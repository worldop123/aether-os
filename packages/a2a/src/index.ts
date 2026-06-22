/**
 * @aether/a2a - Aether OS Agent 间通信模块
 *
 * 实现 Agent 间的发现、注册和消息通信，兼容 Google A2A 协议概念
 */

export { AgentRegistry, createAgentCard } from './registry.js';
export { LocalA2AChannel } from './channel.js';
export { A2AProtocol } from './protocol.js';
export type { MessageHandler } from './channel.js';
export type {
  AgentCapability,
  AgentCard,
  A2AMessage,
  A2AMessageType,
  IA2AChannel,
  IAgentRegistry,
} from './types.js';
