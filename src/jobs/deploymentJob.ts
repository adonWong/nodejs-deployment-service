import Bull from 'bull'
import Redis from 'ioredis'
import { config } from '../config'
import { GitService } from '../services/gitService'
import { BuildService } from '../services/buildService'
import { ConfigService } from '../services/configService'
import { NotificationService } from '../services/notificationService'
import { UploadService } from '../services/uploadService'
import { NginxService } from '../services/nginxService'
import type { JobData, MultiProjectJobData, MultiProjectDeploymentStatus } from '../types/interfaces'
import logger from '../utils/logger'

// 内存存储替代方案
class MemoryQueue {
  private jobs = new Map()
  private processing = false
  private processor: any
  private eventHandlers = new Map()

  async add(jobType: string, data: any, options: any = {}) {
    const jobId = data.deploymentId || `job-${Date.now()}`
    const job = {
      id: jobId,
      data,
      options,
      status: 'waiting',
      progress: 0,
      timestamp: Date.now()
    }

    this.jobs.set(jobId, job)

    // 立即处理任务
    setImmediate(() => this.processJobs())

    return { id: jobId }
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) return null

    return {
      id: job.id,
      data: job.data,
      progress: () => job.progress,
      getState: () => Promise.resolve(job.status),
      timestamp: job.timestamp
    }
  }

  async getWaiting() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'waiting')
  }

  async getActive() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'active')
  }

  async getCompleted() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'completed')
  }

  async getFailed() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'failed')
  }

  process(jobType: string, processor: Function) {
    this.processor = processor
  }

  async processJobs() {
    if (this.processing) return

    this.processing = true

    try {
      const waitingJobs = await this.getWaiting()

      for (const jobData of waitingJobs) {
        const job = {
          id: jobData.id,
          data: jobData.data,
          timestamp: jobData.timestamp,
          progress: (value: number) => {
            jobData.progress = value
            return value
          }
        }

        jobData.status = 'active'

        try {
          await this.processor(job)
          jobData.status = 'completed'
          this.emit('completed', job)
        } catch (error) {
          jobData.status = 'failed'
          this.emit('failed', job, error)
        }
      }
    } finally {
      this.processing = false
    }
  }

  on(event: string, callback: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }

    this.eventHandlers.get(event).push(callback)
  }

  emit(event: string, ...args: any[]) {
    if (this.eventHandlers && this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event)
      handlers.forEach((handler: any) => handler(...args))
    }
  }

  async close() {
    this.jobs.clear()
  }
}

// 内存存储的Redis替代
class MemoryRedis {
  private storage = new Map()

  async hset(key: string, data: any) {
    if (!this.storage.has(key)) {
      this.storage.set(key, {})
    }
    Object.assign(this.storage.get(key), data)
  }

  async hgetall(key: string) {
    return this.storage.get(key) || {}
  }

  async lpush(key: string, value: string) {
    if (!this.storage.has(key)) {
      this.storage.set(key, [])
    }
    this.storage.get(key).unshift(value)
  }

  async lrange(key: string, start: number, end: number) {
    const list = this.storage.get(key) || []
    if (end === -1) return list.slice(start)
    return list.slice(start, end + 1)
  }

  async ltrim(key: string, start: number, end: number) {
    if (this.storage.has(key)) {
      const list = this.storage.get(key)
      this.storage.set(key, list.slice(start, end + 1))
    }
  }

  async expire(key: string, seconds: number) {
    // 在内存模式下忽略过期设置
  }

  async exists(key: string) {
    return this.storage.has(key) ? 1 : 0
  }

  async keys(pattern: string) {
    const keys = Array.from(this.storage.keys())
    if (pattern === '*') return keys
    // 简单的模式匹配
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return keys.filter(key => regex.test(key))
  }

  async ping() {
    return 'PONG'
  }

  async disconnect() {
    this.storage.clear()
  }
}

// 根据配置选择使用Redis还是内存存储
let redis: Redis | MemoryRedis
let deploymentQueue: Bull.Queue | MemoryQueue

if (config.REDIS.ENABLED) {
  // 使用真正的Redis
  redis = new Redis({
    host: config.REDIS.HOST,
    port: config.REDIS.PORT,
    password: config.REDIS.PASSWORD,
    db: config.REDIS.DB,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  })

  deploymentQueue = new Bull('deployment', {
    redis: {
      host: config.REDIS.HOST,
      port: config.REDIS.PORT,
      password: config.REDIS.PASSWORD,
      db: config.REDIS.DB
    },
    defaultJobOptions: {
      attempts: config.JOB.ATTEMPTS,
      backoff: config.JOB.BACKOFF,
      removeOnComplete: config.JOB.REMOVE_ON_COMPLETE,
      removeOnFail: config.JOB.REMOVE_ON_FAIL
    }
  })
} else {
  // 使用内存存储
  logger.warn('Redis已禁用，使用内存存储模式 - 仅适用于开发和测试')
  redis = new MemoryRedis()
  deploymentQueue = new MemoryQueue()
}

const gitService = new GitService()
const buildService = new BuildService()
const configService = new ConfigService()
const uploadService = new UploadService()
const nginxService = new NginxService()
const notificationService = new NotificationService()

// 多项目部署任务处理器
deploymentQueue.process('build-and-deploy-multi', async job => {
  const { deploymentId, projectIds, branch, commitHash } = job.data as MultiProjectJobData

  try {
    logger.info(`开始执行多项目部署任务 [${deploymentId}]`, {
      projectIds,
      branch,
      commitHash
    })

    // 初始化部署状态
    await initializeDeploymentStatus(deploymentId, projectIds)
    job.progress(5)

    // 步骤1: 克隆/更新所有项目源代码
    logger.info(`步骤1: 获取项目源代码 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'cloning', '正在获取源代码...')

    const clonePromises = projectIds.map(projectId => 
      gitService.cloneOrUpdateProject(deploymentId, projectId)
        .then(() => updateSingleProjectStatus(deploymentId, projectId, 'cloning', '源代码获取完成', 100))
        .catch(error => {
          updateSingleProjectStatus(deploymentId, projectId, 'failed', `源代码获取失败: ${error.message}`, 0)
          throw error
        })
    )

    await Promise.all(clonePromises)
    job.progress(20)

    // 步骤2: 构建所有项目
    logger.info(`步骤2: 构建项目 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'building', '正在构建项目...')

    const projectBuilds = await buildService.buildMultipleProjects(deploymentId, projectIds)

    // 更新构建完成的项目状态
    for (const projectId of projectIds) {
      if (projectBuilds[projectId]) {
        await updateSingleProjectStatus(deploymentId, projectId, 'building', '项目构建完成', 100)
      }
    }

    job.progress(50)

    // 步骤3: 获取服务器配置
    logger.info(`步骤3: 获取服务器配置 [${deploymentId}]`)
    const serverConfig = await configService.getServerConfig(deploymentId, projectIds[0]) // 使用第一个项目获取配置
    job.progress(60)

    // 步骤4: 上传文件到服务器
    logger.info(`步骤4: 上传文件 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'uploading', '正在上传文件...')

    await uploadService.uploadMultipleProjects(deploymentId, projectBuilds, serverConfig)

    // 更新上传完成的项目状态
    for (const projectId of projectIds) {
      await updateSingleProjectStatus(deploymentId, projectId, 'uploading', '文件上传完成', 100)
    }

    job.progress(80)

    // 步骤5: 配置Nginx
    logger.info(`步骤5: 配置Nginx [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'configuring', '正在配置Nginx...')

    await nginxService.updateNginxConfig(deploymentId, projectIds, serverConfig.host)

    // 更新配置完成的项目状态
    for (const projectId of projectIds) {
      await updateSingleProjectStatus(deploymentId, projectId, 'configuring', 'Nginx配置完成', 100)
    }

    job.progress(90)

    // 步骤6: 清理构建文件
    await buildService.cleanupBuild(deploymentId, projectIds)

    // 步骤7: 完成部署
    await updateProjectStatus(deploymentId, projectIds, 'completed', '部署完成')
    await updateOverallStatus(deploymentId, 'completed', '所有项目部署完成')
    job.progress(100)

    // 步骤8: 发送成功通知
    await notificationService.sendMultiProjectSuccessNotification(deploymentId, {
      projectIds,
      branch,
      commitHash,
      serverHost: serverConfig.host,
      projectBuilds
    })

    logger.info(`多项目部署任务完成 [${deploymentId}]`, { projectIds })

    return {
      deploymentId,
      status: 'completed',
      serverHost: serverConfig.host,
      projectIds,
      projectBuilds
    }

  } catch (error) {
    logger.error(`多项目部署任务失败 [${deploymentId}]`, error)

    // 更新失败状态
    await updateOverallStatus(deploymentId, 'failed', `部署失败: ${error.message}`)

    // 清理失败的构建文件
    await buildService.cleanupOnFailure(deploymentId, projectIds)

    // 发送失败通知
    await notificationService.sendFailureNotification(deploymentId, error)

    throw error
  }
})

// 保持向后兼容的单项目部署处理
deploymentQueue.process('build-and-deploy', async job => {
  const { deploymentId, projectId } = job.data as JobData

  // 转换为多项目格式处理
  const multiProjectData = {
    ...job.data,
    projectIds: [projectId]
  }

  // 创建新的多项目任务
  const multiJob = {
    ...job,
    data: multiProjectData,
    progress: job.progress.bind(job)
  }

  // 使用多项目处理器
  return await processMultiProjectDeployment(multiJob)
})

// 多项目处理函数（从上面的处理器中提取）
async function processMultiProjectDeployment(job: any) {
  const { deploymentId, projectIds, branch, commitHash } = job.data as MultiProjectJobData

  try {
    logger.info(`开始执行多项目部署任务 [${deploymentId}]`, {
      projectIds,
      branch,
      commitHash
    })

    // 初始化部署状态
    await initializeDeploymentStatus(deploymentId, projectIds)
    job.progress(5)

    // 步骤1: 克隆/更新所有项目源代码
    logger.info(`步骤1: 获取项目源代码 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'cloning', '正在获取源代码...')

    const clonePromises = projectIds.map(projectId => 
      gitService.cloneOrUpdateProject(deploymentId, projectId)
        .then(() => updateSingleProjectStatus(deploymentId, projectId, 'cloning', '源代码获取完成', 100))
        .catch(error => {
          updateSingleProjectStatus(deploymentId, projectId, 'failed', `源代码获取失败: ${error.message}`, 0)
          throw error
        })
    )

    await Promise.all(clonePromises)
    job.progress(20)

    // 步骤2: 构建所有项目
    logger.info(`步骤2: 构建项目 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'building', '正在构建项目...')

    const projectBuilds = await buildService.buildMultipleProjects(deploymentId, projectIds)

    // 更新构建完成的项目状态
    for (const projectId of projectIds) {
      if (projectBuilds[projectId]) {
        await updateSingleProjectStatus(deploymentId, projectId, 'building', '项目构建完成', 100)
      }
    }

    job.progress(50)

    // 步骤3: 获取服务器配置
    logger.info(`步骤3: 获取服务器配置 [${deploymentId}]`)
    const serverConfig = await configService.getServerConfig(deploymentId, projectIds[0]) // 使用第一个项目获取配置
    job.progress(60)

    // 步骤4: 上传文件到服务器
    logger.info(`步骤4: 上传文件 [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'uploading', '正在上传文件...')

    await uploadService.uploadMultipleProjects(deploymentId, projectBuilds, serverConfig)

    // 更新上传完成的项目状态
    for (const projectId of projectIds) {
      await updateSingleProjectStatus(deploymentId, projectId, 'uploading', '文件上传完成', 100)
    }

    job.progress(80)

    // 步骤5: 配置Nginx
    logger.info(`步骤5: 配置Nginx [${deploymentId}]`)
    await updateProjectStatus(deploymentId, projectIds, 'configuring', '正在配置Nginx...')

    await nginxService.updateNginxConfig(deploymentId, projectIds, serverConfig.host)

    // 更新配置完成的项目状态
    for (const projectId of projectIds) {
      await updateSingleProjectStatus(deploymentId, projectId, 'configuring', 'Nginx配置完成', 100)
    }

    job.progress(90)

    // 步骤6: 清理构建文件
    await buildService.cleanupBuild(deploymentId, projectIds)

    // 步骤7: 完成部署
    await updateProjectStatus(deploymentId, projectIds, 'completed', '部署完成')
    await updateOverallStatus(deploymentId, 'completed', '所有项目部署完成')
    job.progress(100)

    // 步骤8: 发送成功通知
    await notificationService.sendMultiProjectSuccessNotification(deploymentId, {
      projectIds,
      branch,
      commitHash,
      serverHost: serverConfig.host,
      projectBuilds
    })

    logger.info(`多项目部署任务完成 [${deploymentId}]`, { projectIds })

    return {
      deploymentId,
      status: 'completed',
      serverHost: serverConfig.host,
      projectIds,
      projectBuilds
    }

  } catch (error) {
    logger.error(`多项目部署任务失败 [${deploymentId}]`, error)

    // 更新失败状态
    await updateOverallStatus(deploymentId, 'failed', `部署失败: ${error.message}`)

    // 清理失败的构建文件
    await buildService.cleanupOnFailure(deploymentId, projectIds)

    // 发送失败通知
    await notificationService.sendFailureNotification(deploymentId, error)

    throw error
  }
}

async function initializeDeploymentStatus(
  deploymentId: string,
  projectIds: string[]
): Promise<void> {
  const status: MultiProjectDeploymentStatus = {
    deploymentId,
    overallStatus: 'pending',
    projects: {},
    startTime: new Date().toISOString()
  }
  
  // 初始化每个项目的状态
  for (const projectId of projectIds) {
    status.projects[projectId] = {
      status: 'pending',
      progress: 0,
      message: '等待开始...'
    }
  }
  
  const statusKey = `deployment:${deploymentId}:status`
  await redis.hset(statusKey, 'data', JSON.stringify(status))
  await redis.expire(statusKey, 86400) // 24小时过期
}

async function updateProjectStatus(
  deploymentId: string,
  projectIds: string[],
  status: string,
  message: string
): Promise<void> {
  for (const projectId of projectIds) {
    await updateSingleProjectStatus(deploymentId, projectId, status, message, 0)
  }
}

async function updateSingleProjectStatus(
  deploymentId: string,
  projectId: string,
  status: string,
  message: string,
  progress: number = 0
): Promise<void> {
  const statusKey = `deployment:${deploymentId}:status`
  const statusDataString = await redis.hgetall(statusKey)
  
  if (statusDataString && statusDataString.data) {
    const deploymentStatus: MultiProjectDeploymentStatus = JSON.parse(statusDataString.data)
    
    deploymentStatus.projects[projectId] = {
      status: status as any,
      progress,
      message
    }
    
    await redis.hset(statusKey, 'data', JSON.stringify(deploymentStatus))
    await redis.expire(statusKey, 86400)
  }
}

async function updateOverallStatus(
  deploymentId: string,
  status: string,
  message: string
): Promise<void> {
  const statusKey = `deployment:${deploymentId}:status`
  const statusDataString = await redis.hgetall(statusKey)
  
  if (statusDataString && statusDataString.data) {
    const deploymentStatus: MultiProjectDeploymentStatus = JSON.parse(statusDataString.data)
    
    deploymentStatus.overallStatus = status as any
    
    // 设置预计完成时间
    if (status === 'completed') {
      deploymentStatus.estimatedCompletion = new Date().toISOString()
    }
    
    await redis.hset(statusKey, 'data', JSON.stringify(deploymentStatus))
    await redis.expire(statusKey, 86400)
    
    logger.info(`部署状态更新 [${deploymentId}]`, { status, message })
  }
}

// 更新部署状态（保持向后兼容）
async function updateDeploymentStatus(
  deploymentId: string,
  status: string,
  message: string,
  progress?: number,
  endTime?: string
): Promise<void> {
  try {
    const statusKey = `deployment:${deploymentId}:status`
    const statusData: Record<string, string> = {
      status,
      currentStep: message,
      updatedAt: new Date().toISOString()
    }

    if (progress !== undefined) {
      statusData.progress = progress.toString()
    }

    if (endTime) {
      statusData.endTime = endTime
    }

    // 如果是第一次设置状态，记录开始时间
    const exists = await redis.exists(statusKey)
    if (!exists) {
      statusData.startTime = new Date().toISOString()
      // 估算完成时间（基于历史数据或固定值）
      const estimatedDuration = 8 * 60 * 1000 // 8分钟
      statusData.estimatedCompletion = new Date(Date.now() + estimatedDuration).toISOString()
    }

    await redis.hset(statusKey, statusData)
    await redis.expire(statusKey, 86400) // 24小时过期

    logger.debug(`状态已更新 [${deploymentId}]`, { status, message, progress })
  } catch (error) {
    logger.error(`更新部署状态失败 [${deploymentId}]`, error)
  }
}

// 添加部署日志
async function addDeploymentLog(
  deploymentId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: any
): Promise<void> {
  try {
    const logsKey = `deployment:${deploymentId}:logs`
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data && { data })
    }

    await redis.lpush(logsKey, JSON.stringify(logEntry))
    await redis.ltrim(logsKey, 0, 99) // 只保留最近100条日志
    await redis.expire(logsKey, 86400) // 24小时过期

    logger.debug(`日志已添加 [${deploymentId}]`, logEntry)
  } catch (error) {
    logger.error(`添加部署日志失败 [${deploymentId}]`, error)
  }
}

// 任务事件监听器
deploymentQueue.on('completed', async (job, result) => {
  const { deploymentId } = job.data
  logger.info(`部署任务完成 [${deploymentId}]`, {
    jobId: job.id,
    result,
    duration: Date.now() - job.timestamp
  })
})

deploymentQueue.on('failed', async (job, err) => {
  const { deploymentId } = job.data
  logger.error(`部署任务失败 [${deploymentId}]`, {
    jobId: job.id,
    error: err.message,
    stack: err.stack,
    duration: Date.now() - job.timestamp
  })
})

deploymentQueue.on('progress', async (job, progress) => {
  const { deploymentId } = job.data
  logger.debug(`部署进度更新 [${deploymentId}]`, {
    jobId: job.id,
    progress
  })
})

deploymentQueue.on('stalled', async job => {
  const { deploymentId } = job.data
  logger.warn(`部署任务停滞 [${deploymentId}]`, {
    jobId: job.id
  })

  await addDeploymentLog(deploymentId, 'warn', '任务执行停滞，正在重试...')
})

// 队列错误处理
deploymentQueue.on('error', error => {
  logger.error('队列错误', error)
})

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，开始优雅关闭...')
  await deploymentQueue.close()
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，开始优雅关闭...')
  await deploymentQueue.close()
  await redis.disconnect()
  process.exit(0)
})

export { addDeploymentLog, deploymentQueue, redis, updateDeploymentStatus }
