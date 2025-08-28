import { ServerConfig } from '../types/interfaces';
export declare class UploadService {
    uploadToServer(deploymentId: string, localPath: string, serverConfig: ServerConfig): Promise<void>;
    private createBackup;
    private getDirectoryStats;
    private getRemoteDirectoryStats;
}
//# sourceMappingURL=uploadService.d.ts.map