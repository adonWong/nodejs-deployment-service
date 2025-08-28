export declare class BuildService {
    private readonly projectPath;
    private readonly distPath;
    constructor();
    buildProject(deploymentId: string): Promise<string>;
    cleanupBuild(deploymentId: string): Promise<void>;
    getProjectInfo(): Promise<{
        name: string;
        version: string;
        buildCommand: string;
    }>;
}
//# sourceMappingURL=buildService.d.ts.map