import type { ID, Timestamp } from '@aether/shared';
import { now, globalEventBus } from '@aether/shared';
import { NotFoundError } from '@aether/shared';
import type { AgentCard, IAgentRegistry } from './types.js';

/**
 * Agent 注册表实现
 * 使用内存 Map 存储 AgentCard，支持注册、注销、查询和能力发现
 * 通过 globalEventBus 触发 a2a.agent_registered / a2a.agent_unregistered 事件
 */
export class AgentRegistry implements IAgentRegistry {
  private agents: Map<ID, AgentCard> = new Map();

  /**
   * 注册 Agent
   * 如果已存在同 ID 的 Agent，则更新其信息
   */
  async register(card: AgentCard): Promise<void> {
    const normalized: AgentCard = {
      ...card,
      lastSeenAt: card.lastSeenAt ?? now(),
    };
    this.agents.set(card.id, normalized);
    globalEventBus.emit('a2a.agent_registered', card.id, normalized.lastSeenAt);
  }

  /**
   * 注销 Agent
   */
  async unregister(agentId: ID): Promise<void> {
    const existed = this.agents.delete(agentId);
    if (existed) {
      globalEventBus.emit('a2a.agent_unregistered', agentId, now());
    }
  }

  /**
   * 获取指定 Agent 的信息
   */
  async getAgent(agentId: ID): Promise<AgentCard | null> {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * 列出所有 Agent，支持按 status 或 capabilities 过滤
   */
  async listAgents(
    filter?: Partial<Pick<AgentCard, 'status' | 'capabilities'>>
  ): Promise<AgentCard[]> {
    let items = Array.from(this.agents.values());

    if (filter?.status) {
      items = items.filter((agent) => agent.status === filter.status);
    }

    if (filter?.capabilities && filter.capabilities.length > 0) {
      const requiredNames = filter.capabilities.map((c) => c.name);
      items = items.filter((agent) =>
        requiredNames.every((name) => agent.capabilities.some((c) => c.name === name))
      );
    }

    return items;
  }

  /**
   * 根据能力名称发现 Agent
   */
  async discoverByCapability(capabilityName: string): Promise<AgentCard[]> {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.capabilities.some((c) => c.name === capabilityName)
    );
  }

  /**
   * 更新 Agent 状态
   */
  async updateStatus(agentId: ID, status: AgentCard['status']): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new NotFoundError(`Agent ${agentId} 不存在`, { agentId });
    }
    agent.status = status;
    agent.lastSeenAt = now();
  }

  /**
   * 更新 Agent 的最后心跳时间
   * 用于心跳检测，标记 Agent 仍然在线
   */
  async heartbeat(agentId: ID): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new NotFoundError(`Agent ${agentId} 不存在`, { agentId });
    }
    agent.lastSeenAt = now();
  }

  /**
   * 清理超时 Agent
   * 将超过指定时间未发送心跳的 Agent 标记为 offline，或直接移除
   * @param timeoutMs 超时时间（毫秒）
   * @param remove 是否直接移除（默认 false，仅标记为 offline）
   * @returns 被清理的 Agent ID 列表
   */
  async cleanupStaleAgents(timeoutMs: number, remove = false): Promise<ID[]> {
    const currentTime = now();
    const staleAgentIds: ID[] = [];

    for (const [agentId, agent] of this.agents) {
      if (currentTime - agent.lastSeenAt > timeoutMs) {
        staleAgentIds.push(agentId);
        if (remove) {
          this.agents.delete(agentId);
          globalEventBus.emit('a2a.agent_unregistered', agentId, currentTime);
        } else {
          agent.status = 'offline';
        }
      }
    }

    return staleAgentIds;
  }

  /**
   * 获取当前注册的 Agent 数量
   */
  size(): number {
    return this.agents.size;
  }

  /**
   * 清空所有注册的 Agent
   */
  async clear(): Promise<void> {
    const currentTime = now();
    const agentIds = Array.from(this.agents.keys());
    this.agents.clear();
    for (const agentId of agentIds) {
      globalEventBus.emit('a2a.agent_unregistered', agentId, currentTime);
    }
  }
}

/**
 * 创建一个 AgentCard 的便捷工厂函数
 */
export function createAgentCard(options: {
  id: ID;
  name: string;
  description?: string;
  url?: string;
  capabilities?: AgentCard['capabilities'];
  skills?: string[];
  metadata?: AgentCard['metadata'];
  status?: AgentCard['status'];
  lastSeenAt?: Timestamp;
}): AgentCard {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    url: options.url,
    capabilities: options.capabilities ?? [],
    skills: options.skills,
    metadata: options.metadata,
    status: options.status ?? 'online',
    lastSeenAt: options.lastSeenAt ?? now(),
  };
}
