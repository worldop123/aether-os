import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LogLevel,
  ConsoleLogAppender,
  MemoryLogAppender,
  Logger,
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  Tracer,
  SpanStatus,
  traced,
} from '../src/index.js';

describe('Logger 测试', () => {
  describe('MemoryLogAppender', () => {
    it('应该记录日志', () => {
      const appender = new MemoryLogAppender();
      const logger = new Logger('test').addAppender(appender);

      logger.info('测试消息');
      logger.warn('警告消息');

      expect(appender.count()).toBe(2);
      const entries = appender.getEntries();
      expect(entries[0].level).toBe(LogLevel.INFO);
      expect(entries[0].message).toBe('测试消息');
      expect(entries[1].level).toBe(LogLevel.WARN);
    });

    it('应该按级别过滤', () => {
      const appender = new MemoryLogAppender(10000, LogLevel.WARN);
      const logger = new Logger('test').addAppender(appender);

      logger.info('info 消息'); // 应该被过滤
      logger.warn('warn 消息');
      logger.error('error 消息');

      expect(appender.count()).toBe(2);
    });

    it('应该记录错误对象', () => {
      const appender = new MemoryLogAppender();
      const logger = new Logger('test').addAppender(appender);

      const error = new Error('测试错误');
      logger.error('操作失败', error);

      const entries = appender.getEntries();
      expect(entries[0].error).toBeDefined();
      expect(entries[0].error!.message).toBe('测试错误');
      expect(entries[0].error!.name).toBe('Error');
    });

    it('应该按 Agent 过滤', () => {
      const appender = new MemoryLogAppender();
      const logger = new Logger('test').addAppender(appender).setAgentId('agent-1');

      logger.info('消息1');
      const logger2 = new Logger('test').addAppender(appender).setAgentId('agent-2');
      logger2.info('消息2');

      const agent1Logs = appender.getByAgent('agent-1');
      const agent2Logs = appender.getByAgent('agent-2');
      expect(agent1Logs.length).toBe(1);
      expect(agent2Logs.length).toBe(1);
    });

    it('应该支持子日志记录器', () => {
      const appender = new MemoryLogAppender();
      const parent = new Logger('parent').addAppender(appender).setAgentId('agent-1');
      const child = parent.child('worker');

      child.info('子日志消息');

      const entries = appender.getEntries();
      expect(entries[0].source).toBe('parent:worker');
      expect(entries[0].agentId).toBe('agent-1');
    });

    it('FIFO 淘汰应该生效', () => {
      const appender = new MemoryLogAppender(3);
      const logger = new Logger('test').addAppender(appender);

      logger.info('消息1');
      logger.info('消息2');
      logger.info('消息3');
      logger.info('消息4');

      expect(appender.count()).toBe(3);
      const entries = appender.getEntries();
      expect(entries[0].message).toBe('消息2');
    });
  });

  describe('ConsoleLogAppender', () => {
    it('应该调用 console 方法', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const appender = new ConsoleLogAppender(LogLevel.INFO);
      const logger = new Logger('test').addAppender(appender);

      logger.info('控制台消息');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('Metrics 测试', () => {
  describe('Counter', () => {
    it('应该正确计数', () => {
      const counter = new Counter('requests', '请求数');
      counter.inc();
      counter.inc();
      counter.inc(5);

      expect(counter.get()).toBe(7);
    });

    it('应该支持标签', () => {
      const counter = new Counter('requests', '请求数');
      counter.inc(1, { method: 'GET' });
      counter.inc(1, { method: 'GET' });
      counter.inc(1, { method: 'POST' });

      expect(counter.get({ method: 'GET' })).toBe(2);
      expect(counter.get({ method: 'POST' })).toBe(1);
    });

    it('reset 应该清空计数', () => {
      const counter = new Counter('requests', '请求数');
      counter.inc(10);
      counter.reset();
      expect(counter.get()).toBe(0);
    });
  });

  describe('Gauge', () => {
    it('应该设置和获取值', () => {
      const gauge = new Gauge('temperature', '温度');
      gauge.set(25);
      expect(gauge.get()).toBe(25);
      gauge.set(30);
      expect(gauge.get()).toBe(30);
    });

    it('应该支持增减', () => {
      const gauge = new Gauge('connections', '连接数');
      gauge.set(10);
      gauge.inc(5);
      expect(gauge.get()).toBe(15);
      gauge.dec(3);
      expect(gauge.get()).toBe(12);
    });
  });

  describe('Histogram', () => {
    it('应该记录观察值', () => {
      const hist = new Histogram('latency', '延迟');
      hist.observe(0.1);
      hist.observe(0.5);
      hist.observe(1.0);

      const stats = hist.getStats();
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(3);
      expect(stats!.sum).toBeCloseTo(1.6);
      expect(stats!.avg).toBeCloseTo(0.533, 2);
      expect(stats!.min).toBe(0.1);
      expect(stats!.max).toBe(1.0);
    });

    it('应该计算分位数', () => {
      const hist = new Histogram('latency', '延迟');
      for (let i = 1; i <= 100; i++) {
        hist.observe(i);
      }

      const p50 = hist.getQuantile(0.5);
      const p99 = hist.getQuantile(0.99);

      expect(p50).toBeGreaterThanOrEqual(49);
      expect(p50).toBeLessThanOrEqual(51);
      expect(p99).toBeGreaterThanOrEqual(98);
    });
  });

  describe('MetricsRegistry', () => {
    it('应该创建和获取指标', () => {
      const registry = new MetricsRegistry();
      const counter = registry.counter('requests', '请求数');
      const gauge = registry.gauge('memory', '内存使用');
      const hist = registry.histogram('latency', '延迟');

      counter.inc(5);
      gauge.set(1024);
      hist.observe(0.1);

      expect(registry.getCounters().length).toBe(1);
      expect(registry.getGauges().length).toBe(1);
      expect(registry.getHistograms().length).toBe(1);
    });

    it('export 应该返回 Prometheus 格式', () => {
      const registry = new MetricsRegistry();
      const counter = registry.counter('http_requests', 'HTTP 请求数');
      counter.inc(10);

      const exported = registry.export();
      expect(exported).toContain('# HELP http_requests');
      expect(exported).toContain('# TYPE http_requests counter');
      expect(exported).toContain('http_requests 10');
    });
  });
});

describe('Tracer 测试', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer();
  });

  it('应该开始和结束追踪', () => {
    const span = tracer.startTrace('操作A');
    expect(span.status).toBe(SpanStatus.ACTIVE);
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();

    tracer.finishSpan(span.spanId);

    const finished = tracer.getSpan(span.spanId);
    expect(finished!.status).toBe(SpanStatus.COMPLETED);
    expect(finished!.duration).toBeGreaterThanOrEqual(0);
  });

  it('应该支持父子跨度', () => {
    const parent = tracer.startTrace('父操作');
    const child = tracer.startSpan('子操作');

    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);

    tracer.finishSpan(child.spanId);
    tracer.finishSpan(parent.spanId);

    const trace = tracer.getTrace(parent.traceId);
    expect(trace.length).toBe(2);
  });

  it('错误跨度应该标记错误状态', () => {
    const span = tracer.startTrace('可能失败的操作');
    const error = new Error('操作失败');
    tracer.finishSpan(span.spanId, error);

    const finished = tracer.getSpan(span.spanId);
    expect(finished!.status).toBe(SpanStatus.ERROR);
    expect(finished!.tags!.error).toBe(true);
    expect(finished!.tags!['error.message']).toBe('操作失败');
  });

  it('应该支持添加标签和日志', () => {
    const span = tracer.startTrace('操作');
    tracer.setTag(span.spanId, 'key', 'value');
    tracer.setTag(span.spanId, 'count', 42);
    tracer.log(span.spanId, '事件1', { data: 'test' });

    const current = tracer.getSpan(span.spanId);
    expect(current!.tags!.key).toBe('value');
    expect(current!.tags!.count).toBe(42);
    expect(current!.logs!.length).toBe(1);
    expect(current!.logs![0].event).toBe('事件1');
  });

  it('应该获取追踪的所有跨度', () => {
    const root = tracer.startTrace('root');
    const child1 = tracer.startSpan('child1');
    tracer.finishSpan(child1.spanId);
    const child2 = tracer.startSpan('child2');
    tracer.finishSpan(child2.spanId);
    tracer.finishSpan(root.spanId);

    const spans = tracer.getTrace(root.traceId);
    expect(spans.length).toBe(3);
    // 应该按时间排序
    expect(spans[0].name).toBe('root');
  });

  it('traced 装饰器应该自动追踪', async () => {
    const result = await traced('async-op', async () => {
      return 42;
    });

    expect(result).toBe(42);
    // traced 使用全局 tracer，检查全局 tracer
    const { tracer: globalTracer } = await import('../src/index.js');
    const traces = globalTracer.listTraces();
    expect(traces.length).toBeGreaterThanOrEqual(1);
  });

  it('traced 装饰器应该捕获错误', async () => {
    await expect(
      traced('failing-op', async () => {
        throw new Error('失败');
      })
    ).rejects.toThrow('失败');
  });
});
