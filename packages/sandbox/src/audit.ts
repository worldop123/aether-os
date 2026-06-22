import { now, generateId, globalEventBus } from '@aether/shared';
import type { AuditEntry, AuditQueryFilter, IAuditPersistence } from './types.js';

/** 审计日志最大条数（FIFO 淘汰） */
const DEFAULT_MAX_ENTRIES = 10000;

/**
 * 审计日志记录器
 *
 * 内存存储审计日志，限制最大条数（默认 10000），超出后 FIFO 淘汰。
 * 支持通过 filter 查询历史日志。
 * 每次记录都会通过 globalEventBus 触发 sandbox.audit_logged 事件。
 *
 * 可选注入 IAuditPersistence 实现持久化（暂不实现，预留扩展点）。
 */
export class AuditLogger {
  /** 内存存储（数组，按时间顺序追加） */
  private entries: AuditEntry[] = [];
  /** 最大条数 */
  private maxEntries: number;
  /** 可选持久化实现 */
  private persistence?: IAuditPersistence;

  constructor(options?: { maxEntries?: number; persistence?: IAuditPersistence }) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.persistence = options?.persistence;
  }

  /**
   * 记录审计条目
   *
   * @param partial 部分审计字段（id/timestamp 会自动填充）
   * @returns 完整的审计条目
   */
  async log(partial: Omit<AuditEntry, 'id' | 'timestamp'> & Partial<Pick<AuditEntry, 'id' | 'timestamp'>>): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: partial.id ?? generateId('audit'),
      timestamp: partial.timestamp ?? now(),
      agentId: partial.agentId,
      skillId: partial.skillId,
      action: partial.action,
      permission: partial.permission,
      resource: partial.resource,
      result: partial.result,
      details: partial.details,
      metadata: partial.metadata,
    };

    this.entries.push(entry);

    // FIFO 淘汰
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.length - this.maxEntries;
      this.entries.splice(0, overflow);
    }

    // 可选持久化（失败不影响主流程）
    if (this.persistence) {
      try {
        await this.persistence.save(entry);
      } catch {
        // 持久化失败不影响内存记录
      }
    }

    // 触发审计日志事件
    globalEventBus.emit(
      'sandbox.audit_logged',
      entry.id,
      entry.action,
      entry.result,
      entry.timestamp
    );

    return entry;
  }

  /**
   * 同步记录审计条目（不等待持久化）
   */
  logSync(partial: Omit<AuditEntry, 'id' | 'timestamp'> & Partial<Pick<AuditEntry, 'id' | 'timestamp'>>): AuditEntry {
    const entry: AuditEntry = {
      id: partial.id ?? generateId('audit'),
      timestamp: partial.timestamp ?? now(),
      agentId: partial.agentId,
      skillId: partial.skillId,
      action: partial.action,
      permission: partial.permission,
      resource: partial.resource,
      result: partial.result,
      details: partial.details,
      metadata: partial.metadata,
    };

    this.entries.push(entry);

    // FIFO 淘汰
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.length - this.maxEntries;
      this.entries.splice(0, overflow);
    }

    // 触发审计日志事件
    globalEventBus.emit(
      'sandbox.audit_logged',
      entry.id,
      entry.action,
      entry.result,
      entry.timestamp
    );

    return entry;
  }

  /**
   * 查询审计日志
   *
   * @param filter 过滤器
   * @returns 匹配的审计条目数组（按时间正序）
   */
  query(filter?: AuditQueryFilter): AuditEntry[] {
    let results = [...this.entries];

    if (filter?.agentId !== undefined) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }
    if (filter?.skillId !== undefined) {
      results = results.filter((e) => e.skillId === filter.skillId);
    }
    if (filter?.action !== undefined) {
      results = results.filter((e) => e.action === filter.action);
    }
    if (filter?.permission !== undefined) {
      results = results.filter((e) => e.permission === filter.permission);
    }
    if (filter?.result !== undefined) {
      results = results.filter((e) => e.result === filter.result);
    }
    if (filter?.startTime !== undefined) {
      results = results.filter((e) => e.timestamp >= filter.startTime!);
    }
    if (filter?.endTime !== undefined) {
      results = results.filter((e) => e.timestamp <= filter.endTime!);
    }

    if (filter?.limit !== undefined && filter.limit > 0) {
      // 取最新的 limit 条
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /**
   * 获取所有审计条目（按时间正序）
   */
  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * 获取审计条目数量
   */
  count(): number {
    return this.entries.length;
  }

  /**
   * 清空所有审计日志
   */
  async clear(): Promise<void> {
    this.entries = [];
    if (this.persistence) {
      try {
        await this.persistence.clear();
      } catch {
        // 持久化清理失败不影响内存清理
      }
    }
  }

  /**
   * 同步清空所有审计日志
   */
  clearSync(): void {
    this.entries = [];
  }

  /**
   * 设置持久化实现
   */
  setPersistence(persistence: IAuditPersistence): void {
    this.persistence = persistence;
  }
}
