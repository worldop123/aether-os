import type { ID, Timestamp, Metadata } from '@aether/shared';

/** 权限类型 */
export type Permission =
  | 'fs.read' // 文件读取
  | 'fs.write' // 文件写入
  | 'fs.delete' // 文件删除
  | 'net.http' // HTTP 请求
  | 'net.websocket' // WebSocket
  | 'process.env' // 环境变量访问
  | 'process.exit' // 进程退出
  | 'child_process' // 子进程
  | 'memory.read' // 记忆读取
  | 'memory.write' // 记忆写入
  | 'mcp.tool' // MCP 工具调用
  | 'a2a.message' // A2A 消息
  | 'time' // 获取时间
  | 'random'; // 随机数

/** 权限规则 */
export interface PermissionRule {
  permission: Permission;
  allowed: boolean;
  /** 资源限制（如 fs.read 限制可读路径） */
  resources?: string[];
}

/** 权限策略 */
export interface PermissionPolicy {
  /** 默认策略：allow 或 deny */
  default: 'allow' | 'deny';
  /** 具体规则 */
  rules: PermissionRule[];
  /** 资源限制 */
  limits?: {
    maxMemoryMB?: number;
    maxCpuMs?: number;
    maxTimeoutMs?: number;
    maxFileDescriptors?: number;
  };
}

/** 审计日志条目 */
export interface AuditEntry {
  id: ID;
  timestamp: Timestamp;
  agentId?: ID;
  skillId?: string;
  action: string;
  permission?: Permission;
  resource?: string;
  result: 'allow' | 'deny' | 'error';
  details?: string;
  metadata?: Metadata;
}

/** 沙箱执行结果 */
export interface SandboxResult {
  success: boolean;
  value?: unknown;
  error?: string;
  duration: number;
  auditEntries: AuditEntry[];
}

/** 沙箱配置 */
export interface SandboxConfig {
  skillId: string;
  agentId?: ID;
  policy: PermissionPolicy;
  /** 执行超时（毫秒） */
  timeout?: number;
  /** 注入的上下文变量 */
  context?: Record<string, unknown>;
}

/** 审计日志查询过滤器 */
export interface AuditQueryFilter {
  agentId?: ID;
  skillId?: string;
  action?: string;
  permission?: Permission;
  result?: AuditEntry['result'];
  /** 起始时间戳 */
  startTime?: Timestamp;
  /** 结束时间戳 */
  endTime?: Timestamp;
  /** 限制数量 */
  limit?: number;
}

/** 持久化接口（暂不实现，预留扩展点） */
export interface IAuditPersistence {
  save(entry: AuditEntry): Promise<void>;
  load(filter: AuditQueryFilter): Promise<AuditEntry[]>;
  clear(): Promise<void>;
}

/** 权限检查结果 */
export interface PermissionCheckResult {
  allowed: boolean;
  permission: Permission;
  resource?: string;
  reason: string;
}
