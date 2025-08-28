#!/bin/bash

# 前端自动化部署服务启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查环境
check_environment() {
    log_info "检查运行环境..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js 18+"
        exit 1
    fi
    
    # 检查 Node.js 版本
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
        log_error "Node.js 版本过低，当前版本: $NODE_VERSION，要求版本: $REQUIRED_VERSION+"
        exit 1
    fi
    
    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm 未安装，请先安装 pnpm"
        exit 1
    fi
    
    # 检查 Redis
    if ! command -v redis-cli &> /dev/null; then
        log_warn "redis-cli 未找到，请确保 Redis 服务已启动"
    fi
    
    log_info "环境检查完成"
}

# 安装依赖
install_dependencies() {
    log_info "安装项目依赖..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 文件不存在"
        exit 1
    fi
    
    pnpm install
    log_info "依赖安装完成"
}

# 构建项目
build_project() {
    log_info "构建项目..."
    pnpm run build
    log_info "项目构建完成"
}

# 检查配置文件
check_config() {
    log_info "检查配置文件..."
    
    if [ ! -f ".env" ]; then
        log_warn ".env 文件不存在，使用默认配置"
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_info "已复制 .env.example 到 .env，请修改相关配置"
        fi
    fi
    
    # 检查必要的配置项
    if [ -f ".env" ]; then
        source .env
        
        if [ -z "$PROJECT_PATH" ]; then
            log_warn "PROJECT_PATH 未配置，请在 .env 中设置前端项目路径"
        fi
        
        if [ -z "$BACKEND_API_TOKEN" ]; then
            log_warn "BACKEND_API_TOKEN 未配置，请在 .env 中设置后端API令牌"
        fi
        
        if [ -z "$WEBHOOK_SECRET" ]; then
            log_warn "WEBHOOK_SECRET 未配置，请在 .env 中设置Webhook密钥"
        fi
    fi
    
    log_info "配置检查完成"
}

# 创建日志目录
create_log_directory() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        log_info "创建日志目录: logs"
    fi
}

# 检查Redis连接
check_redis() {
    log_info "检查 Redis 连接..."
    
    REDIS_HOST=${REDIS_HOST:-localhost}
    REDIS_PORT=${REDIS_PORT:-6379}
    
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
            log_info "Redis 连接正常"
        else
            log_error "无法连接到 Redis ($REDIS_HOST:$REDIS_PORT)"
            log_error "请确保 Redis 服务已启动并检查连接配置"
            exit 1
        fi
    else
        log_warn "redis-cli 未找到，跳过 Redis 连接检查"
    fi
}

# 启动服务
start_service() {
    MODE=${1:-development}
    
    log_info "启动部署服务 (模式: $MODE)..."
    
    case "$MODE" in
        "dev"|"development")
            pnpm run dev
            ;;
        "prod"|"production")
            if command -v pm2 &> /dev/null; then
                pnpm run pm2:start
            else
                log_warn "PM2 未安装，使用普通模式启动"
                pnpm start
            fi
            ;;
        "pm2")
            if command -v pm2 &> /dev/null; then
                pnpm run pm2:start
            else
                log_error "PM2 未安装，请先安装 PM2: npm install -g pm2"
                exit 1
            fi
            ;;
        *)
            log_error "不支持的启动模式: $MODE"
            log_info "支持的模式: dev, prod, pm2"
            exit 1
            ;;
    esac
}

# 主函数
main() {
    log_info "前端自动化部署服务启动脚本"
    log_info "================================"
    
    # 检查是否在项目目录
    if [ ! -f "package.json" ]; then
        log_error "请在项目根目录运行此脚本"
        exit 1
    fi
    
    # 解析命令行参数
    MODE="development"
    SKIP_BUILD=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode)
                MODE="$2"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --help|-h)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --mode <mode>    启动模式 (dev|prod|pm2) [默认: dev]"
                echo "  --skip-build     跳过构建步骤"
                echo "  --help, -h       显示帮助信息"
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    # 执行启动流程
    check_environment
    create_log_directory
    check_config
    install_dependencies
    
    if [ "$SKIP_BUILD" = false ]; then
        build_project
    fi
    
    check_redis
    start_service "$MODE"
}

# 执行主函数
main "$@"