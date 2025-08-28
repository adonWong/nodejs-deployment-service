"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
class NotificationService {
    constructor() {
        this.webhookUrl = config_1.config.NOTIFICATION_WEBHOOK_URL;
    }
    async sendSuccessNotification(deploymentId, data) {
        const notificationData = {
            deploymentId,
            projectId: data.projectId,
            branch: data.branch,
            commitHash: data.commitHash,
            status: 'success',
            serverHost: data.serverHost,
            deployPath: data.deployPath
        };
        await this.sendNotification(notificationData);
        logger_1.default.info(`部署成功通知已发送 [${deploymentId}]`, {
            projectId: data.projectId,
            serverHost: data.serverHost
        });
    }
    async sendFailureNotification(deploymentId, error) {
        const notificationData = {
            deploymentId,
            projectId: 'unknown',
            branch: 'unknown',
            commitHash: 'unknown',
            status: 'failure',
            error
        };
        await this.sendNotification(notificationData);
        logger_1.default.info(`部署失败通知已发送 [${deploymentId}]`, {
            error: error.message
        });
    }
    async sendNotification(data) {
        if (!this.webhookUrl) {
            logger_1.default.warn('通知Webhook URL未配置，跳过通知发送');
            return;
        }
        try {
            const payload = {
                type: 'deployment_notification',
                timestamp: new Date().toISOString(),
                data: {
                    deploymentId: data.deploymentId,
                    projectId: data.projectId,
                    branch: data.branch,
                    commitHash: data.commitHash,
                    status: data.status,
                    serverHost: data.serverHost,
                    deployPath: data.deployPath,
                    error: data.error ? {
                        message: data.error.message,
                        stack: data.error.stack
                    } : undefined
                }
            };
            await axios_1.default.post(this.webhookUrl, payload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'deployment-service/1.0.0'
                }
            });
            logger_1.default.info(`通知发送成功`, {
                deploymentId: data.deploymentId,
                status: data.status
            });
        }
        catch (error) {
            logger_1.default.error('发送通知失败', {
                deploymentId: data.deploymentId,
                error: error.message,
                webhookUrl: this.webhookUrl
            });
        }
    }
    async testWebhookConnection() {
        if (!this.webhookUrl) {
            return false;
        }
        try {
            const testPayload = {
                type: 'test',
                timestamp: new Date().toISOString(),
                message: 'Webhook连接测试'
            };
            await axios_1.default.post(this.webhookUrl, testPayload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return true;
        }
        catch (error) {
            logger_1.default.error('Webhook连接测试失败', error);
            return false;
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map