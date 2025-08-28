import { Request, Response } from 'express';
export declare class HealthController {
    private buildService;
    private configService;
    private notificationService;
    getHealth(req: Request, res: Response): Promise<void>;
    getDetailedHealth(req: Request, res: Response): Promise<void>;
    private checkRedisConnection;
    private checkProjectAccess;
    private checkBackendService;
    private getRedisStatus;
    private getProjectStatus;
    private getBackendStatus;
    private getWebhookStatus;
    private getProjectInfo;
    private parseRedisInfo;
    private getSettledValue;
}
//# sourceMappingURL=healthController.d.ts.map