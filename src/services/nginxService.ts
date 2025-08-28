import { exec } from 'child_process';
import fs from 'fs-extra';
import { promisify } from 'util';
import { config, PROJECT_CONFIGS } from '../config';
import logger from '../utils/logger';
import { ProjectConfig } from '../types/interfaces';

const execAsync = promisify(exec);

export class NginxService {
  
  async updateNginxConfig(
    deploymentId: string,
    projectIds: string[],
    serverHost: string
  ): Promise<void> {
    try {
      logger.info(`开始更新Nginx配置 [${deploymentId}]`, {
        projectIds,
        serverHost,
        configPath: config.NGINX_CONFIG_PATH
      });

      // 生成新的nginx配置
      const nginxConfig = this.generateNginxConfig(projectIds, serverHost);
      
      // 备份现有配置
      await this.backupNginxConfig(deploymentId);
      
      // 写入新配置
      await fs.writeFile(config.NGINX_CONFIG_PATH, nginxConfig, 'utf8');
      
      // 验证配置
      await this.validateNginxConfig(deploymentId);
      
      // 重新加载nginx
      await this.reloadNginx(deploymentId);
      
      logger.info(`Nginx配置更新完成 [${deploymentId}]`);
      
    } catch (error) {
      logger.error(`Nginx配置更新失败 [${deploymentId}]`, error);
      
      // 尝试恢复备份配置
      await this.restoreBackupConfig(deploymentId);
      
      throw new Error(`Nginx配置失败: ${error.message}`);
    }
  }

  private generateNginxConfig(projectIds: string[], serverHost: string): string {
    const locations = projectIds.map(projectId => {
      const config = PROJECT_CONFIGS[projectId];
      if (!config) return '';

      return `
    # ${config.name}
    location ${config.nginxLocation} {
        alias ${config.remotePath}/;
        index index.html;
        try_files $uri $uri/ ${config.nginxLocation}/index.html;
        
        # 设置缓存策略
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # 安全头设置
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    }`;
    }).join('\n');

    return `# 前端项目Nginx配置
# 自动生成时间: ${new Date().toISOString()}
# 部署的项目: ${projectIds.join(', ')}

server {
    listen 80;
    server_name ${serverHost};
    
    # 日志配置
    access_log /var/log/nginx/frontend_access.log;
    error_log /var/log/nginx/frontend_error.log;
    
    # 全局安全设置
    server_tokens off;
    
    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # 根路径重定向到主应用
    location = / {
        return 301 ${PROJECT_CONFIGS[projectIds[0]]?.nginxLocation || '/admin'};
    }
    
    # 健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
${locations}
    
    # 404处理
    error_page 404 /404.html;
    location = /404.html {
        root /usr/share/nginx/html;
    }
    
    # 50x错误处理
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}

# HTTPS重定向 (可选)
# server {
#     listen 443 ssl http2;
#     server_name ${serverHost};
#     
#     ssl_certificate /path/to/certificate.crt;
#     ssl_certificate_key /path/to/private.key;
#     
#     # SSL配置
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
#     
#     # 包含上面的location块
# }
`;
  }

  private async backupNginxConfig(deploymentId: string): Promise<void> {
    try {
      if (await fs.pathExists(config.NGINX_CONFIG_PATH)) {
        const backupPath = `${config.NGINX_CONFIG_PATH}.backup.${Date.now()}`;
        await fs.copy(config.NGINX_CONFIG_PATH, backupPath);
        logger.info(`Nginx配置已备份 [${deploymentId}]`, { backupPath });
      }
    } catch (error) {
      logger.warn(`Nginx配置备份失败 [${deploymentId}]`, error);
    }
  }

  private async validateNginxConfig(deploymentId: string): Promise<void> {
    try {
      await execAsync('nginx -t', { timeout: 30000 });
      logger.info(`Nginx配置验证通过 [${deploymentId}]`);
    } catch (error) {
      logger.error(`Nginx配置验证失败 [${deploymentId}]`, error);
      throw new Error(`Nginx配置验证失败: ${error.message}`);
    }
  }

  private async reloadNginx(deploymentId: string): Promise<void> {
    try {
      await execAsync(config.NGINX_RELOAD_CMD, { timeout: 30000 });
      logger.info(`Nginx重新加载完成 [${deploymentId}]`);
    } catch (error) {
      logger.error(`Nginx重新加载失败 [${deploymentId}]`, error);
      throw new Error(`Nginx重新加载失败: ${error.message}`);
    }
  }

  private async restoreBackupConfig(deploymentId: string): Promise<void> {
    try {
      // 查找最新的备份文件
      const backupPattern = `${config.NGINX_CONFIG_PATH}.backup.*`;
      const { stdout } = await execAsync(`ls -t ${backupPattern} 2>/dev/null | head -1`, {
        shell: '/bin/bash'
      });
      
      const latestBackup = stdout.trim();
      if (latestBackup && await fs.pathExists(latestBackup)) {
        await fs.copy(latestBackup, config.NGINX_CONFIG_PATH);
        await this.reloadNginx(deploymentId);
        logger.info(`Nginx配置已恢复 [${deploymentId}]`, { backupFile: latestBackup });
      }
    } catch (error) {
      logger.error(`Nginx配置恢复失败 [${deploymentId}]`, error);
    }
  }

  async checkNginxStatus(): Promise<boolean> {
    try {
      await execAsync('nginx -t', { timeout: 10000 });
      const { stdout } = await execAsync('systemctl is-active nginx', { timeout: 10000 });
      return stdout.trim() === 'active';
    } catch (error) {
      return false;
    }
  }

  async getActiveProjects(): Promise<string[]> {
    try {
      if (!await fs.pathExists(config.NGINX_CONFIG_PATH)) {
        return [];
      }

      const configContent = await fs.readFile(config.NGINX_CONFIG_PATH, 'utf8');
      const projects = Object.keys(PROJECT_CONFIGS).filter(projectId => {
        const config = PROJECT_CONFIGS[projectId];
        return configContent.includes(`location ${config.nginxLocation}`);
      });

      return projects;
    } catch (error) {
      logger.error('获取活跃项目列表失败', error);
      return [];
    }
  }

  async generateConfigPreview(projectIds: string[], serverHost: string): Promise<string> {
    return this.generateNginxConfig(projectIds, serverHost);
  }

  async testNginxAccess(serverHost: string, location: string): Promise<boolean> {
    try {
      // 这里可以添加实际的HTTP请求测试
      // 暂时返回nginx状态检查结果
      return await this.checkNginxStatus();
    } catch (error) {
      logger.error(`测试Nginx访问失败`, error);
      return false;
    }
  }
}