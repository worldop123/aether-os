# Aether OS 使用文档

> **版本**：v0.3.0
> **更新日期**：2026-06-24
> **适用对象**：开发者、运维人员、AI Agent 应用构建者

Aether OS 是面向 AI Agent 的有状态运行时操作系统，提供 Agent 生命周期管理、记忆系统、模型路由、MCP 工具、任务调度、可观测性等完整能力。本文档涵盖安装、CLI、Web API、核心 API、配置、示例等全部使用场景。

---

## 目录

- [1. 环境要求与安装](#1-环境要求与安装)
- [2. 快速开始（5 分钟上手）](#2-快速开始5-分钟上手)
- [3. CLI 命令手册](#3-cli-命令手册)
- [4. Web API 手册](#4-web-api-手册)
- [5. 核心 API 手册](#5-核心-api-手册)
  - [5.1 ProcessManager — Agent 管理](#51-processmanager--agent-管理)
  - [5.2 AgentRuntime — 对话与工具调用](#52-agentruntime--对话与工具调用)
  - [5.3 MemoryManager — 记忆系统](#53-memorymanager--记忆系统)
  - [5.4 记忆巩固与遗忘](#54-记忆巩固与遗忘)
  - [5.5 BudgetController — 预算控制](#55-budgetcontroller--预算控制)
  - [5.6 ModelRouter — 模型路由](#56-modelrouter--模型路由)
  - [5.7 McpManager — 工具系统](#57-mcpmanager--工具系统)
  - [5.8 TaskScheduler — 任务调度](#58-taskscheduler--任务调度)
  - [5.9 A2A 通信](#59-a2a-通信)
  - [5.10 SkillManager — 技能系统](#510-skillmanager--技能系统)
  - [5.11 可观测性（日志/指标/追踪）](#511-可观测性日志指标追踪)
- [6. 配置文件](#6-配置文件)
- [7. 示例脚本](#7-示例脚本)
- [8. 事件总线](#8-事件总线)
- [9. 常见问题（FAQ）](#9-常见问题faq)

---

## 1. 环境要求与安装

### 1.1 环境要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 18.0.0 | 推荐 20.x LTS 或更高 |
| pnpm | >= 9.0.0 | 包管理器（monorepo workspace） |
| TypeScript | >= 5.4.0 | 开发依赖，构建时使用 |
| Python + 编译工具链 | — | `better-sqlite3` 原生模块编译所需（memory/scheduler 包） |

### 1.2 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/worldop123/aether-os.git
cd aether-os

# 2. 安装依赖（pnpm workspace 会自动链接本地包）
pnpm install

# 3. 构建所有包
pnpm build

# 4. 运行测试（验证安装成功，735+ 个测试）
pnpm test
```

### 1.3 验证安装

```bash
# 查看 CLI 版本
node packages/cli/dist/cli.js --version

# 查看帮助
node packages/cli/dist/cli.js --help

# 全局链接（可选，链接后可直接使用 aether 命令）
pnpm link --global
aether --version
```

### 1.4 npm scripts

| 命令 | 作用 |
|------|------|
| `pnpm build` | 递归构建所有包（`pnpm -r build`） |
| `pnpm test` | 运行全部测试（`vitest run`） |
| `pnpm test:watch` | 监听模式测试 |
| `pnpm lint` | 递归 lint |
| `pnpm clean` | 递归清理 `dist` 目录 |

### 1.5 包结构

项目采用 pnpm workspace monorepo，共 13 个包：

| 包名 | npm 包 | 功能 | 状态 |
|------|--------|------|------|
| shared | `@aether/shared` | 共享类型、工具函数、事件总线、错误类 | 稳定 |
| core | `@aether/core` | Agent 实体、ProcessManager、AgentRuntime | 稳定 |
| memory | `@aether/memory` | 短期/长期记忆、巩固、遗忘 | 稳定 |
| model-router | `@aether/model-router` | 模型路由、预算控制、OpenAI 提供商 | 稳定 |
| mcp | `@aether/mcp` | MCP 工具系统、内置工具、stdio 客户端 | 稳定 |
| scheduler | `@aether/scheduler` | cron 任务调度、SQLite 持久化 | 稳定 |
| cli | `@aether/cli` | 命令行入口（bin: `aether`） | 稳定 |
| skills | `@aether/skills` | 技能注册与加载（5 个内置技能） | 稳定 |
| observability | `@aether/observability` | Logger / Metrics / Tracer 三件套 | 稳定 |
| a2a | `@aether/a2a` | Agent-to-Agent 通信（本地 + HTTP） | 稳定 |
| sandbox | `@aether/sandbox` | 安全沙箱（node:vm + 权限控制） | 实验性 |
| workflow | `@aether/workflow` | DAG 工作流编排 | 实验性 |
| web | `@aether/web` | REST API + SSE + 静态 Web UI | 稳定 |

---

## 2. 快速开始（5 分钟上手）

### 2.1 最简示例：创建 Agent 并对话

```typescript
import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';

async function main() {
  // 1. 初始化核心组件
  const processManager = new ProcessManager();
  const memoryManager = new MemoryManager('my-agent');
  const modelRouter = new ModelRouter();
  modelRouter.registerProvider(new MockModelProvider()); // 注册 Mock 模型（无需 API Key）
  const budgetController = new BudgetController(100000); // 每日 10 万 token 预算
  const mcpManager = new McpManager(); // 自动加载内置工具

  // 2. 创建并启动 Agent
  const agent = await processManager.createAgent('my-agent', {
    defaultModel: 'mock-small',
    memoryEnabled: true,
    toolsEnabled: true,
  });
  await processManager.startAgent(agent.id);

  // 3. 执行 MCP 工具
  const result = await mcpManager.executeTool('calculate', { expression: '2 + 3 * 4' });
  console.log('计算结果:', result.data.result); // 14

  // 4. 添加记忆
  await memoryManager.longTerm.store(agent.id, '用户是软件工程师', {
    type: 'fact',
    importance: 0.9,
  });

  // 5. 搜索记忆
  const memories = await memoryManager.longTerm.search(agent.id, '工程师', { topK: 5 });
  console.log('搜索结果:', memories);

  console.log('Agent ID:', agent.id);
}

main().catch(console.error);
```

运行：

```bash
npx tsx my-script.ts
```

### 2.2 使用 CLI 快速操作

```bash
# 创建 Agent
aether agent create --name my-agent --model mock-small

# 对话
aether chat --message "你好"

# 执行 MCP 工具
aether mcp run --tool calculate --args '{"expression":"2+3*4"}'

# 查看预算
aether budget status

# 启动 Web UI
aether web --port 3000
```

### 2.3 启动 Web UI

```bash
# 方式一：CLI 命令
aether web --port 3000 --host 0.0.0.0

# 方式二：示例脚本
npx tsx examples/start-web.ts
```

打开浏览器访问 `http://localhost:3000`，或调用 API：

```bash
curl http://localhost:3000/api/status
curl http://localhost:3000/api/agents
```

---

## 3. CLI 命令手册

CLI 入口：`aether`（构建后位于 `packages/cli/dist/cli.js`）。

### 3.1 全局选项

| 选项 | 说明 |
|------|------|
| `--help` / `-h` | 显示帮助 |
| `--version` / `-v` | 显示版本 |
| `--format <text\|json>` | 输出格式 |
| `--quiet` / `-q` | 静默模式 |
| `--verbose` / `-V` | 详细输出 |

参数解析支持：`--key=value`、`--key value`、`-k value`、布尔标志。

### 3.2 `agent` — Agent 管理

```bash
# 列出所有 Agent
aether agent list
aether agent list --status running

# 创建 Agent
aether agent create --name my-agent --model mock-small --description "测试 Agent"

# 生命周期控制
aether agent start --id <agent-id>
aether agent pause --id <agent-id>
aether agent resume --id <agent-id>
aether agent stop --id <agent-id>     # 终态，不可重启

# 查看状态
aether agent status --id <agent-id>
```

| 子命令 | 必填选项 | 可选选项 |
|--------|---------|---------|
| `list` | — | `--status`、`--format` |
| `create` | `--name` | `--description`、`--model` |
| `start` / `stop` / `pause` / `resume` / `status` | `--id` | — |

### 3.3 `memory` — 记忆管理

```bash
# 添加长期记忆
aether memory add --content "用户喜欢咖啡" --type preference --importance 0.8

# 搜索记忆
aether memory search --query "编程语言" --limit 5

# 列出记忆
aether memory list --type fact --limit 20
```

| 子命令 | 必填选项 | 可选选项 |
|--------|---------|---------|
| `add` | `--content` | `--type`（默认 fact）、`--importance`（默认 0.5） |
| `search` | `--query` | `--limit`（默认 5）、`--format` |
| `list` | — | `--type`、`--limit`（默认 20） |

记忆类型：`fact`、`experience`、`preference`、`summary`、`custom`。

### 3.4 `budget` — 预算管理

```bash
aether budget status
aether budget set --amount 100000
aether budget reset
```

### 3.5 `mcp` — MCP 工具管理

```bash
# 列出服务器
aether mcp servers

# 列出工具
aether mcp tools
aether mcp tools --server builtin

# 执行工具
aether mcp run --tool calculate --args '{"expression":"2+3*4"}'
aether mcp run --tool get_current_time --args '{"timezone":"Asia/Shanghai"}'
aether mcp run --tool echo --args '{"message":"Hello"}'
```

内置工具：

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `get_current_time` | `timezone?` | 获取当前时间 |
| `calculate` | `expression` | 安全表达式计算（不用 eval） |
| `echo` | `message` | 回显消息 |

### 3.6 `schedule` — 任务调度

```bash
# 创建定时任务
aether schedule add \
  --name "每分钟心跳" \
  --agent <agent-id> \
  --cron "* * * * *" \
  --type custom \
  --payload '{"message":"ok"}'

# 列出任务
aether schedule list
aether schedule list --agent <agent-id>

# 立即执行
aether schedule run --id <task-id>

# 取消任务
aether schedule cancel --id <task-id>
```

cron 表达式为标准 5 字段：`分 时 日 月 周`，支持 `*`、数字、范围 `1-5`、列表 `1,3,5`、步长 `*/15`。

### 3.7 `chat` — 对话

```bash
# 单次消息
aether chat --message "你好"

# 指定 Agent
aether chat --agent my-agent --message "帮我计算 2+2"

# 交互模式
aether chat --agent my-agent -i
```

### 3.8 `config` — 配置管理

```bash
aether config path                    # 显示配置文件路径
aether config list                    # 列出所有配置
aether config get --key defaultModel  # 获取配置项
aether config set --key defaultModel --value gpt-4
```

### 3.9 `web` — 启动 Web UI

```bash
aether web --port 3000 --host 0.0.0.0
```

---

## 4. Web API 手册

Web 服务器基于 Node.js 原生 `http` 模块实现，不依赖 express。默认端口 3000。

### 4.1 系统状态

```http
GET /api/status
```

响应：

```json
{
  "uptime": 120,
  "timestamp": 1782236453752,
  "agentCount": 2,
  "taskCount": 1,
  "budget": {
    "dailyBudget": 100000,
    "dailyUsed": 253,
    "percentage": 0.00253,
    "remaining": 99747
  },
  "mcpServerCount": 1,
  "mcpToolCount": 3,
  "schedulerRunning": true
}
```

### 4.2 Agent 端点

| 方法 | 路径 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/agents` | 列出 Agent | `?status=running` |
| POST | `/api/agents` | 创建 Agent | `{name, description?, model?}` |
| GET | `/api/agents/:id` | Agent 详情 | — |
| POST | `/api/agents/:id/start` | 启动 Agent | — |
| POST | `/api/agents/:id/stop` | 停止 Agent | — |
| POST | `/api/agents/:id/pause` | 暂停 Agent | — |
| POST | `/api/agents/:id/resume` | 恢复 Agent | — |

示例：

```bash
# 创建 Agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","model":"mock-small","description":"测试"}'

# 暂停 Agent
curl -X POST http://localhost:3000/api/agents/<agent-id>/pause
```

### 4.3 记忆端点

| 方法 | 路径 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/memories` | 列出记忆 | `?agentId=&type=&limit=` |
| GET | `/api/memories/search` | 搜索记忆 | `?q=&limit=&agentId=` |
| POST | `/api/memories` | 存储记忆 | `{agentId, content, type?, importance?, tags?, metadata?}` |
| DELETE | `/api/memories/:id` | 删除记忆 | — |

示例：

```bash
# 存储记忆
curl -X POST http://localhost:3000/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "agentId":"agent-001",
    "content":"用户是工程师",
    "type":"fact",
    "importance":0.9,
    "tags":["profile"]
  }'

# 搜索记忆
curl "http://localhost:3000/api/memories/search?q=工程师&limit=5"
```

### 4.4 预算端点

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/budget` | 预算状态 | — |
| POST | `/api/budget` | 设置预算 | `{budget, agentId?}` |

### 4.5 MCP 端点

| 方法 | 路径 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/mcp/servers` | 列出服务器 | — |
| GET | `/api/mcp/tools` | 列出工具 | — |
| POST | `/api/mcp/tools/:name/execute` | 执行工具 | `{args?, serverName?}` |

示例：

```bash
# 执行计算工具
curl -X POST http://localhost:3000/api/mcp/tools/calculate/execute \
  -H "Content-Type: application/json" \
  -d '{"args":{"expression":"(10+5)*3"}}'
# 返回: {"success":true,"content":"计算结果：(10 + 5) * 3 = 45","data":{"result":45}}
```

### 4.6 调度端点

| 方法 | 路径 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/schedules` | 列出任务 | `?agentId=` |
| POST | `/api/schedules` | 创建任务 | `{name, agentId, cron, taskType?, payload?, description?, enabled?}` |
| DELETE | `/api/schedules/:id` | 取消任务 | — |
| POST | `/api/schedules/:id/run` | 立即执行 | — |

示例：

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name":"每日报告",
    "agentId":"agent-001",
    "cron":"0 9 * * *",
    "taskType":"custom",
    "payload":{"action":"generate_report"}
  }'
```

### 4.7 SSE 事件流

```http
GET /api/events
```

Server-Sent Events 实时事件流，30 秒心跳，转发 22 种事件。

JavaScript 客户端示例：

```javascript
const eventSource = new EventSource('http://localhost:3000/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到事件:', data.event, data.args);
};

// 关闭连接
// eventSource.close();
```

事件类型：

| 类别 | 事件 |
|------|------|
| Agent | `agent.started`、`agent.paused`、`agent.resumed`、`agent.stopped`、`agent.error`、`agent.status_changed` |
| Memory | `memory.added`、`memory.deleted`、`memory.cleared` |
| Model | `model.request`、`model.response`、`model.error` |
| Budget | `budget.warning`、`budget.exceeded` |
| MCP | `mcp.tool_called`、`mcp.tool_result`、`mcp.tool_error`、`mcp.server_connected`、`mcp.server_disconnected` |
| Scheduler | `scheduler.task_created`、`scheduler.task_cancelled`、`scheduler.task_executed`、`scheduler.task_error` |

### 4.8 错误响应格式

所有错误返回统一 JSON 格式：

```json
{
  "error": "Agent xxx 不存在",
  "code": "AGENT_NOT_FOUND"
}
```

HTTP 状态码：`400`（参数错误）、`404`（不存在）、`409`（已存在）、`500`（服务器错误）。

---

## 5. 核心 API 手册

### 5.1 ProcessManager — Agent 管理

```typescript
import { ProcessManager } from '@aether/core';

const pm = new ProcessManager();

// 创建 Agent
const agent = await pm.createAgent('my-agent', {
  defaultModel: 'mock-small',
  systemPrompt: '你是一个友好的助手',
  temperature: 0.7,
  maxTokens: 1000,
  memoryEnabled: true,
  toolsEnabled: true,
});

// 生命周期
await pm.startAgent(agent.id);
await pm.pauseAgent(agent.id);
await pm.resumeAgent(agent.id);
await pm.stopAgent(agent.id); // 终态，不可重启

// 查询
pm.listAgents();              // 全部
pm.listAgents('running');     // 按状态过滤
pm.getAgent(agent.id);
pm.hasAgent(agent.id);
pm.getAgentStatus(agent.id);
await pm.removeAgent(agent.id);
```

Agent 状态机：

```
IDLE → RUNNING → (PAUSED ↔ RUNNING) → STOPPED（终态）
                  ↓
                ERROR
```

### 5.2 AgentRuntime — 对话与工具调用

`AgentRuntime` 将 Agent 与 Memory/ModelRouter/MCP/Budget 集成，实现真正的对话和工具调用循环（默认最多 10 轮）。

```typescript
import { AgentRuntime, AgentRuntimeManager } from '@aether/core';

// 单个 Runtime
const runtime = new AgentRuntime({
  agent,
  memoryManager,
  modelRouter,
  budgetController,
  mcpManager,
  maxToolRounds: 10,        // 可选，默认 10
  systemPrompt: '...',      // 可选
});

const response = await runtime.sendMessage('帮我计算 2+3*4');
runtime.getHistory();       // 获取对话历史
runtime.clearHistory();     // 清空历史

// 批量管理
const manager = new AgentRuntimeManager();
await manager.createRuntime(agentId, {
  agent,
  memoryManager,
  modelRouter,
  budgetController,
  mcpManager,
});
const resp = await manager.sendMessage(agentId, '你好');
manager.listRuntimes();
manager.removeRuntime(agentId);
```

工具调用循环流程：

1. 用户消息加入短期记忆
2. 构建上下文（短期记忆 + 长期记忆检索）
3. 构建请求（添加工具定义）
4. 预算检查
5. 调用模型
6. 记录 token 用量
7. 检查是否有工具调用
8. 执行工具，结果加入记忆
9. 循环回到步骤 2（直到无工具调用或达到最大轮数）
10. 返回最终响应

### 5.3 MemoryManager — 记忆系统

```typescript
import { MemoryManager } from '@aether/memory';

const mm = new MemoryManager('agent-001');

// ===== 短期记忆（FIFO 淘汰）=====
mm.shortTerm.addMessage({ role: 'user', content: '你好' });
mm.shortTerm.addMessage({ role: 'assistant', content: '你好！' });
mm.shortTerm.getContext(10);     // 获取最近 10 条
mm.shortTerm.getTokenCount();
mm.shortTerm.setMaxMessages(50); // 设置容量上限

// ===== 长期记忆（向量检索 + 关键词降级）=====
await mm.longTerm.store('agent-001', '用户是工程师', {
  type: 'fact',           // fact|experience|preference|summary|custom
  importance: 0.9,
  tags: ['profile'],
});

const results = await mm.longTerm.search('agent-001', '编程', {
  topK: 5,
  threshold: 0.3,
});

await mm.longTerm.updateImportance(memoryId, 0.8);
await mm.longTerm.delete(memoryId);
await mm.longTerm.list('agent-001', { type: 'fact', limit: 20 });

// ===== 合并上下文 =====
const ctx = await mm.getFullContext('用户背景', { limit: 10 });

// ===== 巩固到长期记忆 =====
await mm.consolidateToLongTerm('agent-001');
```

消息角色：`SYSTEM`、`USER`、`ASSISTANT`、`TOOL`。

### 5.4 记忆巩固与遗忘

```typescript
import {
  MemoryConsolidator,
  MemoryForgetter,
  MemoryMaintenance,
} from '@aether/memory';

// 巩固（将重要的短期记忆转为长期）
const consolidator = new MemoryConsolidator({
  strategy: 'hybrid',           // importance|recency|frequency|hybrid
  importanceThreshold: 0.5,
  maxConsolidate: 20,
  minAgeMs: 60000,
  autoSummarize: true,
  summaryMaxLength: 500,
});
const result = await consolidator.consolidate('agent-001', shortTermMemory);

// 遗忘（清理过期或低价值记忆）
const forgetter = new MemoryForgetter({
  strategy: 'decay',            // fifo|lru|lfu|decay|importance-based
  maxMemories: 10000,
  decayFactor: 0.95,
  minImportance: 0.1,
  expirationMs: 30 * 24 * 60 * 60 * 1000, // 30 天
});
const forgetResult = forgetter.forget('agent-001');

// 定期维护（自动巩固 + 遗忘）
const maintenance = new MemoryMaintenance({
  consolidator,
  forgetter,
  intervalMs: 300000, // 5 分钟
});
maintenance.start();
maintenance.stop();
```

巩固策略说明：

| 策略 | 说明 |
|------|------|
| `importance` | 按重要性排序，巩固高重要性记忆 |
| `recency` | 按时间排序，巩固最近记忆 |
| `frequency` | 按访问频率排序，巩固高频访问记忆 |
| `hybrid` | 综合以上三个维度（推荐） |

遗忘策略说明：

| 策略 | 说明 |
|------|------|
| `fifo` | 先进先出 |
| `lru` | 最近最少使用 |
| `lfu` | 最少使用频率 |
| `decay` | 时间衰减（推荐） |
| `importance-based` | 基于重要性阈值 |

### 5.5 BudgetController — 预算控制

```typescript
import { BudgetController } from '@aether/model-router';

const budget = new BudgetController(100000); // 每日 10 万 token

// 跟踪用量
await budget.trackUsage({
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  timestamp: Date.now(),
  model: 'mock-small',
  agentId: 'agent-001',
});

// 查询
await budget.checkBudget(500, 'agent-001'); // 检查是否超预算
await budget.getDailyUsage('agent-001');    // 按 Agent
await budget.getDailyUsage();               // 全局
await budget.getDailyBudget('agent-001');
await budget.getBudgetPercentage('agent-001');
await budget.getUsageHistory({ agentId: 'agent-001', limit: 100 });

// 设置/重置
await budget.setDailyBudget(200000, 'agent-001'); // 按 Agent
await budget.setDailyBudget(200000);              // 全局
await budget.resetDaily('agent-001');
```

支持全局预算和按 Agent 预算，超阈值时触发 `budget.warning`（80%）和 `budget.exceeded`（100%）事件。

### 5.6 ModelRouter — 模型路由

```typescript
import { ModelRouter, MockModelProvider } from '@aether/model-router';
import { OpenAIProvider } from '@aether/model-router/providers/openai';

const router = new ModelRouter();

// 注册提供商
router.registerProvider(new MockModelProvider()); // 无需 API Key，用于测试
router.registerProvider(new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
}));

// 路由调用
const response = await router.route(
  {
    messages: [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
    ],
    model: 'mock-small',
    temperature: 0.7,
    maxTokens: 1000,
    tools: [...],       // 可选
    toolChoice: 'auto', // 可选
  },
  { strategy: 'cheapest' }
);

// Embedding
const emb = await router.routeEmbedding({
  input: '要嵌入的文本',
  model: 'text-embedding-3-small',
});

// 查询
router.listProviders();
router.listAllModels();
router.getBestModel({ strategy: 'cheapest', supportsTools: true });
router.getProviderForModel('gpt-4');
router.unregisterProvider('openai');
```

路由策略：

| 策略 | 说明 |
|------|------|
| `cheapest` | 最便宜 |
| `fastest` | 最快 |
| `best-quality` | 最高质量 |
| `balanced` | 平衡（推荐） |
| `manual` | 手动指定 `model` |

内置提供商：

- **MockModelProvider**：`mock-small`（4096 上下文）、`mock-large`（8192 上下文，支持工具）
- **OpenAIProvider**：`gpt-4`、`gpt-4-turbo`、`gpt-3.5-turbo`、`gpt-4o` + 3 个 embedding 模型

### 5.7 McpManager — 工具系统

```typescript
import { McpManager } from '@aether/mcp';

const mcp = new McpManager(); // 自动加载内置工具

// 列出
await mcp.listServers();
await mcp.listAllTools();
await mcp.listTools('server-name');

// 执行工具
const result = await mcp.executeTool('calculate', { expression: '2 + 3 * 4' });
// result: { success, data: { result: 14 }, content, error }

const time = await mcp.executeTool('get_current_time', { timezone: 'Asia/Shanghai' });

// 加载外部服务器（stdio）
await mcp.loadServer({
  name: 'filesystem',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  env: {},
});

await mcp.connectAll();
await mcp.disconnectAll();
await mcp.reloadServer('filesystem');
await mcp.unloadServer('filesystem');
mcp.findTool('calculate');
```

内置工具：

| 工具 | 参数 | 返回 |
|------|------|------|
| `get_current_time` | `timezone?` | `{timestamp, isoString, timezone}` |
| `calculate` | `expression` | `{expression, result}` |
| `echo` | `message` | `{message}` |

### 5.8 TaskScheduler — 任务调度

```typescript
import { TaskScheduler, SqlitePersistence } from '@aether/scheduler';

const scheduler = new TaskScheduler();

// 持久化（可选）
await scheduler.setPersistence(new SqlitePersistence('./data/aether.db'));

// 注册任务处理器
// TaskType: agent_message|agent_start|agent_stop|memory_consolidate|budget_reset|custom
scheduler.registerTaskHandler('custom', async (task) => {
  console.log('执行:', task.name, task.payload);
  return { success: true, data: { done: true } };
});

// 创建任务
const task = await scheduler.schedule({
  name: '每分钟心跳',
  agentId: 'agent-001',
  cron: '* * * * *',
  taskType: 'custom',
  payload: { message: 'ok' },
  enabled: true,
  maxRuns: 5, // 可选，最多执行 5 次
});

// 管理
await scheduler.cancel(task.id);
await scheduler.executeNow(task.id);
await scheduler.enableTask(task.id);
await scheduler.disableTask(task.id);
await scheduler.updateTask(task.id, { name: '新名称', payload: { ... } });
await scheduler.getTask(task.id);

// 查询
const { items, total } = await scheduler.listTasks({
  agentId: 'agent-001',
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});
scheduler.getExecutionHistory(task.id);

// 启停
await scheduler.start();
scheduler.isRunning();
await scheduler.stop();
```

任务状态：`PENDING`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED`。

cron 表达式（5 字段）：

```
┌──────── 分钟 (0-59)
│ ┌────── 小时 (0-23)
│ │ ┌──── 日 (1-31)
│ │ │ ┌── 月 (1-12)
│ │ │ │ ┌ 周 (0-6, 0=周日)
│ │ │ │ │
* * * * *
```

示例：

| 表达式 | 说明 |
|--------|------|
| `* * * * *` | 每分钟 |
| `*/15 * * * *` | 每 15 分钟 |
| `0 9 * * *` | 每天 9:00 |
| `0 9 * * 1-5` | 工作日 9:00 |
| `0 0 1 * *` | 每月 1 日 0:00 |

### 5.9 A2A 通信

#### HTTP 通道（跨进程）

```typescript
import { createHttpChannel } from '@aether/a2a';

const channel = createHttpChannel({
  agentId: 'agent-001',
  port: 0,                    // 0 = 自动分配
  host: '127.0.0.1',
  remoteEndpoints: ['http://127.0.0.1:4000/a2a/message'],
  timeout: 5000,
});

channel.onMessage((message) => {
  console.log('收到:', message);
});

await channel.start();
console.log(channel.getLocalUrl()); // http://127.0.0.1:xxxx/a2a/message

// 单播
await channel.send({ to: 'agent-002', payload: { text: '你好' } });
// 广播
await channel.send({ to: '*', payload: { announcement: '系统更新' } });

channel.registerEndpoint('agent-003', 'http://127.0.0.1:5000/a2a/message');
channel.unregisterEndpoint('agent-003');
await channel.close();
```

#### A2AProtocol（高层 API）

```typescript
import { A2AProtocol } from '@aether/a2a';

const protocol = new A2AProtocol({
  agentId: 'agent-001',
  heartbeatInterval: 30000,
  heartbeatTimeout: 90000,
});

await protocol.registerAgent(card, (message) => { /* 处理 */ });

// 请求-响应
const response = await protocol.request('agent-001', 'agent-002', { query: '...' });
await protocol.respond(originalMessage, { answer: '...' });

// 通知/广播
await protocol.notify('agent-001', 'agent-002', { ... });
await protocol.broadcast('agent-001', { ... });

// 能力发现
const agents = await protocol.queryCapabilities('agent-001', { status: 'online' });
const coders = await protocol.discoverByCapability('coding');

// 心跳
protocol.startHeartbeat('agent-001');
const stale = await protocol.cleanupStaleAgents(false);
protocol.stopHeartbeat();
await protocol.close();
```

### 5.10 SkillManager — 技能系统

内置 5 个技能：`code-assistant`、`tech-writer`、`data-analyst`、`task-automator`、`research-assistant`。

```typescript
import { SkillManager } from '@aether/skills';

const skills = new SkillManager();

// 注册自定义技能
skills.register({
  id: 'my-skill',
  name: '我的技能',
  description: '...',
  category: 'custom', // coding|writing|analysis|research|communication|automation|custom
  systemPrompt: '你是一个...',
  recommendedModel: 'gpt-4',
  recommendedTemperature: 0.3,
  recommendedMaxTokens: 2000,
  requiredTools: ['calculate'],
  requiredPermissions: ['fs.read'],
  examples: ['示例 1'],
  version: '1.0.0',
  author: 'me',
  tags: ['demo'],
});

// 查询
skills.getSkill('my-skill');
skills.listSkills();              // 全部
skills.listSkills('coding');      // 按分类
skills.searchSkills('编程');

// 加载到 Agent
await skills.loadSkill('agent-001', 'my-skill');
skills.getAgentSkills('agent-001');
const prompt = skills.buildSystemPrompt('agent-001');
const tools = skills.getRequiredTools('agent-001');
skills.recordUsage('agent-001', 'my-skill');
await skills.unloadSkill('agent-001', 'my-skill');
skills.unregister('my-skill');
```

### 5.11 可观测性（日志/指标/追踪）

#### Logger

```typescript
import {
  logManager,
  getLogger,
  ConsoleLogAppender,
  MemoryLogAppender,
} from '@aether/observability';

// 全局配置
logManager.addAppender(new ConsoleLogAppender());
logManager.setLevel('INFO'); // DEBUG|INFO|WARN|ERROR|FATAL

// 获取 logger
const logger = getLogger('my-app');
logger.setAgentId('agent-001');
logger.setTraceId('trace-xxx');

logger.info('启动', { extra: 'data' });
logger.warn('警告');
logger.error('错误', new Error('boom'));
logger.fatal('致命');

// 子 logger
const child = logger.child('submodule');

// 内存 appender（用于测试）
const memAppender = new MemoryLogAppender(1000);
```

#### Metrics

```typescript
import { metricsRegistry } from '@aether/observability';

// Counter（只增）
const counter = metricsRegistry.counter('requests_total', '总请求数');
counter.inc(1, { method: 'GET', status: '200' });
counter.get({ method: 'GET', status: '200' }); // 2

// Gauge（可增可减）
const gauge = metricsRegistry.gauge('active_agents', '活跃 Agent 数');
gauge.set(5);
gauge.inc();
gauge.dec(2);

// Histogram（分布）
const hist = metricsRegistry.histogram('response_time_ms', '响应时间', {
  buckets: [10, 50, 100, 500, 1000],
});
hist.observe(42, { endpoint: '/api/agents' });
hist.getQuantile(0.95, { endpoint: '/api/agents' });
hist.getStats({ endpoint: '/api/agents' });

// 导出 Prometheus 格式
const promText = metricsRegistry.export();
```

#### Tracer

```typescript
import { tracer, traced } from '@aether/observability';

// 手动 span
const trace = tracer.startTrace('handle-request', 'agent-001');
const span = tracer.startSpan('call-model', tracer.getCurrentContext(), 'agent-001');
tracer.setTag(span.id, 'model', 'gpt-4');
tracer.log(span.id, '开始调用');
try {
  // ... 业务
  tracer.finishSpan(span.id);
} catch (e) {
  tracer.finishSpan(span.id, e as Error);
}

// 装饰器（推荐）
const result = await traced('my-operation', async (span) => {
  tracer.setTag(span.id, 'key', 'value');
  return 'done';
}, { agentId: 'agent-001' });
```

---

## 6. 配置文件

### 6.1 配置文件路径

默认路径：`~/.aether/config.json`

```bash
aether config path  # 查看实际路径
```

### 6.2 配置项

```typescript
interface UserConfig {
  outputFormat?: 'text' | 'json';   // 输出格式
  color?: boolean;                   // 彩色输出
  quiet?: boolean;                   // 静默模式
  verbose?: boolean;                 // 详细输出
  defaultModel?: string;             // 默认模型
  defaultAgentId?: string;           // 默认 Agent ID
  providers?: {                      // 模型提供商
    openai?: { apiKey?: string; baseURL?: string };
    anthropic?: { apiKey?: string };
    ollama?: { baseURL?: string };
  };
  mcpServers?: Record<string, {      // MCP 服务器
    type: 'stdio' | 'http' | 'sse' | 'local';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled?: boolean;
  }>;
  dataDir?: string;                  // 数据目录
}
```

### 6.3 配置示例

`~/.aether/config.json`：

```json
{
  "outputFormat": "text",
  "color": true,
  "defaultModel": "gpt-4",
  "defaultAgentId": "default",
  "providers": {
    "openai": { "apiKey": "sk-xxx" },
    "ollama": { "baseURL": "http://localhost:11434" }
  },
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true
    }
  },
  "dataDir": "./data"
}
```

### 6.4 环境变量

| 变量名 | 说明 |
|--------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `OLLAMA_BASE_URL` | Ollama 服务地址 |

---

## 7. 示例脚本

项目提供 8 个示例脚本，位于 `examples/` 和 `docs/examples/` 目录。

### 7.1 `basic-agent.ts` — 基础集成（推荐入门）

演示 ProcessManager + MemoryManager + ModelRouter + BudgetController + McpManager 完整初始化。

```bash
npx tsx examples/basic-agent.ts
```

涵盖：事件监听、创建 Agent、添加短期/长期记忆、搜索记忆、调用 mock 模型、记录预算、执行 MCP 工具、暂停/恢复/停止 Agent。

### 7.2 `run-agent-demo.ts` — AgentRuntime 验证

测试工具调用循环、AgentRuntimeManager、SkillManager、可观测性集成。

```bash
npx tsx examples/run-agent-demo.ts
```

### 7.3 `memory-system-demo.ts` — 记忆系统

演示自定义 embedding 函数、短期记忆、巩固、长期记忆、向量检索。

```bash
npx tsx examples/memory-system-demo.ts
```

### 7.4 `monitor-agent-demo.ts` — 后台监控 Agent

演示 ProcessManager + TaskScheduler + BudgetController 集成，含自定义任务处理器、定时任务、预算警告。

```bash
npx tsx examples/monitor-agent-demo.ts
```

### 7.5 `custom-skill-demo.ts` — 自定义 MCP 工具

创建 3 个自定义工具：`text_processor`、`data_store`、`weather_mock`。

```bash
npx tsx examples/custom-skill-demo.ts
```

### 7.6 `start-web.ts` — 启动 Web UI

```bash
npx tsx examples/start-web.ts
# 访问 http://127.0.0.1:3456
```

### 7.7 `docs/examples/scheduler-demo.ts` — 任务调度

演示 3 个任务处理器、4 种 cron 任务、重试（指数退避）、执行历史。

```bash
npx tsx docs/examples/scheduler-demo.ts
```

### 7.8 `monitor-agent.ts` — 监控 Agent 类封装

展示如何将监控能力封装为可复用类。

```bash
npx tsx examples/monitor-agent.ts
```

---

## 8. 事件总线

Aether OS 提供 `globalEventBus`，支持 30+ 种事件。

```typescript
import { globalEventBus, EVENTS } from '@aether/shared';

// 监听事件
globalEventBus.on(EVENTS.AGENT_STARTED, (agentId, timestamp) => {
  console.log(`Agent ${agentId} 已启动`);
});

globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, agentId) => {
  console.log(`记忆 ${memoryId} 已添加给 Agent ${agentId}`);
});

globalEventBus.on(EVENTS.BUDGET_WARNING, (used, budget, percentage) => {
  console.log(`预算警告: ${used}/${budget} (${percentage}%)`);
});

globalEventBus.on(EVENTS.MCP_TOOL_CALLED, (toolName, serverName, timestamp) => {
  console.log(`工具 ${toolName} 被调用`);
});

// 触发事件（通常由内部组件触发，用户一般不需要手动触发）
globalEventBus.emit(EVENTS.AGENT_STATUS_CHANGED, agentId, oldStatus, newStatus, timestamp);
```

主要事件类别：

| 类别 | 事件常量 | 说明 |
|------|---------|------|
| Agent | `AGENT_STARTED`、`AGENT_PAUSED`、`AGENT_RESUMED`、`AGENT_STOPPED`、`AGENT_ERROR`、`AGENT_STATUS_CHANGED` | Agent 生命周期 |
| Memory | `MEMORY_ADDED`、`MEMORY_DELETED`、`MEMORY_CLEARED` | 记忆变更 |
| Model | `MODEL_REQUEST`、`MODEL_RESPONSE`、`MODEL_ERROR` | 模型调用 |
| Budget | `BUDGET_WARNING`、`BUDGET_EXCEEDED` | 预算告警 |
| MCP | `MCP_TOOL_CALLED`、`MCP_TOOL_RESULT`、`MCP_TOOL_ERROR`、`MCP_SERVER_CONNECTED`、`MCP_SERVER_DISCONNECTED` | 工具系统 |
| Scheduler | `SCHEDULER_TASK_CREATED`、`SCHEDULER_TASK_CANCELLED`、`SCHEDULER_TASK_EXECUTED`、`SCHEDULER_TASK_ERROR` | 任务调度 |

---

## 9. 常见问题（FAQ）

### Q1: 安装时 `better-sqlite3` 编译失败？

`@aether/memory` 和 `@aether/scheduler` 依赖 `better-sqlite3` 原生模块。需要：

- Node.js >= 18
- Python 3.x
- 编译工具链（Linux: `build-essential`，macOS: Xcode Command Line Tools，Windows: `windows-build-tools`）

```bash
# Ubuntu/Debian
sudo apt-get install python3 build-essential

# 重新安装
pnpm rebuild better-sqlite3
```

### Q2: TypeScript 编译报 `baseUrl` 弃用警告？

TS 5.9.3+ 中 `baseUrl` 已弃用。项目已在 `tsconfig.base.json` 中移除该配置，各包通过自己的 `tsconfig.json` 的 `paths` 解析包路径。

### Q3: import 必须带 `.js` 后缀？

项目使用 ESM (NodeNext) 模块解析，所有相对 import 必须带 `.js` 扩展名（即使源文件是 `.ts`）：

```typescript
// 正确
import { ProcessManager } from './process-manager.js';

// 错误
import { ProcessManager } from './process-manager';
```

### Q4: 如何使用真实 OpenAI 模型而非 Mock？

```typescript
import { ModelRouter, OpenAIProvider } from '@aether/model-router';

const router = new ModelRouter();
router.registerProvider(new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY, // 设置环境变量
}));

// 使用真实模型
const response = await router.route({
  messages: [{ role: 'user', content: '你好' }],
  model: 'gpt-4',
});
```

或通过配置文件 `~/.aether/config.json`：

```json
{
  "providers": {
    "openai": { "apiKey": "sk-xxx" }
  }
}
```

### Q5: 如何持久化任务和记忆？

```typescript
import { SqlitePersistence } from '@aether/scheduler';

const scheduler = new TaskScheduler();
await scheduler.setPersistence(new SqlitePersistence('./data/aether.db'));
await scheduler.start();
```

SQLite 会创建 4 张表：`agents`、`memories`、`tasks`、`token_usage`。

### Q6: Agent 停止后能重启吗？

不能。`stopAgent` 是终态操作。如需重新运行，请创建新 Agent：

```typescript
await pm.stopAgent(agent.id);     // 终态
const newAgent = await pm.createAgent('new-agent', { ... });
await pm.startAgent(newAgent.id);
```

### Q7: 如何自定义 embedding 函数？

```typescript
import { LongTermMemory } from '@aether/memory';

// 自定义确定性 embedding（示例）
const customEmbedding = async (text: string): Promise<number[]> => {
  const vec = new Array(256).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 256] += text.charCodeAt(i) / 1000;
  }
  return vec;
};

const ltm = new LongTermMemory({ embeddingFn: customEmbedding });
```

### Q8: Web UI 如何跨域访问？

Web 服务器已内置 CORS 支持，SSE 端点设置 `Access-Control-Allow-Origin: *`。如需更严格的 CORS 配置，可在反向代理（如 nginx）层处理。

### Q9: 如何监控 Agent 的 token 消耗？

```typescript
// 方式一：BudgetController
const usage = await budget.getDailyUsage('agent-001');
console.log(`已用: ${usage.totalTokens} tokens`);

// 方式二：事件监听
globalEventBus.on(EVENTS.BUDGET_WARNING, (used, budget, pct) => {
  console.log(`警告: ${pct}% 已使用`);
});

// 方式三：Web API
curl http://localhost:3000/api/budget
```

### Q10: 如何运行测试？

```bash
# 全部测试
pnpm test

# 监听模式
pnpm test:watch

# 单个包测试
cd packages/core && pnpm test

# 查看测试覆盖率
pnpm test -- --coverage
```

---

## 附录：技术速查表

| 主题 | 要点 |
|------|------|
| 模块系统 | TypeScript strict + ESM (NodeNext)，import 须带 `.js` 后缀 |
| Agent 状态机 | IDLE → RUNNING → (PAUSED ↔ RUNNING) → STOPPED / ERROR |
| 记忆类型 | 短期（FIFO 淘汰）+ 长期（向量检索，关键词匹配降级） |
| 巩固策略 | importance / recency / frequency / hybrid |
| 遗忘策略 | fifo / lru / lfu / decay / importance-based |
| 模型路由 | cheapest / fastest / best-quality / balanced / manual |
| cron 表达式 | 5 字段（分 时 日 月 周），支持 `*`、范围、列表、步长 |
| 持久化 | SQLite（better-sqlite3），4 张表 |
| A2A 通信 | 本地通道（同进程）+ HTTP 通道（跨进程） |
| 可观测性 | Logger + Metrics（Prometheus）+ Tracer |
| 事件总线 | globalEventBus，30+ 种事件 |
| 内置 MCP 工具 | get_current_time、calculate、echo |
| 内置技能 | code-assistant、tech-writer、data-analyst、task-automator、research-assistant |

---

**文档结束**。如有疑问或发现问题，请提交 [GitHub Issue](https://github.com/worldop123/aether-os/issues)。
