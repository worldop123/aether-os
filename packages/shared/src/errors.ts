/**
 * Aether OS 基础错误类
 * 所有自定义错误都应继承此类
 */
export class AetherError extends Error {
  /** 错误码 */
  public readonly code: string;
  /** 错误元数据 */
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'AetherError';
    this.code = code;
    this.metadata = metadata;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      metadata: this.metadata,
      stack: this.stack,
    };
  }
}

/**
 * Agent 相关错误
 */
export class AgentError extends AetherError {
  constructor(message: string, code: string = 'AGENT_ERROR', metadata?: Record<string, unknown>) {
    super(message, code, metadata);
    this.name = 'AgentError';
  }
}

/**
 * 记忆系统错误
 */
export class MemoryError extends AetherError {
  constructor(message: string, code: string = 'MEMORY_ERROR', metadata?: Record<string, unknown>) {
    super(message, code, metadata);
    this.name = 'MemoryError';
  }
}

/**
 * 模型路由错误
 */
export class ModelRouterError extends AetherError {
  constructor(message: string, code: string = 'MODEL_ROUTER_ERROR', metadata?: Record<string, unknown>) {
    super(message, code, metadata);
    this.name = 'ModelRouterError';
  }
}

/**
 * 预算超限错误
 */
export class BudgetExceededError extends ModelRouterError {
  constructor(message: string = 'Budget exceeded', metadata?: Record<string, unknown>) {
    super(message, 'BUDGET_EXCEEDED', metadata);
    this.name = 'BudgetExceededError';
  }
}

/**
 * MCP 工具错误
 */
export class McpError extends AetherError {
  constructor(message: string, code: string = 'MCP_ERROR', metadata?: Record<string, unknown>) {
    super(message, code, metadata);
    this.name = 'McpError';
  }
}

/**
 * 调度器错误
 */
export class SchedulerError extends AetherError {
  constructor(message: string, code: string = 'SCHEDULER_ERROR', metadata?: Record<string, unknown>) {
    super(message, code, metadata);
    this.name = 'SchedulerError';
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends AetherError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', metadata);
    this.name = 'ConfigurationError';
  }
}

/**
 * 未找到错误
 */
export class NotFoundError extends AetherError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', metadata);
    this.name = 'NotFoundError';
  }
}
