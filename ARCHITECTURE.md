# Aether OS 架构文档

本文档描述 Aether OS 的整体架构、模块设计和数据流。

## 架构概览

Aether OS 采用**事件驱动的分层架构**，所有模块通过 `globalEventBus` 通信，模块间松耦合。

```
┌─────────────────────────────────────────────────────────────┐
│                        用户接口层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │   CLI    │  │  Web UI  │  │ Examples │                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
├───────┼──────────────┼──────────────┼──────────────────────┤
│       │   高级功能层  │              │                       │
│  ┌────▼────┐  ┌──────▼──────┐  ┌───▼────┐  ┌─────────┐    │
│  │   A2A   │  │  Workflow   │  │Sandbox │  │Scheduler│    │
│  └────┬────┘  └──────┬──────┘  └───┬────┘  └────┬────┘    │
├───────┼──────────────┼──────────────┼────────────┼─────────┤
│       │     核心服务层 │              │            │         │
│  ┌────▼──────────────▼──────────────▼────────────▼──────┐  │
│  │                      Core                            │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  │  │
│  │  │ Agent  │  │ Memory │  │  MCP   │  │ModelRouter│  │  │
│  │  └────────┘  └────────┘  └────────┘  └──────────┘  │  │
│  └──────────────────────┬───────────────────────────────┘  │
├─────────────────────────┼───────────────────────────────────┤
│                   基础设施层                                 │
│                  ┌────────▼─────┐                           │
│                  │   Shared     │                           │
│                  │ EventBus     │                           │
│                  │ Errors       │                           │
│                  │ Constants    │                           │
│                  │ Utils        │                           │
│                  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

## 分层说明

### 1. 基础设施层（Shared）

`@aether/shared` 是所有包的基础依赖，提供：

- **EventBus** - 全局事件总线，模块间通信的核心
- **错误类** - 统一的错误体系（AetherError 基类 + 8 个子类）
- **常量** - 事件名、状态、默认值、数据库表结构定义
- **工具函数** - generateId、now、sleep、withTimeout、retry

### 2. 核心服务层（Core）

提供 Agent 运行时的核心能力：

- **Agent** - Agent 实体，管理状态机（IDLE → RUNNING → PAUSED → STOPPED）
- **ProcessManager** - 管理多个 Agent 的进程隔离
- **MemoryManager** - 短期记忆 + 长期记忆管理
- **McpManager** - MCP 工具系统
- **ModelRouter** - 模型路由和预算控制

### 3. 高级功能层

- **A2A** - Agent 间通信协议
- **Workflow** - DAG 工作流编排
- **Sandbox** - 安全沙箱执行
- **Scheduler** - 定时任务调度

### 4. 用户接口层

- **CLI** - 命令行工具
- **Web UI** - Web 管理界面
- **Examples** - 示例代码

## 事件驱动架构

### 事件总线

所有模块通过 `globalEventBus`（EventBus 单例）通信：

```typescript
import { globalEventBus, EVENTS } from '@aether/shared';

// 监听事件
globalEventBus.on(EVENTS.AGENT_STATUS_CHANGED, (event) => {
  console.log(`Agent ${event.agentId} 状态变更: ${event.from} -> ${event.to}`);
});

// 触发事件
globalEventBus.emit(EVENTS.AGENT_STATUS_CHANGED, {
  agentId: 'agent-1',
  from: 'IDLE',
  to: 'RUNNING',
  timestamp: Date.now(),
});
```

### 事件分类

共定义 30+ 种事件，分为以下类别：

| 类别 | 事件前缀 | 说明 |
|---|---|---|
| Agent | `agent.*` | 生命周期、状态变更、错误 |
| Memory | `memory.*` | 消息添加、记忆巩固、检索 |
| Model | `model.*` | 路由决策、token 使用 |
| Budget | `budget.*` | 预算警告、超额 |
| MCP | `mcp.*` | 工具调用、结果 |
| Scheduler | `scheduler.*` | 任务创建、执行、完成 |
| A2A | `a2a.*` | Agent 注册、消息收发 |
| Sandbox | `sandbox.*` | 权限检查、审计日志 |
| Workflow | `workflow.*` | 工作流启动、节点完成 |

## 模块详解

### Agent 状态机

```
                 ┌──────────┐
                 │   IDLE   │ ← createAgent
                 └────┬─────┘
                      │ startAgent
                      ▼
                 ┌──────────┐
        ┌───────│ RUNNING  │───────┐
        │        └────┬─────┘       │
        │ pauseAgent  │             │ stopAgent
        ▼             │ stopAgent   ▼
  ┌──────────┐        │        ┌──────────┐
  │  PAUSED  │        └───────│ STOPPED  │
  └────┬─────┘                 └──────────┘
       │ resumeAgent               ✗ 不可恢复
       ▼
  ┌──────────┐
  │ RUNNING  │
  └──────────┘

  任何状态 ──error──→ ┌──────────┐
                      │  ERROR   │
                      └──────────┘
```

### 记忆系统架构

```
┌─────────────────────────────────────┐
│          MemoryManager              │
├─────────────┬───────────────────────┤
│ ShortTerm   │      LongTerm         │
│ Memory      │      Memory           │
│             │                       │
│ ┌─────────┐ │  ┌─────────────────┐  │
│ │ 消息队列 │ │  │ 记忆项存储      │  │
│ │ (FIFO)  │ │  │                 │  │
│ └─────────┘ │  │ ┌─────────────┐ │  │
│             │  │ │ 关键词匹配   │ │  │
│ Token 估算  │  │ │ (降级方案)   │ │  │
│ 消息淘汰    │  │ ├─────────────┤ │  │
│             │  │ │ 向量检索    │ │  │
│             │  │ │ (cosine)    │ │  │
│             │  │ └─────────────┘ │  │
│             │  └─────────────────┘  │
├─────────────┴───────────────────────┤
│         可选持久化                   │
│  ┌─────────────────────────────┐    │
│  │   SqliteLongTermMemory      │    │
│  │   (better-sqlite3)          │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 模型路由架构

```
                    ┌─────────────────┐
                    │  ChatRequest    │
                    │  + strategy     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  ModelRouter    │
                    │  - 选择最优模型  │
                    │  - 预算检查     │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
  ┌────────▼──────┐ ┌────────▼──────┐ ┌────────▼──────┐
  │ OpenAIProvider│ │AnthropicProvider│ │OllamaProvider │
  │ - GPT-4       │ │ - Claude-3    │ │ - Llama       │
  │ - GPT-3.5     │ │ - Claude-3.5  │ │ - Mistral     │
  │ - Embeddings  │ │ (无 embedding)│ │ - Embeddings  │
  └───────────────┘ └───────────────┘ └───────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────▼────────┐
                    │ BudgetController│
                    │ - Token 跟踪    │
                    │ - 预算警告      │
                    └─────────────────┘
```

### MCP 工具系统架构

```
┌──────────────────────────────────────────┐
│              McpManager                  │
├──────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────────────┐  │
│  │ Builtin    │  │ External Servers   │  │
│  │ Server     │  │                    │  │
│  │            │  │  ┌──────────────┐  │  │
│  │ - calculate│  │  │ StdioMcpClient│  │  │
│  │ - get_time │  │  │ - spawn 子进程│  │  │
│  │ - echo     │  │  │ - JSON-RPC    │  │  │
│  │            │  │  │ - tools/list  │  │  │
│  └────────────┘  │  │ - tools/call  │  │  │
│                  │  └──────────────┘  │  │
│                  └────────────────────┘  │
└──────────────────────────────────────────┘
```

### 工作流执行流程

```
┌──────────────┐
│ WorkflowDef  │
│  (DAG)       │
└──────┬───────┘
       │
┌──────▼───────┐
│  Executor    │
│  - 拓扑排序   │
└──────┬───────┘
       │
       ▼
  ┌─────────┐     ┌─────────────────┐
  │  task   │────▶│  condition      │
  │  node   │     │  - true/false   │
  └─────────┘     └────────┬────────┘
       │                   │
       │           ┌───────┴───────┐
       │           ▼               ▼
       │     ┌─────────┐    ┌─────────┐
       │     │ branch A│    │ branch B│
       │     └────┬────┘    └────┬────┘
       │          │              │
       └──────────┴──────────────┘
                  │
                  ▼
           ┌───────────┐
           │ parallel  │
           │ Promise.all│
           └───────────┘
```

## 数据流

### Agent 消息处理流程

```
用户输入
    │
    ▼
CLI / API
    │
    ▼
ProcessManager.getAgent(id)
    │
    ▼
Agent.sendMessage(text)
    │
    ├──→ MemoryManager.getContext()  // 获取上下文
    │
    ├──→ ModelRouter.route()         // 调用模型
    │    ├──→ BudgetController.check()
    │    └──→ Provider.chat()
    │
    ├──→ MemoryManager.addMessage()  // 存储回复
    │
    └──→ 返回响应
```

### 事件传播流程

```
Agent 状态变更
    │
    ▼
globalEventBus.emit(AGENT_STATUS_CHANGED)
    │
    ├──→ Scheduler 检查相关任务
    ├──→ Web UI 通过 SSE 推送到前端
    ├──→ A2A 通知其他 Agent
    ├──→ AuditLogger 记录审计日志
    └──→ BudgetController 更新状态
```

## 错误处理

### 错误类层次

```
AetherError (基类)
├── AgentError          // Agent 相关错误
├── MemoryError         // 记忆系统错误
├── ModelRouterError    // 模型路由错误
│   └── BudgetExceededError  // 预算超限
├── McpError            // MCP 工具错误
├── SchedulerError      // 调度器错误
├── ConfigurationError  // 配置错误
└── NotFoundError       // 资源未找到
```

每个错误包含：
- `code` - 错误码（如 `AGENT_NOT_FOUND`）
- `message` - 错误消息
- `metadata` - 元数据（用于调试）
- `toJSON()` - 序列化方法

## 持久化

### SQLite Schema

```sql
-- Agent 状态
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  config TEXT,        -- JSON
  metadata TEXT,      -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 记忆
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT,
  importance REAL DEFAULT 0.5,
  embedding TEXT,     -- JSON array
  metadata TEXT,      -- JSON
  tags TEXT,          -- JSON array
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  access_count INTEGER DEFAULT 0
);

-- 定时任务
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_id TEXT,
  cron TEXT,
  type TEXT,
  handler TEXT,
  payload TEXT,       -- JSON
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  run_count INTEGER DEFAULT 0,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Token 使用
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost REAL,
  timestamp INTEGER NOT NULL
);
```

## 安全模型

### 沙箱权限控制

```
┌─────────────────────────────────────┐
│         PermissionPolicy            │
├─────────────────────────────────────┤
│  default: 'deny'                    │
│  rules:                             │
│    - fs.read    (resources: [...])  │
│    - fs.write   (resources: [...])  │
│    - net.http                      │
│    - process.env                   │
│    - memory.read                   │
│    - mcp.tool                      │
│    - ...                           │
│  limits:                            │
│    - maxMemoryMB                   │
│    - maxCpuMs                      │
│    - maxTimeoutMs                  │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│           VmSandbox                 │
│  - node:vm.createContext            │
│  - 注入受限 API                     │
│  - 每次调用权限检查                  │
│  - 审计日志记录                     │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│          AuditLogger                │
│  - allow / deny / error             │
│  - FIFO 队列（10000 条）            │
│  - 事件触发                         │
└─────────────────────────────────────┘
```

## 扩展性

### 添加新的模型提供商

```typescript
import type { IModelProvider } from '@aether/model-router';

class MyProvider implements IModelProvider {
  readonly id = 'my-provider';
  readonly name = 'My Provider';

  async chat(request) { /* ... */ }
  async embed(request) { /* ... */ }
  isAvailable() { return true; }
  listModels() { /* ... */ }
  getModelInfo(id) { /* ... */ }
}

router.registerProvider(new MyProvider());
```

### 添加新的 MCP 工具

```typescript
import { McpTool, McpServer } from '@aether/mcp';

const tool = new McpTool(
  'my_tool',
  '我的工具',
  [{ name: 'input', type: 'string', required: true }],
  'builtin',
  async (args) => {
    return { success: true, content: `处理: ${args.input}` };
  }
);

server.registerTool(tool);
```

### 添加新的工作流节点类型

通过实现 `WorkflowNode` 接口扩展：

```typescript
const customNode: WorkflowNode = {
  id: 'custom-1',
  type: 'task',
  name: '自定义节点',
  handler: async (input, context) => {
    // 自定义逻辑
    return result;
  },
  retry: { maxAttempts: 3, delayMs: 1000 },
};
```

## 性能考量

- **事件总线**：基于 Node.js EventEmitter，maxListeners=100，避免内存泄漏
- **SQLite**：使用 prepared statements，单连接同步访问（better-sqlite3 特性）
- **向量检索**：内存中计算余弦相似度，适合中小规模（<10000 条记忆）
- **工作流并行**：用 Promise.all 并行执行无依赖节点
- **MCP 子进程**：每个 MCP 服务器一个子进程，通过 stdio 通信

## 限制与注意事项

1. **node:vm 沙箱不是完全安全的**：有已知的逃逸路径，不要执行完全不受信任的代码
2. **向量检索是内存版**：大量记忆时需要集成真正的向量数据库
3. **A2A 是本地通信**：目前只支持同进程内 Agent 通信，不支持跨进程/跨机器
4. **better-sqlite3 是同步的**：会阻塞事件循环，高并发场景需注意

## 设计决策

### 为什么用 ESM 而不是 CommonJS？

ESM 是 Node.js 的未来，支持 tree-shaking、top-level await 等特性。虽然需要 `.js` 扩展名略显繁琐，但长期收益更大。

### 为什么用 pnpm 而不是 npm/yarn？

pnpm 的 monorepo workspace 支持更好，磁盘占用更少，依赖解析更严格。

### 为什么用 better-sqlite3 而不是 sqlite3？

better-sqlite3 是同步 API，性能更好（约 2-3 倍），API 更简洁。对于本地优先的应用，同步访问数据库是可接受的。

### 为什么用 node:vm 做沙箱？

node:vm 是 Node.js 内置模块，无需额外依赖。虽然不是完全安全的沙箱，但作为第一层隔离是合理的。完全不受信任的代码应该用容器或 WASM 沙箱。

### 为什么事件总线用 EventEmitter 而不是消息队列？

EventBus 适合同进程内通信，简单高效。跨进程通信可以基于 EventBus 扩展（如通过 WebSocket 转发）。
