export interface DeploymentRequest {
    projectId: string;
    branch: string;
    commitHash: string;
    triggerBy: string;
    timestamp: string;
    metadata?: {
        buildType?: 'development' | 'staging' | 'production';
        priority?: 'low' | 'normal' | 'high';
        [key: string]: any;
    };
}
export interface ServerConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    deployPath: string;
    backupPath?: string;
}
export interface DeploymentStatus {
    deploymentId: string;
    status: 'pending' | 'building' | 'uploading' | 'completed' | 'failed';
    progress: number;
    currentStep: string;
    logs: LogEntry[];
    startTime: string;
    endTime?: string;
    estimatedCompletion?: string;
}
export interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}
export interface JobData extends DeploymentRequest {
    deploymentId: string;
}
export interface NotificationData {
    deploymentId: string;
    projectId: string;
    branch: string;
    commitHash: string;
    status: 'success' | 'failure';
    serverHost?: string;
    deployPath?: string;
    error?: Error;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}
export interface HealthCheckResult {
    redis: boolean;
    frontendProject: boolean;
    backendService: boolean;
}
//# sourceMappingURL=interfaces.d.ts.map