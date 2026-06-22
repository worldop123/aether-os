import type { ID } from '@aether/shared';
import { now, globalEventBus } from '@aether/shared';
import { NotFoundError } from '@aether/shared';
import type { A2AMessage, IA2AChannel } from './types.js';

/** 消息处理器类型 */
export type MessageHandler = (message: A2AMessage) => void;

/** 等待响应的 Promise 解析器 */
interface PendingRequest {
  resolve: (message: A2AMessage) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

/**
 * 本地进程内 A2A 通信通道
 * 基于 Map<agentId, handler[]> 实现消息路由
 * 支持单播、广播以及请求-响应模式
 */
export class LocalA2AChannel implements IA2AChannel {
  /** 每个 Agent 注册的消息处理器列表 */
  private handlers: Map<ID, MessageHandler[]> = new Map();
  /** 广播处理器列表（接收所有广播消息） */
  private broadcastHandlers: MessageHandler[] = [];
  /** 等待响应的请求映射：messageId -> PendingRequest */
  private pendingRequests: Map<ID, PendingRequest> = new Map();
  /** 通道是否已关闭 */
  private closed: boolean = false;

  /**
   * 注册指定 Agent 的消息处理器
   * @param agentId 接收消息的 Agent ID
   * @param handler 消息处理器
   */
  registerAgent(agentId: ID, handler: MessageHandler): void {
    if (this.closed) {
      throw new Error('通道已关闭，无法注册 Agent');
    }
    const handlers = this.handlers.get(agentId);
    if (handlers) {
      handlers.push(handler);
    } else {
      this.handlers.set(agentId, [handler]);
    }
  }

  /**
   * 注销指定 Agent 的所有消息处理器
   */
  unregisterAgent(agentId: ID): void {
    this.handlers.delete(agentId);
  }

  /**
   * 注册全局消息处理器（接收所有消息，包括广播）
   * 与 IA2AChannel.onMessage 等价
   */
  onMessage(handler: MessageHandler): void {
    if (this.closed) {
      throw new Error('通道已关闭，无法注册处理器');
    }
    this.broadcastHandlers.push(handler);
  }

  /**
   * 移除消息处理器
   */
  offMessage(handler: MessageHandler): void {
    this.broadcastHandlers = this.broadcastHandlers.filter((h) => h !== handler);
  }

  /**
   * 发送消息
   * 根据 to 字段路由消息：单播到指定 Agent，或广播给所有 Agent
   */
  async send(message: A2AMessage): Promise<void> {
    if (this.closed) {
      throw new Error('通道已关闭，无法发送消息');
    }

    const timestamp = now();
    globalEventBus.emit(
      'a2a.message_sent',
      message.id,
      message.from,
      String(message.to),
      timestamp
    );

    if (message.to === '*') {
      // 广播：发送给所有已注册的 Agent（除了发送方自己）
      this.deliverToAll(message);
    } else {
      // 单播：发送给指定 Agent
      this.deliverToOne(message);
    }

    // 调用全局处理器（onMessage 注册的处理器接收所有消息）
    this.invokeGlobalHandlers(message);
  }

  /**
   * 调用全局处理器（onMessage 注册的处理器）
   */
  private invokeGlobalHandlers(message: A2AMessage): void {
    const snapshot = [...this.broadcastHandlers];
    for (const handler of snapshot) {
      try {
        handler(message);
      } catch {
        // 处理器抛出的异常不应影响其他处理器的执行
      }
    }
  }

  /**
   * 投递消息给指定 Agent
   */
  private deliverToOne(message: A2AMessage): void {
    const targetId = message.to as ID;
    const handlers = this.handlers.get(targetId);

    if (!handlers || handlers.length === 0) {
      // 目标 Agent 不注册任何处理器
      if (message.replyTo) {
        // 对于响应消息，仍然尝试解析等待中的请求
        this.resolvePendingRequest(message);
      } else {
        // 对于请求消息，拒绝等待中的请求
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.reject(
            new NotFoundError(`目标 Agent ${targetId} 不存在`, { targetId })
          );
          this.pendingRequests.delete(message.id);
        }
      }
      return;
    }

    this.invokeHandlers(handlers, message);
  }

  /**
   * 投递广播消息给所有 Agent（除了发送方）
   */
  private deliverToAll(message: A2AMessage): void {
    for (const [agentId, handlers] of this.handlers) {
      if (agentId === message.from) continue;
      this.invokeHandlers(handlers, message);
    }
  }

  /**
   * 调用处理器列表，触发 message_received 事件
   * 如果消息带有 replyTo 字段且存在等待中的请求，自动解析该请求
   */
  private invokeHandlers(handlers: MessageHandler[], message: A2AMessage): void {
    const timestamp = now();
    globalEventBus.emit(
      'a2a.message_received',
      message.id,
      message.from,
      String(message.to),
      timestamp
    );

    // 如果是响应消息，尝试解析等待中的请求
    if (message.replyTo) {
      this.resolvePendingRequest(message);
    }

    // 复制一份，避免在调用过程中处理器列表被修改
    const snapshot = [...handlers];
    for (const handler of snapshot) {
      try {
        handler(message);
      } catch {
        // 处理器抛出的异常不应影响其他处理器的执行
      }
    }
  }

  /**
   * 发送消息并等待响应
   * @param message 请求消息
   * @param timeout 超时时间（毫秒），默认 5000ms
   * @returns 响应消息
   */
  async sendAndWait(message: A2AMessage, timeout: number = 5000): Promise<A2AMessage> {
    if (this.closed) {
      throw new Error('通道已关闭，无法发送消息');
    }

    return new Promise<A2AMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error(`请求 ${message.id} 超时（${timeout}ms）`));
        }
      }, timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timer,
      });

      // 发送消息（异步），如果目标不存在则 reject 会被触发
      this.send(message).catch((error) => {
        clearTimeout(timer);
        this.pendingRequests.delete(message.id);
        reject(error);
      });
    });
  }

  /**
   * 处理收到的响应消息，解析对应的等待中的请求
   * 应在响应消息处理器中调用此方法
   */
  resolvePendingRequest(response: A2AMessage): boolean {
    const replyTo = response.replyTo;
    if (!replyTo) return false;

    const pending = this.pendingRequests.get(replyTo);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(replyTo);
    pending.resolve(response);
    return true;
  }

  /**
   * 检查是否有等待指定消息 ID 响应的请求
   */
  hasPendingRequest(messageId: ID): boolean {
    return this.pendingRequests.has(messageId);
  }

  /**
   * 获取当前等待中的请求数量
   */
  pendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 获取已注册的 Agent ID 列表
   */
  getRegisteredAgents(): ID[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 关闭通道，清理所有处理器和等待中的请求
   */
  async close(): Promise<void> {
    this.closed = true;

    // 拒绝所有等待中的请求
    for (const [, pending] of this.pendingRequests) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error('通道已关闭'));
    }
    this.pendingRequests.clear();

    // 清理所有处理器
    this.handlers.clear();
    this.broadcastHandlers.length = 0;
  }

  /**
   * 检查通道是否已关闭
   */
  isClosed(): boolean {
    return this.closed;
  }
}
