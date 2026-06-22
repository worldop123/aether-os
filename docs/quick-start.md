# Aether OS 快速开始指南

本指南将帮助你快速上手 Aether OS，从安装到运行第一个 Agent。

## 前置要求

在开始之前，请确保你的系统已安装以下软件：

- **Node.js** >= 18.x (推荐 v22.x)
- **pnpm** >= 8.x (推荐 v11.x)
- **Git**

## 第一步：安装依赖

### 1.1 克隆项目

```bash
git clone https://github.com/your-org/aether-os.git
cd aether-os
```

### 1.2 安装依赖

```bash
pnpm install
```

这会安装所有包的依赖，包括开发依赖。

### 1.3 构建所有包

```bash
pnpm build
```

这会按依赖顺序构建所有 7 个包。

### 1.4 运行测试（可选）

```bash
pnpm test
```

确认所有测试都通过（应该有 300+ 个测试全部通过）。

## 第二步：使用 CLI

### 2.1 查看帮助

```bash
# 查看全局帮助
pnpm cli --help

# 查看子命令帮助
pnpm cli agent --help
pnpm cli memory --help
```

### 2.2 管理 Agent

#### 创建一个 Agent

```bash
pnpm cli agent create --name my-first-agent
```

输出示例：
```
✅ Agent 创建成功
┌─────────────────────────────────────────┐
│ ID: agent_abc123                        │
│ 名称: my-first-agent                    │
│ 状态: running                           │
│ 创建时间: 2024-01-01T00:00:00.000Z     │
└─────────────────────────────────────────┘
```

#### 列出所有 Agent

```bash
pnpm cli agent list
```

#### 查看 Agent 状态

```bash
pnpm cli agent status --id agent_abc123
```

#### 暂停 Agent

```bash
pnpm cli agent pause --id agent_abc123
```

#### 恢复 Agent

```bash
pnpm cli agent resume --id agent_abc123
```

#### 停止 Agent

```bash
pnpm cli agent stop --id agent_abc123
```

> **注意**: 停止后的 Agent 不能重新启动，这是设计决定的终态。

### 2.3 管理记忆

#### 添加长期记忆

```bash
pnpm cli memory add --content "用户喜欢蓝色" --type preference --importance 0.8
```

#### 搜索记忆

```bash
pnpm cli memory search --query "用户偏好"
```

#### 列出所有记忆

```bash
pnpm cli memory list
```

#### 清空记忆

```bash
pnpm cli memory clear
```

### 2.4 管理预算

#### 查看预算状态

```bash
pnpm cli budget status
```

输出示例：
```
📊 预算状态
每日预算: 100,000 tokens
今日使用: 1,234 tokens (1.23%)
剩余: 98,766 tokens
```

#### 设置每日预算

```bash
pnpm cli budget set --amount 50000
```

#### 重置今日使用量

```bash
pnpm cli budget reset
```

### 2.5 MCP 工具

#### 列出所有工具

```bash
pnpm cli mcp tools
```

#### 列出所有服务器

```bash
pnpm cli mcp servers
```

#### 执行工具

```bash
# 计算器工具
pnpm cli mcp run --tool calculate --args '{"expression": "2 + 3 * 4"}'

# 获取当前时间
pnpm cli mcp run --tool get_current_time --args '{"timezone": "Asia/Shanghai"}'

# 回显工具
pnpm cli mcp run --tool echo --args '{"message": "Hello World"}'
```

### 2.6 定时任务

#### 添加定时任务

```bash
# 每天早上 9 点执行
pnpm cli schedule add --name "每日问候" --agent agent_abc123 --cron "0 9 * * *" --type custom
```

#### 列出所有任务

```bash
pnpm cli schedule list
```

#### 立即执行任务

```bash
pnpm cli schedule run --id task_xyz789
```

#### 取消任务

```bash
pnpm cli schedule cancel --id task_xyz789
```

### 2.7 运行演示

```bash
pnpm cli demo
```

这会运行一个完整的演示，展示所有核心功能。

## 第三步：作为库使用

Aether OS 也可以作为 Node.js 库集成到你的项目中。

### 3.1 安装包

```bash
pnpm add @aether/core @aether/memory @aether/model-router @aether/mcp @aether/scheduler
```

### 3.2 基本示例

#### 创建和管理 Agent

```typescript
import { ProcessManager } from '@aether/core';

const processManager = new ProcessManager();

// 创建 Agent
const agent = await processManager.createAgent('my-agent', {
  defaultModel: 'mock-small',
  systemPrompt: '你是一个友好的助手',
  temperature: 0.7,
});

console.log(`Agent 创建成功: ${agent.id}`);
console.log(`当前状态: ${agent.status}`);

// 暂停 Agent
await processManager.pauseAgent(agent.id);

// 恢复 Agent
await processManager.resumeAgent(agent.id);

// 停止 Agent
await processManager.stopAgent(agent.id);
```

#### 使用记忆系统

```typescript
import { MemoryManager } from '@aether/memory';

const memoryManager = new MemoryManager('agent-123');

// 添加短期记忆
memoryManager.shortTerm.addMessage({
  role: 'user',
  content: '你好，我叫张三',
});

memoryManager.shortTerm.addMessage({
  role: 'assistant',
  content: '你好张三！有什么可以帮你的吗？',
});

// 添加长期记忆
await memoryManager.longTerm.store('agent-123', '用户喜欢蓝色和绿色', {
  type: 'preference',
  importance: 0.8,
});

// 搜索长期记忆
const results = await memoryManager.longTerm.search('agent-123', '颜色偏好');
console.log(`找到 ${results.length} 条相关记忆`);

// 获取完整上下文
const fullContext = await memoryManager.getFullContext('用户偏好');
console.log(`完整上下文包含 ${fullContext.length} 条消息`);
```

#### 使用模型路由

```typescript
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';

// 初始化
const modelRouter = new ModelRouter();
const budgetController = new BudgetController();

// 注册模型提供商
modelRouter.registerProvider(new MockModelProvider());

// 发送聊天请求
const response = await modelRouter.route({
  messages: [
    { role: 'system', content: '你是一个助手' },
    { role: 'user', content: '你好' },
  ],
  strategy: 'best-quality',
});

console.log(`模型: ${response.model}`);
console.log(`回复: ${response.message.content}`);
console.log(`Token 使用: ${response.usage.totalTokens}`);

// 记录 token 使用
await budgetController.trackUsage({
  inputTokens: response.usage.inputTokens,
  outputTokens: response.usage.outputTokens,
  totalTokens: response.usage.totalTokens,
  timestamp: Date.now(),
  model: response.model,
  agentId: 'agent-123',
});
```

#### 使用 MCP 工具

```typescript
import { McpManager } from '@aether/mcp';

const mcpManager = new McpManager();

// 列出所有工具
const tools = await mcpManager.listAllTools();
console.log(`可用工具: ${tools.map(t => t.name).join(', ')}`);

// 执行工具
const result = await mcpManager.executeTool('calculate', {
  expression: '2 + 3 * 4',
});

if (result.success) {
  console.log(`计算结果: ${result.data.result}`);
} else {
  console.error(`执行失败: ${result.error}`);
}
```

#### 使用任务调度器

```typescript
import { TaskScheduler } from '@aether/scheduler';

const scheduler = new TaskScheduler();

// 注册任务处理器
scheduler.registerTaskHandler('custom', async (task) => {
  console.log(`执行任务: ${task.name}`);
  console.log(`Payload:`, task.payload);
  return { success: true };
});

// 启动调度器
await scheduler.start();

// 创建定时任务（每分钟执行）
const task = await scheduler.schedule({
  name: '测试任务',
  agentId: 'agent-123',
  cron: '* * * * *',
  taskType: 'custom',
  payload: { message: 'hello' },
});

console.log(`任务创建成功: ${task.id}`);

// 立即执行
const result = await scheduler.executeNow(task.id);
console.log(`执行结果: ${result.success ? '成功' : '失败'}`);

// 停止调度器
setTimeout(async () => {
  await scheduler.stop();
  console.log('调度器已停止');
}, 5000);
```

#### 监听事件

```typescript
import { globalEventBus, EVENTS } from '@aether/shared';

// 监听 Agent 状态变化
globalEventBus.on(EVENTS.AGENT_STATUS_CHANGED, (agentId, oldStatus, newStatus) => {
  console.log(`Agent ${agentId} 状态变化: ${oldStatus} → ${newStatus}`);
});

// 监听记忆添加
globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, agentId, timestamp) => {
  console.log(`新记忆添加: ${memoryId} (Agent: ${agentId})`);
});

// 监听模型请求
globalEventBus.on(EVENTS.MODEL_REQUEST, (requestId, model, request) => {
  console.log(`模型请求: ${model} (${requestId})`);
});
```

## 第四步：运行示例

项目包含完整的示例代码，位于 `examples/` 目录。

### 4.1 构建示例

```bash
pnpm build
```

### 4.2 运行监控 Agent 示例

```bash
node examples/monitor-agent.js
```

### 4.3 更多示例

查看 `docs/examples/` 目录获取更多示例代码：

- `basic-agent.ts` - 基础 Agent 使用
- `memory-demo.ts` - 记忆系统演示
- `scheduler-demo.ts` - 任务调度演示

## 第五步：开发新功能

### 5.1 项目结构

```
aether-os/
├── packages/
│   ├── shared/         # 共享模块
│   ├── core/           # 核心模块
│   ├── memory/         # 记忆系统
│   ├── model-router/   # 模型路由
│   ├── mcp/            # MCP 工具
│   ├── scheduler/      # 调度器
│   └── cli/            # 命令行工具
├── __tests__/          # 集成测试
├── examples/           # 示例代码
├── docs/               # 文档
└── package.json
```

### 5.2 运行单个包的测试

```bash
# 只运行 shared 包的测试
pnpm --filter @aether/shared test

# 只运行 memory 包的测试
pnpm --filter @aether/memory test
```

### 5.3 构建单个包

```bash
# 只构建 core 包
pnpm --filter @aether/core build
```

## 常见问题

### Q: 为什么停止后的 Agent 不能重新启动？
A: 这是设计决定的。STOPPED 状态是终态，表示 Agent 的生命周期已结束。如果你需要重新使用，可以创建一个新的 Agent。

### Q: 记忆系统的相似度是怎么计算的？
A: MVP 版本使用简单的子字符串匹配 + 重要性权重。后续版本会集成真实的向量数据库，提供更准确的语义检索。

### Q: 支持哪些 Cron 表达式？
A: 当前支持简化版 Cron，包括：
- `* * * * *` - 每分钟
- `N * * * *` - 每小时第 N 分钟
- `N H * * *` - 每天 H:N 执行

更复杂的 Cron 表达式会在后续版本中支持。

### Q: 如何添加新的模型提供商？
A: 实现 `IModelProvider` 接口，然后通过 `modelRouter.registerProvider()` 注册即可。

### Q: 数据存储在哪里？
A: MVP 版本的长期记忆和任务数据存储在内存中，重启后会丢失。后续版本会添加 SQLite 持久化支持。

## 下一步

- 阅读 [架构文档](./architecture.md) 了解系统设计
- 查看 [API 文档](./api/) 了解详细接口
- 探索 [示例代码](./examples/) 学习更多用法
- 查看 [贡献指南](../README.md#贡献指南) 参与开发

## 获取帮助

如果遇到问题，可以：

1. 查看 [GitHub Issues](https://github.com/your-org/aether-os/issues)
2. 阅读 [FAQ 文档](./faq.md)
3. 提交新的 Issue
