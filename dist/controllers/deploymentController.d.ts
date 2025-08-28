import { Request, Response } from 'express';
export declare class DeploymentController {
    getDeploymentStatus(req: Request, res: Response): Promise<void>;
    getDeploymentHistory(req: Request, res: Response): Promise<void>;
    private mapJobStateToStatus;
    private getCurrentStep;
}
//# sourceMappingURL=deploymentController.d.ts.map