import vm from 'node:vm';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { now, globalEventBus } from '@aether/shared';
import { PermissionDeniedError } from './permissions.js';
import type { PermissionController } from './permissions.js';
import type { AuditLogger } from './audit.js';
import type { SandboxResult, SandboxConfig, Permission, AuditEntry } from './types.js';

/**
 * 从错误对象中提取错误消息
 *
 * vm 上下文中抛出的 Error 对象不是宿主 Error 的实例，
 * 因此不能仅依赖 `instanceof Error`，需要额外检查 message 属性。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(error);
}

/**
 * 基于 node:vm 的代码沙箱
 *
 * 通过 vm.createContext 创建隔离上下文，仅注入白名单 API。
 * 每个注入的 API 都会自动进行权限检查和审计日志记录。
 *
 * 安全性说明：
 * node:vm 模块本身并不是完全安全的沙箱，存在已知的逃逸路径
 * （例如通过原型链访问宿主对象）。在 MVP 阶段，本实现作为第一层
 * 隔离是合理的，但不应作为唯一的安全边界。生产环境应考虑使用
 * 独立进程、容器或 WASM 等更强的隔离方案。
 */
export class VmSandbox {
  constructor(
    private readonly config: SandboxConfig,
    private readonly permissionController: PermissionController,
    private readonly auditLogger: AuditLogger
  ) {}

  /**
   * 在沙箱中执行代码
   *
   * @param code 要执行的 JavaScript 代码（在 async 函数中执行，可使用 return 和 await）
   * @param args 传入沙箱的参数，可在代码中通过 `args` 访问
   * @returns 执行结果
   */
  async execute(code: string, args?: Record<string, unknown>): Promise<SandboxResult> {
    const startTime = now();
    const localAuditEntries: AuditEntry[] = [];

    try {
      const sandbox = this.createSandbox(localAuditEntries);

      // 注入参数和上下文
      sandbox.args = args ?? {};
      sandbox.ctx = this.config.context ?? {};

      const context = vm.createContext(sandbox);
      const timeout = this.config.timeout ?? 5000;

      // 将代码包装在 async IIFE 中，支持 return 和 await
      const wrappedCode = `(async () => {\n${code}\n})()`;

      // vm.runInContext 的 timeout 仅对同步执行有效
      const result = vm.runInContext(wrappedCode, context, {
        timeout,
        filename: `sandbox:${this.config.skillId}`,
        displayErrors: true,
      });

      // 对异步部分使用 Promise.race 控制超时
      const value = await Promise.race([
        Promise.resolve(result),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`执行超时 (${timeout}ms)`));
          }, timeout);
        }),
      ]);

      const duration = now() - startTime;

      globalEventBus.emit(
        'sandbox.skill_executed',
        this.config.skillId,
        this.config.agentId,
        duration,
        now()
      );

      return {
        success: true,
        value,
        duration,
        auditEntries: localAuditEntries,
      };
    } catch (error) {
      const duration = now() - startTime;
      const errorMsg = getErrorMessage(error);

      // 权限被拒绝时触发 skill_blocked 事件
      if (error instanceof PermissionDeniedError) {
        globalEventBus.emit(
          'sandbox.skill_blocked',
          this.config.skillId,
          this.config.agentId,
          errorMsg,
          now()
        );
      }

      return {
        success: false,
        error: errorMsg,
        duration,
        auditEntries: localAuditEntries,
      };
    }
  }

  /**
   * 创建沙箱上下文对象，注入白名单 API
   *
   * 每个注入的 API 都会通过 permissionController 检查权限，
   * 并通过 auditLogger 记录审计日志。
   */
  private createSandbox(localEntries: AuditEntry[]): Record<string, unknown> {
    const { skillId, agentId } = this.config;
    const permissionController = this.permissionController;
    const auditLogger = this.auditLogger;

    // 每次执行使用独立的内存存储
    const memoryStore = new Map<string, unknown>();

    /**
     * 记录审计日志（同步），同时收集到本地数组用于返回
     */
    const audit = (
      action: string,
      permission: Permission,
      result: AuditEntry['result'],
      resource?: string,
      details?: string
    ): void => {
      const entry = auditLogger.logSync({
        action,
        permission,
        resource,
        result,
        details,
        skillId,
        agentId,
      });
      localEntries.push(entry);
    };

    /**
     * 包装异步操作：先检查权限，再执行操作，全程审计
     */
    const withPermissionAsync = async <T>(
      permission: Permission,
      action: string,
      resource: string | undefined,
      fn: () => Promise<T>
    ): Promise<T> => {
      const check = permissionController.check(permission, resource);
      if (!check.allowed) {
        audit(action, permission, 'deny', resource, check.reason);
        throw new PermissionDeniedError(
          `${action} 被拒绝${resource ? ` (resource: ${resource})` : ''} - ${check.reason}`,
          permission,
          resource
        );
      }
      try {
        const result = await fn();
        audit(action, permission, 'allow', resource);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        audit(action, permission, 'error', resource, errorMsg);
        throw error;
      }
    };

    /**
     * 包装同步操作：先检查权限，再执行操作，全程审计
     */
    const withPermissionSync = <T>(
      permission: Permission,
      action: string,
      resource: string | undefined,
      fn: () => T
    ): T => {
      const check = permissionController.check(permission, resource);
      if (!check.allowed) {
        audit(action, permission, 'deny', resource, check.reason);
        throw new PermissionDeniedError(
          `${action} 被拒绝${resource ? ` (resource: ${resource})` : ''} - ${check.reason}`,
          permission,
          resource
        );
      }
      try {
        const result = fn();
        audit(action, permission, 'allow', resource);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        audit(action, permission, 'error', resource, errorMsg);
        throw error;
      }
    };

    return {
      // 文件系统 API
      fs: {
        readFile: (path: string) =>
          withPermissionAsync('fs.read', 'fs.readFile', path, () =>
            readFile(path, 'utf-8')
          ),
        writeFile: (path: string, content: string) =>
          withPermissionAsync('fs.write', 'fs.writeFile', path, () =>
            writeFile(path, content, 'utf-8')
          ),
        deleteFile: (path: string) =>
          withPermissionAsync('fs.delete', 'fs.deleteFile', path, () => unlink(path)),
      },
      // HTTP API
      http: {
        fetch: (url: string, options?: unknown) =>
          withPermissionAsync('net.http', 'http.fetch', url, () =>
            fetch(url, options as RequestInit | undefined)
          ),
      },
      // 环境变量 API
      env: {
        get: (key: string) =>
          withPermissionSync('process.env', 'env.get', key, () => process.env[key]),
      },
      // 时间 API
      time: {
        now: () => withPermissionSync('time', 'time.now', undefined, () => Date.now()),
        sleep: (ms: number) =>
          withPermissionAsync('time', 'time.sleep', undefined, () =>
            new Promise<void>((resolve) => setTimeout(resolve, ms))
          ),
      },
      // 随机数 API
      random: {
        value: () =>
          withPermissionSync('random', 'random.value', undefined, () => Math.random()),
      },
      // 记忆 API（沙箱内简单的键值存储，可被外部 context 替换）
      memory: {
        read: (key: string) =>
          withPermissionAsync('memory.read', 'memory.read', key, async () =>
            memoryStore.get(key)
          ),
        write: (key: string, value: unknown) =>
          withPermissionAsync('memory.write', 'memory.write', key, async () => {
            memoryStore.set(key, value);
            return true;
          }),
      },
      // MCP 工具 API（默认为占位实现，可通过 context 注入真实实现）
      mcp: {
        callTool: (toolName: string, toolArgs?: unknown) =>
          withPermissionAsync('mcp.tool', 'mcp.callTool', toolName, async () => ({
            success: false,
            error: 'MCP tools not available in this sandbox',
            toolName,
            toolArgs,
          })),
      },
    };
  }
}
