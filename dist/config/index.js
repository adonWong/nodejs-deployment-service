"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
exports.config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3001'),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    PROJECT_PATH: process.env.PROJECT_PATH || path_1.default.join(__dirname, '../../../'),
    BUILD_COMMAND: 'pnpm build',
    DIST_DIR: 'dist',
    BACKEND_SERVICE_URL: process.env.BACKEND_SERVICE_URL || 'http://localhost:3000',
    BACKEND_API_TOKEN: process.env.BACKEND_API_TOKEN || '',
    REDIS: {
        HOST: process.env.REDIS_HOST || 'localhost',
        PORT: parseInt(process.env.REDIS_PORT || '6379'),
        PASSWORD: process.env.REDIS_PASSWORD || undefined,
        DB: parseInt(process.env.REDIS_DB || '0'),
        ENABLED: process.env.REDIS_ENABLED !== 'false'
    },
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'default-secret',
    API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT || '100'),
    NOTIFICATION_WEBHOOK_URL: process.env.NOTIFICATION_WEBHOOK_URL || '',
    EMAIL_SERVICE_API_KEY: process.env.EMAIL_SERVICE_API_KEY || '',
    JOB: {
        ATTEMPTS: 3,
        BACKOFF: 'exponential',
        REMOVE_ON_COMPLETE: 10,
        REMOVE_ON_FAIL: 5
    },
    UPLOAD: {
        TIMEOUT: 300000,
        CONCURRENCY: 3
    },
    LOG: {
        MAX_FILES: '14d',
        MAX_SIZE: '20m'
    }
};
exports.default = exports.config;
//# sourceMappingURL=index.js.map