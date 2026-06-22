import { EventEmitter } from 'node:events';

/**
 * 事件总线基类
 * 所有需要事件驱动的模块都应继承此类
 *
 * @template TEvents 事件类型映射，键为事件名，值为事件参数类型
 */
export class EventBus<TEvents extends Record<string, unknown[]>> {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // 设置最大监听器数量，避免内存泄漏警告
    this.emitter.setMaxListeners(100);
  }

  /**
   * 监听事件
   * @param event 事件名称
   * @param listener 事件监听器
   */
  on<K extends keyof TEvents & string>(event: K, listener: (...args: TEvents[K]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * 监听事件（仅触发一次）
   * @param event 事件名称
   * @param listener 事件监听器
   */
  once<K extends keyof TEvents & string>(event: K, listener: (...args: TEvents[K]) => void): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param listener 事件监听器
   */
  off<K extends keyof TEvents & string>(event: K, listener: (...args: TEvents[K]) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 事件参数
   */
  emit<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]): boolean {
    return this.emitter.emit(event, ...args);
  }

  /**
   * 移除指定事件的所有监听器
   * @param event 事件名称（可选，不填则移除所有事件的监听器）
   */
  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /**
   * 获取指定事件的监听器数量
   * @param event 事件名称
   */
  listenerCount<K extends keyof TEvents & string>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * 获取所有事件名称
   */
  eventNames(): (keyof TEvents & string)[] {
    return this.emitter.eventNames() as (keyof TEvents & string)[];
  }

  /**
   * 销毁事件总线，移除所有监听器
   */
  destroy(): void {
    this.removeAllListeners();
  }
}

/**
 * 全局事件总线类型定义
 * 定义系统中所有可能的事件
 */
export interface GlobalEvents {
  [key: string]: unknown[];
  // Agent 生命周期事件
  'agent.started': [agentId: string, timestamp: number];
  'agent.paused': [agentId: string, timestamp: number];
  'agent.resumed': [agentId: string, timestamp: number];
  'agent.stopped': [agentId: string, timestamp: number];
  'agent.error': [agentId: string, error: Error, timestamp: number];
  'agent.status_changed': [agentId: string, oldStatus: string, newStatus: string, timestamp: number];

  // 记忆系统事件
  'memory.added': [memoryId: string, agentId: string, timestamp: number];
  'memory.deleted': [memoryId: string, agentId: string, timestamp: number];
  'memory.cleared': [agentId: string, timestamp: number];

  // 模型路由事件
  'model.request': [model: string, inputTokens: number, timestamp: number];
  'model.response': [model: string, outputTokens: number, duration: number, timestamp: number];
  'model.error': [model: string, error: Error, timestamp: number];
  'budget.warning': [currentUsage: number, budget: number, timestamp: number];
  'budget.exceeded': [currentUsage: number, budget: number, timestamp: number];

  // MCP 工具事件
  'mcp.tool_called': [toolName: string, serverName: string, timestamp: number];
  'mcp.tool_result': [toolName: string, serverName: string, duration: number, timestamp: number];
  'mcp.tool_error': [toolName: string, serverName: string, error: Error, timestamp: number];
  'mcp.server_connected': [serverName: string, timestamp: number];
  'mcp.server_disconnected': [serverName: string, timestamp: number];

  // 调度器事件
  'scheduler.task_created': [taskId: string, agentId: string, timestamp: number];
  'scheduler.task_cancelled': [taskId: string, agentId: string, timestamp: number];
  'scheduler.task_executed': [taskId: string, agentId: string, timestamp: number];
  'scheduler.task_error': [taskId: string, agentId: string, error: Error, timestamp: number];

  // A2A 通信事件
  'a2a.agent_registered': [agentId: string, timestamp: number];
  'a2a.agent_unregistered': [agentId: string, timestamp: number];
  'a2a.message_sent': [messageId: string, from: string, to: string, timestamp: number];
  'a2a.message_received': [messageId: string, from: string, to: string, timestamp: number];

  // 沙箱事件
  'sandbox.permission_checked': [
    skillId: string,
    permission: string,
    resource: string | undefined,
    allowed: boolean,
    timestamp: number
  ];
  'sandbox.audit_logged': [auditId: string, action: string, result: string, timestamp: number];
  'sandbox.skill_executed': [skillId: string, agentId: string | undefined, duration: number, timestamp: number];
  'sandbox.skill_blocked': [
    skillId: string,
    agentId: string | undefined,
    reason: string,
    timestamp: number
  ];

  // 工作流事件
  'workflow.started': [workflowId: string, executionId: string, timestamp: number];
  'workflow.node_started': [workflowId: string, executionId: string, nodeId: string, timestamp: number];
  'workflow.node_completed': [
    workflowId: string,
    executionId: string,
    nodeId: string,
    status: string,
    duration: number,
    timestamp: number
  ];
  'workflow.completed': [
    workflowId: string,
    executionId: string,
    status: string,
    duration: number,
    timestamp: number
  ];
  'workflow.error': [workflowId: string, executionId: string, error: Error, timestamp: number];
}

/**
 * 全局事件总线单例
 */
export const globalEventBus = new EventBus<GlobalEvents>();
