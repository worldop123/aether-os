import type { Timestamp, Metadata } from '@aether/shared';
import { now, generateId } from '@aether/shared';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * 日志级别优先级（数字越大优先级越高）
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40,
  [LogLevel.FATAL]: 50,
};

/**
 * 日志条目
 */
export interface LogEntry {
  /** 日志 ID */
  id: string;
  /** 时间戳 */
  timestamp: Timestamp;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 来源（模块名/类名） */
  source?: string;
  /** Agent ID */
  agentId?: string;
  /** 追踪 ID */
  traceId?: string;
  /** 跨度 ID */
  spanId?: string;
  /** 元数据 */
  metadata?: Metadata;
  /** 错误对象 */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * 日志输出器接口
 */
export interface LogAppender {
  /** 追加日志 */
  append(entry: LogEntry): void;
  /** 刷新缓冲区 */
  flush?(): void;
  /** 关闭输出器 */
  close?(): void;
}

/**
 * 控制台日志输出器
 */
export class ConsoleLogAppender implements LogAppender {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  append(entry: LogEntry): void {
    if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const time = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const source = entry.source ? `[${entry.source}]` : '';
    const agent = entry.agentId ? `{agent:${entry.agentId.slice(-8)}}` : '';
    const trace = entry.traceId ? `{trace:${entry.traceId.slice(-8)}}` : '';

    const prefix = `${time} ${level} ${source}${agent}${trace}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message);
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message);
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(prefix, entry.message);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
    }
  }
}

/**
 * 内存日志输出器（用于测试和调试）
 */
export class MemoryLogAppender implements LogAppender {
  private entries: LogEntry[] = [];
  private maxEntries: number;
  private minLevel: LogLevel;

  constructor(maxEntries: number = 10000, minLevel: LogLevel = LogLevel.DEBUG) {
    this.maxEntries = maxEntries;
    this.minLevel = minLevel;
  }

  append(entry: LogEntry): void {
    if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    this.entries.push(entry);

    // FIFO 淘汰
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /** 获取所有日志条目 */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** 按级别过滤 */
  getByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /** 按 Agent 过滤 */
  getByAgent(agentId: string): LogEntry[] {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  /** 按追踪 ID 过滤 */
  getByTrace(traceId: string): LogEntry[] {
    return this.entries.filter((e) => e.traceId === traceId);
  }

  /** 清空日志 */
  clear(): void {
    this.entries = [];
  }

  /** 获取日志数量 */
  count(): number {
    return this.entries.length;
  }
}

/**
 * 日志记录器
 */
export class Logger {
  readonly name: string;
  private appenders: LogAppender[] = [];
  private minLevel: LogLevel;
  private defaultAgentId?: string;
  private defaultTraceId?: string;

  constructor(name: string, minLevel: LogLevel = LogLevel.DEBUG) {
    this.name = name;
    this.minLevel = minLevel;
  }

  /**
   * 添加日志输出器
   */
  addAppender(appender: LogAppender): this {
    this.appenders.push(appender);
    return this;
  }

  /**
   * 设置最小日志级别
   */
  setLevel(level: LogLevel): this {
    this.minLevel = level;
    return this;
  }

  /**
   * 设置默认 Agent ID
   */
  setAgentId(agentId?: string): this {
    this.defaultAgentId = agentId;
    return this;
  }

  /**
   * 设置默认追踪 ID
   */
  setTraceId(traceId?: string): this {
    this.defaultTraceId = traceId;
    return this;
  }

  /**
   * 记录 DEBUG 日志
   */
  debug(message: string, metadata?: Metadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * 记录 INFO 日志
   */
  info(message: string, metadata?: Metadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * 记录 WARN 日志
   */
  warn(message: string, metadata?: Metadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * 记录 ERROR 日志
   */
  error(message: string, error?: Error, metadata?: Metadata): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  /**
   * 记录 FATAL 日志
   */
  fatal(message: string, error?: Error, metadata?: Metadata): void {
    this.log(LogLevel.FATAL, message, metadata, error);
  }

  /**
   * 记录日志
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Metadata,
    error?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: generateId('log'),
      timestamp: now(),
      level,
      message,
      source: this.name,
      agentId: this.defaultAgentId,
      traceId: this.defaultTraceId,
      metadata,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    for (const appender of this.appenders) {
      try {
        appender.append(entry);
      } catch {
        // 输出器失败不应影响主流程
      }
    }
  }

  /**
   * 创建子日志记录器
   */
  child(name: string): Logger {
    const childLogger = new Logger(`${this.name}:${name}`, this.minLevel);
    childLogger.appenders = [...this.appenders];
    childLogger.defaultAgentId = this.defaultAgentId;
    childLogger.defaultTraceId = this.defaultTraceId;
    return childLogger;
  }

  /**
   * 刷新所有输出器
   */
  flush(): void {
    for (const appender of this.appenders) {
      appender.flush?.();
    }
  }

  /**
   * 关闭所有输出器
   */
  close(): void {
    for (const appender of this.appenders) {
      appender.close?.();
    }
  }
}

/**
 * 日志管理器（单例）
 */
export class LogManager {
  private static instance: LogManager;
  private loggers: Map<string, Logger> = new Map();
  private globalAppenders: LogAppender[] = [];
  private globalLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    // 默认添加控制台输出器
    this.globalAppenders.push(new ConsoleLogAppender(LogLevel.INFO));
  }

  /** 获取单例 */
  static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /**
   * 获取或创建日志记录器
   */
  getLogger(name: string): Logger {
    if (!this.loggers.has(name)) {
      const logger = new Logger(name, this.globalLevel);
      for (const appender of this.globalAppenders) {
        logger.addAppender(appender);
      }
      this.loggers.set(name, logger);
    }
    return this.loggers.get(name)!;
  }

  /**
   * 添加全局输出器
   */
  addAppender(appender: LogAppender): this {
    this.globalAppenders.push(appender);
    // 添加到所有已有日志记录器
    for (const logger of this.loggers.values()) {
      logger.addAppender(appender);
    }
    return this;
  }

  /**
   * 设置全局日志级别
   */
  setLevel(level: LogLevel): this {
    this.globalLevel = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
    return this;
  }

  /**
   * 刷新所有日志记录器
   */
  flush(): void {
    for (const logger of this.loggers.values()) {
      logger.flush();
    }
  }
}

/**
 * 全局日志管理器实例
 */
export const logManager = LogManager.getInstance();

/**
 * 获取默认日志记录器
 */
export function getLogger(name: string): Logger {
  return logManager.getLogger(name);
}
