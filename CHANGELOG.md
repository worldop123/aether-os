# 变更日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [0.3.0] - 2026-06-23

### 重大变更

- **Agent 运行时**：新增 `AgentRuntime` 类，`sendMessage` 不再是 echo，而是真正集成 Memory + ModelRouter + MCP 的工具调用循环
- **MemoryMessage 类型扩展**：新增 `toolCalls` 字段，支持助手消息携带工具调用信息
- **LongTermMemoryItem 类型扩展**：`type` 字段新增 `summary` 类型

### 新增功能

#### P3.1 - Agent 核心能力增强

- **feat(core)**: 新增 `AgentRuntime` 类
  - 真正集成 MemoryManager、ModelRouter、MCP 工具系统
  - 实现完整的工具调用循环（tool call loop）
  - 支持预算检查和 token 使用跟踪
  - 支持系统提示词
  - 最大工具调用循环次数限制（默认 10）
  - 无模型路由器时回退到 echo 模式
- **feat(core)**: 新增 `AgentRuntimeManager` 管理多个运行时
  - 自动创建运行时
  - 统一的消息发送接口

#### P3.2 - 技能系统

- **feat(skills)**: 新增 `@aether/skills` 包
  - `SkillManager` 技能管理器
  - 5 个内置技能：代码助手、技术文档撰写、数据分析、任务自动化、研究助手
  - 技能注册、注销、搜索
  - 技能加载到 Agent
  - 组合系统提示词构建
  - 工具需求聚合

#### P3.3 - 可观测性

- **feat(observability)**: 新增 `@aether/observability` 包
  - **日志系统**：Logger、LogManager、ConsoleLogAppender、MemoryLogAppender
    - 5 个日志级别（DEBUG/INFO/WARN/ERROR/FATAL）
    - 多输出器支持
    - 子日志记录器
    - 按 Agent/Trace 过滤
    - FIFO 淘汰
  - **指标系统**：Counter、Gauge、Histogram、MetricsRegistry
    - 标签支持
    - 分位数计算
    - Prometheus 格式导出
  - **链路追踪**：Tracer、Span、TraceContext
    - 父子跨度
    - 标签和日志事件
    - `traced` 装饰器自动追踪

#### P3.4 - A2A HTTP 传输层

- **feat(a2a)**: 新增 `HttpA2AChannel` 类
  - 基于 HTTP 协议的跨进程/跨机器 Agent 通信
  - 内置 HTTP 服务器接收消息
  - 支持单播和广播
  - 远程端点注册管理
  - 请求超时控制
  - `createHttpChannel` 工厂函数

#### P3.5 - 记忆巩固与遗忘

- **feat(memory)**: 新增记忆巩固与遗忘机制
  - `MemoryConsolidator` 记忆巩固器
    - 4 种巩固策略（importance/recency/frequency/hybrid）
    - 重要性评分计算
    - 自动摘要生成
    - 重要性阈值过滤
  - `MemoryForgetter` 记忆遗忘器
    - 5 种遗忘策略（fifo/lru/lfu/decay/importance-based）
    - 保留分数计算
    - 最大记忆数量限制
    - 过期记忆清理
  - `MemoryMaintenance` 定期维护管理器
    - 定期自动执行巩固和遗忘
    - 可配置维护间隔

### 测试

- 测试数量从 735 增加到 **827**（全部通过）
- 测试文件从 25 个增加到 **30 个**
- 新增测试覆盖：
  - Agent 运行时（12 个）
  - 技能系统（29 个）
  - 可观测性（23 个）
  - HTTP A2A 通道（10 个）
  - 记忆巩固与遗忘（18 个）

### 文档

- **docs**: 更新 README 添加新包说明
- **docs**: 更新 ARCHITECTURE 添加新模块架构图
- **docs**: 更新 CHANGELOG

## [0.2.0] - 2026-06-22

### 重大变更

- **CLI ESM 修复**：tsconfig 从 `moduleResolution: "bundler"` 改为 `NodeNext`，所有相对 import 必须带 `.js` 扩展名
- **better-sqlite3 升级**：从 9.4.0 升级到 12.2.0，支持 Node.js 18-24+
- **LongTermMemory 接口**：`store` 方法新增可选 `embedding` 参数

### 新增功能

#### P0 - 让 MVP 真正可用

- **feat(model-router)**: 添加真实模型提供商
  - `OpenAIProvider` - 支持 GPT-4/GPT-3.5-turbo/GPT-4o 的 chat 和 embedding
  - `AnthropicProvider` - 支持 Claude-3 系列 chat（不支持 embedding）
  - `OllamaProvider` - 本地模型提供商，支持 chat 和 embedding
- **feat(memory)**: 实现 SQLite 持久化
  - 新增 `SqliteLongTermMemory` 类，基于 better-sqlite3
  - 支持向量存储和余弦相似度检索
  - 关键词匹配降级方案
- **feat(scheduler)**: TaskScheduler 支持持久化
  - 新增 `setPersistence()` 方法
  - 任务创建、取消、执行后自动持久化
  - 启动时从持久化加载任务
- **feat(mcp)**: 接入真实 MCP 服务器
  - 新增 `StdioMcpClient` 类，通过子进程启动 MCP 服务器
  - 支持 JSON-RPC 2.0 over stdio 通信
  - 新增 `RemoteMcpTool` 包装远程工具
  - McpServer 支持 stdio 类型连接

#### P1 - 提升体验和功能

- **feat(memory)**: 实现真正的向量记忆检索
  - 新增 `vector.ts` 模块（cosineSimilarity、vectorNorm、dotProduct、normalizeVector、hashEmbedding）
  - `LongTermMemory` 支持注入 `embeddingFn` 自动生成向量
  - 新增 `VectorMemoryManager` 装饰器，集成 IModelProvider
- **feat(cli)**: 完善 CLI 功能
  - 新增 `colors.ts` 彩色输出模块（ANSI 颜色码，TTY 自动检测）
  - 新增 `progress.ts` 进度指示器（Spinner + ProgressBar）
  - 新增 `config.ts` 配置文件支持（`~/.aether/config.json`）
  - 新增 `interactive.ts` 交互式 REPL 模式
  - 新增 `config` 命令（list/get/set/path）
  - 新增 `web` 命令启动 Web UI
  - `chat` 命令支持 `-i`/`--interactive` 进入交互模式
- **feat(examples)**: 添加 3 个完整示例
  - `monitor-agent-demo.ts` - 后台监控 Agent
  - `memory-system-demo.ts` - 记忆系统完整示例
  - `custom-skill-demo.ts` - 自定义 Skill 示例

#### P2 - Phase 2 功能

- **feat(a2a)**: 新增 Agent 间通信包 `@aether/a2a`
  - `AgentCard` / `AgentRegistry` - Agent 发现与注册
  - `LocalA2AChannel` - 本地消息通道（单播/广播/请求-响应）
  - `A2AProtocol` - 高层协议（request/respond/notify/broadcast/queryCapabilities）
  - 心跳检测和超时清理
- **feat(sandbox)**: 新增安全沙箱包 `@aether/sandbox`
  - 14 种权限类型（fs/net/process/memory/mcp/a2a/time/random）
  - `PermissionController` 权限控制器（规则匹配 + 资源限制）
  - `AuditLogger` 审计日志（内存存储，FIFO 淘汰）
  - `VmSandbox` 基于 node:vm 的代码隔离执行
  - `SkillSandbox` 高层封装
- **feat(workflow)**: 新增工作流编排包 `@aether/workflow`
  - `DagGraph` DAG 图结构（拓扑排序、环检测、可达性验证）
  - 5 种节点类型（task/condition/parallel/loop/delay）
  - `WorkflowExecutor` 执行器（重试、超时、fallback、取消）
  - `WorkflowBuilder` 流式 API
- **feat(web)**: 新增 Web UI 包 `@aether/web`
  - 20 个 REST API 端点
  - SSE 事件流推送
  - 单页管理界面（Dashboard/Agents/Memories/Budget/MCP/Schedules）
  - 暗色主题支持

### 修复

- **fix(scheduler)**: 修复 7 个 SqlitePersistence 测试失败问题（better-sqlite3 升级解决）
- **fix(mcp)**: 替换 `calculate` 工具的 `eval` 实现为安全的递归下降解析器，杜绝代码注入风险
- **fix(scheduler)**: 完善 `parseCron` 支持完整 5 字段语法（minute hour day-of-month month day-of-week）
  - 支持范围 `1-5`
  - 支持列表 `1,3,5`
  - 支持步长 `*/15`、`1-23/2`
  - 支持 dayOfMonth 和 dayOfWeek 的 OR 关系
- **fix(cli)**: 修复 ESM 模块解析问题，CLI 可直接运行
- **fix(docs)**: 修正 README 中"长期向量记忆"的描述为"关键词匹配（MVP）"

### 测试

- 测试数量从 314 增加到 **735**（全部通过）
- 测试文件从 11 个增加到 **25 个**
- 新增测试覆盖：
  - 模型提供商（43 个）
  - SQLite 持久化（40 个）
  - MCP stdio 客户端（17 个）
  - 向量检索（62 个）
  - CLI 新功能（67 个）
  - A2A 通信（41 个）
  - 安全沙箱（48 个）
  - 工作流编排（50 个）
  - Web UI（26 个）
  - Cron 解析器（19 个）

### 文档

- **docs**: 重写 README 为完整的开源文档
- **docs**: 新增 CONTRIBUTING.md 贡献指南
- **docs**: 新增 ARCHITECTURE.md 架构文档
- **docs**: 新增 CHANGELOG.md 变更日志
- **docs**: 新增 GitHub Issue 模板和 PR 模板

### 基础设施

- **chore**: 升级 better-sqlite3 到 ^12.2.0
- **chore**: tsconfig.base.json 改用 NodeNext 模块解析
- **chore**: 添加 @aether/a2a、@aether/sandbox、@aether/workflow、@aether/web 路径映射
- **chore**: 更新 .gitignore

## [0.1.0] - 2026-06-20

### 初始发布

- 7 个核心包：shared、core、memory、model-router、mcp、scheduler、cli
- 314 个测试用例
- 基础文档：README、架构文档、快速开始、API 文档
- 4 个示例代码

### 已知限制

- CLI 直接运行有 ESM 模块解析问题
- 长期记忆用关键词匹配，不是真向量检索
- 只有 Mock 模型提供商，没有接真实 LLM
- 只有内存存储，没有 SQLite 持久化
- MCP 只有内置工具，不能连接外部 MCP 服务器
- `calculate` 工具使用 `eval`（有正则白名单，仍有安全隐患）
- `parseCron` 仅支持 minute/hour 两字段
