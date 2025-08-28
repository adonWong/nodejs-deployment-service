import express from 'express';
import './jobs/deploymentJob';
declare class DeploymentServiceApp {
    private app;
    private webhookController;
    private deploymentController;
    private healthController;
    constructor();
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    start(): void;
    getApp(): express.Application;
}
export default DeploymentServiceApp;
//# sourceMappingURL=app.d.ts.map