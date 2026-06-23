import type { Timestamp, Metadata } from '@aether/shared';
import { now, generateId, globalEventBus } from '@aether/shared';

/**
 * 追踪跨度状态
 */
export enum SpanStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * 追踪跨度
 */
export interface Span {
  /** 跨度 ID */
  spanId: string;
  /** 追踪 ID */
  traceId: string;
  /** 父跨度 ID */
  parentSpanId?: string;
  /** 操作名称 */
  name: string;
  /** 开始时间 */
  startTime: Timestamp;
  /** 结束时间 */
  endTime?: Timestamp;
  /** 持续时间（毫秒） */
  duration?: number;
  /** 状态 */
  status: SpanStatus;
  /** Agent ID */
  agentId?: string;
  /** 标签 */
  tags?: Record<string, string | number | boolean>;
  /** 日志事件 */
  logs?: SpanLog[];
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * 跨度日志事件
 */
export interface SpanLog {
  /** 时间戳 */
  timestamp: Timestamp;
  /** 事件名 */
  event: string;
  /** 字段 */
  fields?: Record<string, unknown>;
}

/**
 * 追踪上下文
 * 用于在异步调用中传递追踪信息
 */
export interface TraceContext {
  /** 追踪 ID */
  traceId: string;
  /** 当前跨度 ID */
  spanId: string;
}

/**
 * 追踪器
 * 管理追踪和跨度
 */
export class Tracer {
  private spans: Map<string, Span> = new Map();
  private traces: Map<string, Set<string>> = new Map();
  private maxSpans: number;
  private currentContext?: TraceContext;

  constructor(maxSpans: number = 50000) {
    this.maxSpans = maxSpans;
  }

  /**
   * 开始新的追踪
   */
  startTrace(name: string, agentId?: string): Span {
    const traceId = generateId('trace');
    const spanId = generateId('span');

    const span: Span = {
      spanId,
      traceId,
      name,
      startTime: now(),
      status: SpanStatus.ACTIVE,
      agentId,
    };

    this.spans.set(spanId, span);

    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, new Set());
    }
    this.traces.get(traceId)!.add(spanId);

    this.currentContext = { traceId, spanId };
    globalEventBus.emit('trace.started', traceId, spanId, now());

    return span;
  }

  /**
   * 在现有追踪中开始新跨度
   */
  startSpan(
    name: string,
    parentContext?: TraceContext,
    agentId?: string
  ): Span {
    const ctx = parentContext || this.currentContext;
    if (!ctx) {
      // 没有上下文，开始新追踪
      return this.startTrace(name, agentId);
    }

    const spanId = generateId('span');
    const span: Span = {
      spanId,
      traceId: ctx.traceId,
      parentSpanId: ctx.spanId,
      name,
      startTime: now(),
      status: SpanStatus.ACTIVE,
      agentId,
    };

    this.spans.set(spanId, span);
    this.traces.get(ctx.traceId)?.add(spanId);

    this.currentContext = { traceId: ctx.traceId, spanId };
    globalEventBus.emit('trace.span_started', ctx.traceId, spanId, now());

    return span;
  }

  /**
   * 结束跨度
   */
  finishSpan(spanId: string, error?: Error): Span | undefined {
    const span = this.spans.get(spanId);
    if (!span) return undefined;

    span.endTime = now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? SpanStatus.ERROR : SpanStatus.COMPLETED;

    if (error) {
      span.tags = {
        ...span.tags,
        error: true,
        'error.message': error.message,
      };
    }

    // 恢复父上下文
    if (span.parentSpanId) {
      const parent = this.spans.get(span.parentSpanId);
      if (parent) {
        this.currentContext = {
          traceId: span.traceId,
          spanId: parent.spanId,
        };
      }
    }

    globalEventBus.emit(
      'trace.span_finished',
      span.traceId,
      spanId,
      span.duration,
      now()
    );

    return span;
  }

  /**
   * 给跨度添加标签
   */
  setTag(spanId: string, key: string, value: string | number | boolean): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    if (!span.tags) span.tags = {};
    span.tags[key] = value;
  }

  /**
   * 给跨度添加日志
   */
  log(spanId: string, event: string, fields?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    if (!span.logs) span.logs = [];
    span.logs.push({
      timestamp: now(),
      event,
      fields,
    });
  }

  /**
   * 获取跨度
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * 获取追踪的所有跨度
   */
  getTrace(traceId: string): Span[] {
    const spanIds = this.traces.get(traceId);
    if (!spanIds) return [];

    const spans: Span[] = [];
    for (const spanId of spanIds) {
      const span = this.spans.get(spanId);
      if (span) spans.push(span);
    }
    return spans.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 获取当前上下文
   */
  getCurrentContext(): TraceContext | undefined {
    return this.currentContext;
  }

  /**
   * 设置当前上下文
   */
  setCurrentContext(ctx: TraceContext): void {
    this.currentContext = ctx;
  }

  /**
   * 清除当前上下文
   */
  clearContext(): void {
    this.currentContext = undefined;
  }

  /**
   * 获取所有追踪 ID
   */
  listTraces(): string[] {
    return Array.from(this.traces.keys());
  }

  /**
   * 清理过期的跨度
   */
  cleanup(): void {
    if (this.spans.size <= this.maxSpans) return;

    // 按开始时间排序，删除最老的
    const sortedSpans = Array.from(this.spans.entries()).sort(
      (a, b) => a[1].startTime - b[1].startTime
    );

    const toRemove = sortedSpans.slice(0, this.spans.size - this.maxSpans);
    for (const [spanId, span] of toRemove) {
      this.spans.delete(spanId);
      this.traces.get(span.traceId)?.delete(spanId);
      if (this.traces.get(span.traceId)?.size === 0) {
        this.traces.delete(span.traceId);
      }
    }
  }
}

/**
 * 全局追踪器
 */
export const tracer = new Tracer();

/**
 * 追踪装饰器
 * 直接执行异步函数并自动追踪
 */
export async function traced<T>(
  name: string,
  fn: () => Promise<T>,
  agentId?: string
): Promise<T> {
  const span = tracer.startSpan(name, undefined, agentId);
  try {
    const result = await fn();
    tracer.finishSpan(span.spanId);
    return result;
  } catch (error) {
    tracer.finishSpan(span.spanId, error as Error);
    throw error;
  }
}
