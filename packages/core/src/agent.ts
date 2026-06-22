import type { ID, Timestamp, Metadata } from '@aether/shared';
import { generateId, now, globalEventBus } from '@aether/shared';
import { AgentError } from '@aether/shared';

/**
 * Agent 状态枚举
 */
export enum AgentStatus {
  /** 空闲状态，等待任务 */
  IDLE = 'idle',
  /** 运行中 */
  RUNNING = 'running',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 已停止 */
  STOPPED = 'stopped',
  /** 错误状态 */
  ERROR = 'error',
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 默认模型 */
  defaultModel?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 是否启用记忆 */
  memoryEnabled?: boolean;
  /** 是否启用工具 */
  toolsEnabled?: boolean;
  /** 其他自定义配置 */
  [key: string]: unknown;
}

/**
 * Agent 类
 * 实现 Agent 生命周期管理和消息处理
 */
export class Agent implements IAgent {
  readonly id: ID;
  readonly name: string;
  readonly description?: string;
  private _status: AgentStatus;
  readonly createdAt: Timestamp;
  private _updatedAt: Timestamp;
  readonly config: AgentConfig;
  readonly metadata: Metadata;

  constructor(
    name: string,
    config: AgentConfig = {},
    metadata: Metadata = {}
  ) {
    this.id = generateId('agent');
    this.name = name;
    this.description = config.description as string | undefined;
    this._status = AgentStatus.IDLE;
    this.createdAt = now();
    this._updatedAt = this.createdAt;
    this.config = {
      memoryEnabled: true,
      toolsEnabled: true,
      ...config,
    };
    this.metadata = metadata;
  }

  /** 当前状态 */
  get status(): AgentStatus {
    return this._status;
  }

  /** 最后更新时间 */
  get updatedAt(): Timestamp {
    return this._updatedAt;
  }

  /**
   * 更新状态并触发事件
   */
  private setStatus(newStatus: AgentStatus): void {
    const oldStatus = this._status;
    if (oldStatus === newStatus) return;

    this._status = newStatus;
    this._updatedAt = now();

    // 触发状态变化事件
    globalEventBus.emit('agent.status_changed', this.id, oldStatus, newStatus, this._updatedAt);
  }

  /**
   * 启动 Agent
   */
  async start(): Promise<void> {
    if (this._status === AgentStatus.RUNNING) {
      return;
    }

    if (this._status === AgentStatus.STOPPED) {
      throw new AgentError(`Agent ${this.name} 已停止，无法重新启动`, 'AGENT_STOPPED');
    }

    this.setStatus(AgentStatus.RUNNING);
    globalEventBus.emit('agent.started', this.id, now());
  }

  /**
   * 暂停 Agent
   */
  async pause(): Promise<void> {
    if (this._status !== AgentStatus.RUNNING) {
      throw new AgentError(
        `只能暂停运行中的 Agent，当前状态: ${this._status}`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.setStatus(AgentStatus.PAUSED);
    globalEventBus.emit('agent.paused', this.id, now());
  }

  /**
   * 恢复 Agent
   */
  async resume(): Promise<void> {
    if (this._status !== AgentStatus.PAUSED) {
      throw new AgentError(
        `只能恢复已暂停的 Agent，当前状态: ${this._status}`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.setStatus(AgentStatus.RUNNING);
    globalEventBus.emit('agent.resumed', this.id, now());
  }

  /**
   * 停止 Agent
   */
  async stop(): Promise<void> {
    if (this._status === AgentStatus.STOPPED) {
      return;
    }

    this.setStatus(AgentStatus.STOPPED);
    globalEventBus.emit('agent.stopped', this.id, now());
  }

  /**
   * 发送消息给 Agent
   * MVP 版本：简单的 echo 实现
   */
  async sendMessage(message: string): Promise<string> {
    if (this._status !== AgentStatus.RUNNING) {
      throw new AgentError(
        `只能向运行中的 Agent 发送消息，当前状态: ${this._status}`,
        'AGENT_NOT_RUNNING'
      );
    }

    try {
      // MVP: 简单的 echo 响应
      const response = `Echo: ${message}`;
      return response;
    } catch (error) {
      this.setStatus(AgentStatus.ERROR);
      globalEventBus.emit('agent.error', this.id, error as Error, now());
      throw error;
    }
  }

  /**
   * 获取 Agent 状态
   */
  getStatus(): AgentStatus {
    return this._status;
  }
}

/**
 * Agent 接口定义
 */
export interface IAgent {
  /** Agent 唯一标识 */
  readonly id: ID;
  /** Agent 名称 */
  readonly name: string;
  /** Agent 描述 */
  readonly description?: string;
  /** 当前状态 */
  readonly status: AgentStatus;
  /** 创建时间 */
  readonly createdAt: Timestamp;
  /** 最后更新时间 */
  readonly updatedAt: Timestamp;
  /** Agent 配置 */
  readonly config: AgentConfig;
  /** 元数据 */
  readonly metadata: Metadata;

  /**
   * 启动 Agent
   */
  start(): Promise<void>;

  /**
   * 暂停 Agent
   */
  pause(): Promise<void>;

  /**
   * 恢复 Agent
   */
  resume(): Promise<void>;

  /**
   * 停止 Agent
   */
  stop(): Promise<void>;

  /**
   * 发送消息给 Agent
   * @param message 消息内容
   */
  sendMessage(message: string): Promise<string>;

  /**
   * 获取 Agent 状态
   */
  getStatus(): AgentStatus;
}

/**
 * 进程管理器类
 * 负责管理所有 Agent 实例的生命周期
 */
export class ProcessManager implements IProcessManager {
  private agents: Map<ID, Agent> = new Map();

  /**
   * 创建并启动一个新的 Agent
   */
  async createAgent(
    name: string,
    config?: AgentConfig,
    metadata?: Metadata
  ): Promise<IAgent> {
    const agent = new Agent(name, config, metadata);
    this.agents.set(agent.id, agent);

    // 自动启动 Agent
    await agent.start();

    return agent;
  }

  /**
   * 启动指定 Agent
   */
  async startAgent(agentId: ID): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }
    await agent.start();
  }

  /**
   * 暂停指定 Agent
   */
  async pauseAgent(agentId: ID): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }
    await agent.pause();
  }

  /**
   * 恢复指定 Agent
   */
  async resumeAgent(agentId: ID): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }
    await agent.resume();
  }

  /**
   * 停止指定 Agent
   */
  async stopAgent(agentId: ID): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }
    await agent.stop();
  }

  /**
   * 删除指定 Agent
   */
  async removeAgent(agentId: ID): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }

    // 先停止 Agent
    if (agent.status !== AgentStatus.STOPPED) {
      await agent.stop();
    }

    this.agents.delete(agentId);
  }

  /**
   * 获取指定 Agent
   */
  getAgent(agentId: ID): IAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 列出所有 Agent
   * @param status 可选，按状态过滤
   */
  listAgents(status?: AgentStatus): IAgent[] {
    const agents = Array.from(this.agents.values());
    if (status) {
      return agents.filter((agent) => agent.status === status);
    }
    return agents;
  }

  /**
   * 获取 Agent 状态
   */
  getAgentStatus(agentId: ID): AgentStatus {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }
    return agent.status;
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(agentId: ID): boolean {
    return this.agents.has(agentId);
  }
}

/**
 * 进程管理器接口
 * 负责管理所有 Agent 实例的生命周期
 */
export interface IProcessManager {
  /**
   * 创建并启动一个新的 Agent
   * @param name Agent 名称
   * @param config Agent 配置
   * @param metadata 元数据
   */
  createAgent(name: string, config?: AgentConfig, metadata?: Metadata): Promise<IAgent>;

  /**
   * 启动指定 Agent
   * @param agentId Agent ID
   */
  startAgent(agentId: ID): Promise<void>;

  /**
   * 暂停指定 Agent
   * @param agentId Agent ID
   */
  pauseAgent(agentId: ID): Promise<void>;

  /**
   * 恢复指定 Agent
   * @param agentId Agent ID
   */
  resumeAgent(agentId: ID): Promise<void>;

  /**
   * 停止指定 Agent
   * @param agentId Agent ID
   */
  stopAgent(agentId: ID): Promise<void>;

  /**
   * 删除指定 Agent
   * @param agentId Agent ID
   */
  removeAgent(agentId: ID): Promise<void>;

  /**
   * 获取指定 Agent
   * @param agentId Agent ID
   */
  getAgent(agentId: ID): IAgent | undefined;

  /**
   * 列出所有 Agent
   * @param status 可选，按状态过滤
   */
  listAgents(status?: AgentStatus): IAgent[];

  /**
   * 获取 Agent 状态
   * @param agentId Agent ID
   */
  getAgentStatus(agentId: ID): AgentStatus;

  /**
   * 检查 Agent 是否存在
   * @param agentId Agent ID
   */
  hasAgent(agentId: ID): boolean;
}

/**
 * Agent 状态变化事件数据
 */
export interface AgentStatusChangedEvent {
  /** Agent ID */
  agentId: ID;
  /** 旧状态 */
  oldStatus: AgentStatus;
  /** 新状态 */
  newStatus: AgentStatus;
  /** 时间戳 */
  timestamp: Timestamp;
}

/**
 * Agent 错误事件数据
 */
export interface AgentErrorEvent {
  /** Agent ID */
  agentId: ID;
  /** 错误信息 */
  error: Error;
  /** 时间戳 */
  timestamp: Timestamp;
}
