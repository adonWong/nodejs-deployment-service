# Redis连接问题解决方案

## 问题说明

您遇到的Redis连接错误是因为Redis服务没有启动。我已经为您提供了两个解决方案：

## 解决方案1: 安装Redis (推荐)

### Windows环境下安装Redis

1. **使用Chocolatey安装 (推荐)**
```bash
# 安装Chocolatey (如果未安装)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装Redis
choco install redis-64

# 启动Redis服务
redis-server
```

2. **手动下载安装**
   - 下载地址: https://github.com/tporadowski/redis/releases
   - 解压到 C:\Redis\
   - 运行 redis-server.exe

3. **验证Redis是否运行**
```bash
redis-cli ping
# 应该返回: PONG
```

## 解决方案2: 使用Docker (推荐)

```bash
# 启动Redis容器
docker run -d --name redis -p 6379:6379 redis:alpine

# 测试连接
docker exec -it redis redis-cli ping
```

## 解决方案3: 临时禁用Redis

如果您暂时不想安装Redis，可以继续使用内存存储模式：

1. 确保 `.env` 文件中有：
```
REDIS_ENABLED=false
```

2. 重新启动服务：
```bash
cd deployment-service
pnpm install
pnpm run dev
```

## 当前状态

✅ 项目创建完成  
✅ 配置文件已设置  
✅ 内存存储模式已启用  
⚠️ 需要修复TypeScript类型错误  

## 快速测试

等服务启动后，可以测试这些接口：

```bash
# 健康检查
curl http://localhost:3002/health

# 服务信息  
curl http://localhost:3002/

# 队列状态
curl http://localhost:3002/api/queue/status
```

## 推荐操作顺序

1. **安装Redis** (选择上面的任一方法)
2. **修改.env** 设置 `REDIS_ENABLED=true`  
3. **重启服务**
4. **测试API接口**

Redis安装完成后，您的自动化部署服务将具备完整的功能，包括任务持久化和可靠的队列处理。