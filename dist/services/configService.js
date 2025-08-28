"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const validator_1 = require("../utils/validator");
class ConfigService {
    constructor() {
        this.backendServiceUrl = config_1.config.BACKEND_SERVICE_URL;
        this.apiToken = config_1.config.BACKEND_API_TOKEN;
    }
    async getServerConfig(deploymentId, projectId) {
        try {
            logger_1.default.info(`获取服务器配置 [${deploymentId}]`, {
                projectId,
                backendUrl: this.backendServiceUrl
            });
            if (!this.apiToken) {
                throw new Error('后端服务API Token未配置');
            }
            const response = await axios_1.default.post(`${this.backendServiceUrl}/api/server/config`, {
                projectId,
                deploymentId,
                purpose: 'frontend-deployment',
                timestamp: new Date().toISOString()
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiToken}`,
                    'User-Agent': 'deployment-service/1.0.0'
                }
            });
            if (!response.data) {
                throw new Error('后端服务返回空响应');
            }
            if (!response.data.success) {
                throw new Error(`后端服务错误: ${response.data.message || '未知错误'}`);
            }
            const serverConfig = response.data.data;
            if (!serverConfig) {
                throw new Error('后端服务未返回配置数据');
            }
            const validatedConfig = (0, validator_1.validateServerConfig)(serverConfig);
            logger_1.default.info(`服务器配置获取成功 [${deploymentId}]`, {
                host: validatedConfig.host,
                port: validatedConfig.port,
                username: validatedConfig.username,
                deployPath: validatedConfig.deployPath,
                hasBackupPath: !!validatedConfig.backupPath
            });
            return validatedConfig;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const status = error.response?.status;
                const statusText = error.response?.statusText;
                const responseData = error.response?.data;
                logger_1.default.error(`获取服务器配置失败 [${deploymentId}]`, {
                    status,
                    statusText,
                    responseData,
                    url: error.config?.url,
                    method: error.config?.method
                });
                if (status === 401) {
                    throw new Error('API Token无效或已过期');
                }
                else if (status === 404) {
                    throw new Error('后端服务接口不存在');
                }
                else if (status >= 500) {
                    throw new Error('后端服务内部错误');
                }
                else {
                    throw new Error(`后端服务错误 (${status}): ${responseData?.message || statusText}`);
                }
            }
            else {
                logger_1.default.error(`获取服务器配置失败 [${deploymentId}]`, error);
                throw new Error(`配置获取失败: ${error.message}`);
            }
        }
    }
    async testBackendConnection() {
        try {
            const response = await axios_1.default.get(`${this.backendServiceUrl}/health`, {
                timeout: 5000,
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`
                }
            });
            return response.status === 200;
        }
        catch (error) {
            logger_1.default.error('后端服务连接测试失败', error);
            return false;
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=configService.js.map