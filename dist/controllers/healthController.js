"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const buildService_1 = require("../services/buildService");
const configService_1 = require("../services/configService");
const notificationService_1 = require("../services/notificationService");
const logger_1 = __importDefault(require("../utils/logger"));
const deploymentJob_1 = require("../jobs/deploymentJob");
class HealthController {
    constructor() {
        this.buildService = new buildService_1.BuildService();
        this.configService = new configService_1.ConfigService();
        this.notificationService = new notificationService_1.NotificationService();
    }
    async getHealth(req, res) {
        try {
            const checks = {
                redis: await this.checkRedisConnection(),
                frontendProject: await this.checkProjectAccess(),
                backendService: await this.checkBackendService()
            };
            const healthy = Object.values(checks).every(Boolean);
            const status = healthy ? 200 : 503;
            const response = {
                success: healthy,
                data: {
                    status: healthy ? 'healthy' : 'unhealthy',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: process.env.npm_package_version || '1.0.0',
                    ...checks
                },
                message: healthy ? '服务健康' : '服务异常',
                timestamp: new Date().toISOString()
            };
            if (!healthy) {
                logger_1.default.warn('健康检查失败', checks);
            }
            res.status(status).json(response);
        }
        catch (error) {
            logger_1.default.error('健康检查异常', error);
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        }
    }
    async getDetailedHealth(req, res) {
        try {
            const [redisStatus, projectStatus, backendStatus, webhookStatus, projectInfo] = await Promise.allSettled([
                this.getRedisStatus(),
                this.getProjectStatus(),
                this.getBackendStatus(),
                this.getWebhookStatus(),
                this.getProjectInfo()
            ]);
            const response = {
                success: true,
                data: {
                    redis: this.getSettledValue(redisStatus),
                    project: this.getSettledValue(projectStatus),
                    backend: this.getSettledValue(backendStatus),
                    webhook: this.getSettledValue(webhookStatus),
                    projectInfo: this.getSettledValue(projectInfo),
                    system: {
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        platform: process.platform,
                        nodeVersion: process.version,
                        pid: process.pid
                    }
                },
                message: '详细健康检查完成',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }
        catch (error) {
            logger_1.default.error('详细健康检查异常', error);
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        }
    }
    async checkRedisConnection() {
        try {
            const result = await deploymentJob_1.redis.ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    async checkProjectAccess() {
        try {
            const projectPath = config_1.config.PROJECT_PATH;
            const packageJsonPath = path_1.default.join(projectPath, 'package.json');
            const [projectExists, packageExists] = await Promise.all([
                fs_extra_1.default.pathExists(projectPath),
                fs_extra_1.default.pathExists(packageJsonPath)
            ]);
            return projectExists && packageExists;
        }
        catch {
            return false;
        }
    }
    async checkBackendService() {
        return await this.configService.testBackendConnection();
    }
    async getRedisStatus() {
        try {
            const ping = await deploymentJob_1.redis.ping();
            return {
                connected: ping === 'PONG',
                host: config_1.config.REDIS.HOST,
                port: config_1.config.REDIS.PORT,
                enabled: config_1.config.REDIS.ENABLED
            };
        }
        catch (error) {
            return {
                connected: false,
                enabled: config_1.config.REDIS.ENABLED,
                error: error.message
            };
        }
    }
    async getProjectStatus() {
        try {
            const projectPath = config_1.config.PROJECT_PATH;
            const packageJsonPath = path_1.default.join(projectPath, 'package.json');
            const distPath = path_1.default.join(projectPath, config_1.config.DIST_DIR);
            const [projectExists, packageExists, distExists] = await Promise.all([
                fs_extra_1.default.pathExists(projectPath),
                fs_extra_1.default.pathExists(packageJsonPath),
                fs_extra_1.default.pathExists(distPath)
            ]);
            return {
                projectPath,
                projectExists,
                packageExists,
                distExists,
                buildCommand: config_1.config.BUILD_COMMAND
            };
        }
        catch (error) {
            return {
                error: error.message
            };
        }
    }
    async getBackendStatus() {
        try {
            const connected = await this.configService.testBackendConnection();
            return {
                url: config_1.config.BACKEND_SERVICE_URL,
                connected,
                hasToken: !!config_1.config.BACKEND_API_TOKEN
            };
        }
        catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
    async getWebhookStatus() {
        try {
            const connected = await this.notificationService.testWebhookConnection();
            return {
                url: config_1.config.NOTIFICATION_WEBHOOK_URL || 'not_configured',
                connected
            };
        }
        catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
    async getProjectInfo() {
        try {
            return await this.buildService.getProjectInfo();
        }
        catch (error) {
            return {
                error: error.message
            };
        }
    }
    parseRedisInfo(info) {
        const lines = info.split('\r\n');
        const parsed = {};
        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    parsed[key] = value;
                }
            }
        }
        return {
            version: parsed.redis_version,
            uptime: parsed.uptime_in_seconds,
            connectedClients: parsed.connected_clients,
            usedMemory: parsed.used_memory_human,
            totalSystemMemory: parsed.total_system_memory_human
        };
    }
    getSettledValue(result) {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        else {
            return {
                error: result.reason?.message || '未知错误'
            };
        }
    }
}
exports.HealthController = HealthController;
//# sourceMappingURL=healthController.js.map