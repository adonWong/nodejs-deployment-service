import type { Request, Response } from 'express'
import { deploymentQueue, redis } from '../jobs/deploymentJob'
import type { ApiResponse, DeploymentStatus } from '../types/interfaces'
import logger from '../utils/logger'

export class DeploymentController {
  async getDeploymentStatus(req: Request, res: Response): Promise<void> {
    const { deploymentId } = req.params

    if (!deploymentId) {
      const response: ApiResponse = {
        success: false,
        message: '部署ID不能为空',
        timestamp: new Date().toISOString()
      }

      res.status(400).json(response)
      return
    }

    try {
      // 从Redis获取部署状态
      const statusKey = `deployment:${deploymentId}:status`
      const logsKey = `deployment:${deploymentId}:logs`

      const statusData = await redis.hgetall(statusKey)
      const logs = await redis.lrange(logsKey, 0, -1)

      if (!statusData || !statusData.status) {
        // 检查任务队列中是否有这个任务
        const job = await deploymentQueue.getJob(deploymentId)

        if (!job) {
          const response: ApiResponse = {
            success: false,
            message: '部署任务不存在',
            timestamp: new Date().toISOString()
          }

          res.status(404).json(response)
          return
        }

        // 从任务队列获取状态
        const jobState = await job.getState()
        const jobProgress = job.progress()

        const deploymentStatus: DeploymentStatus = {
          deploymentId,
          status: this.mapJobStateToStatus(jobState),
          progress: typeof jobProgress === 'number' ? jobProgress : 0,
          currentStep: this.getCurrentStep(jobState, jobProgress),
          logs: [],
          startTime: new Date(job.timestamp).toISOString()
        }

        const response: ApiResponse = {
          success: true,
          data: deploymentStatus,
          message: '部署状态获取成功',
          timestamp: new Date().toISOString()
        }

        res.json(response)
        return
      }

      // 解析日志
      const parsedLogs = logs.map(logStr => {
        try {
          return JSON.parse(logStr)
        } catch {
          return {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: logStr
          }
        }
      })

      const deploymentStatus: DeploymentStatus = {
        deploymentId,
        status: statusData.status as any,
        progress: parseInt(statusData.progress) || 0,
        currentStep: statusData.currentStep || '准备中',
        logs: parsedLogs,
        startTime: statusData.startTime,
        endTime: statusData.endTime,
        estimatedCompletion: statusData.estimatedCompletion
      }

      const response: ApiResponse = {
        success: true,
        data: deploymentStatus,
        message: '部署状态获取成功',
        timestamp: new Date().toISOString()
      }

      res.json(response)
    } catch (error) {
      logger.error(`获取部署状态失败 [${deploymentId}]`, error)

      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      }

      res.status(500).json(response)
    }
  }

  async getDeploymentHistory(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 50, offset = 0 } = req.query

      // 获取最近的部署记录
      const keys = await redis.keys('deployment:*:status')
      const deploymentIds = keys.map(key => key.split(':')[1])

      // 分页
      const startIndex = parseInt(offset as string) || 0
      const endIndex = startIndex + (parseInt(limit as string) || 50)
      const paginatedIds = deploymentIds.slice(startIndex, endIndex)

      const deployments = []

      for (const deploymentId of paginatedIds) {
        const statusKey = `deployment:${deploymentId}:status`
        const statusData = await redis.hgetall(statusKey)

        if (statusData && statusData.status) {
          deployments.push({
            deploymentId,
            status: statusData.status,
            progress: parseInt(statusData.progress) || 0,
            currentStep: statusData.currentStep || '未知',
            startTime: statusData.startTime,
            endTime: statusData.endTime
          })
        }
      }

      // 按开始时间降序排列
      deployments.sort((a, b) => {
        const timeA = new Date(a.startTime).getTime()
        const timeB = new Date(b.startTime).getTime()
        return timeB - timeA
      })

      const response: ApiResponse = {
        success: true,
        data: {
          deployments,
          total: deploymentIds.length,
          offset: startIndex,
          limit: parseInt(limit as string) || 50
        },
        message: '部署历史获取成功',
        timestamp: new Date().toISOString()
      }

      res.json(response)
    } catch (error) {
      logger.error('获取部署历史失败', error)

      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      }

      res.status(500).json(response)
    }
  }

  private mapJobStateToStatus(jobState: string): DeploymentStatus['status'] {
    switch (jobState) {
      case 'waiting':
        return 'pending'
      case 'active':
        return 'building'
      case 'completed':
        return 'completed'
      case 'failed':
        return 'failed'
      default:
        return 'pending'
    }
  }

  private getCurrentStep(jobState: string, progress: any): string {
    if (jobState === 'waiting') return '等待中'
    if (jobState === 'failed') return '失败'
    if (jobState === 'completed') return '完成'

    const progressNum = typeof progress === 'number' ? progress : 0

    if (progressNum < 40) return '构建中'
    if (progressNum < 50) return '获取配置中'
    if (progressNum < 90) return '上传中'
    if (progressNum < 100) return '清理中'
    return '完成'
  }
}
