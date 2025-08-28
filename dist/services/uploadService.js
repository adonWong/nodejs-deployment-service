"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const node_ssh_1 = require("node-ssh");
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
class UploadService {
    async uploadToServer(deploymentId, localPath, serverConfig) {
        const ssh = new node_ssh_1.NodeSSH();
        try {
            logger_1.default.info(`连接服务器 [${deploymentId}]`, {
                host: serverConfig.host,
                port: serverConfig.port,
                username: serverConfig.username
            });
            await ssh.connect({
                host: serverConfig.host,
                port: serverConfig.port || 22,
                username: serverConfig.username,
                password: serverConfig.password,
                readyTimeout: 30000,
                algorithms: {
                    kex: ['diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256'],
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
                    hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
                    compress: ['none']
                }
            });
            logger_1.default.info(`SSH连接成功 [${deploymentId}]`);
            if (serverConfig.backupPath) {
                await this.createBackup(ssh, deploymentId, serverConfig);
            }
            await ssh.execCommand(`mkdir -p ${serverConfig.deployPath}`);
            logger_1.default.info(`创建部署目录 [${deploymentId}]`, { deployPath: serverConfig.deployPath });
            const cleanResult = await ssh.execCommand(`find ${serverConfig.deployPath} -mindepth 1 -delete`);
            if (cleanResult.code !== 0) {
                logger_1.default.warn(`清空目标目录警告 [${deploymentId}]`, { stderr: cleanResult.stderr });
            }
            logger_1.default.info(`开始上传文件 [${deploymentId}]`, {
                from: localPath,
                to: serverConfig.deployPath
            });
            const localStats = await this.getDirectoryStats(localPath);
            logger_1.default.info(`准备上传文件 [${deploymentId}]`, localStats);
            let uploadedFiles = 0;
            const startTime = Date.now();
            const result = await ssh.putDirectory(localPath, serverConfig.deployPath, {
                recursive: true,
                concurrency: config_1.config.UPLOAD.CONCURRENCY,
                validate: (itemPath) => {
                    const basename = path_1.default.basename(itemPath);
                    const shouldUpload = !basename.startsWith('.') &&
                        basename !== 'node_modules' &&
                        basename !== '.git' &&
                        basename !== 'Thumbs.db' &&
                        basename !== '.DS_Store';
                    return shouldUpload;
                },
                tick: (localPath, remotePath, error) => {
                    if (error) {
                        logger_1.default.error(`文件上传失败 [${deploymentId}]`, {
                            localPath: path_1.default.basename(localPath),
                            error: error.message
                        });
                    }
                    else {
                        uploadedFiles++;
                        if (uploadedFiles % 50 === 0) {
                            logger_1.default.debug(`已上传文件 [${deploymentId}]`, { count: uploadedFiles });
                        }
                    }
                }
            });
            const uploadTime = Date.now() - startTime;
            if (!result) {
                throw new Error('文件上传失败');
            }
            const chmodResult = await ssh.execCommand(`chmod -R 755 ${serverConfig.deployPath}`);
            if (chmodResult.code !== 0) {
                logger_1.default.warn(`设置文件权限警告 [${deploymentId}]`, { stderr: chmodResult.stderr });
            }
            const remoteStats = await this.getRemoteDirectoryStats(ssh, serverConfig.deployPath);
            logger_1.default.info(`文件上传完成 [${deploymentId}]`, {
                uploadTime: `${uploadTime}ms`,
                uploadedFiles,
                localStats,
                remoteStats
            });
        }
        catch (error) {
            logger_1.default.error(`文件上传失败 [${deploymentId}]`, error);
            throw new Error(`上传失败: ${error.message}`);
        }
        finally {
            ssh.dispose();
        }
    }
    async createBackup(ssh, deploymentId, serverConfig) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path_1.default.posix.join(serverConfig.backupPath, `backup-${timestamp}`);
            const { code } = await ssh.execCommand(`test -d ${serverConfig.deployPath}`);
            if (code === 0) {
                await ssh.execCommand(`mkdir -p ${serverConfig.backupPath}`);
                const copyResult = await ssh.execCommand(`cp -r ${serverConfig.deployPath} ${backupDir}`);
                if (copyResult.code === 0) {
                    logger_1.default.info(`备份已创建 [${deploymentId}]`, { backupDir });
                    const cleanupResult = await ssh.execCommand(`cd ${serverConfig.backupPath} && ls -t | tail -n +6 | xargs -r rm -rf`);
                    if (cleanupResult.code !== 0) {
                        logger_1.default.warn(`清理旧备份警告 [${deploymentId}]`, { stderr: cleanupResult.stderr });
                    }
                }
                else {
                    logger_1.default.warn(`创建备份失败 [${deploymentId}]`, { stderr: copyResult.stderr });
                }
            }
            else {
                logger_1.default.info(`部署目录不存在，跳过备份 [${deploymentId}]`);
            }
        }
        catch (error) {
            logger_1.default.warn(`创建备份失败 [${deploymentId}]`, error);
        }
    }
    async getDirectoryStats(dirPath) {
        try {
            const files = await fs_extra_1.default.readdir(dirPath, { withFileTypes: true });
            let fileCount = 0;
            let dirCount = 0;
            let totalSize = 0;
            for (const file of files) {
                const filePath = path_1.default.join(dirPath, file.name);
                if (file.isDirectory()) {
                    dirCount++;
                    const subStats = await this.getDirectoryStats(filePath);
                    fileCount += subStats.fileCount;
                    dirCount += subStats.dirCount;
                    totalSize += subStats.totalSize;
                }
                else {
                    fileCount++;
                    const stats = await fs_extra_1.default.stat(filePath);
                    totalSize += stats.size;
                }
            }
            return {
                fileCount,
                dirCount,
                totalSize,
                totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
            };
        }
        catch (error) {
            return { fileCount: 0, dirCount: 0, totalSize: 0, totalSizeMB: 0 };
        }
    }
    async getRemoteDirectoryStats(ssh, remotePath) {
        try {
            const result = await ssh.execCommand(`find ${remotePath} -type f | wc -l && du -sm ${remotePath}`);
            if (result.code === 0) {
                const lines = result.stdout.trim().split('\n');
                const fileCount = parseInt(lines[0]) || 0;
                const sizeMatch = lines[1]?.match(/^(\d+)/);
                const totalSizeMB = sizeMatch ? parseInt(sizeMatch[1]) : 0;
                return { fileCount, totalSizeMB };
            }
        }
        catch (error) {
            logger_1.default.warn('获取远程目录统计失败', error);
        }
        return { fileCount: 0, totalSizeMB: 0 };
    }
}
exports.UploadService = UploadService;
//# sourceMappingURL=uploadService.js.map