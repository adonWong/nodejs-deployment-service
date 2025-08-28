import Joi from 'joi'
import type { DeploymentRequest, SingleProjectDeploymentRequest } from '../types/interfaces'

// 单项目部署请求验证架构
export const singleProjectDeploymentRequestSchema = Joi.object({
  projectId: Joi.string().required().min(1).max(100),
  branch: Joi.string().required().min(1).max(100),
  commitHash: Joi.string().optional().min(7).max(40),
  triggerBy: Joi.string().required().min(1).max(100),
  timestamp: Joi.string().required(),
  metadata: Joi.object({
    buildType: Joi.string().valid('development', 'staging', 'production').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  })
    .unknown(true)
    .optional()
})

// 多项目部署请求验证架构
export const multiProjectDeploymentRequestSchema = Joi.object({
  projectIds: Joi.array().items(Joi.string().min(1).max(100)).min(1).max(10).required(),
  branch: Joi.string().required().min(1).max(100),
  commitHash: Joi.string().optional().min(7).max(40),
  triggerBy: Joi.string().required().min(1).max(100),
  timestamp: Joi.string().required(),
  metadata: Joi.object({
    buildType: Joi.string().valid('development', 'staging', 'production').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  })
    .unknown(true)
    .optional()
})

// 向后兼容的原有架构
export const deploymentRequestSchema = Joi.object({
  projectId: Joi.string().required().min(1).max(100),
  branch: Joi.string().required().min(1).max(100),
  commitHash: Joi.string().optional().min(7).max(40),
  triggerBy: Joi.string().required().min(1).max(100),
  timestamp: Joi.string().required(),
  metadata: Joi.object({
    buildType: Joi.string().valid('development', 'staging', 'production').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  })
    .unknown(true)
    .optional()
})

export const validateMultiProjectDeploymentRequest = (data: any): DeploymentRequest => {
  const { error, value } = multiProjectDeploymentRequestSchema.validate(data)
  if (error) {
    throw new Error(`多项目请求数据验证失败: ${error.details[0].message}`)
  }
  return value as DeploymentRequest
}

export const validateDeploymentRequest = (data: any): SingleProjectDeploymentRequest => {
  const { error, value } = singleProjectDeploymentRequestSchema.validate(data)
  if (error) {
    throw new Error(`单项目请求数据验证失败: ${error.details[0].message}`)
  }
  return value as SingleProjectDeploymentRequest
}

export const serverConfigSchema = Joi.object({
  host: Joi.string().required().min(1),
  port: Joi.number().port().default(22),
  username: Joi.string().required().min(1),
  password: Joi.string().required().min(1),
  deployPath: Joi.string().required().min(1),
  backupPath: Joi.string().optional()
})

export const validateServerConfig = (data: any) => {
  const { error, value } = serverConfigSchema.validate(data)
  if (error) {
    throw new Error(`服务器配置验证失败: ${error.details[0].message}`)
  }
  return value
}
