import axios, { type AxiosResponse } from 'axios'
import { config } from '../config'
import type { ServerConfig } from '../types/interfaces'
import logger from '../utils/logger'
import { validateServerConfig } from '../utils/validator'

export class ConfigService {
  private readonly backendServiceUrl: string
  private readonly apiToken: string

  constructor() {
    this.backendServiceUrl = config.BACKEND_SERVICE_URL
    this.apiToken = config.BACKEND_API_TOKEN
  }

  async getServerConfig(deploymentId: string, projectId: string): Promise<ServerConfig> {
    try {
      logger.info(`获取服务器配置 [${deploymentId}]`, {
        projectId,
        backendUrl: this.backendServiceUrl
      })

      if (!this.apiToken) {
        throw new Error('后端服务API Token未配置')
      }

      const response: AxiosResponse = await axios.post(
        `${this.backendServiceUrl}/api/server/config`,
        {
          projectId,
          deploymentId,
          purpose: 'frontend-deployment',
          timestamp: new Date().toISOString()
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
            'User-Agent': 'deployment-service/1.0.0'
          }
        }
      )

      if (!response.data) {
        throw new Error('后端服务返回空响应')
      }

      if (!response.data.success) {
        throw new Error(`后端服务错误: ${response.data.message || '未知错误'}`)
      }

      const serverConfig = response.data.data
      if (!serverConfig) {
        throw new Error('后端服务未返回配置数据')
      }

      // 验证配置数据
      const validatedConfig = validateServerConfig(serverConfig)

      logger.info(`服务器配置获取成功 [${deploymentId}]`, {
        host: validatedConfig.host,
        port: validatedConfig.port,
        username: validatedConfig.username,
        deployPath: validatedConfig.deployPath,
        hasBackupPath: !!validatedConfig.backupPath
      })

      return validatedConfig
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const statusText = error.response?.statusText
        const responseData = error.response?.data

        logger.error(`获取服务器配置失败 [${deploymentId}]`, {
          status,
          statusText,
          responseData,
          url: error.config?.url,
          method: error.config?.method
        })

        if (status === 401) {
          throw new Error('API Token无效或已过期')
        } else if (status === 404) {
          throw new Error('后端服务接口不存在')
        } else if (status >= 500) {
          throw new Error('后端服务内部错误')
        } else {
          throw new Error(`后端服务错误 (${status}): ${responseData?.message || statusText}`)
        }
      } else {
        logger.error(`获取服务器配置失败 [${deploymentId}]`, error)
        throw new Error(`配置获取失败: ${error.message}`)
      }
    }
  }

  async testBackendConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.backendServiceUrl}/health`, {
        timeout: 5000,
        headers: {
          Authorization: `Bearer ${this.apiToken}`
        }
      })

      return response.status === 200
    } catch (error) {
      logger.error('后端服务连接测试失败', error)
      return false
    }
  }
}
