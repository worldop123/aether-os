import type { ID, Timestamp, Metadata } from '@aether/shared';

/** Agent 能力描述 */
export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** Agent 注册信息（Agent Card，兼容 Google A2A 协议概念） */
export interface AgentCard {
  id: ID;
  name: string;
  description?: string;
  url?: string; // 远程 Agent 的 URL
  capabilities: AgentCapability[];
  skills?: string[]; // 技能列表
  metadata?: Metadata;
  status: 'online' | 'offline' | 'busy';
  lastSeenAt: Timestamp;
}

/** A2A 消息 */
export interface A2AMessage {
  id: ID;
  from: ID; // 发送方 Agent ID
  to: ID | '*'; // 接收方 Agent ID，'*' 表示广播
  type: A2AMessageType;
  payload: unknown;
  timestamp: Timestamp;
  replyTo?: ID; // 回复的消息 ID
  metadata?: Metadata;
}

export type A2AMessageType =
  | 'request' // 请求
  | 'response' // 响应
  | 'notification' // 通知（无需响应）
  | 'broadcast' // 广播
  | 'query' // 查询能力
  | 'heartbeat'; // 心跳

/** A2A 通信通道接口 */
export interface IA2AChannel {
  send(message: A2AMessage): Promise<void>;
  onMessage(handler: (message: A2AMessage) => void): void;
  close(): Promise<void>;
}

/** Agent 注册表接口 */
export interface IAgentRegistry {
  register(card: AgentCard): Promise<void>;
  unregister(agentId: ID): Promise<void>;
  getAgent(agentId: ID): Promise<AgentCard | null>;
  listAgents(filter?: Partial<Pick<AgentCard, 'status' | 'capabilities'>>): Promise<AgentCard[]>;
  discoverByCapability(capabilityName: string): Promise<AgentCard[]>;
  updateStatus(agentId: ID, status: AgentCard['status']): Promise<void>;
}
