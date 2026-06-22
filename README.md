# Aether OS

> 下一代 AI Agent 操作系统 - MVP 版本

Aether OS 是一个模块化的 AI Agent 运行时系统，采用事件驱动架构，支持多 Agent 管理、记忆系统、模型路由、MCP 工具集成和定时任务调度。

## 项目结构

```
aether-os/
├── packages/
│   ├── core/              # 核心模块：Agent 生命周期管理、进程管理
│   ├── memory/            # 记忆系统：短期记忆 + 长期向量记忆
│   ├── model-router/      # 模型路由 + 预算控制
│   ├── mcp/               # MCP 工具加载与调用
│   ├── scheduler/         # 定时任务 + 状态持久化
│   ├── cli/               # 命令行工具
│   └── shared/            # 共享工具、错误处理、常量、事件总线
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## 技术栈

- **TypeScript** - 类型安全的 JavaScript
- **pnpm** - 快速的包管理器，支持 monorepo
- **SQLite + better-sqlite3** - 轻量级持久化存储
- **Vitest** - 现代化的测试框架
- **EventEmitter** - 事件驱动架构

## 模块说明

### @aether/shared

共享模块，包含所有包共用的基础类型、错误类、常量和事件总线。

**主要内容：**
- 错误类体系（AetherError, AgentError, MemoryError 等）
- 系统常量（事件名、状态枚举、默认配置）
- 事件总线基类（EventBus）
- 通用工具类型和函数

### @aether/core

核心模块，负责 Agent 的生命周期管理。

**主要接口：**
- `IAgent` - Agent 接口
- `IProcessManager` - 进程管理器
- `AgentStatus` - Agent 状态枚举

### @aether/memory

记忆系统模块，提供短期记忆和长期向量记忆能力。

**主要接口：**
- `IShortTermMemory` - 短期记忆
- `ILongTermMemory` - 长期记忆（向量检索）
- `IMemoryManager` - 记忆管理器

### @aether/model-router

模型路由模块，负责多模型提供商的统一接入和智能路由。

**主要接口：**
- `IModelProvider` - 模型提供商接口
- `IModelRouter` - 模型路由器
- `IBudgetController` - 预算控制器

### @aether/mcp

MCP（Model Context Protocol）工具系统模块。

**主要接口：**
- `IMcpTool` - MCP 工具接口
- `IMcpServer` - MCP 服务器接口
- `IMcpManager` - MCP 管理器

### @aether/scheduler

定时任务与持久化模块。

**主要接口：**
- `ITaskScheduler` - 任务调度器
- `IPersistence` - 持久化接口
- `IScheduledTask` - 定时任务

### @aether/cli

命令行工具模块，提供交互式和脚本式的系统操作。

**主要命令：**
- `agent` - Agent 管理（start/stop/pause/list）
- `memory` - 记忆管理（search）
- `budget` - 预算管理（status）
- `mcp` - MCP 工具管理（list）
- `schedule` - 定时任务管理（add/list）

## 开发规范

### 代码风格

- 使用 TypeScript strict 模式
- 所有公共接口必须有 JSDoc 注释
- 接口命名使用 `I` 前缀（如 `IAgent`）
- 类型和接口使用 PascalCase
- 变量和函数使用 camelCase

### 事件驱动设计

所有模块都基于事件驱动架构：

```typescript
import { EventBus } from '@aether/shared';

// 定义事件类型
interface MyEvents {
  'something.happened': [data: string, timestamp: number];
}

// 使用事件总线
const bus = new EventBus<MyEvents>();
bus.on('something.happened', (data, timestamp) => {
  console.log(data, timestamp);
});
bus.emit('something.happened', 'hello', Date.now());
```

### 插件化设计

系统采用插件化设计，便于扩展：

- **模型提供商**：实现 `IModelProvider` 接口即可接入新的模型服务
- **存储后端**：实现 `IPersistence` 接口即可替换存储方案
- **MCP 服务器**：通过配置即可加载新的 MCP 工具服务器

### 包依赖关系

```
cli
├── core
├── memory
├── model-router
├── mcp
├── scheduler
└── shared

core
└── shared

memory
└── shared

model-router
└── shared

mcp
└── shared

scheduler
├── core
└── shared

shared (无依赖)
```

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建所有包

```bash
pnpm build
```

### 运行测试

```bash
pnpm test
```

### 清理构建产物

```bash
pnpm clean
```

## CLI 使用示例

### 查看帮助

```bash
# 查看全局帮助
aether --help

# 查看命令帮助
aether agent --help
```

### Agent 管理

```bash
# 列出所有 Agent
aether agent list

# 创建新 Agent
aether agent create --name my-agent

# 启动 Agent
aether agent start --id agent-123

# 停止 Agent
aether agent stop --id agent-123

# 查看 Agent 状态
aether agent status --id agent-123
```

### 记忆管理

```bash
# 添加记忆
aether memory add --content "用户喜欢蓝色" --type preference

# 搜索记忆
aether memory search --query "用户偏好"

# 列出所有记忆
aether memory list
```

### 预算管理

```bash
# 查看预算状态
aether budget status

# 设置每日预算
aether budget set --amount 50000

# 重置今日使用量
aether budget reset
```

### MCP 工具管理

```bash
# 列出所有服务器
aether mcp servers

# 列出所有工具
aether mcp tools

# 执行工具
aether mcp run --tool calculate --args '{"expression": "2 + 2"}'
```

### 定时任务管理

```bash
# 列出所有任务
aether schedule list

# 添加定时任务
aether schedule add --name "每日报告" --agent agent-1 --cron "0 9 * * *" --type custom

# 取消任务
aether schedule cancel --id task-123

# 立即执行任务
aether schedule run --id task-123
```

## 示例代码

项目包含完整的示例代码，位于 `examples/` 目录：

- **monitor-agent.ts** - 监控 Agent 示例，展示如何使用所有核心功能

### 运行示例

```bash
# 构建项目
pnpm build

# 运行示例
node examples/monitor-agent.js
```

## 开发流程

### 新增一个包

1. 在 `packages/` 下创建新目录
2. 创建 `package.json`，命名为 `@aether/<name>`
3. 创建 `tsconfig.json`，继承根目录配置
4. 在 `src/` 下编写代码
5. 在 `src/index.ts` 中导出公共 API

### 新增接口

1. 在对应包的 `src/` 下创建类型文件
2. 使用 JSDoc 注释说明用途
3. 在 `index.ts` 中导出
4. 如其他包需要使用，在对应包的 `package.json` 中添加依赖

## MVP 阶段目标

- [x] 项目骨架和接口定义
- [x] 核心 Agent 生命周期管理
- [x] 短期记忆实现
- [x] 长期记忆实现（子字符串匹配，MVP 简化版）
- [x] 基础模型路由（单提供商）
- [x] MCP 基础支持（本地工具服务器）
- [x] SQLite 持久化
- [x] 基础 CLI 命令
- [x] 单元测试覆盖（290+ 测试全部通过）
- [x] 事件驱动架构
- [x] 预算控制
- [x] 定时任务调度

## 后续规划

- [ ] 向量数据库集成（真实向量检索）
- [ ] 多模型智能路由（基于成本/质量/速度）
- [ ] 更丰富的 MCP 服务器支持
- [ ] Web UI 管理界面
- [ ] 插件市场
- [ ] 多租户支持
- [ ] 分布式部署支持

## 许可证

MIT
