import { ServerConfig } from '../types/interfaces';
export declare class ConfigService {
    private readonly backendServiceUrl;
    private readonly apiToken;
    constructor();
    getServerConfig(deploymentId: string, projectId: string): Promise<ServerConfig>;
    testBackendConnection(): Promise<boolean>;
}
//# sourceMappingURL=configService.d.ts.map