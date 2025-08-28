"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentController = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const deploymentJob_1 = require("../jobs/deploymentJob");
class DeploymentController {
    async getDeploymentStatus(req, res) {
        const { deploymentId } = req.params;
        if (!deploymentId) {
            const response = {
                success: false,
                message: '部署ID不能为空',
                timestamp: new Date().toISOString()
            };
            res.status(400).json(response);
            return;
        }
        try {
            const statusKey = `deployment:${deploymentId}:status`;
            const logsKey = `deployment:${deploymentId}:logs`;
            const statusData = await deploymentJob_1.redis.hgetall(statusKey);
            const logs = await deploymentJob_1.redis.lrange(logsKey, 0, -1);
            if (!statusData || !statusData.status) {
                const job = await deploymentJob_1.deploymentQueue.getJob(deploymentId);
                if (!job) {
                    const response = {
                        success: false,
                        message: '部署任务不存在',
                        timestamp: new Date().toISOString()
                    };
                    res.status(404).json(response);
                    return;
                }
                const jobState = await job.getState();
                const jobProgress = job.progress();
                const deploymentStatus = {
                    deploymentId,
                    status: this.mapJobStateToStatus(jobState),
                    progress: typeof jobProgress === 'number' ? jobProgress : 0,
                    currentStep: this.getCurrentStep(jobState, jobProgress),
                    logs: [],
                    startTime: new Date(job.timestamp).toISOString()
                };
                const response = {
                    success: true,
                    data: deploymentStatus,
                    message: '部署状态获取成功',
                    timestamp: new Date().toISOString()
                };
                res.json(response);
                return;
            }
            const parsedLogs = logs.map(logStr => {
                try {
                    return JSON.parse(logStr);
                }
                catch {
                    return {
                        timestamp: new Date().toISOString(),
                        level: 'info',
                        message: logStr
                    };
                }
            });
            const deploymentStatus = {
                deploymentId,
                status: statusData.status,
                progress: parseInt(statusData.progress) || 0,
                currentStep: statusData.currentStep || '准备中',
                logs: parsedLogs,
                startTime: statusData.startTime,
                endTime: statusData.endTime,
                estimatedCompletion: statusData.estimatedCompletion
            };
            const response = {
                success: true,
                data: deploymentStatus,
                message: '部署状态获取成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }
        catch (error) {
            logger_1.default.error(`获取部署状态失败 [${deploymentId}]`, error);
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        }
    }
    async getDeploymentHistory(req, res) {
        try {
            const { limit = 50, offset = 0 } = req.query;
            const keys = await deploymentJob_1.redis.keys('deployment:*:status');
            const deploymentIds = keys.map(key => key.split(':')[1]);
            const startIndex = parseInt(offset) || 0;
            const endIndex = startIndex + (parseInt(limit) || 50);
            const paginatedIds = deploymentIds.slice(startIndex, endIndex);
            const deployments = [];
            for (const deploymentId of paginatedIds) {
                const statusKey = `deployment:${deploymentId}:status`;
                const statusData = await deploymentJob_1.redis.hgetall(statusKey);
                if (statusData && statusData.status) {
                    deployments.push({
                        deploymentId,
                        status: statusData.status,
                        progress: parseInt(statusData.progress) || 0,
                        currentStep: statusData.currentStep || '未知',
                        startTime: statusData.startTime,
                        endTime: statusData.endTime
                    });
                }
            }
            deployments.sort((a, b) => {
                const timeA = new Date(a.startTime).getTime();
                const timeB = new Date(b.startTime).getTime();
                return timeB - timeA;
            });
            const response = {
                success: true,
                data: {
                    deployments,
                    total: deploymentIds.length,
                    offset: startIndex,
                    limit: parseInt(limit) || 50
                },
                message: '部署历史获取成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }
        catch (error) {
            logger_1.default.error('获取部署历史失败', error);
            const response = {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        }
    }
    mapJobStateToStatus(jobState) {
        switch (jobState) {
            case 'waiting':
                return 'pending';
            case 'active':
                return 'building';
            case 'completed':
                return 'completed';
            case 'failed':
                return 'failed';
            default:
                return 'pending';
        }
    }
    getCurrentStep(jobState, progress) {
        if (jobState === 'waiting')
            return '等待中';
        if (jobState === 'failed')
            return '失败';
        if (jobState === 'completed')
            return '完成';
        const progressNum = typeof progress === 'number' ? progress : 0;
        if (progressNum < 40)
            return '构建中';
        if (progressNum < 50)
            return '获取配置中';
        if (progressNum < 90)
            return '上传中';
        if (progressNum < 100)
            return '清理中';
        return '完成';
    }
}
exports.DeploymentController = DeploymentController;
//# sourceMappingURL=deploymentController.js.map