import type { ID } from '@aether/shared';
import { generateId, now } from '@aether/shared';
import { NotFoundError } from '@aether/shared';
import type { AgentCard, A2AMessage } from './types.js';
import { AgentRegistry } from './registry.js';
import { LocalA2AChannel } from './channel.js';

/** 默认请求超时时间（毫秒） */
const DEFAULT_REQUEST_TIMEOUT = 5000;

/** 默认心跳间隔（毫秒） */
const DEFAULT_HEARTBEAT_INTERVAL = 30000;

/** 默认心跳超时（毫秒） */
const DEFAULT_HEARTBEAT_TIMEOUT = 90000;

/**
 * A2A 协议实现
 * 组合 AgentRegistry 和 LocalA2AChannel，提供高层 A2A 通信 API
 * 支持请求-响应、通知、广播、能力查询和自动心跳
 */
export class A2AProtocol {
  private registry: AgentRegistry;
  private channel: LocalA2AChannel;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;
  /** 当前协议实例所属的 Agent ID（用于心跳发送方） */
  private agentId?: ID;

  constructor(options?: {
    registry?: AgentRegistry;
    channel?: LocalA2AChannel;
    agentId?: ID;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
  }) {
    this.registry = options?.registry ?? new AgentRegistry();
    this.channel = options?.channel ?? new LocalA2AChannel();
    this.agentId = options?.agentId;
    this.heartbeatInterval = options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
    this.heartbeatTimeout = options?.heartbeatTimeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
  }

  /**
   * 获取关联的 Agent 注册表
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * 获取关联的消息通道
   */
  getChannel(): LocalA2AChannel {
    return this.channel;
  }

  /**
   * 注册 Agent 到注册表，并在通道中注册消息处理器
   * 如果未提供处理器，则注册一个空操作处理器，确保消息能被投递和事件能被触发
   */
  async registerAgent(card: AgentCard, handler?: (message: A2AMessage) => void): Promise<void> {
    await this.registry.register(card);
    this.channel.registerAgent(card.id, handler ?? (() => {}));
  }

  /**
   * 注销 Agent
   */
  async unregisterAgent(agentId: ID): Promise<void> {
    await this.registry.unregister(agentId);
    this.channel.unregisterAgent(agentId);
  }

  /**
   * 发送请求并等待响应
   * @param from 发送方 Agent ID
   * @param to 接收方 Agent ID
   * @param payload 请求载荷
   * @param timeout 超时时间（毫秒），默认 5000ms
   * @returns 响应消息
   */
  async request(
    from: ID,
    to: ID,
    payload: unknown,
    timeout: number = DEFAULT_REQUEST_TIMEOUT
  ): Promise<A2AMessage> {
    // 验证目标 Agent 是否存在
    const targetAgent = await this.registry.getAgent(to);
    if (!targetAgent) {
      throw new NotFoundError(`目标 Agent ${to} 不存在`, { targetId: to });
    }

    const message: A2AMessage = {
      id: generateId('a2a'),
      from,
      to,
      type: 'request',
      payload,
      timestamp: now(),
    };

    return this.channel.sendAndWait(message, timeout);
  }

  /**
   * 回复请求
   * @param originalMessage 原始请求消息
   * @param response 响应载荷
   */
  async respond(originalMessage: A2AMessage, response: unknown): Promise<void> {
    const replyMessage: A2AMessage = {
      id: generateId('a2a'),
      from: originalMessage.to as ID,
      to: originalMessage.from,
      type: 'response',
      payload: response,
      timestamp: now(),
      replyTo: originalMessage.id,
    };

    await this.channel.send(replyMessage);
  }

  /**
   * 发送通知（不等待响应）
   * @param from 发送方 Agent ID
   * @param to 接收方 Agent ID
   * @param payload 通知载荷
   */
  async notify(from: ID, to: ID, payload: unknown): Promise<void> {
    const message: A2AMessage = {
      id: generateId('a2a'),
      from,
      to,
      type: 'notification',
      payload,
      timestamp: now(),
    };

    await this.channel.send(message);
  }

  /**
   * 广播消息给所有已注册的 Agent
   * @param from 发送方 Agent ID
   * @param payload 广播载荷
   */
  async broadcast(from: ID, payload: unknown): Promise<void> {
    const message: A2AMessage = {
      id: generateId('a2a'),
      from,
      to: '*',
      type: 'broadcast',
      payload,
      timestamp: now(),
    };

    await this.channel.send(message);
  }

  /**
   * 查询可用 Agent
   * @param from 发送方 Agent ID
   * @param filter 过滤条件（按状态或能力）
   * @returns 匹配的 Agent 列表
   */
  async queryCapabilities(
    from: ID,
    filter?: Partial<Pick<AgentCard, 'status' | 'capabilities'>>
  ): Promise<AgentCard[]> {
    // 发送查询消息（通知所有 Agent，这里主要用于事件追踪）
    const queryMessage: A2AMessage = {
      id: generateId('a2a'),
      from,
      to: '*',
      type: 'query',
      payload: filter,
      timestamp: now(),
    };

    await this.channel.send(queryMessage);

    // 从注册表查询
    return this.registry.listAgents(filter);
  }

  /**
   * 根据能力名称发现 Agent
   */
  async discoverByCapability(capabilityName: string): Promise<AgentCard[]> {
    return this.registry.discoverByCapability(capabilityName);
  }

  /**
   * 发送心跳
   * @param agentId 发送心跳的 Agent ID
   */
  async sendHeartbeat(agentId: ID): Promise<void> {
    // 更新注册表中的 lastSeenAt
    await this.registry.heartbeat(agentId);

    // 广播心跳消息
    const heartbeatMessage: A2AMessage = {
      id: generateId('a2a'),
      from: agentId,
      to: '*',
      type: 'heartbeat',
      payload: { timestamp: now() },
      timestamp: now(),
    };

    await this.channel.send(heartbeatMessage);
  }

  /**
   * 启动自动心跳
   * @param agentId 发送心跳的 Agent ID
   */
  startHeartbeat(agentId: ID): void {
    if (this.heartbeatTimer) {
      return; // 已启动
    }
    this.agentId = agentId;

    // 立即发送一次心跳
    void this.sendHeartbeat(agentId);

    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat(agentId);
    }, this.heartbeatInterval);
  }

  /**
   * 停止自动心跳
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 清理超时 Agent
   * @param remove 是否直接移除（默认 false，仅标记为 offline）
   * @returns 被清理的 Agent ID 列表
   */
  async cleanupStaleAgents(remove: boolean = false): Promise<ID[]> {
    return this.registry.cleanupStaleAgents(this.heartbeatTimeout, remove);
  }

  /**
   * 检查心跳是否在运行
   */
  isHeartbeatRunning(): boolean {
    return this.heartbeatTimer !== null;
  }

  /**
   * 关闭协议实例，停止心跳并关闭通道
   */
  async close(): Promise<void> {
    this.stopHeartbeat();
    await this.channel.close();
  }
}
