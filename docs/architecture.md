# Aether OS 架构设计

## 概述

Aether OS 是一个模块化的 AI Agent 运行时系统，采用事件驱动架构设计。系统由多个独立的包组成，每个包负责特定的功能领域，通过共享模块和事件总线进行通信。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                        CLI Layer                        │
│  (Command Line Interface - 命令行交互层)                │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Core      │   Memory    │ Model Router│     MCP     │
│ (Agent 管理) │ (记忆系统)  │ (模型路由)  │ (工具系统)  │
└─────────────┴─────────────┴─────────────┴─────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      Scheduler                          │
│                (定时任务调度器)                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                       Shared                            │
│  (常量、类型、错误、事件总线、工具函数)                  │
└─────────────────────────────────────────────────────────┘
```

## 核心设计原则

### 1. 模块化设计
每个功能领域都是独立的包，可以单独使用、测试和替换。包之间通过明确的接口进行交互，降低耦合度。

### 2. 事件驱动架构
所有模块都通过事件总线进行通信，实现松耦合。模块之间不需要直接引用，只需要监听和触发事件。

### 3. 接口优先
所有公共功能都通过接口定义，具体实现可以灵活替换。例如：
- 记忆系统可以从 SQLite 切换到 PostgreSQL
- 模型提供商可以从 OpenAI 切换到 Anthropic
- 存储后端可以从本地文件切换到云存储

### 4. MVP 优先
当前版本专注于核心功能的最小可用实现，避免过度设计。后续版本会逐步增加功能和优化性能。

## 模块详细说明

### 1. Shared 模块
**包名**: `@aether/shared`

**职责**: 提供所有包共用的基础能力

**核心组件**:
- **常量定义**: 系统事件、Agent 状态、消息角色、默认配置等
- **错误体系**: 统一的错误类层次结构，支持错误码和元数据
- **事件总线**: 类型安全的事件总线，基于 Node.js EventEmitter
- **工具函数**: ID 生成、时间戳、重试机制、超时控制等
- **类型定义**: 通用类型接口（ID、Timestamp、Metadata、Pagination 等）

### 2. Core 模块
**包名**: `@aether/core`

**职责**: Agent 生命周期管理和进程管理

**核心组件**:
- **Agent 类**: 单个 Agent 的状态管理
  - 状态流转: IDLE → RUNNING → PAUSED → RUNNING → STOPPED
  - 支持启动、暂停、恢复、停止操作
  - STOPPED 是终态，停止后不能重新启动

- **ProcessManager 类**: 多 Agent 管理
  - Agent 的注册、注销、查询
  - 批量状态管理
  - 内部使用 Map 存储所有 Agent 实例

**状态机**:
```
IDLE ──start──▶ RUNNING ──pause──▶ PAUSED
                  │                   │
                  │                   │
                  stop                stop
                  │                   │
                  ▼                   ▼
              STOPPED ◀───────────────┘
              (终态)
```

### 3. Memory 模块
**包名**: `@aether/memory`

**职责**: 提供短期记忆和长期记忆能力

**核心组件**:
- **ShortTermMemory**: 短期记忆
  - 基于数组的 FIFO 队列
  - 有容量限制（默认 50 条）
  - Token 估算（约 4 字符 = 1 token）
  - 用于对话上下文管理

- **LongTermMemory**: 长期记忆
  - MVP 版本: 基于内存 Map 存储，关键词匹配检索
  - 支持重要性权重
  - 支持分页、排序、类型过滤
  - 存储时触发 `memory.added` 事件

- **MemoryManager**: 记忆管理器
  - 统一管理短期和长期记忆
  - `getFullContext()`: 合并短期记忆和相关长期记忆
  - `consolidateToLongTerm()`: 将短期记忆巩固到长期记忆

**记忆检索流程**:
```
用户查询
    │
    ▼
短期记忆 (最近对话) + 长期记忆检索 (相关历史)
    │
    ▼
合并为完整上下文
    │
    ▼
发送给模型
```

### 4. Model Router 模块
**包名**: `@aether/model-router`

**职责**: 多模型提供商的统一接入和智能路由

**核心组件**:
- **MockModelProvider**: 模拟模型提供商
  - 提供两个模拟模型: mock-small (4k 上下文) 和 mock-large (8k 上下文)
  - 聊天响应返回 echo 模拟
  - 嵌入向量返回 1536 维随机向量

- **ModelRouter**: 模型路由器
  - 支持多种路由策略: cheapest, fastest, best-quality, balanced, manual
  - 统一的聊天和嵌入接口
  - 触发模型请求/响应/错误事件

- **BudgetController**: 预算控制器
  - 跟踪每日 token 使用量
  - 支持预算警告（80% 阈值）和超限阻止
  - 支持按 Agent 维度统计
  - 可配置每日预算限额

### 5. MCP 模块
**包名**: `@aether/mcp`

**职责**: MCP (Model Context Protocol) 工具系统

**核心组件**:
- **McpTool**: MCP 工具
  - 工具定义和参数校验
  - 支持参数类型检查（string/number/boolean）
  - 支持必填参数检查

- **McpServer**: MCP 服务器
  - 管理一组工具
  - 支持连接/断开状态管理
  - 工具注册和发现

- **McpManager**: MCP 管理器
  - 管理多个 MCP 服务器
  - 内置工具服务器（builtin），包含 3 个内置工具:
    - `get_current_time`: 获取当前时间
    - `calculate`: 执行数学计算
    - `echo`: 回显消息
  - 工具查找和执行
  - 服务器批量连接/断开

### 6. Scheduler 模块
**包名**: `@aether/scheduler`

**职责**: 定时任务调度和持久化

**核心组件**:
- **ScheduledTask**: 定时任务
  - 任务定义和状态管理
  - 支持启用/禁用
  - 记录执行历史（运行次数、最后运行时间）

- **TaskScheduler**: 任务调度器
  - 基于 setTimeout 的简单调度
  - 简化版 Cron 解析器（支持基本的分钟/小时级调度）
  - 支持任务处理器注册
  - 指数退避重试机制
  - 任务的增删改查

**支持的 Cron 格式**（简化版）:
- `* * * * *` - 每分钟
- `5 * * * *` - 每小时第 5 分钟
- `0 9 * * *` - 每天 9:00

### 7. CLI 模块
**包名**: `@aether/cli`

**职责**: 命令行交互界面

**核心组件**:
- **CliApp**: CLI 应用主类
  - 集成所有核心组件
  - 命令系统（子命令、选项、默认值、帮助信息）
  - 多种输出格式（text/json/table）

**命令列表**:
- `agent`: Agent 管理（create/list/start/stop/pause/resume/status）
- `memory`: 记忆管理（add/search/list/clear）
- `budget`: 预算管理（status/set/reset）
- `mcp`: MCP 工具管理（servers/tools/run）
- `schedule`: 定时任务管理（list/add/cancel/run）
- `chat`: 与 Agent 对话
- `demo`: 运行完整演示

## 事件机制

### 全局事件总线
系统使用全局单例事件总线 `globalEventBus`，所有模块都通过它进行通信。

### 事件列表

#### Agent 生命周期事件
- `agent.created`: Agent 创建完成 (agentId, agent)
- `agent.started`: Agent 启动 (agentId, timestamp)
- `agent.paused`: Agent 暂停 (agentId, timestamp)
- `agent.resumed`: Agent 恢复 (agentId, timestamp)
- `agent.stopped`: Agent 停止 (agentId, timestamp)
- `agent.error`: Agent 出错 (agentId, error)
- `agent.status_changed`: Agent 状态变化 (agentId, oldStatus, newStatus)

#### 记忆系统事件
- `memory.added`: 记忆添加 (memoryId, agentId, timestamp)
- `memory.deleted`: 记忆删除 (memoryId, agentId, timestamp)
- `memory.cleared`: 记忆清空 (agentId, timestamp)

#### 模型路由事件
- `model.request`: 模型请求 (requestId, model, request)
- `model.response`: 模型响应 (requestId, model, response)
- `model.error`: 模型错误 (requestId, model, error)

#### MCP 工具事件
- `mcp.tool_called`: 工具调用 (toolName, args, timestamp)
- `mcp.tool_completed`: 工具完成 (toolName, result, duration)
- `mcp.tool_error`: 工具错误 (toolName, error)

#### 调度器事件
- `scheduler.task_created`: 任务创建 (taskId, task)
- `scheduler.task_executed`: 任务执行 (taskId, result)
- `scheduler.task_failed`: 任务失败 (taskId, error)
- `scheduler.started`: 调度器启动
- `scheduler.stopped`: 调度器停止

## 数据流

### Agent 对话流程
```
用户输入
    │
    ▼
CLI / API 层
    │
    ▼
ProcessManager (找到对应 Agent)
    │
    ▼
MemoryManager (获取完整上下文)
    │
    ├─ ShortTermMemory (最近对话)
    └─ LongTermMemory (相关历史记忆)
    │
    ▼
ModelRouter (选择模型并发送请求)
    │
    ├─ BudgetController (检查预算)
    └─ ModelProvider (实际调用模型)
    │
    ▼
模型响应
    │
    ├─ BudgetController (记录 token 使用)
    ├─ ShortTermMemory (保存到短期记忆)
    └─ McpManager (如果需要调用工具)
    │
    ▼
返回给用户
```

### 定时任务流程
```
TaskScheduler 启动
    │
    ▼
加载所有持久化任务
    │
    ▼
计算每个任务的下次执行时间
    │
    ▼
设置定时器
    │
    ▼
触发时间到达
    │
    ▼
执行任务处理器
    │
    ├─ 成功 → 记录执行历史，计算下次执行时间
    └─ 失败 → 指数退避重试
    │
    ▼
更新任务状态
```

## 包依赖关系

```
@aether/cli
├── @aether/core
├── @aether/memory
├── @aether/model-router
├── @aether/mcp
├── @aether/scheduler
└── @aether/shared

@aether/core
└── @aether/shared

@aether/memory
└── @aether/shared

@aether/model-router
└── @aether/shared

@aether/mcp
└── @aether/shared

@aether/scheduler
├── @aether/core
└── @aether/shared

@aether/shared (无依赖)
```

## 扩展点

### 1. 新增模型提供商
实现 `IModelProvider` 接口，然后通过 `modelRouter.registerProvider()` 注册即可。

### 2. 新增 MCP 服务器
实现 `IMcpServer` 接口，或者通过配置加载外部 MCP 服务器。

### 3. 替换记忆存储
实现 `ILongTermMemory` 接口，可以替换为真实的向量数据库（如 Pinecone、Weaviate 等）。

### 4. 新增任务类型
通过 `taskScheduler.registerTaskHandler()` 注册自定义任务处理器。

## 技术决策

### 为什么用 better-sqlite3？
- 轻量级，无需单独部署数据库服务
- 同步 API，使用简单
- 性能足够 MVP 阶段使用
- 支持事务和索引

### 为什么用事件驱动？
- 松耦合，模块间依赖少
- 易于扩展，新增模块不需要修改现有代码
- 便于调试和监控，可以监听所有事件
- 符合 Agent 系统的异步特性

### 为什么 MVP 用子字符串匹配代替向量检索？
- 实现简单，无需额外依赖
- 足够演示核心功能
- 后续可以无缝替换为真实向量数据库
- 接口保持一致，上层代码无需修改

## 后续演进方向

1. **真实向量检索**: 集成向量数据库，提升长期记忆检索质量
2. **智能路由**: 基于成本、质量、速度的多维度模型路由
3. **持久化增强**: 所有状态都持久化到数据库，支持重启恢复
4. **分布式支持**: 支持多节点部署，任务分发
5. **Web UI**: 可视化管理界面
6. **插件市场**: 第三方工具和模型的生态系统
