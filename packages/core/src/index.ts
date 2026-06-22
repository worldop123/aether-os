/**
 * @aether/core - Aether OS 核心模块
 *
 * 包含 Agent 生命周期管理、进程管理等核心功能
 */

export { AgentStatus, Agent, ProcessManager } from './agent';
export type {
  IAgent,
  IProcessManager,
  AgentConfig,
  AgentStatusChangedEvent,
  AgentErrorEvent,
} from './agent';
