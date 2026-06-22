# Aether OS API 文档

本目录包含 Aether OS 各模块的 API 文档。

## 模块索引

### @aether/shared
- [常量与类型](#常量与类型)
- [错误类](#错误类)
- [事件总线](#事件总线)
- [工具函数](#工具函数)

### @aether/core
- [Agent 类](#agent-类)
- [ProcessManager 类](#processmanager-类)

### @aether/memory
- [ShortTermMemory 类](#shorttermmemory-类)
- [LongTermMemory 类](#longtermmemory-类)
- [MemoryManager 类](#memorymanager-类)

### @aether/model-router
- [ModelRouter 类](#modelrouter-类)
- [MockModelProvider 类](#mockmodelprovider-类)
- [BudgetController 类](#budgetcontroller-类)

### @aether/mcp
- [McpManager 类](#mcpmanager-类)
- [McpServer 类](#mcpserver-类)
- [McpTool 类](#mcptool-类)

### @aether/scheduler
- [TaskScheduler 类](#taskscheduler-类)
- [ScheduledTask 类](#scheduledtask-类)

---

## @aether/shared

### 常量与类型

#### EVENTS
系统事件常量集合。

```typescript
import { EVENTS } from '@aether/shared';

// Agent 生命周期事件
EVENTS.AGENT_CREATED          // 'agent.created'
EVENTS.AGENT_STARTED          // 'agent.started'
EVENTS.AGENT_PAUSED           // 'agent.paused'
EVENTS.AGENT_RESUMED          // 'agent.resumed'
EVENTS.AGENT_STOPPED          // 'agent.stopped'
EVENTS.AGENT_ERROR            // 'agent.error'
EVENTS.AGENT_STATUS_CHANGED   // 'agent.status_changed'

// 记忆系统事件
EVENTS.MEMORY_ADDED           // 'memory.added'
EVENTS.MEMORY_DELETED         // 'memory.deleted'
EVENTS.MEMORY_CLEARED         // 'memory.cleared'

// 模型路由事件
EVENTS.MODEL_REQUEST          // 'model.request'
EVENTS.MODEL_RESPONSE         // 'model.response'
EVENTS.MODEL_ERROR            // 'model.error'

// MCP 工具事件
EVENTS.MCP_TOOL_CALLED        // 'mcp.tool_called'
EVENTS.MCP_TOOL_COMPLETED     // 'mcp.tool_completed'
EVENTS.MCP_TOOL_ERROR         // 'mcp.tool_error'

// 调度器事件
EVENTS.SCHEDULER_TASK_CREATED   // 'scheduler.task_created'
EVENTS.SCHEDULER_TASK_EXECUTED  // 'scheduler.task_executed'
EVENTS.SCHEDULER_TASK_FAILED    // 'scheduler.task_failed'
EVENTS.SCHEDULER_STARTED        // 'scheduler.started'
EVENTS.SCHEDULER_STOPPED        // 'scheduler.stopped'
```

#### AGENT_STATUS
Agent 状态枚举。

```typescript
enum AgentStatus {
  IDLE = 'idle',       // 空闲
  RUNNING = 'running', // 运行中
  PAUSED = 'paused',   // 已暂停
  STOPPED = 'stopped', // 已停止（终态）
  ERROR = 'error',     // 错误
}
```

#### MESSAGE_ROLES
消息角色枚举。

```typescript
enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}
```

#### DEFAULTS
默认配置常量。

```typescript
const DEFAULTS = {
  SHORT_TERM_MEMORY_LIMIT: 50,     // 短期记忆容量
  DAILY_TOKEN_BUDGET: 100000,      // 每日 token 预算
  BUDGET_WARNING_THRESHOLD: 0.8,   // 预算警告阈值（80%）
  VECTOR_SEARCH_TOP_K: 5,          // 向量检索返回数量
  SIMILARITY_THRESHOLD: 0.7,       // 相似度阈值
};
```

### 错误类

#### AetherError
基础错误类，所有自定义错误都继承自此类。

```typescript
class AetherError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, any>;

  constructor(message: string, code?: string, metadata?: Record<string, any>);

  toJSON(): {
    message: string;
    code: string;
    metadata?: Record<string, any>;
  };
}
```

**子类**:
- `AgentError` - Agent 相关错误
- `MemoryError` - 记忆系统错误
- `ModelRouterError` - 模型路由错误
- `McpError` - MCP 工具错误
- `SchedulerError` - 调度器错误
- `BudgetExceededError` - 预算超限错误
- `ConfigurationError` - 配置错误
- `NotFoundError` - 资源未找到错误

### 事件总线

#### EventBus
类型安全的泛型事件总线，基于 Node.js EventEmitter。

```typescript
class EventBus<TEvents extends Record<string, any[]>> {
  on<E extends keyof TEvents>(event: E, listener: (...args: TEvents[E]) => void): this;
  once<E extends keyof TEvents>(event: E, listener: (...args: TEvents[E]) => void): this;
  off<E extends keyof TEvents>(event: E, listener: (...args: TEvents[E]) => void): this;
  emit<E extends keyof TEvents>(event: E, ...args: TEvents[E]): boolean;
  removeAllListeners<E extends keyof TEvents>(event?: E): this;
  listenerCount(event: keyof TEvents): number;
  eventNames(): Array<keyof TEvents>;
  destroy(): void;
}
```

#### globalEventBus
全局事件总线单例。

```typescript
import { globalEventBus } from '@aether/shared';

// 监听事件
globalEventBus.on('agent.status_changed', (agentId, oldStatus, newStatus) => {
  console.log(`Agent ${agentId}: ${oldStatus} → ${newStatus}`);
});

// 触发事件
globalEventBus.emit('agent.status_changed', 'agent-123', 'idle', 'running');
```

### 工具函数

#### generateId()
生成唯一 ID。

```typescript
function generateId(prefix?: string): string;
// 示例: 'mem_abc123def456'
```

#### now()
获取当前时间戳（毫秒）。

```typescript
function now(): number;
```

#### sleep()
Promise 化的延迟函数。

```typescript
function sleep(ms: number): Promise<void>;
```

#### withTimeout()
带超时的 Promise 包装。

```typescript
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T>;
```

#### retry()
异步重试函数（指数退避）。

```typescript
function retry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;      // 重试次数，默认 3
    delay?: number;        // 初始延迟（毫秒），默认 1000
    factor?: number;       // 退避因子，默认 2
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T>;
```

---

## @aether/core

### Agent 类

单个 Agent 的生命周期管理。

```typescript
class Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: AgentStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly config: AgentConfig;
  readonly metadata: Record<string, any>;

  constructor(name: string, config?: AgentConfig);

  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: string): Promise<string>;
  getStatus(): AgentStatus;
}
```

**AgentConfig 接口**:
```typescript
interface AgentConfig {
  defaultModel?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  memoryEnabled?: boolean;
  toolsEnabled?: boolean;
}
```

**状态流转**:
- IDLE → RUNNING (start)
- RUNNING → PAUSED (pause)
- PAUSED → RUNNING (resume)
- RUNNING → STOPPED (stop)
- PAUSED → STOPPED (stop)
- STOPPED 是终态，不能重新启动

### ProcessManager 类

多 Agent 管理器。

```typescript
class ProcessManager {
  constructor();

  createAgent(name: string, config?: AgentConfig): Promise<Agent>;
  startAgent(agentId: string): Promise<Agent>;
  pauseAgent(agentId: string): Promise<Agent>;
  resumeAgent(agentId: string): Promise<Agent>;
  stopAgent(agentId: string): Promise<Agent>;
  removeAgent(agentId: string): Promise<boolean>;

  getAgent(agentId: string): Agent | undefined;
  listAgents(): Agent[];
  getAgentStatus(agentId: string): AgentStatus | undefined;
  hasAgent(agentId: string): boolean;
}
```

---

## @aether/memory

### ShortTermMemory 类

短期记忆（基于数组的 FIFO 队列）。

```typescript
class ShortTermMemory {
  constructor(maxMessages?: number);

  getContext(): MemoryMessage[];
  addMessage(message: Omit<MemoryMessage, 'id' | 'timestamp'>): MemoryMessage;
  clear(): void;
  getTokenCount(): number;
  getMessageCount(): number;
  setMaxMessages(max: number): void;
  getMaxMessages(): number;
}
```

**MemoryMessage 接口**:
```typescript
interface MemoryMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

### LongTermMemory 类

长期记忆（MVP 版本：内存存储 + 关键词匹配）。

```typescript
class LongTermMemory {
  constructor();

  store(
    agentId: string,
    content: string,
    options?: {
      type?: string;
      importance?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<LongTermMemoryItem>;

  search(
    agentId: string,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      type?: string;
    }
  ): Promise<VectorSearchResult[]>;

  get(memoryId: string): Promise<LongTermMemoryItem | undefined>;
  delete(memoryId: string): Promise<boolean>;
  list(
    agentId: string,
    options?: {
      page?: number;
      pageSize?: number;
      sortBy?: 'createdAt' | 'importance';
      sortOrder?: 'asc' | 'desc';
      type?: string;
    }
  ): Promise<PaginatedResult<LongTermMemoryItem>>;

  updateImportance(memoryId: string, importance: number): Promise<boolean>;
  clear(agentId: string): Promise<void>;
}
```

**LongTermMemoryItem 接口**:
```typescript
interface LongTermMemoryItem {
  id: string;
  agentId: string;
  content: string;
  type: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}
```

**VectorSearchResult 接口**:
```typescript
interface VectorSearchResult {
  item: LongTermMemoryItem;
  similarity: number;
}
```

### MemoryManager 类

记忆管理器，统一管理短期和长期记忆。

```typescript
class MemoryManager {
  readonly shortTerm: ShortTermMemory;
  readonly longTerm: LongTermMemory;

  constructor(agentId: string, options?: {
    maxShortTermMessages?: number;
  });

  getFullContext(query?: string): Promise<MemoryMessage[]>;
  consolidateToLongTerm(
    agentId: string,
    options?: {
      minImportance?: number;
    }
  ): Promise<void>;
}
```

---

## @aether/model-router

### ModelRouter 类

模型路由器，支持多提供商和多种路由策略。

```typescript
class ModelRouter {
  constructor(defaultStrategy?: RoutingStrategy);

  registerProvider(provider: IModelProvider): void;
  unregisterProvider(providerName: string): boolean;
  listProviders(): string[];
  listAllModels(): ModelInfo[];
  getBestModel(strategy?: RoutingStrategy): ModelInfo | null;
  getProviderForModel(modelId: string): IModelProvider | null;

  route(
    request: ChatCompletionRequest,
    options?: {
      strategy?: RoutingStrategy;
      model?: string;
    }
  ): Promise<ChatCompletionResponse>;

  routeEmbedding(
    request: EmbeddingRequest,
    options?: {
      model?: string;
    }
  ): Promise<EmbeddingResponse>;
}
```

**RoutingStrategy 类型**:
```typescript
type RoutingStrategy = 'cheapest' | 'fastest' | 'best-quality' | 'balanced' | 'manual';
```

### MockModelProvider 类

模拟模型提供商，用于测试和开发。

```typescript
class MockModelProvider implements IModelProvider {
  readonly name: string;

  constructor();

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  getModelInfo(modelId: string): ModelInfo | null;
  listModels(): ModelInfo[];
  isAvailable(modelId: string): boolean;
}
```

**提供的模型**:
- `mock-small`: 4k 上下文窗口，不支持工具调用
- `mock-large`: 8k 上下文窗口，支持工具调用

### BudgetController 类

Token 预算控制器。

```typescript
class BudgetController {
  constructor(dailyBudget?: number);

  trackUsage(usage: TokenUsage): Promise<void>;
  getDailyUsage(agentId?: string): Promise<TokenUsage>;
  getDailyBudget(agentId?: string): number;
  setDailyBudget(budget: number, agentId?: string): void;
  getBudgetPercentage(agentId?: string): Promise<number>;
  resetDaily(agentId?: string): Promise<void>;
  checkBudget(estimatedTokens: number, agentId?: string): Promise<boolean>;
}
```

**TokenUsage 接口**:
```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: number;
  model: string;
  agentId?: string;
}
```

---

## @aether/mcp

### McpManager 类

MCP 管理器，管理多个 MCP 服务器。

```typescript
class McpManager {
  constructor();

  loadServer(name: string, config?: McpServerConfig): Promise<IMcpServer>;
  unloadServer(name: string): Promise<boolean>;
  getServer(name: string): IMcpServer | undefined;
  listServers(): IMcpServer[];

  listAllTools(): Promise<IMcpTool[]>;
  executeTool(toolName: string, args: Record<string, any>): Promise<McpToolResult>;
  findTool(toolName: string): IMcpTool | null;

  connectAll(): Promise<void>;
  disconnectAll(): Promise<void>;
  reloadServer(name: string): Promise<IMcpServer>;
}
```

**内置工具服务器 (builtin)**:
- `get_current_time`: 获取当前时间
- `calculate`: 执行数学计算
- `echo`: 回显消息

### McpServer 类

MCP 服务器，管理一组工具。

```typescript
class McpServer implements IMcpServer {
  readonly name: string;
  readonly config: McpServerConfig;
  readonly status: McpServerStatus;

  constructor(name: string, config?: McpServerConfig);

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<IMcpTool[]>;
  callTool(toolName: string, args: Record<string, any>): Promise<McpToolResult>;
  isConnected(): boolean;
  getServerInfo(): { name: string; status: McpServerStatus; toolCount: number };

  registerTool(tool: IMcpTool): void;
}
```

**McpServerStatus 枚举**:
```typescript
enum McpServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}
```

### McpTool 类

MCP 工具定义。

```typescript
class McpTool implements IMcpTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: McpToolParameter[];
  readonly serverName: string;
  readonly inputSchema: Record<string, any>;

  constructor(options: {
    name: string;
    description: string;
    parameters?: McpToolParameter[];
    serverName?: string;
    handler?: (args: Record<string, any>) => Promise<any>;
  });

  execute(args: Record<string, any>): Promise<McpToolResult>;
}
```

**McpToolParameter 接口**:
```typescript
interface McpToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
}
```

**McpToolResult 接口**:
```typescript
interface McpToolResult {
  success: boolean;
  data?: any;
  content?: string;
  error?: string;
}
```

---

## @aether/scheduler

### TaskScheduler 类

任务调度器。

```typescript
class TaskScheduler {
  constructor();

  schedule(options: CreateScheduledTaskOptions): Promise<IScheduledTask>;
  cancel(taskId: string): Promise<boolean>;
  executeNow(taskId: string): Promise<TaskExecutionResult>;
  getTask(taskId: string): Promise<IScheduledTask | undefined>;

  listTasks(options?: {
    agentId?: string;
    status?: TaskStatus;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: 'createdAt' | 'nextRunAt' | 'runCount';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<IScheduledTask>>;

  enableTask(taskId: string): Promise<IScheduledTask>;
  disableTask(taskId: string): Promise<IScheduledTask>;
  updateTask(taskId: string, updates: Partial<CreateScheduledTaskOptions>): Promise<IScheduledTask>;

  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  registerTaskHandler(taskType: string, handler: TaskHandler): void;
  getExecutionHistory(taskId: string): TaskExecutionRecord[];
}
```

**TaskStatus 枚举**:
```typescript
enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
```

**TaskType 类型**:
```typescript
type TaskType = 'agent_message' | 'agent_start' | 'agent_stop' | 'memory_consolidate' | 'budget_reset' | 'custom';
```

### ScheduledTask 类

定时任务定义。

```typescript
class ScheduledTask implements IScheduledTask {
  readonly id: string;
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly taskType: TaskType;
  readonly cron: string;
  readonly payload: Record<string, any>;
  readonly enabled: boolean;
  readonly status: TaskStatus;
  readonly createdAt: number;
  readonly lastRunAt: number | null;
  readonly nextRunAt: number | null;
  readonly runCount: number;
  readonly maxRuns: number | null;
  readonly metadata: Record<string, any>;

  setEnabled(enabled: boolean): void;
  setStatus(status: TaskStatus): void;
  recordExecution(success: boolean, error?: string): void;
  setNextRunAt(timestamp: number): void;
  update(updates: Partial<CreateScheduledTaskOptions>): void;
}
```

---

## 类型定义

### 通用类型

```typescript
type ID = string;
type Timestamp = number;
type Metadata = Record<string, any>;

interface PaginationParams {
  page?: number;
  pageSize?: number;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface BaseConfig {
  [key: string]: any;
}

type AsyncResult<T> = Promise<T>;
```

---

## 事件类型

### GlobalEvents
全局事件类型定义。

```typescript
interface GlobalEvents {
  // Agent 事件
  'agent.created': [agentId: string, agent: IAgent];
  'agent.started': [agentId: string, timestamp: number];
  'agent.paused': [agentId: string, timestamp: number];
  'agent.resumed': [agentId: string, timestamp: number];
  'agent.stopped': [agentId: string, timestamp: number];
  'agent.error': [agentId: string, error: Error];
  'agent.status_changed': [agentId: string, oldStatus: string, newStatus: string];

  // 记忆事件
  'memory.added': [memoryId: string, agentId: string, timestamp: number];
  'memory.deleted': [memoryId: string, agentId: string, timestamp: number];
  'memory.cleared': [agentId: string, timestamp: number];

  // 模型路由事件
  'model.request': [requestId: string, model: string, request: ChatCompletionRequest];
  'model.response': [requestId: string, model: string, response: ChatCompletionResponse];
  'model.error': [requestId: string, model: string, error: Error];

  // MCP 事件
  'mcp.tool_called': [toolName: string, args: Record<string, any>, timestamp: number];
  'mcp.tool_completed': [toolName: string, result: McpToolResult, duration: number];
  'mcp.tool_error': [toolName: string, error: Error];

  // 调度器事件
  'scheduler.task_created': [taskId: string, task: IScheduledTask];
  'scheduler.task_executed': [taskId: string, result: TaskExecutionResult];
  'scheduler.task_failed': [taskId: string, error: Error];
  'scheduler.started': [];
  'scheduler.stopped': [];
}
```
