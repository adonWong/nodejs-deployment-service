"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const logger_1 = __importDefault(require("./utils/logger"));
const webhookController_1 = require("./controllers/webhookController");
const deploymentController_1 = require("./controllers/deploymentController");
const healthController_1 = require("./controllers/healthController");
require("./jobs/deploymentJob");
class DeploymentServiceApp {
    constructor() {
        this.webhookController = new webhookController_1.WebhookController();
        this.deploymentController = new deploymentController_1.DeploymentController();
        this.healthController = new healthController_1.HealthController();
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: false,
        }));
        this.app.use((0, cors_1.default)({
            origin: config_1.config.NODE_ENV === 'production' ? false : true,
            credentials: true
        }));
        this.app.use((0, compression_1.default)());
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        if (config_1.config.NODE_ENV !== 'test') {
            this.app.use((0, morgan_1.default)('combined', {
                stream: {
                    write: (message) => {
                        logger_1.default.info(message.trim(), { source: 'http' });
                    }
                }
            }));
        }
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: 15 * 60 * 1000,
            max: config_1.config.API_RATE_LIMIT,
            message: {
                success: false,
                message: '请求过于频繁，请稍后再试',
                timestamp: new Date().toISOString()
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);
        this.app.set('trust proxy', 1);
    }
    setupRoutes() {
        this.app.get('/health', this.healthController.getHealth.bind(this.healthController));
        this.app.get('/health/detailed', this.healthController.getDetailedHealth.bind(this.healthController));
        const apiRouter = express_1.default.Router();
        apiRouter.post('/webhook/deploy', this.webhookController.handleDeployment.bind(this.webhookController));
        apiRouter.get('/queue/status', this.webhookController.getQueueStatus.bind(this.webhookController));
        apiRouter.get('/deployment/:deploymentId/status', this.deploymentController.getDeploymentStatus.bind(this.deploymentController));
        apiRouter.get('/deployments/history', this.deploymentController.getDeploymentHistory.bind(this.deploymentController));
        this.app.use('/api', apiRouter);
        this.app.get('/', (req, res) => {
            const response = {
                success: true,
                data: {
                    service: 'Frontend Deployment Service',
                    version: process.env.npm_package_version || '1.0.0',
                    uptime: process.uptime(),
                    environment: config_1.config.NODE_ENV
                },
                message: '前端自动化部署服务运行中',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        });
        this.app.use('*', (req, res) => {
            const response = {
                success: false,
                message: `路径 ${req.originalUrl} 不存在`,
                timestamp: new Date().toISOString()
            };
            res.status(404).json(response);
        });
    }
    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            logger_1.default.error('未处理的错误', {
                error: err.message,
                stack: err.stack,
                url: req.url,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            const response = {
                success: false,
                message: config_1.config.NODE_ENV === 'production' ? '内部服务器错误' : err.message,
                timestamp: new Date().toISOString()
            };
            res.status(500).json(response);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('未处理的Promise拒绝', { reason, promise });
        });
        process.on('uncaughtException', (error) => {
            logger_1.default.error('未捕获的异常', error);
            process.exit(1);
        });
    }
    start() {
        const port = config_1.config.PORT;
        this.app.listen(port, () => {
            logger_1.default.info(`部署服务启动成功`, {
                port,
                environment: config_1.config.NODE_ENV,
                projectPath: config_1.config.PROJECT_PATH,
                backendUrl: config_1.config.BACKEND_SERVICE_URL,
                redisHost: config_1.config.REDIS.HOST,
                redisPort: config_1.config.REDIS.PORT
            });
        });
    }
    getApp() {
        return this.app;
    }
}
if (require.main === module) {
    const app = new DeploymentServiceApp();
    app.start();
}
exports.default = DeploymentServiceApp;
//# sourceMappingURL=app.js.map