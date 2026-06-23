/**
 * @aether/observability - Aether OS 可观测性模块
 *
 * 提供日志聚合、指标收集和链路追踪能力
 */

export {
  LogLevel,
  ConsoleLogAppender,
  MemoryLogAppender,
  Logger,
  LogManager,
  logManager,
  getLogger,
} from './logger.js';
export type { LogEntry, LogAppender } from './logger.js';

export {
  MetricType,
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  metricsRegistry,
} from './metrics.js';
export type { MetricLabels, MetricPoint, MetricDefinition } from './metrics.js';

export {
  SpanStatus,
  Tracer,
  tracer,
  traced,
} from './tracer.js';
export type { Span, SpanLog, TraceContext } from './tracer.js';
