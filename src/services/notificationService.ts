import axios from 'axios'
import { config } from '../config'
import type { NotificationData, MultiProjectNotificationData, BuildResult } from '../types/interfaces'
import logger from '../utils/logger'

export class NotificationService {
  private readonly webhookUrl: string

  constructor() {
    this.webhookUrl = config.NOTIFICATION_WEBHOOK_URL
  }

  async sendMultiProjectSuccessNotification(
    deploymentId: string,
    data: {
      projectIds: string[]
      branch: string
      commitHash?: string
      serverHost: string
      projectBuilds: BuildResult
    }
  ): Promise<void> {
    const notificationData: MultiProjectNotificationData = {
      deploymentId,
      projectIds: data.projectIds,
      branch: data.branch,
      commitHash: data.commitHash,
      status: 'success',
      serverHost: data.serverHost,
      projectBuilds: data.projectBuilds
    }

    await this.sendMultiProjectNotification(notificationData)

    logger.info(`多项目部署成功通知已发送 [${deploymentId}]`, {
      projectIds: data.projectIds,
      projectCount: data.projectIds.length,
      serverHost: data.serverHost
    })
  }

  async sendSuccessNotification(
    deploymentId: string,
    data: {
      projectId: string
      branch: string
      commitHash: string
      serverHost: string
      deployPath: string
    }
  ): Promise<void> {
    const notificationData: NotificationData = {
      deploymentId,
      projectId: data.projectId,
      branch: data.branch,
      commitHash: data.commitHash,
      status: 'success',
      serverHost: data.serverHost,
      deployPath: data.deployPath
    }

    await this.sendNotification(notificationData)

    logger.info(`部署成功通知已发送 [${deploymentId}]`, {
      projectId: data.projectId,
      serverHost: data.serverHost
    })
  }

  async sendFailureNotification(deploymentId: string, error: Error): Promise<void> {
    const notificationData: NotificationData = {
      deploymentId,
      projectId: 'unknown',
      branch: 'unknown',
      commitHash: 'unknown',
      status: 'failure',
      error
    }

    await this.sendNotification(notificationData)

    logger.info(`部署失败通知已发送 [${deploymentId}]`, {
      error: error.message
    })
  }

  private async sendMultiProjectNotification(data: MultiProjectNotificationData): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn('通知Webhook URL未配置，跳过通知发送')
      return
    }

    try {
      const payload = {
        type: 'multi_project_deployment_notification',
        timestamp: new Date().toISOString(),
        data: {
          deploymentId: data.deploymentId,
          projectIds: data.projectIds,
          projectCount: data.projectIds.length,
          branch: data.branch,
          commitHash: data.commitHash,
          status: data.status,
          serverHost: data.serverHost,
          projectBuilds: data.projectBuilds,
          failedProjects: data.failedProjects,
          error: data.error
            ? {
                message: data.error.message,
                stack: data.error.stack
              }
            : undefined
        }
      }

      await axios.post(this.webhookUrl, payload, {
        timeout: 10000, // 多项目通知增加超时时间
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'deployment-service/1.0.0'
        }
      })

      logger.info(`多项目通知发送成功`, {
        deploymentId: data.deploymentId,
        status: data.status,
        projectCount: data.projectIds.length
      })
    } catch (error) {
      logger.error('发送多项目通知失败', {
        deploymentId: data.deploymentId,
        error: error.message,
        webhookUrl: this.webhookUrl
      })
    }
  }

  private async sendNotification(data: NotificationData): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn('通知Webhook URL未配置，跳过通知发送')
      return
    }

    try {
      const payload = {
        type: 'deployment_notification',
        timestamp: new Date().toISOString(),
        data: {
          deploymentId: data.deploymentId,
          projectId: data.projectId,
          branch: data.branch,
          commitHash: data.commitHash,
          status: data.status,
          serverHost: data.serverHost,
          deployPath: data.deployPath,
          error: data.error
            ? {
                message: data.error.message,
                stack: data.error.stack
              }
            : undefined
        }
      }

      await axios.post(this.webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'deployment-service/1.0.0'
        }
      })

      logger.info(`通知发送成功`, {
        deploymentId: data.deploymentId,
        status: data.status
      })
    } catch (error) {
      logger.error('发送通知失败', {
        deploymentId: data.deploymentId,
        error: error.message,
        webhookUrl: this.webhookUrl
      })
    }
  }

  async testWebhookConnection(): Promise<boolean> {
    if (!this.webhookUrl) {
      return false
    }

    try {
      const testPayload = {
        type: 'test',
        timestamp: new Date().toISOString(),
        message: 'Webhook连接测试'
      }

      await axios.post(this.webhookUrl, testPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      return true
    } catch (error) {
      logger.error('Webhook连接测试失败', error)
      return false
    }
  }
}
