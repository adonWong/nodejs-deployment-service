"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateServerConfig = exports.serverConfigSchema = exports.validateDeploymentRequest = exports.deploymentRequestSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.deploymentRequestSchema = joi_1.default.object({
    projectId: joi_1.default.string().required().min(1).max(100),
    branch: joi_1.default.string().required().min(1).max(100),
    commitHash: joi_1.default.string().required().min(7).max(40),
    triggerBy: joi_1.default.string().required().min(1).max(100),
    timestamp: joi_1.default.string().isoDate().required(),
    metadata: joi_1.default.object({
        buildType: joi_1.default.string().valid('development', 'staging', 'production').optional(),
        priority: joi_1.default.string().valid('low', 'normal', 'high').optional()
    }).unknown(true).optional()
});
const validateDeploymentRequest = (data) => {
    const { error, value } = exports.deploymentRequestSchema.validate(data);
    if (error) {
        throw new Error(`请求数据验证失败: ${error.details[0].message}`);
    }
    return value;
};
exports.validateDeploymentRequest = validateDeploymentRequest;
exports.serverConfigSchema = joi_1.default.object({
    host: joi_1.default.string().required().min(1),
    port: joi_1.default.number().port().default(22),
    username: joi_1.default.string().required().min(1),
    password: joi_1.default.string().required().min(1),
    deployPath: joi_1.default.string().required().min(1),
    backupPath: joi_1.default.string().optional()
});
const validateServerConfig = (data) => {
    const { error, value } = exports.serverConfigSchema.validate(data);
    if (error) {
        throw new Error(`服务器配置验证失败: ${error.details[0].message}`);
    }
    return value;
};
exports.validateServerConfig = validateServerConfig;
//# sourceMappingURL=validator.js.map