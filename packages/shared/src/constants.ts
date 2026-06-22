/**
 * Aether OS 系统常量
 */

/** 事件名称常量 */
export const EVENTS = Object.freeze({
  // Agent 生命周期事件
  AGENT_STARTED: 'agent.started',
  AGENT_PAUSED: 'agent.paused',
  AGENT_RESUMED: 'agent.resumed',
  AGENT_STOPPED: 'agent.stopped',
  AGENT_ERROR: 'agent.error',
  AGENT_STATUS_CHANGED: 'agent.status_changed',
  // 记忆系统事件
  MEMORY_ADDED: 'memory.added',
  MEMORY_DELETED: 'memory.deleted',
  MEMORY_CLEARED: 'memory.cleared',
  // 模型路由事件
  MODEL_REQUEST: 'model.request',
  MODEL_RESPONSE: 'model.response',
  MODEL_ERROR: 'model.error',
  BUDGET_WARNING: 'budget.warning',
  BUDGET_EXCEEDED: 'budget.exceeded',
  // MCP 工具事件
  MCP_TOOL_CALLED: 'mcp.tool_called',
  MCP_TOOL_RESULT: 'mcp.tool_result',
  MCP_TOOL_ERROR: 'mcp.tool_error',
  MCP_SERVER_CONNECTED: 'mcp.server_connected',
  MCP_SERVER_DISCONNECTED: 'mcp.server_disconnected',
  // 调度器事件
  SCHEDULER_TASK_CREATED: 'scheduler.task_created',
  SCHEDULER_TASK_CANCELLED: 'scheduler.task_cancelled',
  SCHEDULER_TASK_EXECUTED: 'scheduler.task_executed',
  SCHEDULER_TASK_ERROR: 'scheduler.task_error',
  // A2A 通信事件
  A2A_AGENT_REGISTERED: 'a2a.agent_registered',
  A2A_AGENT_UNREGISTERED: 'a2a.agent_unregistered',
  A2A_MESSAGE_SENT: 'a2a.message_sent',
  A2A_MESSAGE_RECEIVED: 'a2a.message_received',
  // 沙箱事件
  SANDBOX_PERMISSION_CHECKED: 'sandbox.permission_checked',
  SANDBOX_AUDIT_LOGGED: 'sandbox.audit_logged',
  SANDBOX_SKILL_EXECUTED: 'sandbox.skill_executed',
  SANDBOX_SKILL_BLOCKED: 'sandbox.skill_blocked',
  // 工作流事件
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_NODE_STARTED: 'workflow.node_started',
  WORKFLOW_NODE_COMPLETED: 'workflow.node_completed',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_ERROR: 'workflow.error',
} as const);

/** Agent 状态枚举 */
export const AGENT_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
} as const);

/** 消息角色 */
export const MESSAGE_ROLES = Object.freeze({
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
} as const);

/** 默认配置 */
export const DEFAULTS = Object.freeze({
  /** 默认短期记忆最大消息数 */
  SHORT_TERM_MEMORY_LIMIT: 50,
  /** 默认 token 预算（每日） */
  DAILY_TOKEN_BUDGET: 100000,
  /** 默认预算警告阈值（百分比） */
  BUDGET_WARNING_THRESHOLD: 0.8,
  /** 默认向量检索 topK */
  VECTOR_SEARCH_TOP_K: 5,
  /** 默认向量相似度阈值 */
  VECTOR_SIMILARITY_THRESHOLD: 0.7,
} as const);

/** 数据库表名 */
export const DB_TABLES = Object.freeze({
  AGENTS: 'agents',
  MEMORIES: 'memories',
  TASKS: 'tasks',
  TOKEN_USAGE: 'token_usage',
  MCP_SERVERS: 'mcp_servers',
} as const);
