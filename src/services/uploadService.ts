import fs from 'fs-extra'
import { NodeSSH } from 'node-ssh'
import path from 'path'
import { config, PROJECT_CONFIGS } from '../config'
import type { ServerConfig, BuildResult } from '../types/interfaces'
import logger from '../utils/logger'

export class UploadService {
  async uploadMultipleProjects(
    deploymentId: string,
    projectBuilds: BuildResult,
    serverConfig: ServerConfig
  ): Promise<void> {
    const ssh = new NodeSSH()
    
    try {
      logger.info(`连接服务器 [${deploymentId}]`, { 
        host: serverConfig.host,
        username: serverConfig.username,
        projectCount: Object.keys(projectBuilds).length
      })
      
      // 连接SSH
      await ssh.connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        readyTimeout: 30000,
        algorithms: {
          kex: ['diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
          compress: ['none']
        }
      })
      
      logger.info(`SSH连接成功 [${deploymentId}]`)
      
      // 并行上传所有项目
      const uploadPromises = Object.entries(projectBuilds).map(
        async ([projectId, distPath]) => {
          const projectConfig = PROJECT_CONFIGS[projectId]
          if (!projectConfig) {
            throw new Error(`未找到项目配置: ${projectId}`)
          }
          
          await this.uploadSingleProject(
            ssh,
            deploymentId,
            projectId,
            distPath,
            projectConfig.remotePath
          )
        }
      )

      await Promise.all(uploadPromises)
      
      logger.info(`所有项目文件上传完成 [${deploymentId}]`)
      
    } catch (error) {
      logger.error(`文件上传失败 [${deploymentId}]`, error)
      throw new Error(`上传失败: ${error.message}`)
    } finally {
      ssh.dispose()
    }
  }

  private async uploadSingleProject(
    ssh: NodeSSH,
    deploymentId: string,
    projectId: string,
    localDistPath: string,
    remotePath: string
  ): Promise<void> {
    try {
      logger.info(`开始上传项目 [${deploymentId}] [${projectId}]`, {
        from: localDistPath,
        to: remotePath
      })

      // 创建远程目录备份（如果存在）
      await this.createRemoteBackup(ssh, deploymentId, projectId, remotePath)
      
      // 创建部署目录（如果不存在）
      await ssh.execCommand(`mkdir -p ${remotePath}`)
      logger.info(`创建部署目录 [${deploymentId}] [${projectId}]`, { remotePath })
      
      // 清空目标目录
      const cleanResult = await ssh.execCommand(`find ${remotePath} -mindepth 1 -delete`)
      if (cleanResult.code !== 0) {
        logger.warn(`清空目标目录警告 [${deploymentId}] [${projectId}]`, { stderr: cleanResult.stderr })
      }
      
      // 获取本地文件统计
      const localStats = await this.getDirectoryStats(localDistPath)
      logger.info(`准备上传文件 [${deploymentId}] [${projectId}]`, localStats)

      // 上传构建文件
      let uploadedFiles = 0
      const startTime = Date.now()

      const result = await ssh.putDirectory(localDistPath, remotePath, {
        recursive: true,
        concurrency: config.UPLOAD.CONCURRENCY,
        validate: (itemPath) => {
          // 排除隐藏文件和系统文件
          const basename = path.basename(itemPath)
          return !basename.startsWith('.') && 
                 basename !== 'node_modules' && 
                 basename !== '.git' &&
                 basename !== 'Thumbs.db' &&
                 basename !== '.DS_Store'
        },
        tick: (localPath, remotePath, error) => {
          if (error) {
            logger.error(`文件上传失败 [${deploymentId}] [${projectId}]`, { 
              localPath: path.basename(localPath), 
              error: error.message 
            })
          } else {
            uploadedFiles++
            if (uploadedFiles % 50 === 0) {
              logger.debug(`已上传文件 [${deploymentId}] [${projectId}]`, { count: uploadedFiles })
            }
          }
        }
      })

      const uploadTime = Date.now() - startTime

      if (!result) {
        throw new Error('文件上传失败')
      }
      
      // 设置文件权限
      const chmodResult = await ssh.execCommand(`chmod -R 755 ${remotePath}`)
      if (chmodResult.code !== 0) {
        logger.warn(`设置文件权限警告 [${deploymentId}] [${projectId}]`, { stderr: chmodResult.stderr })
      }
      
      // 设置正确的所有者（如果需要）
      const chownResult = await ssh.execCommand(`chown -R www-data:www-data ${remotePath} 2>/dev/null || true`)
      if (chownResult.code !== 0 && chownResult.stderr && !chownResult.stderr.includes('Operation not permitted')) {
        logger.warn(`设置所有者警告 [${deploymentId}] [${projectId}]`, { stderr: chownResult.stderr })
      }

      // 验证上传结果
      const remoteStats = await this.getRemoteDirectoryStats(ssh, remotePath)
      
      logger.info(`项目上传完成 [${deploymentId}] [${projectId}]`, {
        remotePath,
        uploadTime: `${uploadTime}ms`,
        uploadedFiles,
        localStats,
        remoteStats
      })
      
    } catch (error) {
      logger.error(`项目上传失败 [${deploymentId}] [${projectId}]`, error)
      throw error
    }
  }

  private async createRemoteBackup(
    ssh: NodeSSH,
    deploymentId: string,
    projectId: string,
    remotePath: string
  ): Promise<void> {
    try {
      // 检查远程目录是否存在
      const { code } = await ssh.execCommand(`test -d ${remotePath}`)
      if (code === 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupDir = `${remotePath}-backup-${timestamp}`
        
        const copyResult = await ssh.execCommand(`cp -r ${remotePath} ${backupDir}`)
        if (copyResult.code === 0) {
          logger.info(`远程备份已创建 [${deploymentId}] [${projectId}]`, { 
            backupDir 
          })
          
          // 保留最近5个备份
          const backupParentDir = path.dirname(remotePath)
          const projectName = path.basename(remotePath)
          const cleanupResult = await ssh.execCommand(
            `cd ${backupParentDir} && ls -t | grep "^${projectName}-backup-" | tail -n +6 | xargs -r rm -rf`
          )
          if (cleanupResult.code !== 0) {
            logger.warn(`清理旧备份警告 [${deploymentId}] [${projectId}]`, { stderr: cleanupResult.stderr })
          }
        } else {
          logger.warn(`创建远程备份失败 [${deploymentId}] [${projectId}]`, { stderr: copyResult.stderr })
        }
      }
    } catch (error) {
      logger.warn(`创建远程备份失败 [${deploymentId}] [${projectId}]`, error)
    }
  }

  // 保持原有的单项目上传方法向后兼容
  async uploadToServer(deploymentId: string, localPath: string, serverConfig: ServerConfig): Promise<void> {
    // 使用第一个项目配置作为默认值
    const firstProjectId = Object.keys(PROJECT_CONFIGS)[0]
    if (firstProjectId) {
      const projectBuilds: BuildResult = { [firstProjectId]: localPath }
      await this.uploadMultipleProjects(deploymentId, projectBuilds, serverConfig)
      return
    }

    // 回退到原有实现
    const ssh = new NodeSSH()

    try {
      logger.info(`连接服务器 [${deploymentId}]`, {
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username
      })

      // 连接SSH
      await ssh.connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        readyTimeout: 30000,
        algorithms: {
          kex: ['diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
          compress: ['none']
        }
      })

      logger.info(`SSH连接成功 [${deploymentId}]`)

      // 创建备份（如果指定了备份路径）
      if (serverConfig.backupPath) {
        await this.createBackup(ssh, deploymentId, serverConfig)
      }

      // 创建部署目录（如果不存在）
      await ssh.execCommand(`mkdir -p ${serverConfig.deployPath}`)
      logger.info(`创建部署目录 [${deploymentId}]`, { deployPath: serverConfig.deployPath })

      // 清空目标目录
      const cleanResult = await ssh.execCommand(`find ${serverConfig.deployPath} -mindepth 1 -delete`)
      if (cleanResult.code !== 0) {
        logger.warn(`清空目标目录警告 [${deploymentId}]`, { stderr: cleanResult.stderr })
      }

      logger.info(`开始上传文件 [${deploymentId}]`, {
        from: localPath,
        to: serverConfig.deployPath
      })

      // 获取本地文件统计
      const localStats = await this.getDirectoryStats(localPath)
      logger.info(`准备上传文件 [${deploymentId}]`, localStats)

      // 上传构建文件
      let uploadedFiles = 0
      const startTime = Date.now()

      const result = await ssh.putDirectory(localPath, serverConfig.deployPath, {
        recursive: true,
        concurrency: config.UPLOAD.CONCURRENCY,
        validate: itemPath => {
          // 排除隐藏文件和系统文件
          const basename = path.basename(itemPath)
          const shouldUpload =
            !basename.startsWith('.') &&
            basename !== 'node_modules' &&
            basename !== '.git' &&
            basename !== 'Thumbs.db' &&
            basename !== '.DS_Store'
          return shouldUpload
        },
        tick: (localPath, remotePath, error) => {
          if (error) {
            logger.error(`文件上传失败 [${deploymentId}]`, {
              localPath: path.basename(localPath),
              error: error.message
            })
          } else {
            uploadedFiles++
            if (uploadedFiles % 50 === 0) {
              logger.debug(`已上传文件 [${deploymentId}]`, { count: uploadedFiles })
            }
          }
        }
      })

      const uploadTime = Date.now() - startTime

      if (!result) {
        throw new Error('文件上传失败')
      }

      // 设置文件权限
      const chmodResult = await ssh.execCommand(`chmod -R 755 ${serverConfig.deployPath}`)
      if (chmodResult.code !== 0) {
        logger.warn(`设置文件权限警告 [${deploymentId}]`, { stderr: chmodResult.stderr })
      }

      // 验证上传结果
      const remoteStats = await this.getRemoteDirectoryStats(ssh, serverConfig.deployPath)

      logger.info(`文件上传完成 [${deploymentId}]`, {
        uploadTime: `${uploadTime}ms`,
        uploadedFiles,
        localStats,
        remoteStats
      })
    } catch (error) {
      logger.error(`文件上传失败 [${deploymentId}]`, error)
      throw new Error(`上传失败: ${error.message}`)
    } finally {
      ssh.dispose()
    }
  }

  private async createBackup(ssh: NodeSSH, deploymentId: string, serverConfig: ServerConfig): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupDir = path.posix.join(serverConfig.backupPath!, `backup-${timestamp}`)

      // 检查部署目录是否存在
      const { code } = await ssh.execCommand(`test -d ${serverConfig.deployPath}`)
      if (code === 0) {
        // 创建备份目录
        await ssh.execCommand(`mkdir -p ${serverConfig.backupPath}`)

        // 复制当前部署到备份目录
        const copyResult = await ssh.execCommand(`cp -r ${serverConfig.deployPath} ${backupDir}`)
        if (copyResult.code === 0) {
          logger.info(`备份已创建 [${deploymentId}]`, { backupDir })

          // 保留最近5个备份
          const cleanupResult = await ssh.execCommand(
            `cd ${serverConfig.backupPath} && ls -t | tail -n +6 | xargs -r rm -rf`
          )
          if (cleanupResult.code !== 0) {
            logger.warn(`清理旧备份警告 [${deploymentId}]`, { stderr: cleanupResult.stderr })
          }
        } else {
          logger.warn(`创建备份失败 [${deploymentId}]`, { stderr: copyResult.stderr })
        }
      } else {
        logger.info(`部署目录不存在，跳过备份 [${deploymentId}]`)
      }
    } catch (error) {
      logger.warn(`创建备份失败 [${deploymentId}]`, error)
    }
  }

  private async getDirectoryStats(dirPath: string) {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true })
      let fileCount = 0
      let dirCount = 0
      let totalSize = 0

      for (const file of files) {
        const filePath = path.join(dirPath, file.name)
        if (file.isDirectory()) {
          dirCount++
          const subStats = await this.getDirectoryStats(filePath)
          fileCount += subStats.fileCount
          dirCount += subStats.dirCount
          totalSize += subStats.totalSize
        } else {
          fileCount++
          const stats = await fs.stat(filePath)
          totalSize += stats.size
        }
      }

      return {
        fileCount,
        dirCount,
        totalSize,
        totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100
      }
    } catch (error) {
      return { fileCount: 0, dirCount: 0, totalSize: 0, totalSizeMB: 0 }
    }
  }

  private async getRemoteDirectoryStats(ssh: NodeSSH, remotePath: string) {
    try {
      const result = await ssh.execCommand(`find ${remotePath} -type f | wc -l && du -sm ${remotePath}`)
      if (result.code === 0) {
        const lines = result.stdout.trim().split('\n')
        const fileCount = parseInt(lines[0]) || 0
        const sizeMatch = lines[1]?.match(/^(\d+)/)
        const totalSizeMB = sizeMatch ? parseInt(sizeMatch[1]) : 0

        return { fileCount, totalSizeMB }
      }
    } catch (error) {
      logger.warn('获取远程目录统计失败', error)
    }
    return { fileCount: 0, totalSizeMB: 0 }
  }
}
