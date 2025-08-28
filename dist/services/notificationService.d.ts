export declare class NotificationService {
    private readonly webhookUrl;
    constructor();
    sendSuccessNotification(deploymentId: string, data: {
        projectId: string;
        branch: string;
        commitHash: string;
        serverHost: string;
        deployPath: string;
    }): Promise<void>;
    sendFailureNotification(deploymentId: string, error: Error): Promise<void>;
    private sendNotification;
    testWebhookConnection(): Promise<boolean>;
}
//# sourceMappingURL=notificationService.d.ts.map