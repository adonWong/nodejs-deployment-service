# 前端自动化部署服务

基于 Node.js + Express + TypeScript 的前端自动化部署服务，支持接收通知、自动构建、服务器配置获取和文件上传。

## 功能特性

- 🚀 **自动化部署**: 接收通知后自动构建并部署前端项目
- 📦 **任务队列**: 基于 Redis 的可靠任务队列系统
- 🔒 **安全认证**: 支持 Webhook 密钥验证和 API Token 认证
- 📊 **状态监控**: 实时部署状态查询和历史记录
- 🔄 **自动重试**: 支持失败任务自动重试机制
- 📝 **详细日志**: 完整的部署日志记录和查询
- 🏥 **健康检查**: 完善的服务健康状态检查
- 📧 **通知系统**: 部署完成后自动发送通知

## 技术栈

- **运行环境**: Node.js 18+
- **开发语言**: TypeScript
- **Web框架**: Express.js
- **任务队列**: Bull (Redis-based)
- **文件上传**: node-ssh + SFTP
- **日志系统**: Winston
- **进程管理**: PM2
- **数据存储**: Redis

## 快速开始

### 1. 环境要求

- Node.js >= 18.0.0
- Redis >= 6.0
- pnpm >= 8.0

### 2. 安装依赖

```bash
cd deployment-service
pnpm install
```

### 3. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 应用配置
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# 前端项目路径 (修改为您的项目实际路径)
PROJECT_PATH=""

# 后端服务配置
BACKEND_SERVICE_URL=http://localhost:3000
BACKEND_API_TOKEN=your-backend-api-token-here

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 安全配置
WEBHOOK_SECRET=your-webhook-secret-here
API_RATE_LIMIT=100

# 通知配置
NOTIFICATION_WEBHOOK_URL=http://localhost:3000/api/deployment/notification
```

### 4. 启动开发服务

```bash
# 开发模式
pnpm run dev

# 或者构建后启动
pnpm run build
pnpm start
```

### 5. 使用 PM2 启动生产服务

```bash
# 启动生产服务
pnpm run pm2:start

# 查看日志
pnpm run pm2:logs

# 停止服务
pnpm run pm2:stop
```

## API 文档

### 1. 部署通知

触发自动部署：

```bash
POST /api/webhook/deploy
Content-Type: application/json
X-Webhook-Secret: your-webhook-secret

{
  \"projectId\": \"frontend-project\",
  \"branch\": \"master\",
  \"commitHash\": \"abc123\",
  \"triggerBy\": \"backend-service\",
  \"timestamp\": \"2025-01-07T10:00:00Z\",
  \"metadata\": {
    \"buildType\": \"production\",
    \"priority\": \"high\"
  }
}
```

### 2. 查询部署状态

```bash
GET /api/deployment/{deploymentId}/status
```

### 3. 部署历史

```bash
GET /api/deployments/history?limit=50&offset=0
```

### 4. 队列状态

```bash
GET /api/queue/status
```

### 5. 健康检查

```bash
GET /health
GET /health/detailed
```

## 部署流程

1. **接收通知**: 接收来自其他服务的部署通知
2. **验证请求**: 验证请求数据和认证信息
3. **创建任务**: 将部署任务加入队列
4. **构建项目**: 执行 `pnpm build` 构建前端项目
5. **获取配置**: 从后端服务获取目标服务器配置
6. **上传文件**: 通过 SFTP 上传构建文件到目标服务器
7. **清理资源**: 清理本地构建文件
8. **发送通知**: 发送部署结果通知

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 服务端口 | `3001` |
| `PROJECT_PATH` | 前端项目路径 | `../` |
| `BACKEND_SERVICE_URL` | 后端服务地址 | `http://localhost:3000` |
| `BACKEND_API_TOKEN` | 后端服务API令牌 | - |
| `REDIS_HOST` | Redis主机 | `localhost` |
| `REDIS_PORT` | Redis端口 | `6379` |
| `WEBHOOK_SECRET` | Webhook密钥 | - |
| `NOTIFICATION_WEBHOOK_URL` | 通知回调地址 | - |

### 构建配置

- **构建命令**: `pnpm build`
- **输出目录**: `dist`
- **超时时间**: 10分钟
- **内存限制**: 8GB

## 监控和日志

### 日志文件

- `logs/combined.log` - 综合日志
- `logs/error.log` - 错误日志
- `logs/err.log` - PM2错误日志
- `logs/out.log` - PM2输出日志

### 监控指标

- 部署成功率
- 平均部署时间
- 任务队列状态
- 系统资源使用

## 安全配置

### 1. Webhook安全

- 使用 `X-Webhook-Secret` 头进行身份验证
- 请求体数据验证
- IP白名单（可选）

### 2. API安全

- 速率限制
- 请求大小限制
- 安全头设置

### 3. 服务器连接安全

- SSH密钥认证（推荐）
- 密码加密存储
- 连接超时设置

## 故障排除

### 常见问题

1. **构建失败**
   - 检查项目路径是否正确
   - 确认 `package.json` 存在
   - 检查依赖是否已安装

2. **连接Redis失败**
   - 确认Redis服务运行状态
   - 检查连接配置
   - 验证网络连通性

3. **文件上传失败**
   - 检查服务器SSH配置
   - 验证用户权限
   - 确认目标目录存在

4. **获取服务器配置失败**
   - 检查后端服务状态
   - 验证API Token
   - 确认接口地址正确

### 日志查看

```bash
# 查看实时日志
pm2 logs deployment-service

# 查看错误日志
tail -f logs/error.log

# 查看综合日志
tail -f logs/combined.log
```

## 开发指南

### 项目结构

```
deployment-service/
├── src/
│   ├── controllers/     # API控制器
│   ├── services/        # 业务服务
│   ├── jobs/           # 任务队列
│   ├── utils/          # 工具函数
│   ├── types/          # 类型定义
│   ├── config/         # 配置管理
│   └── app.ts          # 应用入口
├── logs/               # 日志文件
├── dist/               # 编译输出
├── package.json
├── tsconfig.json
├── ecosystem.config.js # PM2配置
└── .env               # 环境变量
```

### 开发命令

```bash
# 开发模式
pnpm run dev

# 构建项目
pnpm run build

# 代码检查
pnpm run lint
pnpm run lint:fix

# 运行测试
pnpm test
```

## 许可证

MIT License