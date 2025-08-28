// 新增项目配置接口
export interface ProjectConfig {
  id: string;
  name: string;
  gitRepository: string;
  gitBranch: string;
  localPath: string;
  buildCommand: string;
  distDirectory: string;
  remotePath: string;
  nginxLocation: string;
  port?: number;
}

// 修改部署请求接口，支持多项目
export interface DeploymentRequest {
  projectIds: string[]; // 修改为数组，支持多项目
  branch: string;
  commitHash?: string;
  triggerBy: string;
  timestamp: string;
  metadata?: {
    buildType?: 'development' | 'staging' | 'production';
    priority?: 'low' | 'normal' | 'high';
    [key: string]: any;
  };
}

// 保持向后兼容的单项目接口
export interface SingleProjectDeploymentRequest {
  projectId: string;
  branch: string;
  commitHash?: string;
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

// 单项目部署状态（保持向后兼容）
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

// 新增多项目部署状态
export interface MultiProjectDeploymentStatus {
  deploymentId: string;
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial_success';
  projects: {
    [projectId: string]: {
      status: 'pending' | 'cloning' | 'building' | 'uploading' | 'configuring' | 'completed' | 'failed';
      progress: number;
      message: string;
      error?: string;
    };
  };
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

// 新增多项目通知数据接口
export interface MultiProjectNotificationData {
  deploymentId: string;
  projectIds: string[];
  branch: string;
  commitHash?: string;
  status: 'success' | 'failure' | 'partial_success';
  serverHost?: string;
  projectBuilds?: { [projectId: string]: string };
  error?: Error;
  failedProjects?: string[];
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
  nginx?: boolean;
  gitAccess?: boolean;
}

// 新增Git相关接口
export interface GitProjectInfo {
  lastCommit: string;
  author: string;
  message: string;
  timestamp: string;
}

// 新增构建结果接口
export interface BuildResult {
  [projectId: string]: string; // projectId -> distPath
}

// 新增多项目任务数据接口
export interface MultiProjectJobData extends DeploymentRequest {
  deploymentId: string;
}

// 保持单项目任务数据向后兼容
export interface SingleProjectJobData extends SingleProjectDeploymentRequest {
  deploymentId: string;
}