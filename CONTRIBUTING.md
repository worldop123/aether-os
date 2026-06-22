# 贡献指南

感谢你对 Aether OS 项目的关注！本文档描述了如何为项目贡献代码。

## 行为准则

请保持友善、尊重和包容的态度。我们致力于为每个人提供友好的协作环境。

## 开发环境准备

### 环境要求

- **Node.js** >= 18.0.0（推荐 20+）
- **pnpm** >= 9.0.0
- **Git**
- **Python**（可选，better-sqlite3 编译需要）

### 初始化

```bash
# 克隆仓库
git clone https://github.com/worldop123/aether-os.git
cd aether-os

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行所有测试
pnpm test
```

### 验证环境

```bash
# CLI 应该能正常运行
node packages/cli/dist/cli.js --help

# 所有 735 个测试应该通过
pnpm test
```

## 开发流程

### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/issue-description
```

分支命名规范：
- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关

### 2. 编写代码

遵循以下规范：

#### TypeScript 规范
- **strict 模式**：所有代码必须通过 TypeScript strict 模式编译
- **NodeNext 模块**：`module: "NodeNext"`, `moduleResolution: "NodeNext"`
- **相对 import**：必须带 `.js` 扩展名（如 `import { foo } from './bar.js'`）
- **包内 import**：使用 `@aether/xxx` 形式（如 `import { Agent } from '@aether/core'`）
- **接口优先**：先定义接口再实现
- **JSDoc 注释**：所有公共 API 必须有 JSDoc 注释

#### 代码风格
- 接口命名使用 `I` 前缀（如 `IAgent`、`IModelProvider`）
- 类型和接口使用 PascalCase
- 变量和函数使用 camelCase
- 常量使用 UPPER_SNAKE_CASE
- 每个文件末尾保留一个空行

#### 架构规范
- **事件驱动**：模块间通过 `globalEventBus` 通信
- **错误处理**：使用 `@aether/shared` 中的错误类（`AgentError`、`MemoryError` 等）
- **错误码**：错误必须包含错误码和元数据
- **可观测性**：重要状态变化应触发对应事件

### 3. 编写测试

每个新功能都必须有对应的单元测试：

- 测试文件放在 `__tests__/` 目录下，命名为 `*.test.ts`
- 使用 Vitest
- 覆盖正常流程、边界情况、错误场景
- 不要测试真实外部 API（用 mock）

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('YourModule 测试', () => {
  beforeEach(() => {
    // 每个测试前的初始化
  });

  it('应该正确处理正常情况', async () => {
    // 测试代码
  });

  it('应该正确处理错误情况', async () => {
    await expect(someFunction()).rejects.toThrow();
  });
});
```

### 4. 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单个包的测试
pnpm --filter @aether/core test

# 运行单个测试文件
pnpm vitest run packages/core/__tests__/agent.test.ts

# 监听模式
pnpm test:watch
```

### 5. 构建验证

```bash
# 构建所有包
pnpm build

# 构建单个包
pnpm --filter @aether/core build
```

确保 TypeScript 编译无错误。

## 提交规范

### Commit Message 格式

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Type 类型：**
- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档变更
- `style` - 代码格式（不影响功能）
- `refactor` - 重构（既不是新功能也不是修复）
- `test` - 测试相关
- `chore` - 构建/工具/依赖变更

**示例：**
```
feat(model-router): 添加 OpenAI 模型提供商

实现 OpenAIProvider 类，支持 GPT-4/GPT-3.5-turbo 的 chat 和 embedding。
API key 从环境变量 OPENAI_API_KEY 读取。

Closes #123
```

```
fix(scheduler): 修复 cron 解析器不支持步长的问题

替换简化版 parseCron 为完整的 5 字段解析器，支持范围、列表、步长语法。
```

### 提交前检查

提交前请确保：

- [ ] 所有测试通过（`pnpm test`）
- [ ] 构建成功（`pnpm build`）
- [ ] 代码通过 TypeScript strict 模式
- [ ] 新功能有对应的测试
- [ ] JSDoc 注释完整
- [ ] Commit message 符合规范
- [ ] 不要提交 `dist/`、`node_modules/`、`.env` 等文件

## Pull Request 流程

### 1. 提交 PR

PR 标题应遵循 Conventional Commits 规范。PR 描述应包含：

- **变更说明**：做了什么，为什么做
- **变更类型**：新功能 / Bug 修复 / 重构 / 文档
- **测试方式**：如何验证变更
- **破坏性变更**：如有，说明迁移方式
- **相关 Issue**：`Closes #xxx` / `Fixes #xxx`

### 2. PR 模板

```markdown
## 变更说明

<!-- 描述这个 PR 做了什么 -->

## 变更类型

- [ ] 新功能（feat）
- [ ] Bug 修复（fix）
- [ ] 重构（refactor）
- [ ] 文档（docs）
- [ ] 测试（test）
- [ ] 其他（chore）

## 测试

- [ ] 所有测试通过（`pnpm test`）
- [ ] 构建成功（`pnpm build`）
- [ ] 新增了对应的单元测试

## 检查清单

- [ ] 代码遵循项目规范
- [ ] JSDoc 注释完整
- [ ] Commit message 符合规范
- [ ] 无敏感信息（API key、密码等）
```

### 3. 代码审查

- 所有 PR 需要至少一次审查
- 审查者会检查代码质量、测试覆盖、文档完整性
- 请耐心对待审查反馈，及时响应

## 项目结构

```
aether-os/
├── packages/
│   ├── shared/         # 共享模块（常量、错误类、事件总线、工具函数）
│   ├── core/           # 核心模块（Agent 类、ProcessManager）
│   ├── memory/         # 记忆系统（短期记忆、长期记忆、向量检索）
│   ├── model-router/   # 模型路由（OpenAI/Anthropic/Ollama + 预算控制）
│   ├── mcp/            # MCP 工具系统（内置工具 + stdio 客户端）
│   ├── scheduler/      # 任务调度（完整 cron + SQLite 持久化）
│   ├── cli/            # 命令行工具（彩色输出 + 交互模式）
│   ├── a2a/            # Agent 间通信（发现 + 消息传递）
│   ├── sandbox/        # 安全沙箱（权限控制 + 审计日志）
│   ├── workflow/       # 工作流编排（DAG + 条件分支 + 并行）
│   └── web/            # Web UI（REST API + 管理界面）
├── examples/           # 示例代码
├── docs/               # 文档
└── __tests__/          # 集成测试
```

## 添加新包

如果需要添加新包：

1. 在 `packages/` 下创建新目录
2. 创建 `package.json`（name 为 `@aether/xxx`）
3. 创建 `tsconfig.json`（继承 `tsconfig.base.json`）
4. 在 `tsconfig.base.json` 和 `vitest.config.ts` 添加路径映射
5. 在 `pnpm-workspace.yaml` 已用 `packages/*` 通配，无需修改
6. 运行 `pnpm install` 链接新包

## 报告 Bug

使用 GitHub Issues 报告 Bug，请包含：

- **环境信息**：Node 版本、pnpm 版本、操作系统
- **复现步骤**：详细的重现步骤
- **预期行为**：期望发生什么
- **实际行为**：实际发生了什么
- **错误日志**：完整的错误信息
- **最小复现**：如果能提供最小复现示例最好

## 功能请求

欢迎提出新功能建议！请在 Issue 中描述：

- **使用场景**：为什么需要这个功能
- **功能描述**：期望的功能行为
- **替代方案**：是否考虑过其他方案
- **额外上下文**：任何相关信息

## 许可证

通过提交代码，你同意你的贡献将按照 [MIT 许可证](./LICENSE) 授权。

## 联系方式

- **GitHub Issues** - 报告 Bug、提出功能建议
- **GitHub Discussions** - 讨论想法、提问

---

再次感谢你的贡献！
