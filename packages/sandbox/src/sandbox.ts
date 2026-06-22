import { now, globalEventBus } from '@aether/shared';
import { PermissionController } from './permissions.js';
import { AuditLogger } from './audit.js';
import { VmSandbox } from './vm-sandbox.js';
import type { SandboxResult, SandboxConfig, AuditEntry } from './types.js';

/**
 * Skill 沙箱执行器
 *
 * 高层封装，集成权限控制器和审计日志记录器，
 * 在 VmSandbox 之上提供 Skill 级别的执行入口。
 *
 * 每次执行：
 * 1. 根据配置创建 PermissionController 和 AuditLogger（若未提供）
 * 2. 创建 VmSandbox 实例执行代码
 * 3. 返回包含执行结果和审计条目的 SandboxResult
 */
export class SkillSandbox {
  /** 共享的审计日志记录器（跨多次执行） */
  private auditLogger: AuditLogger;

  constructor(options?: { auditLogger?: AuditLogger }) {
    this.auditLogger = options?.auditLogger ?? new AuditLogger();
  }

  /**
   * 获取审计日志记录器
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * 在沙箱中执行 Skill 代码
   *
   * @param config 沙箱配置（包含 skillId、权限策略、超时等）
   * @param code 要执行的 JavaScript 代码
   * @param args 传入沙箱的参数
   * @returns 执行结果
   */
  async execute(
    config: SandboxConfig,
    code: string,
    args?: Record<string, unknown>
  ): Promise<SandboxResult> {
    const permissionController = new PermissionController(
      config.skillId,
      config.policy,
      config.agentId
    );

    const vmSandbox = new VmSandbox(
      config,
      permissionController,
      this.auditLogger
    );

    return vmSandbox.execute(code, args);
  }

  /**
   * 查询历史审计日志
   */
  queryAuditLog(filter?: Parameters<AuditLogger['query']>[0]): AuditEntry[] {
    return this.auditLogger.query(filter);
  }

  /**
   * 清空审计日志
   */
  async clearAuditLog(): Promise<void> {
    await this.auditLogger.clear();
  }
}

/**
 * 创建一个 SkillSandbox 实例
 */
export function createSkillSandbox(options?: ConstructorParameters<typeof SkillSandbox>[0]): SkillSandbox {
  return new SkillSandbox(options);
}
