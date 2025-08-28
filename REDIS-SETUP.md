# Redis 安装和启动指南

## Windows 环境

### 1. 下载并安装Redis
访问 Redis官网下载页面或使用以下方式：

#### 使用Chocolatey (推荐)
```bash
# 安装Chocolatey (如果未安装)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装Redis
choco install redis-64
```

#### 手动下载
1. 下载: https://github.com/tporadowski/redis/releases
2. 解压到 `C:\Redis\` 
3. 将 `C:\Redis\` 添加到系统PATH

### 2. 启动Redis服务

#### 方式1: 命令行启动
```bash
# 启动Redis服务器
redis-server

# 或指定配置文件
redis-server redis.windows.conf
```

#### 方式2: 注册为Windows服务
```bash
# 注册服务
redis-server --service-install redis.windows.conf

# 启动服务
redis-server --service-start

# 停止服务
redis-server --service-stop
```

### 3. 测试Redis连接
```bash
redis-cli ping
# 应该返回: PONG
```

## Linux/Mac 环境

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

### CentOS/RHEL
```bash
sudo yum install epel-release
sudo yum install redis
sudo systemctl start redis
sudo systemctl enable redis
```

### macOS
```bash
# 使用Homebrew
brew install redis
brew services start redis
```

## Docker方式 (跨平台)

### 快速启动Redis容器
```bash
# 启动Redis容器
docker run -d --name redis -p 6379:6379 redis:alpine

# 测试连接
docker exec -it redis redis-cli ping
```

### 使用docker-compose
创建 `docker-compose.yml`:
```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    container_name: deployment-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

启动:
```bash
docker-compose up -d
```

## 验证Redis是否正常运行

```bash
# 检查Redis进程
netstat -an | findstr 6379  # Windows
netstat -an | grep 6379     # Linux/Mac

# 使用redis-cli测试
redis-cli ping
redis-cli info server
```