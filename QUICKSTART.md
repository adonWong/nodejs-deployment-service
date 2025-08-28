# 快速使用指南

## 项目已创建完成！

部署服务已在 `deployment-service/` 目录下创建完成，包含以下功能：

### 🎯 核心功能
- ✅ Webhook通知接收
- ✅ 自动构建前端项目
- ✅ 动态获取服务器配置
- ✅ SFTP文件上传
- ✅ 任务队列管理
- ✅ 实时状态监控
- ✅ 完整日志记录
- ✅ 健康检查接口

### 🚀 快速开始

1. **进入项目目录**
```bash
cd deployment-service
```

2. **安装依赖**
```bash
pnpm install
```

3. **配置环境变量**
编辑 `.env` 文件，设置以下重要配置：
- `PROJECT_PATH`: 您的前端项目路径 (默认已设置为当前项目)
- `BACKEND_SERVICE_URL`: 提供服务器配置的后端服务地址
- `BACKEND_API_TOKEN`: 后端服务API令牌
- `WEBHOOK_SECRET`: Webhook验证密钥
- `REDIS_HOST`: Redis服务器地址

4. **启动Redis服务** (如果未启动)
```bash
# Windows
redis-server

# Linux/Mac
sudo systemctl start redis
# 或
redis-server
```

5. **启动开发服务**
```bash
# 开发模式
pnpm run dev

# 或使用启动脚本
bash start.sh --mode dev
```

### 📡 API测试

服务启动后，可以测试以下接口：

1. **健康检查**
```bash
curl http://localhost:3001/health
```

2. **触发部署** (需要配置正确的密钥)
```bash
curl -X POST http://localhost:3001/api/webhook/deploy \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-webhook-secret" \
  -d '{
    "projectId": "frontend-project",
    "branch": "master", 
    "commitHash": "abc123",
    "triggerBy": "test",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
  }'
```

3. **查询部署状态**
```bash
curl http://localhost:3001/api/deployment/{deploymentId}/status
```

### ⚙️ 生产部署

```bash
# 构建项目
pnpm run build

# 使用PM2启动
pnpm run pm2:start

# 查看日志
pnpm run pm2:logs
```

### 📋 后端服务接口要求

您的后端服务需要提供以下接口：

```javascript
POST /api/server/config
Authorization: Bearer {API_TOKEN}
Content-Type: application/json

{
  "projectId": "frontend-project",
  "deploymentId": "deploy-xxx",
  "purpose": "frontend-deployment"
}

// 返回格式
{
  "success": true,
  "data": {
    "host": "192.168.1.100",
    "port": 22,
    "username": "deploy",
    "password": "password123",
    "deployPath": "/var/www/html",
    "backupPath": "/var/www/backup"  // 可选
  }
}
```

### 📝 注意事项

1. **安全配置**
   - 修改默认的 `WEBHOOK_SECRET`
   - 使用强密码和SSH密钥认证
   - 配置防火墙规则

2. **性能优化**
   - 根据需求调整Redis配置
   - 配置适当的并发数和超时时间
   - 监控系统资源使用情况

3. **日志管理**
   - 定期清理日志文件
   - 配置日志轮转策略
   - 设置日志级别

### 🔗 相关链接

- 详细文档: `README.md`
- 设计方案: `../auto-deployment-solution.md`
- API文档: 查看README中的API部分

---

## 项目结构

```
deployment-service/
├── src/
│   ├── controllers/          # API控制器
│   │   ├── webhookController.ts
│   │   ├── deploymentController.ts
│   │   └── healthController.ts
│   ├── services/            # 核心服务
│   │   ├── buildService.ts
│   │   ├── configService.ts
│   │   ├── uploadService.ts
│   │   └── notificationService.ts
│   ├── jobs/               # 任务队列
│   │   └── deploymentJob.ts
│   ├── utils/              # 工具函数
│   │   ├── logger.ts
│   │   └── validator.ts
│   ├── types/              # 类型定义
│   │   └── interfaces.ts
│   ├── config/             # 配置管理
│   │   └── index.ts
│   └── app.ts              # 应用入口
├── logs/                   # 日志文件
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript配置
├── ecosystem.config.js    # PM2配置
├── .env                   # 环境变量
├── .gitignore            # Git忽略文件
├── start.sh              # 启动脚本
└── README.md             # 详细文档
```

🎉 **项目创建完成！现在您可以开始使用这个强大的自动化部署服务了！**