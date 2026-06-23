/**
 * @aether/core - Aether OS 核心模块
 *
 * 包含 Agent 生命周期管理、进程管理、Agent 运行时等核心功能
 */

export { AgentStatus, Agent, ProcessManager } from './agent.js';
export type {
  IAgent,
  IProcessManager,
  AgentConfig,
  AgentStatusChangedEvent,
  AgentErrorEvent,
} from './agent.js';
export { AgentRuntime, AgentRuntimeManager } from './agent-runtime.js';
export type { AgentRuntimeConfig, ToolExecutionEvent } from './agent-runtime.js';
