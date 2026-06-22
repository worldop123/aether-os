<div align="center">

# Aether OS

### Agent 原生操作系统

**让 AI Agent 从"一次性的对话程序"变成"24 小时在线的数字员工"**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/worldop123/aether-os/actions/workflows/ci.yml/badge.svg)](https://github.com/worldop123/aether-os/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-735%20passed-brightgreen.svg)](#测试)
[![Packages](https://img.shields.io/badge/packages-11-blue.svg)](#包结构)
[![Discussions](https://img.shields.io/badge/Discussions-welcome-9cf.svg)](https://github.com/worldop123/aether-os/discussions)

</div>

---

## 目录

- [简介](#简介)
- [特性](#特性)
- [快速开始](#快速开始)
- [包结构](#包结构)
- [核心概念](#核心概念)
- [使用示例](#使用示例)
- [CLI 命令](#cli-命令)
- [Web UI](#web-ui)
- [配置](#配置)
- [测试](#测试)
- [架构文档](#架构文档)
- [贡献](#贡献)
- [许可证](#许可证)

## 简介

Aether OS 是一个面向 AI Agent 的有状态运行时操作系统。它管理 Agent 的生命周期、资源调度、记忆存储、进程隔离，让 Agent 从"一次性的对话程序"变成"24 小时在线的数字员工"。

### 设计理念

1. **本地优先（Local-first）**：默认在本地运行，数据属于用户
2. **渐进式复杂度**：简单的事情简单做，复杂的事情可以做
3. **标准兼容**：拥抱 MCP、A2A 等标准，不造轮子
4. **可观测性**：系统内部状态必须可观察、可调试
5. **安全默认**：安全是默认选项，不是可选功能

## 特性

### 核心能力

- **Agent 生命周期管理** - 创建、启动、暂停、恢复、停止 Agent
- **进程隔离** - ProcessManager 管理多个独立 Agent
- **记忆系统** - 短期记忆 + 长期记忆（支持向量检索）
- **模型路由** - 支持 OpenAI / Anthropic / Ollama / Mock 提供商
- **预算控制** - Token 使用跟踪和预算限制
- **MCP 工具系统** - 内置工具 + 外部 MCP 服务器连接（stdio）
- **任务调度** - 完整 cron 语法 + SQLite 持久化
- **事件驱动** - 所有模块通过 EventBus 通信

### 高级功能

- **Agent 间通信（A2A）** - Agent 发现、消息传递、请求-响应模式
- **安全沙箱** - 基于 node:vm 的代码隔离 + 14 种权限控制 + 审计日志
- **工作流编排** - DAG 式工作流，支持条件分支、并行执行、循环、重试
- **Web UI** - 可视化管理界面，REST API + SSE 事件流
- **CLI 工具** - 彩色输出、进度条、交互模式、配置文件

## 快速开始

### 环境要求

- **Node.js** >= 18.0.0（推荐 20+）
- **pnpm** >= 9.0.0

### 安装

```bash
# 克隆仓库
git clone https://github.com/worldop123/aether-os.git
cd aether-os

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行所有测试（可选，验证环境）
pnpm test
```

### 第一个 Agent

```bash
# 创建 Agent
node packages/cli/dist/cli.js agent create --name my-agent

# 启动 Agent
node packages/cli/dist/cli.js agent start --id <agent-id>

# 查看状态
node packages/cli/dist/cli.js agent list

# 与 Agent 对话
node packages/cli/dist/cli.js chat --message "你好"

# 交互模式
node packages/cli/dist/cli.js chat -i
```

### 编程方式使用

```typescript
import { ProcessManager, AgentStatus } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';

// 初始化组件
const processManager = new ProcessManager();
const memoryManager = new MemoryManager();
const budgetController = new BudgetController({ dailyBudget: 100000 });
const modelRouter = new ModelRouter();
modelRouter.registerProvider(new MockModelProvider());

// 创建并启动 Agent
const agent = processManager.createAgent({
  name: 'my-agent',
  description: '我的第一个 Agent',
});
processManager.startAgent(agent.id);

// 添加记忆
memoryManager.addMessage(agent.id, {
  role: 'user',
  content: '记住：用户喜欢 Python',
});

// 巩固到长期记忆
await memoryManager.consolidateToLongTerm(agent.id);

// 搜索记忆
const results = await memoryManager.searchLongTerm(agent.id, '编程语言偏好');
console.log(results);
```

## 包结构

Aether OS 采用 monorepo 架构，包含 11 个包：

| 包 | 说明 | 状态 |
|---|---|---|
| [@aether/shared](./packages/shared) | 共享模块（常量、错误类、事件总线、工具函数） | ✅ 稳定 |
| [@aether/core](./packages/core) | 核心模块（Agent 类、ProcessManager） | ✅ 稳定 |
| [@aether/memory](./packages/memory) | 记忆系统（短期记忆、长期记忆、向量检索） | ✅ 稳定 |
| [@aether/model-router](./packages/model-router) | 模型路由（OpenAI/Anthropic/Ollama + 预算控制） | ✅ 稳定 |
| [@aether/mcp](./packages/mcp) | MCP 工具系统（内置工具 + stdio 客户端） | ✅ 稳定 |
| [@aether/scheduler](./packages/scheduler) | 任务调度（完整 cron + SQLite 持久化） | ✅ 稳定 |
| [@aether/cli](./packages/cli) | 命令行工具（彩色输出 + 交互模式） | ✅ 稳定 |
| [@aether/a2a](./packages/a2a) | Agent 间通信（发现 + 消息传递） | 🚧 实验性 |
| [@aether/sandbox](./packages/sandbox) | 安全沙箱（权限控制 + 审计日志） | 🚧 实验性 |
| [@aether/workflow](./packages/workflow) | 工作流编排（DAG + 条件分支 + 并行） | 🚧 实验性 |
| [@aether/web](./packages/web) | Web UI（REST API + 管理界面） | 🚧 实验性 |

## 核心概念

### Agent

Agent 是 Aether OS 的核心实体。每个 Agent 有独立的状态、记忆和生命周期。

```typescript
import { ProcessManager, AgentStatus } from '@aether/core';

const processManager = new ProcessManager();

// 创建 Agent
const agent = processManager.createAgent({
  name: 'assistant',
  description: '个人助手',
  model: 'gpt-4',
});

// 生命周期管理
processManager.startAgent(agent.id);    // IDLE -> RUNNING
processManager.pauseAgent(agent.id);    // RUNNING -> PAUSED
processManager.resumeAgent(agent.id);   // PAUSED -> RUNNING
processManager.stopAgent(agent.id);     // -> STOPPED
```

### 记忆系统

记忆系统分为短期记忆和长期记忆：

```typescript
import { MemoryManager } from '@aether/memory';
import { VectorMemoryManager } from '@aether/memory';
import { MockModelProvider } from '@aether/model-router';

// 基础用法
const memory = new MemoryManager();

// 带向量检索的高级用法
const vectorMemory = new VectorMemoryManager({
  provider: new MockModelProvider(),
});

// 添加短期记忆
memory.addMessage(agentId, {
  role: 'user',
  content: '我喜欢用 TypeScript',
});

// 巩固到长期记忆
await memory.consolidateToLongTerm(agentId);

// 搜索长期记忆
const results = await memory.searchLongTerm(agentId, '编程语言');
```

### 模型路由

支持多种模型提供商，可按策略自动选择：

```typescript
import { ModelRouter, OpenAIProvider, AnthropicProvider, OllamaProvider } from '@aether/model-router';

const router = new ModelRouter();

// 注册提供商
router.registerProvider(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }));
router.registerProvider(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
router.registerProvider(new OllamaProvider({ baseURL: 'http://localhost:11434' }));

// 按策略路由
const response = await router.route({
  messages: [{ role: 'user', content: '你好' }],
  strategy: 'cheapest', // cheapest | fastest | best-quality | balanced
});
```

### MCP 工具系统

支持内置工具和外部 MCP 服务器：

```typescript
import { McpManager } from '@aether/mcp';

const manager = new McpManager();

// 使用内置工具
const result = await manager.executeTool('calculate', { expression: '1 + 2 * 3' });

// 连接外部 MCP 服务器（stdio 模式）
await manager.loadServer('filesystem', {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
});

// 调用远程工具
const tools = manager.listAllTools();
```

### 任务调度

支持完整 cron 语法的定时任务：

```typescript
import { TaskScheduler } from '@aether/scheduler';
import { SqlitePersistence } from '@aether/scheduler';

const scheduler = new TaskScheduler();

// 可选：接入 SQLite 持久化
const persistence = new SqlitePersistence({ dbPath: './aether.db' });
await persistence.initialize();
scheduler.setPersistence(persistence);

// 注册任务处理器
scheduler.registerTaskHandler('monitor', async (task) => {
  console.log('执行监控任务:', task.id);
});

// 添加定时任务（完整 cron 语法）
const task = await scheduler.schedule({
  name: '每小时监控',
  agentId: 'agent-1',
  cron: '0 * * * *',        // 每小时整点
  type: 'monitor',
  handler: 'monitor',
  payload: { url: 'https://example.com' },
});

// 启动调度器
scheduler.start();
```

### Agent 间通信（A2A）

```typescript
import { A2AProtocol, createAgentCard } from '@aether/a2a';

const protocol = new A2AProtocol();

// 注册 Agent
const card = createAgentCard({
  name: 'researcher',
  capabilities: [{ name: 'search', description: '搜索能力' }],
});
await protocol.registerAgent(card);

// 发送请求并等待响应
const response = await protocol.request(
  'agent-1',
  'agent-2',
  { query: '今天天气如何？' },
  5000 // 超时
);
```

### 安全沙箱

在隔离环境中执行不受信任的代码：

```typescript
import { SkillSandbox, PermissionPolicy } from '@aether/sandbox';

const policy: PermissionPolicy = {
  default: 'deny',
  rules: [
    { permission: 'time', allowed: true },
    { permission: 'random', allowed: true },
    { permission: 'fs.read', allowed: true, resources: ['/tmp/safe/**'] },
  ],
  limits: { maxTimeoutMs: 5000 },
};

const sandbox = new SkillSandbox({ policy });

const result = await sandbox.execute(
  { skillId: 'untrusted-skill', policy },
  'return 1 + 2;',
  {}
);
```

### 工作流编排

```typescript
import { WorkflowBuilder, WorkflowExecutor } from '@aether/workflow';

const workflow = new WorkflowBuilder('data-pipeline')
  .task('fetch', '获取数据', async (input) => {
    return { data: [1, 2, 3] };
  })
  .task('process', '处理数据', async (input: any) => {
    return input.data.map((x: number) => x * 2);
  })
  .condition('check', '检查结果', async (input: any) => input.length > 0)
  .task('save', '保存结果', async (input) => `saved ${input.length} items`)
  .edge('fetch', 'process')
  .edge('process', 'check')
  .edge('check', 'save', 'true')
  .retry('fetch', { maxAttempts: 3, delayMs: 100 })
  .build();

const executor = new WorkflowExecutor();
const result = await executor.execute(workflow, {});
```

## 使用示例

项目包含 3 个完整示例：

| 示例 | 说明 |
|---|---|
| [monitor-agent-demo.ts](./examples/monitor-agent-demo.ts) | 后台监控 Agent（定时任务 + 记忆 + 预算控制） |
| [memory-system-demo.ts](./examples/memory-system-demo.ts) | 记忆系统完整示例（向量检索 + 语义相似度） |
| [custom-skill-demo.ts](./examples/custom-skill-demo.ts) | 自定义 Skill（MCP 工具 + 链式调用） |

运行示例：

```bash
# 使用 tsx 运行（推荐）
pnpm dlx tsx examples/memory-system-demo.ts

# 或编译后运行
npx tsc --outDir dist examples/memory-system-demo.ts
node dist/memory-system-demo.js
```

## CLI 命令

```bash
# 查看帮助
aether --help

# Agent 管理
aether agent list
aether agent create --name <name>
aether agent start --id <id>
aether agent stop --id <id>
aether agent status --id <id>

# 记忆管理
aether memory list --agent <id>
aether memory add --agent <id> --content "内容"
aether memory search --agent <id> --query "关键词"

# 预算控制
aether budget status
aether budget set --amount 100000

# MCP 工具
aether mcp servers
aether mcp tools
aether mcp run --tool calculate --args '{"expression":"1+2"}'

# 任务调度
aether schedule list
aether schedule add --name <name> --cron "0 * * * *" --type <type>

# 对话
aether chat --message "你好"
aether chat -i  # 交互模式

# 配置管理
aether config list
aether config get defaultModel
aether config set defaultModel gpt-4

# Web UI
aether web --port 3000
```

## Web UI

启动 Web 管理界面：

```bash
aether web --port 3000
# 然后访问 http://localhost:3000
```

Web UI 提供：
- **Dashboard** - 系统概览
- **Agents** - Agent 管理界面
- **Memories** - 记忆查看和搜索
- **Budget** - 预算状态
- **MCP** - 工具管理
- **Schedules** - 任务调度
- **SSE 事件流** - 实时事件推送

REST API 文档见 [packages/web/README.md](./packages/web/)。

## 配置

配置文件位于 `~/.aether/config.json`：

```json
{
  "defaultModel": "gpt-4",
  "defaultAgentId": "agent-1",
  "color": true,
  "format": "text",
  "providers": {
    "openai": {
      "apiKey": "your-api-key"
    },
    "anthropic": {
      "apiKey": "your-api-key"
    },
    "ollama": {
      "baseURL": "http://localhost:11434"
    }
  },
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true
    }
  },
  "dataDir": "~/.aether/data"
}
```

环境变量：

| 变量 | 说明 |
|---|---|
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `OLLAMA_BASE_URL` | Ollama 服务地址（默认 http://localhost:11434） |

## 测试

```bash
# 运行所有测试
pnpm test

# 运行单个包的测试
pnpm --filter @aether/core test

# 监听模式
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage
```

当前测试状态：
- **735 个测试全部通过**
- **25 个测试文件**
- 覆盖所有 11 个包

## 架构文档

详细的架构设计见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

### 技术栈

- **语言**：TypeScript（strict 模式）
- **包管理**：pnpm（monorepo workspace）
- **测试**：Vitest
- **事件驱动**：Node.js EventEmitter
- **数据库**：SQLite（better-sqlite3）
- **模块系统**：ESM（NodeNext）

### 事件系统

所有模块通过 `globalEventBus` 通信，事件名定义在 `@aether/shared` 的 `EVENTS` 中。共定义了 30+ 种事件，涵盖 Agent 生命周期、记忆、模型路由、MCP、调度、A2A、沙箱、工作流等。

## 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与。

- 报告 Bug：[GitHub Issues](https://github.com/worldop123/aether-os/issues)
- 讨论想法：[GitHub Discussions](https://github.com/worldop123/aether-os/discussions)
- 贡献代码：[Pull Request](https://github.com/worldop123/aether-os/pulls)

### 贡献者

<a href="https://github.com/worldop123/aether-os/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=worldop123/aether-os" />
</a>

## 路线图

### 已完成 ✅

- [x] 7 个核心包（shared/core/memory/model-router/mcp/scheduler/cli）
- [x] 真实模型提供商（OpenAI/Anthropic/Ollama）
- [x] SQLite 持久化
- [x] 真实 MCP 服务器连接（stdio）
- [x] 向量记忆检索
- [x] CLI 完善（彩色输出/进度条/交互模式/配置文件）
- [x] Agent 间通信（A2A）
- [x] 安全沙箱
- [x] 工作流编排
- [x] Web UI

### 计划中 🚀

- [ ] HTTP/SSE 模式的 MCP 服务器连接
- [ ] 真正的向量数据库集成（如 sqlite-vss）
- [ ] 分布式 Agent 部署
- [ ] 插件市场
- [ ] 更多语言 SDK（Python/Go）

## 许可证

[MIT License](./LICENSE) © 2026 Aether OS Contributors

---

<div align="center">

**如果这个项目对你有帮助，请给个 Star ⭐**

</div>
