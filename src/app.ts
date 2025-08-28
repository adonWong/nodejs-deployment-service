import compression from 'compression'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config'
import { DeploymentController } from './controllers/deploymentController'
import { HealthController } from './controllers/healthController'
import { WebhookController } from './controllers/webhookController'
import type { ApiResponse } from './types/interfaces'
import logger from './utils/logger'

// 导入队列以确保任务处理器被注册
import './jobs/deploymentJob'

class DeploymentServiceApp {
  private app: express.Application
  private webhookController = new WebhookController()
  private deploymentController = new DeploymentController()
  private healthController = new HealthController()

  constructor() {
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
    this.setupErrorHandling()
  }

  private setupMiddleware(): void {
    // 安全中间件
    this.app.use(
      helmet({
        contentSecurityPolicy: false // API服务不需要CSP
      })
    )

    // CORS配置
    this.app.use(
      cors({
        origin: config.NODE_ENV === 'production' ? false : true, // 生产环境需要配置具体域名
        credentials: true
      })
    )

    // 压缩
    this.app.use(compression())

    // 请求体解析
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // 日志中间件
    if (config.NODE_ENV !== 'test') {
      this.app.use(
        morgan('combined', {
          stream: {
            write: (message: string) => {
              logger.info(message.trim(), { source: 'http' })
            }
          }
        })
      )
    }

    // 速率限制
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: config.API_RATE_LIMIT, // 限制每个IP的请求数
      message: {
        success: false,
        message: '请求过于频繁，请稍后再试',
        timestamp: new Date().toISOString()
      },
      standardHeaders: true,
      legacyHeaders: false
    })
    this.app.use('/api/', limiter)

    // 信任代理
    this.app.set('trust proxy', 1)
  }

  private setupRoutes(): void {
    // 简单健康检查（不需要限流）
    this.app.get('/health', (req, res) => {
      try {
        res.json({
          success: true,
          data: {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '1.0.0',
            redis: config.REDIS.ENABLED ? 'enabled' : 'disabled (memory mode)',
            projectPath: config.PROJECT_PATH
          },
          message: '服务健康',
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    this.app.get('/health/detailed', this.healthController.getDetailedHealth.bind(this.healthController))

    // API路由
    const apiRouter = express.Router()

    // Webhook路由
    apiRouter.post('/webhook/deploy', this.webhookController.handleDeployment.bind(this.webhookController))
    apiRouter.post('/webhook/deploy-multi', this.webhookController.handleMultiProjectDeployment.bind(this.webhookController))
    apiRouter.get('/queue/status', this.webhookController.getQueueStatus.bind(this.webhookController))

    // 部署状态路由
    apiRouter.get(
      '/deployment/:deploymentId/status',
      this.deploymentController.getDeploymentStatus.bind(this.deploymentController)
    )
    apiRouter.get(
      '/deployments/history',
      this.deploymentController.getDeploymentHistory.bind(this.deploymentController)
    )

    this.app.use('/api', apiRouter)

    // 根路由
    this.app.get('/', (req, res) => {
      const response: ApiResponse = {
        success: true,
        data: {
          service: 'Frontend Deployment Service',
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          environment: config.NODE_ENV
        },
        message: '前端自动化部署服务运行中',
        timestamp: new Date().toISOString()
      }
      res.json(response)
    })

    // 404处理
    this.app.use('*', (req, res) => {
      const response: ApiResponse = {
        success: false,
        message: `路径 ${req.originalUrl} 不存在`,
        timestamp: new Date().toISOString()
      }
      res.status(404).json(response)
    })
  }

  private setupErrorHandling(): void {
    // 全局错误处理
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('未处理的错误', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })

      const response: ApiResponse = {
        success: false,
        message: config.NODE_ENV === 'production' ? '内部服务器错误' : err.message,
        timestamp: new Date().toISOString()
      }

      res.status(500).json(response)
    })

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', { reason, promise })
    })

    // 未捕获的异常
    process.on('uncaughtException', error => {
      logger.error('未捕获的异常', error)
      process.exit(1)
    })
  }

  public start(): void {
    const port = config.PORT

    this.app.listen(port, () => {
      logger.info(`部署服务启动成功`, {
        port,
        environment: config.NODE_ENV,
        projectPath: config.PROJECT_PATH,
        backendUrl: config.BACKEND_SERVICE_URL,
        redisHost: config.REDIS.HOST,
        redisPort: config.REDIS.PORT
      })
    })
  }

  public getApp(): express.Application {
    return this.app
  }
}

// 启动应用
if (require.main === module) {
  const app = new DeploymentServiceApp()
  app.start()
}

export default DeploymentServiceApp
