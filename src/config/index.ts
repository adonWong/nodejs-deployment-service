import dotenv from 'dotenv';
import path from 'path';
import { ProjectConfig } from '../types/interfaces';

dotenv.config();

// 项目配置映射
export const PROJECT_CONFIGS: { [key: string]: ProjectConfig } = {
  'admin-portal': {
    id: 'admin-portal',
    name: '管理后台',
    gitRepository: process.env.ADMIN_PORTAL_GIT_REPO || '',
    gitBranch: process.env.ADMIN_PORTAL_GIT_BRANCH || 'main',
    localPath: process.env.ADMIN_PORTAL_LOCAL_PATH || path.join(__dirname, '../../../projects/admin-portal'),
    buildCommand: process.env.ADMIN_PORTAL_BUILD_CMD || 'npm run build:prod',
    distDirectory: 'dist',
    remotePath: process.env.ADMIN_PORTAL_REMOTE_PATH || '/var/www/admin',
    nginxLocation: '/admin',
    port: 8080
  },
  'user-portal': {
    id: 'user-portal',
    name: '用户门户',
    gitRepository: process.env.USER_PORTAL_GIT_REPO || '',
    gitBranch: process.env.USER_PORTAL_GIT_BRANCH || 'main',
    localPath: process.env.USER_PORTAL_LOCAL_PATH || path.join(__dirname, '../../../projects/user-portal'),
    buildCommand: process.env.USER_PORTAL_BUILD_CMD || 'npm run build',
    distDirectory: 'dist',
    remotePath: process.env.USER_PORTAL_REMOTE_PATH || '/var/www/user',
    nginxLocation: '/user',
    port: 8081
  },
  'mobile-app': {
    id: 'mobile-app',
    name: '移动端应用',
    gitRepository: process.env.MOBILE_APP_GIT_REPO || '',
    gitBranch: process.env.MOBILE_APP_GIT_BRANCH || 'main',
    localPath: process.env.MOBILE_APP_LOCAL_PATH || path.join(__dirname, '../../../projects/mobile-app'),
    buildCommand: process.env.MOBILE_APP_BUILD_CMD || 'pnpm build:mobile',
    distDirectory: 'dist',
    remotePath: process.env.MOBILE_APP_REMOTE_PATH || '/var/www/mobile',
    nginxLocation: '/mobile',
    port: 8082
  }
};

export const config = {
  // 应用配置
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // 前端项目配置（保持向后兼容）
  PROJECT_PATH: process.env.PROJECT_PATH || path.join(__dirname, '../../../'),
  BUILD_COMMAND: 'pnpm build',
  DIST_DIR: 'dist',

  // Git配置
  GIT_SSH_KEY_PATH: process.env.GIT_SSH_KEY_PATH || path.join(__dirname, '../../../keys/id_rsa'),

  // Nginx配置
  NGINX_CONFIG_PATH: process.env.NGINX_CONFIG_PATH || '/etc/nginx/sites-available/frontend',
  NGINX_RELOAD_CMD: process.env.NGINX_RELOAD_CMD || 'sudo systemctl reload nginx',

  // 性能配置
  CONCURRENT_BUILDS: parseInt(process.env.CONCURRENT_BUILDS || '2'),

  // 后端服务配置
  BACKEND_SERVICE_URL: process.env.BACKEND_SERVICE_URL || 'http://localhost:3000',
  BACKEND_API_TOKEN: process.env.BACKEND_API_TOKEN || '',

  // Redis配置
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT || '6379'),
    PASSWORD: process.env.REDIS_PASSWORD || undefined,
    DB: parseInt(process.env.REDIS_DB || '0'),
    // 新增：是否启用Redis
    ENABLED: process.env.REDIS_ENABLED !== 'false'
  },

  // 安全配置
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'default-secret',
  API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT || '100'),

  // 通知配置
  NOTIFICATION_WEBHOOK_URL: process.env.NOTIFICATION_WEBHOOK_URL || '',
  EMAIL_SERVICE_API_KEY: process.env.EMAIL_SERVICE_API_KEY || '',

  // 任务配置
  JOB: {
    ATTEMPTS: 3,
    BACKOFF: 'exponential' as const,
    REMOVE_ON_COMPLETE: 10,
    REMOVE_ON_FAIL: 5
  },

  // 上传配置
  UPLOAD: {
    TIMEOUT: 300000, // 5分钟
    CONCURRENCY: 3
  },

  // 日志配置
  LOG: {
    MAX_FILES: '14d',
    MAX_SIZE: '20m'
  }
};

export default config;