import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import { BuildService } from '../services/buildService';
import { ConfigService } from '../services/configService';
import { NotificationService } from '../services/notificationService';
import { ApiResponse, HealthCheckResult } from '../types/interfaces';
import logger from '../utils/logger';
import { redis } from '../jobs/deploymentJob';

export class HealthController {
  private buildService = new BuildService();
  private configService = new ConfigService();
  private notificationService = new NotificationService();
  
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const checks: HealthCheckResult = {
        redis: await this.checkRedisConnection(),
        frontendProject: await this.checkProjectAccess(),
        backendService: await this.checkBackendService()
      };
      
      const healthy = Object.values(checks).every(Boolean);
      const status = healthy ? 200 : 503;
      
      const response: ApiResponse<HealthCheckResult & { 
        status: 'healthy' | 'unhealthy';
        uptime: number;
        memory: NodeJS.MemoryUsage;
        version: string;
      }> = {
        success: healthy,
        data: {
          status: healthy ? 'healthy' : 'unhealthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0',
          ...checks
        },
        message: healthy ? '服务健康' : '服务异常',
        timestamp: new Date().toISOString()
      };
      
      if (!healthy) {
        logger.warn('健康检查失败', checks);
      }
      
      res.status(status).json(response);
      
    } catch (error) {
      logger.error('健康检查异常', error);
      
      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      };
      
      res.status(500).json(response);
    }
  }
  
  async getDetailedHealth(req: Request, res: Response): Promise<void> {
    try {
      const [
        redisStatus,
        projectStatus,
        backendStatus,
        webhookStatus,
        projectInfo
      ] = await Promise.allSettled([
        this.getRedisStatus(),
        this.getProjectStatus(),
        this.getBackendStatus(),
        this.getWebhookStatus(),
        this.getProjectInfo()
      ]);
      
      const response: ApiResponse = {
        success: true,
        data: {
          redis: this.getSettledValue(redisStatus),
          project: this.getSettledValue(projectStatus),
          backend: this.getSettledValue(backendStatus),
          webhook: this.getSettledValue(webhookStatus),
          projectInfo: this.getSettledValue(projectInfo),
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version,
            pid: process.pid
          }
        },
        message: '详细健康检查完成',
        timestamp: new Date().toISOString()
      };
      
      res.json(response);
      
    } catch (error) {
      logger.error('详细健康检查异常', error);
      
      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      };
      
      res.status(500).json(response);
    }
  }
  
  private async checkRedisConnection(): Promise<boolean> {
    try {
      const result = await redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
  
  private async checkProjectAccess(): Promise<boolean> {
    try {
      const projectPath = config.PROJECT_PATH;
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      const [projectExists, packageExists] = await Promise.all([
        fs.pathExists(projectPath),
        fs.pathExists(packageJsonPath)
      ]);
      
      return projectExists && packageExists;
    } catch {
      return false;
    }
  }
  
  private async checkBackendService(): Promise<boolean> {
    return await this.configService.testBackendConnection();
  }
  
  private async getRedisStatus() {
    try {
      const ping = await redis.ping();
      
      return {
        connected: ping === 'PONG',
        host: config.REDIS.HOST,
        port: config.REDIS.PORT,
        enabled: config.REDIS.ENABLED
      };
    } catch (error) {
      return {
        connected: false,
        enabled: config.REDIS.ENABLED,
        error: error.message
      };
    }
  }
  
  private async getProjectStatus() {
    try {
      const projectPath = config.PROJECT_PATH;
      const packageJsonPath = path.join(projectPath, 'package.json');
      const distPath = path.join(projectPath, config.DIST_DIR);
      
      const [projectExists, packageExists, distExists] = await Promise.all([
        fs.pathExists(projectPath),
        fs.pathExists(packageJsonPath),
        fs.pathExists(distPath)
      ]);
      
      return {
        projectPath,
        projectExists,
        packageExists,
        distExists,
        buildCommand: config.BUILD_COMMAND
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
  
  private async getBackendStatus() {
    try {
      const connected = await this.configService.testBackendConnection();
      return {
        url: config.BACKEND_SERVICE_URL,
        connected,
        hasToken: !!config.BACKEND_API_TOKEN
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  private async getWebhookStatus() {
    try {
      const connected = await this.notificationService.testWebhookConnection();
      return {
        url: config.NOTIFICATION_WEBHOOK_URL || 'not_configured',
        connected
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  private async getProjectInfo() {
    try {
      return await this.buildService.getProjectInfo();
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
  
  private parseRedisInfo(info: string) {
    const lines = info.split('\r\n');
    const parsed: Record<string, any> = {};
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          parsed[key] = value;
        }
      }
    }
    
    return {
      version: parsed.redis_version,
      uptime: parsed.uptime_in_seconds,
      connectedClients: parsed.connected_clients,
      usedMemory: parsed.used_memory_human,
      totalSystemMemory: parsed.total_system_memory_human
    };
  }
  
  private getSettledValue(result: PromiseSettledResult<any>) {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        error: result.reason?.message || '未知错误'
      };
    }
  }
}