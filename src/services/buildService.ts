import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import { promisify } from "util";
import { config, PROJECT_CONFIGS } from "../config";
import logger from "../utils/logger";
import { ProjectConfig, BuildResult } from "../types/interfaces";

const execAsync = promisify(exec);

export class BuildService {
  
  async buildProject(
    deploymentId: string, 
    projectId: string
  ): Promise<string> {
    const projectConfig = PROJECT_CONFIGS[projectId];
    if (!projectConfig) {
      throw new Error(`未找到项目配置: ${projectId}`);
    }

    try {
      logger.info(`开始构建项目 [${deploymentId}] [${projectId}]`, {
        projectPath: projectConfig.localPath,
        buildCommand: projectConfig.buildCommand,
      });

      // 检查项目目录是否存在
      if (!(await fs.pathExists(projectConfig.localPath))) {
        throw new Error(`项目目录不存在: ${projectConfig.localPath}`);
      }

      // 检查package.json是否存在
      const packageJsonPath = path.join(projectConfig.localPath, "package.json");
      if (!(await fs.pathExists(packageJsonPath))) {
        throw new Error(`package.json不存在: ${packageJsonPath}`);
      }

      // 清理之前的构建结果
      const distPath = path.join(projectConfig.localPath, projectConfig.distDirectory);
      await this.cleanDistDirectory(deploymentId, projectId, distPath);

      // 安装依赖（如果需要）
      await this.installDependencies(deploymentId, projectConfig);

      // 执行构建命令
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(projectConfig.buildCommand, {
        cwd: projectConfig.localPath,
        env: {
          ...process.env,
          NODE_OPTIONS: "--max-old-space-size=8192",
        },
        timeout: 600000, // 10分钟超时
      });

      const buildTime = Date.now() - startTime;

      if (stderr) {
        logger.warn(`构建警告 [${deploymentId}] [${projectId}]`, { stderr });
      }

      logger.info(`构建输出 [${deploymentId}] [${projectId}]`, { stdout });

      // 验证构建结果
      if (!(await fs.pathExists(distPath))) {
        throw new Error("构建失败：dist目录未生成");
      }

      // 检查dist目录是否有内容
      const distContents = await fs.readdir(distPath);
      if (distContents.length === 0) {
        throw new Error("构建失败：dist目录为空");
      }

      logger.info(`项目构建完成 [${deploymentId}] [${projectId}]`, {
        distPath,
        buildTime: `${buildTime}ms`,
        fileCount: distContents.length,
      });

      return distPath;
    } catch (error) {
      logger.error(`项目构建失败 [${deploymentId}] [${projectId}]`, error);
      throw new Error(`构建失败: ${error.message}`);
    }
  }

  async buildMultipleProjects(
    deploymentId: string, 
    projectIds: string[]
  ): Promise<BuildResult> {
    const results: BuildResult = {};
    const errors: { [projectId: string]: string } = {};

    // 并行构建（根据配置限制并发数）
    const chunks = this.chunkArray(projectIds, config.CONCURRENT_BUILDS);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (projectId) => {
        try {
          const distPath = await this.buildProject(deploymentId, projectId);
          results[projectId] = distPath;
        } catch (error) {
          errors[projectId] = error.message;
          logger.error(`项目构建失败 [${deploymentId}] [${projectId}]`, error);
        }
      });

      await Promise.all(promises);
    }

    // 检查是否有构建失败的项目
    if (Object.keys(errors).length > 0) {
      const errorMsg = Object.entries(errors)
        .map(([projectId, error]) => `${projectId}: ${error}`)
        .join('; ');
      throw new Error(`部分项目构建失败: ${errorMsg}`);
    }

    return results;
  }

  private async installDependencies(
    deploymentId: string, 
    projectConfig: ProjectConfig
  ): Promise<void> {
    try {
      // 检查是否有node_modules目录和package-lock.json
      const nodeModulesPath = path.join(projectConfig.localPath, 'node_modules');
      const packageLockPath = path.join(projectConfig.localPath, 'package-lock.json');
      const pnpmLockPath = path.join(projectConfig.localPath, 'pnpm-lock.yaml');

      let installCmd = 'npm ci';
      
      if (await fs.pathExists(pnpmLockPath)) {
        installCmd = 'pnpm install --frozen-lockfile';
      } else if (!await fs.pathExists(packageLockPath)) {
        installCmd = 'npm install';
      }

      // 只有当node_modules不存在或者lock文件更新时才重新安装
      const shouldInstall = !(await fs.pathExists(nodeModulesPath)) || 
                           await this.isLockFileNewer(projectConfig.localPath);

      if (shouldInstall) {
        logger.info(`安装依赖 [${deploymentId}] [${projectConfig.id}]`, { installCmd });
        
        await execAsync(installCmd, {
          cwd: projectConfig.localPath,
          timeout: 300000, // 5分钟超时
        });

        logger.info(`依赖安装完成 [${deploymentId}] [${projectConfig.id}]`);
      } else {
        logger.info(`跳过依赖安装 [${deploymentId}] [${projectConfig.id}]`);
      }
    } catch (error) {
      logger.error(`依赖安装失败 [${deploymentId}] [${projectConfig.id}]`, error);
      throw new Error(`依赖安装失败: ${error.message}`);
    }
  }

  private async isLockFileNewer(projectPath: string): Promise<boolean> {
    try {
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      const lockFilePaths = [
        path.join(projectPath, 'package-lock.json'),
        path.join(projectPath, 'pnpm-lock.yaml')
      ];

      if (!(await fs.pathExists(nodeModulesPath))) {
        return true;
      }

      const nodeModulesStat = await fs.stat(nodeModulesPath);

      for (const lockFile of lockFilePaths) {
        if (await fs.pathExists(lockFile)) {
          const lockFileStat = await fs.stat(lockFile);
          if (lockFileStat.mtime > nodeModulesStat.mtime) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return true; // 出错时选择重新安装
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async cleanDistDirectory(
    deploymentId: string, 
    projectId: string, 
    distPath: string
  ): Promise<void> {
    try {
      if (await fs.pathExists(distPath)) {
        await fs.remove(distPath);
        logger.info(`清理旧的构建文件 [${deploymentId}] [${projectId}]`, {
          distPath,
        });
      }
    } catch (error) {
      logger.error(`清理构建文件失败 [${deploymentId}] [${projectId}]`, error);
      throw error;
    }
  }

  async cleanupBuild(deploymentId: string, projectIds: string[]): Promise<void> {
    // 保留构建结果，跳过清理
    logger.info(`保留构建文件，跳过清理 [${deploymentId}]`, { projectIds });
  }

  async cleanupOnFailure(deploymentId: string, projectIds: string[]): Promise<void> {
    // 仅在失败时清理所有项目的构建文件
    const cleanupPromises = projectIds.map(async (projectId) => {
      const projectConfig = PROJECT_CONFIGS[projectId];
      if (projectConfig) {
        const distPath = path.join(projectConfig.localPath, projectConfig.distDirectory);
        try {
          if (await fs.pathExists(distPath)) {
            await fs.remove(distPath);
            logger.info(`部署失败，清理构建文件 [${deploymentId}] [${projectId}]`, {
              distPath,
            });
          }
        } catch (error) {
          logger.error(`清理构建文件失败 [${deploymentId}] [${projectId}]`, error);
        }
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  async getProjectInfo(projectId: string): Promise<{
    name: string;
    version: string;
    buildCommand: string;
    localPath: string;
  }> {
    const projectConfig = PROJECT_CONFIGS[projectId];
    if (!projectConfig) {
      throw new Error(`项目配置不存在: ${projectId}`);
    }
    
    try {
      const packageJsonPath = path.join(projectConfig.localPath, "package.json");
      const packageJson = await fs.readJson(packageJsonPath);

      return {
        name: packageJson.name || projectConfig.name,
        version: packageJson.version || "0.0.0",
        buildCommand: projectConfig.buildCommand,
        localPath: projectConfig.localPath,
      };
    } catch (error) {
      logger.error(`获取项目信息失败 [${projectId}]`, error);
      throw new Error("无法读取项目信息");
    }
  }

  async getAllProjectsInfo(): Promise<{ [projectId: string]: any }> {
    const results: { [projectId: string]: any } = {};
    
    for (const projectId of Object.keys(PROJECT_CONFIGS)) {
      try {
        results[projectId] = await this.getProjectInfo(projectId);
      } catch (error) {
        logger.warn(`获取项目信息失败 [${projectId}]`, error);
        results[projectId] = {
          name: PROJECT_CONFIGS[projectId].name,
          version: '0.0.0',
          buildCommand: PROJECT_CONFIGS[projectId].buildCommand,
          localPath: PROJECT_CONFIGS[projectId].localPath,
          error: error.message
        };
      }
    }
    
    return results;
  }

  // 保持向后兼容的单项目构建方法
  async buildSingleProject(deploymentId: string): Promise<string> {
    // 使用第一个项目配置作为默认值
    const firstProjectId = Object.keys(PROJECT_CONFIGS)[0];
    if (!firstProjectId) {
      // 回退到原有配置
      const projectPath = config.PROJECT_PATH;
      const distPath = path.join(projectPath, config.DIST_DIR);
      
      logger.info(`开始构建项目（兼容模式） [${deploymentId}]`, {
        projectPath,
        buildCommand: config.BUILD_COMMAND,
      });

      if (!(await fs.pathExists(projectPath))) {
        throw new Error(`项目目录不存在: ${projectPath}`);
      }

      const packageJsonPath = path.join(projectPath, "package.json");
      if (!(await fs.pathExists(packageJsonPath))) {
        throw new Error(`package.json不存在: ${packageJsonPath}`);
      }

      await this.cleanDistDirectory(deploymentId, 'legacy', distPath);

      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(config.BUILD_COMMAND, {
        cwd: projectPath,
        env: {
          ...process.env,
          NODE_OPTIONS: "--max-old-space-size=8192",
        },
        timeout: 600000,
      });

      const buildTime = Date.now() - startTime;

      if (stderr) {
        logger.warn(`构建警告 [${deploymentId}]`, { stderr });
      }

      if (!(await fs.pathExists(distPath))) {
        throw new Error("构建失败：dist目录未生成");
      }

      const distContents = await fs.readdir(distPath);
      if (distContents.length === 0) {
        throw new Error("构建失败：dist目录为空");
      }

      logger.info(`项目构建完成（兼容模式） [${deploymentId}]`, {
        distPath,
        buildTime: `${buildTime}ms`,
        fileCount: distContents.length,
      });

      return distPath;
    }
    
    return this.buildProject(deploymentId, firstProjectId);
  }
}
