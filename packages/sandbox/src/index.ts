/**
 * @aether/sandbox - Aether OS 安全沙箱模块
 *
 * 提供 Skill 代码的沙箱执行能力，包含：
 * - 细粒度权限控制（基于白名单/黑名单策略）
 * - 操作审计日志（记录所有权限检查和 API 调用）
 * - 基于 node:vm 的代码隔离执行
 *
 * 安全性说明：
 * node:vm 模块本身并不是完全安全的沙箱，存在已知的逃逸路径。
 * 本模块在 MVP 阶段作为第一层隔离是合理的，但生产环境应考虑
 * 使用独立进程、容器或 WASM 等更强的隔离方案。
 */

export { SkillSandbox, createSkillSandbox } from './sandbox.js';
export { VmSandbox } from './vm-sandbox.js';
export {
  PermissionController,
  PermissionDeniedError,
  createDenyAllPolicy,
  createAllowAllPolicy,
  generatePermissionId,
} from './permissions.js';
export { AuditLogger } from './audit.js';
export type {
  Permission,
  PermissionRule,
  PermissionPolicy,
  AuditEntry,
  SandboxResult,
  SandboxConfig,
  AuditQueryFilter,
  IAuditPersistence,
  PermissionCheckResult,
} from './types.js';
