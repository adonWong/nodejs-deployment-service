export declare const config: {
    NODE_ENV: string;
    PORT: number;
    LOG_LEVEL: string;
    PROJECT_PATH: string;
    BUILD_COMMAND: string;
    DIST_DIR: string;
    BACKEND_SERVICE_URL: string;
    BACKEND_API_TOKEN: string;
    REDIS: {
        HOST: string;
        PORT: number;
        PASSWORD: string | undefined;
        DB: number;
        ENABLED: boolean;
    };
    WEBHOOK_SECRET: string;
    API_RATE_LIMIT: number;
    NOTIFICATION_WEBHOOK_URL: string;
    EMAIL_SERVICE_API_KEY: string;
    JOB: {
        ATTEMPTS: number;
        BACKOFF: "exponential";
        REMOVE_ON_COMPLETE: number;
        REMOVE_ON_FAIL: number;
    };
    UPLOAD: {
        TIMEOUT: number;
        CONCURRENCY: number;
    };
    LOG: {
        MAX_FILES: string;
        MAX_SIZE: string;
    };
};
export default config;
//# sourceMappingURL=index.d.ts.map