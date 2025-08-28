"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = exports.deploymentQueue = void 0;
exports.updateDeploymentStatus = updateDeploymentStatus;
exports.addDeploymentLog = addDeploymentLog;
const bull_1 = __importDefault(require("bull"));
const ioredis_1 = __importDefault(require("ioredis"));
const buildService_1 = require("../services/buildService");
const configService_1 = require("../services/configService");
const uploadService_1 = require("../services/uploadService");
const notificationService_1 = require("../services/notificationService");
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
class MemoryQueue {
    constructor() {
        this.jobs = new Map();
        this.processing = false;
    }
    async add(jobType, data, options = {}) {
        const jobId = data.deploymentId || `job-${Date.now()}`;
        const job = {
            id: jobId,
            data,
            options,
            status: 'waiting',
            progress: 0,
            timestamp: Date.now()
        };
        this.jobs.set(jobId, job);
        setImmediate(() => this.processJobs());
        return { id: jobId };
    }
    async getJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            return null;
        return {
            id: job.id,
            data: job.data,
            progress: () => job.progress,
            getState: () => Promise.resolve(job.status)
        };
    }
    async getWaiting() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'waiting');
    }
    async getActive() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'active');
    }
    async getCompleted() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'completed');
    }
    async getFailed() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'failed');
    }
    process(jobType, processor) {
        this.processor = processor;
    }
    async processJobs() {
        if (this.processing)
            return;
        this.processing = true;
        try {
            const waitingJobs = await this.getWaiting();
            for (const jobData of waitingJobs) {
                const job = {
                    id: jobData.id,
                    data: jobData.data,
                    progress: (value) => {
                        jobData.progress = value;
                        return value;
                    }
                };
                jobData.status = 'active';
                try {
                    await this.processor(job);
                    jobData.status = 'completed';
                    this.emit('completed', job);
                }
                catch (error) {
                    jobData.status = 'failed';
                    this.emit('failed', job, error);
                }
            }
        }
        finally {
            this.processing = false;
        }
    }
    on(event, callback) {
        if (!this.eventHandlers) {
            this.eventHandlers = new Map();
        }
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(callback);
    }
    emit(event, ...args) {
        if (this.eventHandlers && this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            handlers.forEach(handler => handler(...args));
        }
    }
    async close() {
        this.jobs.clear();
    }
}
class MemoryRedis {
    constructor() {
        this.storage = new Map();
    }
    async hset(key, data) {
        if (!this.storage.has(key)) {
            this.storage.set(key, {});
        }
        Object.assign(this.storage.get(key), data);
    }
    async hgetall(key) {
        return this.storage.get(key) || {};
    }
    async lpush(key, value) {
        if (!this.storage.has(key)) {
            this.storage.set(key, []);
        }
        this.storage.get(key).unshift(value);
    }
    async lrange(key, start, end) {
        const list = this.storage.get(key) || [];
        if (end === -1)
            return list.slice(start);
        return list.slice(start, end + 1);
    }
    async ltrim(key, start, end) {
        if (this.storage.has(key)) {
            const list = this.storage.get(key);
            this.storage.set(key, list.slice(start, end + 1));
        }
    }
    async expire(key, seconds) {
    }
    async exists(key) {
        return this.storage.has(key) ? 1 : 0;
    }
    async keys(pattern) {
        const keys = Array.from(this.storage.keys());
        if (pattern === '*')
            return keys;
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return keys.filter(key => regex.test(key));
    }
    async ping() {
        return 'PONG';
    }
    async disconnect() {
        this.storage.clear();
    }
}
let redis;
let deploymentQueue;
if (config_1.config.REDIS.ENABLED) {
    exports.redis = redis = new ioredis_1.default({
        host: config_1.config.REDIS.HOST,
        port: config_1.config.REDIS.PORT,
        password: config_1.config.REDIS.PASSWORD,
        db: config_1.config.REDIS.DB,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
    });
    exports.deploymentQueue = deploymentQueue = new bull_1.default('deployment', {
        redis: {
            host: config_1.config.REDIS.HOST,
            port: config_1.config.REDIS.PORT,
            password: config_1.config.REDIS.PASSWORD,
            db: config_1.config.REDIS.DB
        },
        defaultJobOptions: {
            attempts: config_1.config.JOB.ATTEMPTS,
            backoff: config_1.config.JOB.BACKOFF,
            removeOnComplete: config_1.config.JOB.REMOVE_ON_COMPLETE,
            removeOnFail: config_1.config.JOB.REMOVE_ON_FAIL
        }
    });
}
else {
    logger_1.default.warn('Redis已禁用，使用内存存储模式 - 仅适用于开发和测试');
    exports.redis = redis = new MemoryRedis();
    exports.deploymentQueue = deploymentQueue = new MemoryQueue();
}
const buildService = new buildService_1.BuildService();
const configService = new configService_1.ConfigService();
const uploadService = new uploadService_1.UploadService();
const notificationService = new notificationService_1.NotificationService();
deploymentQueue.process('build-and-deploy', async (job) => {
    const { deploymentId, projectId, branch, commitHash, triggerBy, metadata } = job.data;
    try {
        logger_1.default.info(`开始执行部署任务 [${deploymentId}]`, {
            projectId,
            branch,
            commitHash,
            triggerBy,
            metadata
        });
        await updateDeploymentStatus(deploymentId, 'building', '初始化部署任务...', 0);
        await addDeploymentLog(deploymentId, 'info', '部署任务开始', {
            projectId,
            branch,
            commitHash
        });
        job.progress(10);
        await updateDeploymentStatus(deploymentId, 'building', '开始构建项目...', 10);
        await addDeploymentLog(deploymentId, 'info', '开始构建前端项目');
        const distPath = await buildService.buildProject(deploymentId);
        job.progress(40);
        await updateDeploymentStatus(deploymentId, 'building', '项目构建完成，准备获取服务器配置...', 40);
        await addDeploymentLog(deploymentId, 'info', '项目构建成功', { distPath });
        await updateDeploymentStatus(deploymentId, 'building', '正在获取服务器配置...', 45);
        await addDeploymentLog(deploymentId, 'info', '开始获取服务器配置');
        const serverConfig = await configService.getServerConfig(deploymentId, projectId);
        job.progress(50);
        await updateDeploymentStatus(deploymentId, 'uploading', '服务器配置获取成功，开始上传文件...', 50);
        await addDeploymentLog(deploymentId, 'info', '服务器配置获取成功', {
            host: serverConfig.host,
            deployPath: serverConfig.deployPath
        });
        await uploadService.uploadToServer(deploymentId, distPath, serverConfig);
        job.progress(90);
        await updateDeploymentStatus(deploymentId, 'uploading', '文件上传完成，正在清理...', 90);
        await addDeploymentLog(deploymentId, 'info', '文件上传成功');
        await buildService.cleanupBuild(deploymentId);
        job.progress(95);
        await addDeploymentLog(deploymentId, 'info', '清理构建文件完成');
        job.progress(100);
        await updateDeploymentStatus(deploymentId, 'completed', '部署完成', 100, new Date().toISOString());
        await addDeploymentLog(deploymentId, 'info', '部署任务完成');
        try {
            await notificationService.sendSuccessNotification(deploymentId, {
                projectId,
                branch,
                commitHash,
                serverHost: serverConfig.host,
                deployPath: serverConfig.deployPath
            });
            await addDeploymentLog(deploymentId, 'info', '成功通知已发送');
        }
        catch (notificationError) {
            logger_1.default.error(`发送成功通知失败 [${deploymentId}]`, notificationError);
            await addDeploymentLog(deploymentId, 'warn', `通知发送失败: ${notificationError.message}`);
        }
        logger_1.default.info(`部署任务完成 [${deploymentId}]`);
        return {
            deploymentId,
            status: 'completed',
            serverHost: serverConfig.host,
            deployPath: serverConfig.deployPath
        };
    }
    catch (error) {
        logger_1.default.error(`部署任务失败 [${deploymentId}]`, error);
        await updateDeploymentStatus(deploymentId, 'failed', `部署失败: ${error.message}`, undefined, new Date().toISOString());
        await addDeploymentLog(deploymentId, 'error', `部署失败: ${error.message}`, {
            stack: error.stack
        });
        try {
            await notificationService.sendFailureNotification(deploymentId, error);
            await addDeploymentLog(deploymentId, 'info', '失败通知已发送');
        }
        catch (notificationError) {
            logger_1.default.error(`发送失败通知失败 [${deploymentId}]`, notificationError);
        }
        try {
            await buildService.cleanupBuild(deploymentId);
            await addDeploymentLog(deploymentId, 'info', '构建文件已清理');
        }
        catch (cleanupError) {
            logger_1.default.error(`清理构建文件失败 [${deploymentId}]`, cleanupError);
        }
        throw error;
    }
});
async function updateDeploymentStatus(deploymentId, status, message, progress, endTime) {
    try {
        const statusKey = `deployment:${deploymentId}:status`;
        const statusData = {
            status,
            currentStep: message,
            updatedAt: new Date().toISOString()
        };
        if (progress !== undefined) {
            statusData.progress = progress.toString();
        }
        if (endTime) {
            statusData.endTime = endTime;
        }
        const exists = await redis.exists(statusKey);
        if (!exists) {
            statusData.startTime = new Date().toISOString();
            const estimatedDuration = 8 * 60 * 1000;
            statusData.estimatedCompletion = new Date(Date.now() + estimatedDuration).toISOString();
        }
        await redis.hset(statusKey, statusData);
        await redis.expire(statusKey, 86400);
        logger_1.default.debug(`状态已更新 [${deploymentId}]`, { status, message, progress });
    }
    catch (error) {
        logger_1.default.error(`更新部署状态失败 [${deploymentId}]`, error);
    }
}
async function addDeploymentLog(deploymentId, level, message, data) {
    try {
        const logsKey = `deployment:${deploymentId}:logs`;
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(data && { data })
        };
        await redis.lpush(logsKey, JSON.stringify(logEntry));
        await redis.ltrim(logsKey, 0, 99);
        await redis.expire(logsKey, 86400);
        logger_1.default.debug(`日志已添加 [${deploymentId}]`, logEntry);
    }
    catch (error) {
        logger_1.default.error(`添加部署日志失败 [${deploymentId}]`, error);
    }
}
deploymentQueue.on('completed', async (job, result) => {
    const { deploymentId } = job.data;
    logger_1.default.info(`部署任务完成 [${deploymentId}]`, {
        jobId: job.id,
        result,
        duration: Date.now() - job.timestamp
    });
});
deploymentQueue.on('failed', async (job, err) => {
    const { deploymentId } = job.data;
    logger_1.default.error(`部署任务失败 [${deploymentId}]`, {
        jobId: job.id,
        error: err.message,
        stack: err.stack,
        duration: Date.now() - job.timestamp
    });
});
deploymentQueue.on('progress', async (job, progress) => {
    const { deploymentId } = job.data;
    logger_1.default.debug(`部署进度更新 [${deploymentId}]`, {
        jobId: job.id,
        progress
    });
});
deploymentQueue.on('stalled', async (job) => {
    const { deploymentId } = job.data;
    logger_1.default.warn(`部署任务停滞 [${deploymentId}]`, {
        jobId: job.id
    });
    await addDeploymentLog(deploymentId, 'warn', '任务执行停滞，正在重试...');
});
deploymentQueue.on('error', (error) => {
    logger_1.default.error('队列错误', error);
});
process.on('SIGTERM', async () => {
    logger_1.default.info('收到SIGTERM信号，开始优雅关闭...');
    await deploymentQueue.close();
    await redis.disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger_1.default.info('收到SIGINT信号，开始优雅关闭...');
    await deploymentQueue.close();
    await redis.disconnect();
    process.exit(0);
});
//# sourceMappingURL=deploymentJob.js.map