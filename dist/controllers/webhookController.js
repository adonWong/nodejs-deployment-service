"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookController = void 0;
const deploymentJob_1 = require("../jobs/deploymentJob");
const validator_1 = require("../utils/validator");
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
class WebhookController {
    async handleDeployment(req, res) {
        const startTime = Date.now();
        try {
            const providedSecret = req.headers['x-webhook-secret'];
            if (providedSecret !== config_1.config.WEBHOOK_SECRET) {
                logger_1.default.warn('Webhook密钥验证失败', {
                    providedSecret: providedSecret?.substring(0, 10) + '...',
                    ip: req.ip
                });
                const response = {
                    success: false,
                    message: '认证失败',
                    timestamp: new Date().toISOString()
                };
                res.status(401).json(response);
                return;
            }
            const deploymentData = (0, validator_1.validateDeploymentRequest)(req.body);
            const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const priority = deploymentData.metadata?.priority === 'high' ? 10 :
                deploymentData.metadata?.priority === 'low' ? 1 : 5;
            const job = await deploymentJob_1.deploymentQueue.add('build-and-deploy', {
                deploymentId,
                ...deploymentData
            }, {
                priority,
                attempts: config_1.config.JOB.ATTEMPTS,
                backoff: config_1.config.JOB.BACKOFF,
                removeOnComplete: config_1.config.JOB.REMOVE_ON_COMPLETE,
                removeOnFail: config_1.config.JOB.REMOVE_ON_FAIL,
                jobId: deploymentId
            });
            const processTime = Date.now() - startTime;
            logger_1.default.info(`部署任务已创建: ${deploymentId}`, {
                deploymentData,
                jobId: job.id,
                priority,
                processTime: `${processTime}ms`
            });
            const response = {
                success: true,
                data: {
                    deploymentId,
                    jobId: job.id,
                    priority,
                    estimatedTime: '5-10分钟'
                },
                message: '部署任务已创建',
                timestamp: new Date().toISOString()
            };
            res.status(200).json(response);
        }
        catch (error) {
            const processTime = Date.now() - startTime;
            logger_1.default.error('创建部署任务失败', {
                error: error.message,
                stack: error.stack,
                processTime: `${processTime}ms`,
                body: req.body
            });
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(400).json(response);
        }
    }
    async getQueueStatus(req, res) {
        try {
            const waiting = await deploymentJob_1.deploymentQueue.getWaiting();
            const active = await deploymentJob_1.deploymentQueue.getActive();
            const completed = await deploymentJob_1.deploymentQueue.getCompleted();
            const failed = await deploymentJob_1.deploymentQueue.getFailed();
            const response = {
                success: true,
                data: {
                    queue: {
                        waiting: waiting.length,
                        active: active.length,
                        completed: completed.length,
                        failed: failed.length
                    },
                    activeJobs: active.map(job => ({
                        id: job.id,
                        data: job.data,
                        progress: job.progress(),
                        processedOn: job.processedOn,
                        opts: job.opts
                    }))
                },
                message: '队列状态获取成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }
        catch (error) {
            logger_1.default.error('获取队列状态失败', error);
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        }
    }
}
exports.WebhookController = WebhookController;
//# sourceMappingURL=webhookController.js.map