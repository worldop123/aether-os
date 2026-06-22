/**
 * 通用工具类型定义
 */

/** 唯一 ID 类型 */
export type ID = string;

/** 时间戳类型（毫秒） */
export type Timestamp = number;

/** 通用元数据类型 */
export type Metadata = Record<string, unknown>;

/**
 * 分页参数
 */
export interface PaginationParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  items: T[];
  /** 总数量 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 排序参数
 */
export interface SortParams {
  /** 排序字段 */
  field: string;
  /** 排序方向 */
  order: 'asc' | 'desc';
}

/**
 * 可配置选项基类
 */
export interface BaseConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * 异步结果包装
 */
export type AsyncResult<T, E = Error> = Promise<{
  success: boolean;
  data?: T;
  error?: E;
}>;

/**
 * 生成唯一 ID
 * MVP 阶段使用简单的时间戳 + 随机数实现
 */
export function generateId(prefix = ''): ID {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * 获取当前时间戳
 */
export function now(): Timestamp {
  return Date.now();
}

/**
 * 延迟执行
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(promise: Promise<T>, timeout: number, timeoutMessage = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeout)
    ),
  ]);
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number; onRetry?: (error: Error, attempt: number) => void } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, onRetry } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        onRetry?.(lastError, attempt + 1);
        await sleep(delay * Math.pow(2, attempt)); // 指数退避
      }
    }
  }

  throw lastError!;
}
