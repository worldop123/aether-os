/**
 * @aether/shared - Aether OS 共享模块
 *
 * 包含所有包共享的类型定义、错误类、常量、事件总线和工具函数
 */

// 错误类
export {
  AetherError,
  AgentError,
  MemoryError,
  ModelRouterError,
  BudgetExceededError,
  McpError,
  SchedulerError,
  ConfigurationError,
  NotFoundError,
} from './errors';

// 常量
export { EVENTS, AGENT_STATUS, MESSAGE_ROLES, DEFAULTS, DB_TABLES } from './constants';

// 事件总线
export { EventBus, globalEventBus } from './event-bus';
export type { GlobalEvents } from './event-bus';

// 工具类型和函数
export { generateId, now, sleep, withTimeout, retry } from './utils';
export type {
  ID,
  Timestamp,
  Metadata,
  PaginationParams,
  PaginatedResult,
  SortParams,
  BaseConfig,
  AsyncResult,
} from './utils';
