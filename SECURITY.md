# 安全政策

## 报告安全漏洞

我们非常重视 Aether OS 的安全问题。如果你发现安全漏洞，请按照以下流程报告。

### 报告流程

**请不要通过公开的 GitHub Issue 报告安全漏洞。**

请通过以下方式之一私密报告：

1. **GitHub Security Advisory**（推荐）
   - 访问 https://github.com/worldop123/aether-os/security/advisories/new
   - 点击 "Report a vulnerability"
   - 填写漏洞详情

2. **邮件报告**
   - 发送邮件到：security@example.com（请替换为实际邮箱）
   - 邮件标题：`[SECURITY] Aether OS - 漏洞描述`

### 报告内容

请包含以下信息：

- **漏洞类型**（如代码注入、权限提升、信息泄露）
- **影响范围**（哪些包/功能受影响）
- **复现步骤**（详细的重现步骤）
- **影响版本**（受影响的版本号）
- **修复建议**（如有）
- **你的联系方式**（用于后续沟通）

### 响应时间

- **确认收到**：24 小时内
- **初步评估**：72 小时内
- **修复发布**：根据严重程度，7-30 天内
- **公开披露**：修复发布后 90 天，或与报告者协商的时间

## 安全措施

### 沙箱执行

Aether OS 提供基于 `node:vm` 的安全沙箱（`@aether/sandbox`）：

- 14 种权限类型控制
- 资源限制（内存、CPU、超时）
- 完整的审计日志
- 默认拒绝策略

**注意**：`node:vm` 不是完全安全的沙箱，有已知的逃逸路径。对于完全不受信任的代码，请使用容器或 WASM 沙箱。

### API Key 保护

- API Key 通过环境变量传递，不硬编码在代码中
- 配置文件 `~/.aether/config.json` 应设置文件权限为 600
- `.gitignore` 已排除 `.env` 和 `*.local.json` 文件

### 依赖安全

- 定期更新依赖
- `better-sqlite3` 是唯一需要原生编译的依赖
- 所有依赖都是开源的

## 安全最佳实践

### 对于使用者

1. **不要在代码中硬编码 API Key**
   ```typescript
   // ❌ 错误
   const provider = new OpenAIProvider({ apiKey: 'sk-xxx' });

   // ✅ 正确
   const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
   ```

2. **使用沙箱执行不受信任的代码**
   ```typescript
   import { SkillSandbox } from '@aether/sandbox';

   const sandbox = new SkillSandbox({
     policy: { default: 'deny', rules: [...] }
   });
   await sandbox.execute(config, untrustedCode, args);
   ```

3. **设置合理的预算限制**
   ```typescript
   const budget = new BudgetController({
     dailyBudget: 100000,  // 设置每日 token 上限
     perAgentBudget: 20000 // 设置每个 Agent 的上限
   });
   ```

4. **限制文件系统访问**
   ```typescript
   // 在沙箱策略中限制可访问的路径
   {
     permission: 'fs.read',
     allowed: true,
     resources: ['/tmp/safe/**']  // 只允许读取 /tmp/safe 下的文件
   }
   ```

5. **定期检查审计日志**
   ```typescript
   const entries = auditLogger.query({
     result: 'deny',
     startTime: Date.now() - 86400000  // 最近 24 小时
   });
   ```

### 对于开发者

1. 所有外部输入必须经过验证
2. 使用参数化查询（better-sqlite3 默认支持）
3. 不要使用 `eval` 或 `Function` 构造函数
4. 错误信息不要泄露敏感数据
5. PR 会被审查安全风险

## 已知限制

1. **node:vm 沙箱**：不是完全安全的，有已知逃逸路径
2. **本地存储**：SQLite 数据库文件未加密，请保护文件系统权限
3. **网络通信**：MCP stdio 通信不加密，确保在可信环境使用
4. **A2A 通信**：目前是本地进程内通信，无加密需求

## 安全更新

安全更新会通过以下方式通知：

- GitHub Security Advisory
- Release Notes 中的安全相关条目
- CHANGELOG.md 中标记为 `[security]` 的条目

## 致谢

感谢以下安全研究人员对 Aether OS 的贡献（按报告时间排序）：

<!-- 安全漏洞报告者将在此列出 -->

---

如果你有任何安全问题，请优先通过上述私密渠道报告。
