import Bull from 'bull';
import Redis from 'ioredis';
declare class MemoryQueue {
    private jobs;
    private processing;
    add(jobType: string, data: any, options?: any): Promise<{
        id: any;
    }>;
    getJob(jobId: string): Promise<{
        id: any;
        data: any;
        progress: () => any;
        getState: () => Promise<any>;
    } | null>;
    getWaiting(): Promise<any[]>;
    getActive(): Promise<any[]>;
    getCompleted(): Promise<any[]>;
    getFailed(): Promise<any[]>;
    process(jobType: string, processor: Function): void;
    processJobs(): Promise<void>;
    on(event: string, callback: Function): void;
    emit(event: string, ...args: any[]): void;
    close(): Promise<void>;
}
declare class MemoryRedis {
    private storage;
    hset(key: string, data: any): Promise<void>;
    hgetall(key: string): Promise<any>;
    lpush(key: string, value: string): Promise<void>;
    lrange(key: string, start: number, end: number): Promise<any>;
    ltrim(key: string, start: number, end: number): Promise<void>;
    expire(key: string, seconds: number): Promise<void>;
    exists(key: string): Promise<0 | 1>;
    keys(pattern: string): Promise<any[]>;
    ping(): Promise<string>;
    disconnect(): Promise<void>;
}
declare let redis: Redis | MemoryRedis;
declare let deploymentQueue: Bull.Queue | MemoryQueue;
declare function updateDeploymentStatus(deploymentId: string, status: string, message: string, progress?: number, endTime?: string): Promise<void>;
declare function addDeploymentLog(deploymentId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): Promise<void>;
export { deploymentQueue, redis, updateDeploymentStatus, addDeploymentLog };
//# sourceMappingURL=deploymentJob.d.ts.map