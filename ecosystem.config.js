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
      // 日志配置
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,

      // 重启配置
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      restart_delay: 4000,

      // 监听文件变化（仅开发环境）
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],

      // 环境变量
      env_file: '.env',

      // 进程管理
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 性能监控
      pmx: true,

      // 集群配置
      instance_var: 'INSTANCE_ID',

      // 高级配置
      node_args: '--max-old-space-size=2048',

      // 合并日志
      merge_logs: true,

      // 日志轮转
      log_date_format: 'YYYY-MM-DD HH:mm Z',

      // 自动重启条件
      max_memory_restart: '500M',

      // 定时重启（每天凌晨2点）
      cron_restart: '0 2 * * *'
    }
  ],

  // 部署配置
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/master',
      repo: 'git@github.com:your-username/deployment-service.git',
      path: '/var/www/deployment-service',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
}
