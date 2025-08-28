"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class BuildService {
    constructor() {
        this.projectPath = config_1.config.PROJECT_PATH;
        this.distPath = path_1.default.join(this.projectPath, config_1.config.DIST_DIR);
    }
    async buildProject(deploymentId) {
        try {
            logger_1.default.info(`开始构建项目 [${deploymentId}]`, {
                projectPath: this.projectPath,
                buildCommand: config_1.config.BUILD_COMMAND
            });
            if (!await fs_extra_1.default.pathExists(this.projectPath)) {
                throw new Error(`项目目录不存在: ${this.projectPath}`);
            }
            const packageJsonPath = path_1.default.join(this.projectPath, 'package.json');
            if (!await fs_extra_1.default.pathExists(packageJsonPath)) {
                throw new Error(`package.json不存在: ${packageJsonPath}`);
            }
            if (await fs_extra_1.default.pathExists(this.distPath)) {
                await fs_extra_1.default.remove(this.distPath);
                logger_1.default.info(`清理旧的构建文件 [${deploymentId}]`);
            }
            const startTime = Date.now();
            const { stdout, stderr } = await execAsync(config_1.config.BUILD_COMMAND, {
                cwd: this.projectPath,
                env: {
                    ...process.env,
                    NODE_OPTIONS: '--max-old-space-size=8192'
                },
                timeout: 600000
            });
            const buildTime = Date.now() - startTime;
            if (stderr) {
                logger_1.default.warn(`构建警告 [${deploymentId}]`, { stderr });
            }
            logger_1.default.info(`构建输出 [${deploymentId}]`, { stdout });
            if (!await fs_extra_1.default.pathExists(this.distPath)) {
                throw new Error('构建失败：dist目录未生成');
            }
            const distContents = await fs_extra_1.default.readdir(this.distPath);
            if (distContents.length === 0) {
                throw new Error('构建失败：dist目录为空');
            }
            logger_1.default.info(`项目构建完成 [${deploymentId}]`, {
                distPath: this.distPath,
                buildTime: `${buildTime}ms`,
                fileCount: distContents.length
            });
            return this.distPath;
        }
        catch (error) {
            logger_1.default.error(`项目构建失败 [${deploymentId}]`, error);
            throw new Error(`构建失败: ${error.message}`);
        }
    }
    async cleanupBuild(deploymentId) {
        try {
            if (await fs_extra_1.default.pathExists(this.distPath)) {
                await fs_extra_1.default.remove(this.distPath);
                logger_1.default.info(`清理构建文件 [${deploymentId}]`);
            }
        }
        catch (error) {
            logger_1.default.error(`清理构建文件失败 [${deploymentId}]`, error);
        }
    }
    async getProjectInfo() {
        try {
            const packageJsonPath = path_1.default.join(this.projectPath, 'package.json');
            const packageJson = await fs_extra_1.default.readJson(packageJsonPath);
            return {
                name: packageJson.name || 'unknown',
                version: packageJson.version || '0.0.0',
                buildCommand: config_1.config.BUILD_COMMAND
            };
        }
        catch (error) {
            logger_1.default.error('获取项目信息失败', error);
            throw new Error('无法读取项目信息');
        }
    }
}
exports.BuildService = BuildService;
//# sourceMappingURL=buildService.js.map