import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { config, PROJECT_CONFIGS } from '../config';
import logger from '../utils/logger';
import { ProjectConfig, GitProjectInfo } from '../types/interfaces';

const execAsync = promisify(exec);

export class GitService {
  async cloneOrUpdateProject(
    deploymentId: string, 
    projectId: string
  ): Promise<string> {
    const projectConfig = PROJECT_CONFIGS[projectId];
    if (!projectConfig) {
      throw new Error(`未找到项目配置: ${projectId}`);
    }

    try {
      logger.info(`开始获取项目源代码 [${deploymentId}] [${projectId}]`, {
        repository: projectConfig.gitRepository,
        branch: projectConfig.gitBranch,
        localPath: projectConfig.localPath
      });

      // 确保父目录存在
      await fs.ensureDir(path.dirname(projectConfig.localPath));

      // 检查本地路径是否已存在
      if (await fs.pathExists(projectConfig.localPath)) {
        // 如果存在，拉取最新代码
        await this.updateExistingProject(deploymentId, projectConfig);
      } else {
        // 如果不存在，克隆项目
        await this.cloneNewProject(deploymentId, projectConfig);
      }

      // 切换到指定分支
      await this.checkoutBranch(deploymentId, projectConfig);

      logger.info(`项目源代码获取完成 [${deploymentId}] [${projectId}]`, {
        localPath: projectConfig.localPath
      });

      return projectConfig.localPath;

    } catch (error) {
      logger.error(`获取项目源代码失败 [${deploymentId}] [${projectId}]`, error);
      throw new Error(`Git操作失败: ${error.message}`);
    }
  }

  private async cloneNewProject(
    deploymentId: string, 
    projectConfig: ProjectConfig
  ): Promise<void> {
    const cloneCmd = `git clone ${projectConfig.gitRepository} ${projectConfig.localPath}`;
    
    await execAsync(cloneCmd, {
      env: {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${config.GIT_SSH_KEY_PATH} -o StrictHostKeyChecking=no`
      },
      timeout: 300000 // 5分钟超时
    });

    logger.info(`项目克隆完成 [${deploymentId}]`, {
      project: projectConfig.id,
      localPath: projectConfig.localPath
    });
  }

  private async updateExistingProject(
    deploymentId: string, 
    projectConfig: ProjectConfig
  ): Promise<void> {
    const gitCommands = [
      'git fetch origin',
      'git reset --hard HEAD',
      'git clean -fd',
      `git pull origin ${projectConfig.gitBranch}`
    ];

    for (const cmd of gitCommands) {
      await execAsync(cmd, {
        cwd: projectConfig.localPath,
        env: {
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i ${config.GIT_SSH_KEY_PATH} -o StrictHostKeyChecking=no`
        },
        timeout: 60000
      });
    }

    logger.info(`项目更新完成 [${deploymentId}]`, {
      project: projectConfig.id,
      localPath: projectConfig.localPath
    });
  }

  private async checkoutBranch(
    deploymentId: string, 
    projectConfig: ProjectConfig
  ): Promise<void> {
    const checkoutCmd = `git checkout ${projectConfig.gitBranch}`;
    
    await execAsync(checkoutCmd, {
      cwd: projectConfig.localPath,
      timeout: 30000
    });

    // 获取当前commit信息
    const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
      cwd: projectConfig.localPath
    });

    logger.info(`分支切换完成 [${deploymentId}]`, {
      project: projectConfig.id,
      branch: projectConfig.gitBranch,
      commitHash: commitHash.trim()
    });
  }

  async getProjectInfo(projectId: string): Promise<GitProjectInfo> {
    const projectConfig = PROJECT_CONFIGS[projectId];
    if (!projectConfig || !await fs.pathExists(projectConfig.localPath)) {
      throw new Error(`项目不存在: ${projectId}`);
    }

    try {
      const { stdout } = await execAsync(
        'git log -1 --pretty=format:"%H|%an|%s|%ci"',
        { cwd: projectConfig.localPath }
      );

      const [hash, author, message, timestamp] = stdout.trim().split('|');

      return {
        lastCommit: hash,
        author,
        message,
        timestamp
      };
    } catch (error) {
      logger.error(`获取项目信息失败 [${projectId}]`, error);
      throw new Error(`Git信息获取失败: ${error.message}`);
    }
  }

  async validateGitAccess(projectId: string): Promise<boolean> {
    try {
      const projectConfig = PROJECT_CONFIGS[projectId];
      if (!projectConfig) {
        return false;
      }

      // 测试Git仓库连接
      await execAsync(`git ls-remote ${projectConfig.gitRepository}`, {
        env: {
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i ${config.GIT_SSH_KEY_PATH} -o StrictHostKeyChecking=no`
        },
        timeout: 30000
      });

      return true;
    } catch (error) {
      logger.error(`Git访问验证失败 [${projectId}]`, error);
      return false;
    }
  }

  async getAllProjectsInfo(): Promise<{ [projectId: string]: GitProjectInfo }> {
    const results: { [projectId: string]: GitProjectInfo } = {};
    
    for (const projectId of Object.keys(PROJECT_CONFIGS)) {
      try {
        results[projectId] = await this.getProjectInfo(projectId);
      } catch (error) {
        logger.warn(`获取项目信息失败 [${projectId}]`, error);
      }
    }
    
    return results;
  }
}