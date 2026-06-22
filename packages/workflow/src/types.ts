import type { ID, Timestamp, Metadata } from '@aether/shared';

/** 工作流节点类型 */
export type NodeType = 'task' | 'condition' | 'parallel' | 'loop' | 'delay';

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  /** 任务执行函数（task 类型） */
  handler?: (input: unknown, context: WorkflowContext) => Promise<unknown>;
  /** 条件判断函数（condition 类型） */
  condition?: (input: unknown, context: WorkflowContext) => Promise<boolean> | boolean;
  /** 并行子节点 ID（parallel 类型） */
  parallelBranches?: string[];
  /** 循环次数或条件（loop 类型） */
  loop?: {
    count?: number;
    condition?: (input: unknown, context: WorkflowContext, iteration: number) => boolean;
    body: string; // 循环体节点 ID
  };
  /** 延迟毫秒（delay 类型） */
  delayMs?: number;
  /** 重试配置 */
  retry?: {
    maxAttempts: number;
    delayMs?: number;
    backoff?: 'fixed' | 'exponential';
    retryOnError?: (error: Error) => boolean;
  };
  /** 超时（毫秒） */
  timeout?: number;
  /** 失败时的回退节点 ID */
  fallback?: string;
  metadata?: Metadata;
}

/** 工作流边 */
export interface WorkflowEdge {
  from: string;
  to: string;
  /** 条件表达式（来自 condition 节点的 true/false 分支） */
  condition?: 'true' | 'false';
}

/** 工作流定义 */
export interface WorkflowDefinition {
  id: ID;
  name: string;
  description?: string;
  version: string;
  nodes: Map<string, WorkflowNode>;
  edges: WorkflowEdge[];
  /** 入口节点 ID */
  entry: string;
  /** 全局超时 */
  timeout?: number;
  metadata?: Metadata;
}

/** 工作流执行上下文 */
export interface WorkflowContext {
  workflowId: ID;
  executionId: ID;
  variables: Record<string, unknown>;
  startTime: Timestamp;
  /** 父工作流执行 ID（用于子工作流） */
  parentExecutionId?: ID;
}

/** 节点执行状态 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

/** 节点执行结果 */
export interface NodeExecutionResult {
  nodeId: string;
  status: NodeStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  duration?: number;
  attempts: number;
}

/** 工作流执行结果 */
export interface WorkflowExecutionResult {
  executionId: ID;
  workflowId: ID;
  status: NodeStatus;
  results: Map<string, NodeExecutionResult>;
  startTime: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  finalOutput?: unknown;
  error?: string;
}
