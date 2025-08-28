import type { Request, Response } from "express";
import { config } from "../config";
import { deploymentQueue } from "../jobs/deploymentJob";
import type { ApiResponse, DeploymentRequest, SingleProjectDeploymentRequest } from "../types/interfaces";
import logger from "../utils/logger";
import { validateDeploymentRequest, validateMultiProjectDeploymentRequest } from "../utils/validator";

export class WebhookController {
  async handleMultiProjectDeployment(req: Request, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      // 验证Webhook密钥
      const providedSecret = req.headers["x-webhook-secret"] as string
      if (providedSecret !== config.WEBHOOK_SECRET) {
        logger.warn("Webhook密钥验证失败", {
          providedSecret: providedSecret?.substring(0, 10) + "...",
          ip: req.ip,
        })

        const response: ApiResponse = {
          success: false,
          message: "认证失败",
          timestamp: new Date().toISOString(),
        }

        res.status(401).json(response)
        return
      }

      // 验证请求数据
      const deploymentData = validateMultiProjectDeploymentRequest(req.body)

      // 创建部署任务ID
      const deploymentId = `deploy-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`

      // 确定任务优先级
      const priority =
        deploymentData.metadata?.priority === "high"
          ? 10
          : deploymentData.metadata?.priority === "low"
          ? 1
          : 5

      // 添加到多项目部署队列
      const job = await deploymentQueue.add(
        "build-and-deploy-multi",
        {
          deploymentId,
          ...deploymentData,
        },
        {
          priority,
          attempts: config.JOB.ATTEMPTS,
          backoff: config.JOB.BACKOFF,
          removeOnComplete: config.JOB.REMOVE_ON_COMPLETE,
          removeOnFail: config.JOB.REMOVE_ON_FAIL,
          jobId: deploymentId,
        }
      )

      const processTime = Date.now() - startTime

      logger.info(`多项目部署任务已创建: ${deploymentId}`, {
        deploymentData,
        jobId: job.id,
        priority,
        processTime: `${processTime}ms`,
        projectCount: deploymentData.projectIds.length
      })

      const response: ApiResponse = {
        success: true,
        data: {
          deploymentId,
          jobId: job.id,
          priority,
          projectCount: deploymentData.projectIds.length,
          estimatedTime: `${5 + deploymentData.projectIds.length * 3}-${10 + deploymentData.projectIds.length * 5}分钟`,
        },
        message: "多项目部署任务已创建",
        timestamp: new Date().toISOString(),
      }

      res.status(200).json(response)
    } catch (error) {
      const processTime = Date.now() - startTime

      logger.error("创建多项目部署任务失败", {
        error: error.message,
        stack: error.stack,
        processTime: `${processTime}ms`,
        body: req.body,
      })

      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      }

      res.status(400).json(response)
    }
  }

  async handleDeployment(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      // 验证Webhook密钥（简单的安全措施）
      const providedSecret = req.headers["x-webhook-secret"] as string;
      if (providedSecret !== config.WEBHOOK_SECRET) {
        logger.warn("Webhook密钥验证失败", {
          providedSecret: providedSecret?.substring(0, 10) + "...",
          ip: req.ip,
        });

        const response: ApiResponse = {
          success: false,
          message: "认证失败",
          timestamp: new Date().toISOString(),
        };

        res.status(401).json(response);
        return;
      }

      // 验证请求数据为单项目格式
      const deploymentData = validateDeploymentRequest(req.body) as SingleProjectDeploymentRequest;

      // 创建部署任务ID
      const deploymentId = `deploy-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // 确定任务优先级
      const priority =
        deploymentData.metadata?.priority === "high"
          ? 10
          : deploymentData.metadata?.priority === "low"
          ? 1
          : 5;

      // 添加到任务队列
      const job = await deploymentQueue.add(
        "build-and-deploy",
        {
          deploymentId,
          ...deploymentData,
        },
        {
          priority,
          attempts: config.JOB.ATTEMPTS,
          backoff: config.JOB.BACKOFF,
          removeOnComplete: config.JOB.REMOVE_ON_COMPLETE,
          removeOnFail: config.JOB.REMOVE_ON_FAIL,
          jobId: deploymentId, // 使用部署ID作为任务ID
        }
      );

      const processTime = Date.now() - startTime;

      logger.info(`部署任务已创建: ${deploymentId}`, {
        deploymentData,
        jobId: job.id,
        priority,
        processTime: `${processTime}ms`,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          deploymentId,
          jobId: job.id,
          priority,
          estimatedTime: "5-10分钟",
        },
        message: "部署任务已创建",
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      const processTime = Date.now() - startTime;

      logger.error("创建部署任务失败", {
        error: error.message,
        stack: error.stack,
        processTime: `${processTime}ms`,
        body: req.body,
      });

      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      };

      res.status(400).json(response);
    }
  }

  async getQueueStatus(req: Request, res: Response): Promise<void> {
    try {
      const waiting = await deploymentQueue.getWaiting();
      const active = await deploymentQueue.getActive();
      const completed = await deploymentQueue.getCompleted();
      const failed = await deploymentQueue.getFailed();

      const response: ApiResponse = {
        success: true,
        data: {
          queue: {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
          },
          activeJobs: active.map((job) => ({
            id: job.id,
            data: job.data,
            progress: job.progress(),
            processedOn: job.processedOn,
            opts: job.opts,
          })),
        },
        message: "队列状态获取成功",
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    } catch (error) {
      logger.error("获取队列状态失败", error);

      const response: ApiResponse = {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      };

      res.status(500).json(response);
    }
  }
}
