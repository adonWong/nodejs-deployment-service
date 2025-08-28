# 前端自动化部署方案设计

## 项目概述

基于现有的Vue3 + Vite + TypeScript前端项目，设计一个完整的自动化部署解决方案。该方案包含通知接收、自动构建、服务器配置获取和文件上传等核心功能。

## 技术栈分析

### 前端项目技术栈
- **框架**: Vue 3.5.13 + TypeScript 5.8.3
- **构建工具**: Vite 6.3.3
- **UI组件库**: Element Plus 2.9.8
- **包管理器**: pnpm
- **构建命令**: `pnpm build` (输出到 `dist` 目录)

### 部署方案技术选择
- **Node.js后端服务**: Express.js + TypeScript
- **文件上传**: node-ssh + sftp
- **任务队列**: Bull (Redis-based)
- **日志系统**: Winston
- **配置管理**: dotenv
- **进程管理**: PM2

## 系统架构设计

```
┌─────────────────┐    HTTP POST    ┌─────────────────────┐
│   通知源服务    │ ───────────────→ │   部署服务API      │
└─────────────────┘                 └─────────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────────┐
                                    │   构建任务队列      │
                                    └─────────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────────┐
                                    │   前端项目构建      │
                                    │   (pnpm build)      │
                                    └─────────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────────┐
                                    │   获取服务器配置    │
                                    │   (API调用)         │
                                    └─────────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────────┐
                                    │   SFTP文件上传      │
                                    │   到目标服务器      │
                                    └─────────────────────┘
```

## 详细实现方案

### 1. Node.js部署服务结构

```
deployment-service/
├── src/
│   ├── controllers/
│   │   ├── webhookController.ts     # 接收通知的控制器
│   │   └── deploymentController.ts  # 部署状态查询控制器
│   ├── services/
│   │   ├── buildService.ts          # 构建服务
│   │   ├── configService.ts         # 配置获取服务
│   │   ├── uploadService.ts         # 文件上传服务
│   │   └── notificationService.ts   # 通知服务
│   ├── jobs/
│   │   └── deploymentJob.ts         # 部署任务处理
│   ├── utils/
│   │   ├── logger.ts                # 日志工具
│   │   └── validator.ts             # 数据验证
│   ├── types/
│   │   └── interfaces.ts            # 类型定义
│   ├── config/
│   │   └── index.ts                 # 配置管理
│   └── app.ts                       # 应用入口
├── package.json
├── tsconfig.json
├── .env
└── ecosystem.config.js              # PM2配置
```

### 2. 核心API接口设计

#### 2.1 接收部署通知
```typescript
POST /api/webhook/deploy
Content-Type: application/json

{
  "projectId": "frontend-project",
  "branch": "master",
  "commitHash": "abc123",
  "triggerBy": "backend-service",
  "timestamp": "2025-01-07T10:00:00Z",
  "metadata": {
    "buildType": "production",
    "priority": "high"
  }
}

Response:
{
  "success": true,
  "deploymentId": "deploy-123456",
  "message": "部署任务已创建",
  "estimatedTime": "5-10分钟"
}
```

#### 2.2 查询部署状态
```typescript
GET /api/deployment/{deploymentId}/status

Response:
{
  "deploymentId": "deploy-123456",
  "status": "in_progress", // pending, building, uploading, completed, failed
  "progress": 60,
  "currentStep": "uploading",
  "logs": [
    {
      "timestamp": "2025-01-07T10:05:00Z",
      "level": "info",
      "message": "开始构建项目..."
    }
  ],
  "startTime": "2025-01-07T10:00:00Z",
  "estimatedCompletion": "2025-01-07T10:08:00Z"
}
```

### 3. 部署流程实现

#### 3.1 Webhook控制器
```typescript
// src/controllers/webhookController.ts
import { Request, Response } from 'express';
import { deploymentQueue } from '../jobs/deploymentJob';
import { validateDeploymentRequest } from '../utils/validator';
import logger from '../utils/logger';

export class WebhookController {
  async handleDeployment(req: Request, res: Response) {
    try {
      // 验证请求数据
      const deploymentData = validateDeploymentRequest(req.body);
      
      // 创建部署任务ID
      const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 添加到任务队列
      await deploymentQueue.add('build-and-deploy', {
        deploymentId,
        ...deploymentData
      }, {
        priority: deploymentData.metadata?.priority === 'high' ? 10 : 5,
        attempts: 3,
        backoff: 'exponential'
      });
      
      logger.info(`部署任务已创建: ${deploymentId}`, { deploymentData });
      
      res.json({
        success: true,
        deploymentId,
        message: '部署任务已创建',
        estimatedTime: '5-10分钟'
      });
    } catch (error) {
      logger.error('创建部署任务失败', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
```

#### 3.2 构建服务
```typescript
// src/services/buildService.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import logger from '../utils/logger';

const execAsync = promisify(exec);

export class BuildService {
  private readonly projectPath: string;
  private readonly distPath: string;
  
  constructor() {
    this.projectPath = process.env.PROJECT_PATH || '/path/to/frontend-project';
    this.distPath = path.join(this.projectPath, 'dist');
  }
  
  async buildProject(deploymentId: string): Promise<string> {
    try {
      logger.info(`开始构建项目 [${deploymentId}]`, { projectPath: this.projectPath });
      
      // 切换到项目目录并执行构建
      const { stdout, stderr } = await execAsync('pnpm build', {
        cwd: this.projectPath,
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=8192'
        }
      });
      
      if (stderr) {
        logger.warn(`构建警告 [${deploymentId}]`, { stderr });
      }
      
      // 验证构建结果
      if (!await fs.pathExists(this.distPath)) {
        throw new Error('构建失败：dist目录未生成');
      }
      
      logger.info(`项目构建完成 [${deploymentId}]`, { distPath: this.distPath });
      return this.distPath;
      
    } catch (error) {
      logger.error(`项目构建失败 [${deploymentId}]`, error);
      throw new Error(`构建失败: ${error.message}`);
    }
  }
  
  async cleanupBuild(deploymentId: string): Promise<void> {
    try {
      if (await fs.pathExists(this.distPath)) {
        await fs.remove(this.distPath);
        logger.info(`清理构建文件 [${deploymentId}]`);
      }
    } catch (error) {
      logger.error(`清理构建文件失败 [${deploymentId}]`, error);
    }
  }
}
```

#### 3.3 配置获取服务
```typescript
// src/services/configService.ts
import axios from 'axios';
import logger from '../utils/logger';

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  deployPath: string;
  backupPath?: string;
}

export class ConfigService {
  private readonly backendServiceUrl: string;
  
  constructor() {
    this.backendServiceUrl = process.env.BACKEND_SERVICE_URL || 'http://localhost:3000';
  }
  
  async getServerConfig(deploymentId: string, projectId: string): Promise<ServerConfig> {
    try {
      logger.info(`获取服务器配置 [${deploymentId}]`, { projectId });
      
      const response = await axios.post(`${this.backendServiceUrl}/api/server/config`, {
        projectId,
        deploymentId,
        purpose: 'frontend-deployment'
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BACKEND_API_TOKEN}`
        }
      });
      
      if (!response.data || !response.data.success) {
        throw new Error('获取服务器配置失败');
      }
      
      const config = response.data.data;
      
      // 验证必需字段
      if (!config.host || !config.username || !config.password || !config.deployPath) {
        throw new Error('服务器配置不完整');
      }
      
      logger.info(`服务器配置获取成功 [${deploymentId}]`, { 
        host: config.host,
        deployPath: config.deployPath 
      });
      
      return config;
      
    } catch (error) {
      logger.error(`获取服务器配置失败 [${deploymentId}]`, error);
      throw new Error(`配置获取失败: ${error.message}`);
    }
  }
}
```

#### 3.4 文件上传服务
```typescript
// src/services/uploadService.ts
import { NodeSSH } from 'node-ssh';
import path from 'path';
import fs from 'fs-extra';
import logger from '../utils/logger';
import { ServerConfig } from './configService';

export class UploadService {
  async uploadToServer(
    deploymentId: string,
    localPath: string,
    serverConfig: ServerConfig
  ): Promise<void> {
    const ssh = new NodeSSH();
    
    try {
      logger.info(`连接服务器 [${deploymentId}]`, { 
        host: serverConfig.host,
        username: serverConfig.username 
      });
      
      // 连接SSH
      await ssh.connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        readyTimeout: 30000
      });
      
      // 创建备份（如果指定了备份路径）
      if (serverConfig.backupPath) {
        await this.createBackup(ssh, deploymentId, serverConfig);
      }
      
      // 创建部署目录（如果不存在）
      await ssh.execCommand(`mkdir -p ${serverConfig.deployPath}`);
      
      // 清空目标目录
      await ssh.execCommand(`rm -rf ${serverConfig.deployPath}/*`);
      
      logger.info(`开始上传文件 [${deploymentId}]`, {
        from: localPath,
        to: serverConfig.deployPath
      });
      
      // 上传构建文件
      await ssh.putDirectory(localPath, serverConfig.deployPath, {
        recursive: true,
        concurrency: 3,
        validate: (itemPath) => {
          // 排除隐藏文件和系统文件
          const basename = path.basename(itemPath);
          return !basename.startsWith('.') && basename !== 'node_modules';
        },
        tick: (localPath, remotePath, error) => {
          if (error) {
            logger.error(`文件上传失败 [${deploymentId}]`, { localPath, error });
          } else {
            logger.debug(`文件已上传 [${deploymentId}]`, { localPath, remotePath });
          }
        }
      });
      
      // 设置文件权限
      await ssh.execCommand(`chmod -R 755 ${serverConfig.deployPath}`);
      
      logger.info(`文件上传完成 [${deploymentId}]`);
      
    } catch (error) {
      logger.error(`文件上传失败 [${deploymentId}]`, error);
      throw new Error(`上传失败: ${error.message}`);
    } finally {
      ssh.dispose();
    }
  }
  
  private async createBackup(
    ssh: NodeSSH,
    deploymentId: string,
    serverConfig: ServerConfig
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(serverConfig.backupPath!, `backup-${timestamp}`);
      
      // 检查部署目录是否存在
      const { code } = await ssh.execCommand(`test -d ${serverConfig.deployPath}`);
      if (code === 0) {
        await ssh.execCommand(`mkdir -p ${serverConfig.backupPath}`);
        await ssh.execCommand(`cp -r ${serverConfig.deployPath} ${backupDir}`);
        logger.info(`备份已创建 [${deploymentId}]`, { backupDir });
        
        // 保留最近5个备份
        await ssh.execCommand(`cd ${serverConfig.backupPath} && ls -t | tail -n +6 | xargs -r rm -rf`);
      }
    } catch (error) {
      logger.warn(`创建备份失败 [${deploymentId}]`, error);
    }
  }
}
```

#### 3.5 部署任务处理
```typescript
// src/jobs/deploymentJob.ts
import Bull from 'bull';
import Redis from 'ioredis';
import { BuildService } from '../services/buildService';
import { ConfigService } from '../services/configService';
import { UploadService } from '../services/uploadService';
import { NotificationService } from '../services/notificationService';
import logger from '../utils/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

export const deploymentQueue = new Bull('deployment', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

const buildService = new BuildService();
const configService = new ConfigService();
const uploadService = new UploadService();
const notificationService = new NotificationService();

deploymentQueue.process('build-and-deploy', async (job) => {
  const { deploymentId, projectId, branch, commitHash } = job.data;
  
  try {
    logger.info(`开始执行部署任务 [${deploymentId}]`, job.data);
    
    // 更新任务状态
    await job.progress(10);
    await updateDeploymentStatus(deploymentId, 'building', '开始构建项目...');
    
    // 1. 构建项目
    const distPath = await buildService.buildProject(deploymentId);
    await job.progress(40);
    await updateDeploymentStatus(deploymentId, 'building', '项目构建完成，准备上传...');
    
    // 2. 获取服务器配置
    const serverConfig = await configService.getServerConfig(deploymentId, projectId);
    await job.progress(50);
    await updateDeploymentStatus(deploymentId, 'uploading', '开始上传文件到服务器...');
    
    // 3. 上传文件
    await uploadService.uploadToServer(deploymentId, distPath, serverConfig);
    await job.progress(90);
    await updateDeploymentStatus(deploymentId, 'uploading', '文件上传完成...');
    
    // 4. 清理构建文件
    await buildService.cleanupBuild(deploymentId);
    await job.progress(100);
    await updateDeploymentStatus(deploymentId, 'completed', '部署完成');
    
    // 5. 发送成功通知
    await notificationService.sendSuccessNotification(deploymentId, {
      projectId,
      branch,
      commitHash,
      serverHost: serverConfig.host,
      deployPath: serverConfig.deployPath
    });
    
    logger.info(`部署任务完成 [${deploymentId}]`);
    
  } catch (error) {
    logger.error(`部署任务失败 [${deploymentId}]`, error);
    await updateDeploymentStatus(deploymentId, 'failed', `部署失败: ${error.message}`);
    await notificationService.sendFailureNotification(deploymentId, error);
    throw error;
  }
});

async function updateDeploymentStatus(
  deploymentId: string,
  status: string,
  message: string
): Promise<void> {
  const statusKey = `deployment:${deploymentId}:status`;
  await redis.hset(statusKey, {
    status,
    message,
    updatedAt: new Date().toISOString()
  });
  await redis.expire(statusKey, 86400); // 24小时过期
}

// 处理失败任务
deploymentQueue.on('failed', async (job, err) => {
  logger.error(`部署任务失败 [${job.data.deploymentId}]`, err);
  await updateDeploymentStatus(job.data.deploymentId, 'failed', err.message);
});

// 处理完成任务
deploymentQueue.on('completed', async (job) => {
  logger.info(`部署任务完成 [${job.data.deploymentId}]`);
});
```

### 4. 配置文件示例

#### 4.1 环境配置 (.env)
```bash
# 应用配置
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# 前端项目路径
PROJECT_PATH=/path/to/frontend-project

# 后端服务配置
BACKEND_SERVICE_URL=http://your-backend-service:3000
BACKEND_API_TOKEN=your-api-token

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 安全配置
WEBHOOK_SECRET=your-webhook-secret
API_RATE_LIMIT=100

# 通知配置
NOTIFICATION_WEBHOOK_URL=http://your-notification-service/webhook
EMAIL_SERVICE_API_KEY=your-email-api-key
```

#### 4.2 PM2配置 (ecosystem.config.js)
```javascript
module.exports = {
  apps: [
    {
      name: 'deployment-service',
      script: 'dist/app.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      max_memory_restart: '1G'
    }
  ]
};
```

### 5. 安全考虑

#### 5.1 认证与授权
- 使用API Token验证通知源身份
- 实现请求签名验证机制
- 限制IP白名单访问

#### 5.2 数据验证
- 严格验证所有输入数据
- 防止路径遍历攻击
- 限制文件上传大小

#### 5.3 网络安全
- 使用HTTPS传输
- SSH密钥认证优于密码
- 配置防火墙规则

### 6. 监控与日志

#### 6.1 日志记录
- 结构化日志格式
- 不同级别的日志分离
- 敏感信息脱敏处理

#### 6.2 监控指标
- 部署成功率
- 平均部署时间
- 系统资源使用率
- 错误率统计

#### 6.3 告警机制
- 部署失败告警
- 系统异常告警
- 性能阈值告警

### 7. 部署和运维

#### 7.1 服务部署
```bash
# 克隆项目
git clone <deployment-service-repo>
cd deployment-service

# 安装依赖
npm install

# 构建项目
npm run build

# 启动Redis服务
systemctl start redis

# 使用PM2启动服务
pm2 start ecosystem.config.js --env production

# 查看日志
pm2 logs deployment-service
```

#### 7.2 健康检查
```typescript
// 健康检查端点
app.get('/health', async (req, res) => {
  const checks = {
    redis: await checkRedisConnection(),
    frontendProject: await checkProjectAccess(),
    backendService: await checkBackendService()
  };
  
  const healthy = Object.values(checks).every(Boolean);
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

#### 7.3 备份策略
- 定期备份部署历史
- 配置文件版本控制
- 数据库备份（如果使用）

### 8. 优化建议

#### 8.1 性能优化
- 启用构建缓存
- 并行文件上传
- 增量部署支持
- CDN集成

#### 8.2 可扩展性
- 支持多环境部署
- 蓝绿部署策略
- 回滚机制
- 多项目管理

#### 8.3 用户体验
- 实时部署状态推送
- 部署历史查询
- Web管理界面
- 移动端通知

## 总结

该方案提供了一个完整的前端自动化部署解决方案，具备以下特点：

1. **可靠性**: 完善的错误处理和重试机制
2. **安全性**: 多层安全防护措施
3. **可监控**: 详细的日志和监控指标
4. **可扩展**: 支持多项目和多环境
5. **易维护**: 模块化设计和清晰的代码结构

通过该方案，可以实现从接收通知到完成部署的全自动化流程，大幅提高部署效率和可靠性。