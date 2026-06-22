import { now, generateId, globalEventBus } from '@aether/shared';
import type { Permission, PermissionPolicy, PermissionRule, PermissionCheckResult } from './types.js';

/**
 * 权限控制器
 *
 * 根据权限策略对沙箱内的操作进行细粒度权限检查。
 * 支持白名单/黑名单模式、资源限制（如 fs.read 限制可读路径），
 * 每次检查都会通过 globalEventBus 触发 sandbox.permission_checked 事件。
 */
export class PermissionController {
  private policy: PermissionPolicy;
  private skillId: string;
  private agentId?: string;

  constructor(skillId: string, policy: PermissionPolicy, agentId?: string) {
    this.skillId = skillId;
    this.agentId = agentId;
    this.policy = policy;
  }

  /**
   * 更新权限策略
   */
  setPolicy(policy: PermissionPolicy): void {
    this.policy = policy;
  }

  /**
   * 获取当前策略
   */
  getPolicy(): PermissionPolicy {
    return this.policy;
  }

  /**
   * 检查权限是否允许
   *
   * 匹配规则：
   * 1. 遍历所有规则，找到 permission 匹配的规则
   * 2. 若规则带 resources，则资源需在 resources 列表内（前缀匹配）才生效
   * 3. 若规则不带 resources，则对所有资源生效
   * 4. 多条匹配规则中，deny 优先于 allow（安全优先）
   * 5. 未匹配到任何规则时，使用默认策略
   *
   * @param permission 权限类型
   * @param resource 资源标识（如文件路径、URL）
   */
  check(permission: Permission, resource?: string): PermissionCheckResult {
    const matchedRules = this.findMatchingRules(permission, resource);

    let allowed: boolean;
    let reason: string;

    if (matchedRules.length === 0) {
      // 未匹配到规则，使用默认策略
      allowed = this.policy.default === 'allow';
      reason = `no matching rule, default=${this.policy.default}`;
    } else {
      // deny 优先：只要有一条 deny 规则匹配，就拒绝
      const hasDeny = matchedRules.some((r) => !r.allowed);
      allowed = !hasDeny;
      reason = hasDeny
        ? `denied by rule`
        : `allowed by rule (${matchedRules.length} match(es))`;
    }

    const result: PermissionCheckResult = {
      allowed,
      permission,
      resource,
      reason,
    };

    // 触发权限检查事件
    globalEventBus.emit(
      'sandbox.permission_checked',
      this.skillId,
      permission,
      resource,
      allowed,
      now()
    );

    return result;
  }

  /**
   * 检查权限，不允许时抛出错误
   */
  assert(permission: Permission, resource?: string): void {
    const result = this.check(permission, resource);
    if (!result.allowed) {
      throw new PermissionDeniedError(
        `权限被拒绝: ${permission}` +
          (resource ? ` (resource: ${resource})` : '') +
          ` - ${result.reason}`,
        permission,
        resource
      );
    }
  }

  /**
   * 查找匹配指定权限和资源的规则
   */
  private findMatchingRules(
    permission: Permission,
    resource?: string
  ): PermissionRule[] {
    return this.policy.rules.filter((rule) => {
      if (rule.permission !== permission) return false;

      // 规则未限定资源，匹配所有
      if (!rule.resources || rule.resources.length === 0) {
        return true;
      }

      // 规则限定了资源，但请求未提供资源，不匹配
      if (!resource) return false;

      // 资源需在允许列表内（精确匹配或目录前缀匹配，避免 /tmp/safe 误匹配 /tmp/safeother）
      return rule.resources.some(
        (allowed) => resource === allowed || resource.startsWith(allowed + '/')
      );
    });
  }
}

/**
 * 权限被拒绝错误
 */
export class PermissionDeniedError extends Error {
  public readonly permission: Permission;
  public readonly resource?: string;

  constructor(message: string, permission: Permission, resource?: string) {
    super(message);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
    this.resource = resource;
  }
}

/**
 * 创建默认的拒绝策略（最小权限）
 */
export function createDenyAllPolicy(): PermissionPolicy {
  return {
    default: 'deny',
    rules: [],
  };
}

/**
 * 创建默认的允许策略（最大权限，仅用于可信代码）
 */
export function createAllowAllPolicy(): PermissionPolicy {
  return {
    default: 'allow',
    rules: [],
  };
}

/**
 * 便捷方法：生成权限审计条目 ID
 */
export function generatePermissionId(): string {
  return generateId('perm');
}
