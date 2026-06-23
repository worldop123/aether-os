import type { Timestamp, Metadata } from '@aether/shared';
import { now, generateId } from '@aether/shared';

/**
 * 指标类型
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
}

/**
 * 指标标签
 */
export type MetricLabels = Record<string, string>;

/**
 * 指标数据点
 */
export interface MetricPoint {
  /** 时间戳 */
  timestamp: Timestamp;
  /** 值 */
  value: number;
  /** 标签 */
  labels?: MetricLabels;
}

/**
 * 指标定义
 */
export interface MetricDefinition {
  /** 指标名称 */
  name: string;
  /** 指标描述 */
  description: string;
  /** 指标类型 */
  type: MetricType;
  /** 单位 */
  unit?: string;
}

/**
 * 计数器指标
 */
export class Counter {
  readonly name: string;
  readonly description: string;
  private values: Map<string, number> = new Map();
  private history: MetricPoint[] = [];
  private maxHistory: number;

  constructor(name: string, description: string, maxHistory: number = 10000) {
    this.name = name;
    this.description = description;
    this.maxHistory = maxHistory;
  }

  /**
   * 增加计数
   */
  inc(value: number = 1, labels?: MetricLabels): void {
    const key = this.labelsKey(labels);
    const current = this.values.get(key) || 0;
    const newValue = current + value;
    this.values.set(key, newValue);

    this.recordPoint(value, labels);
  }

  /**
   * 获取计数值
   */
  get(labels?: MetricLabels): number {
    return this.values.get(this.labelsKey(labels)) || 0;
  }

  /**
   * 获取所有标签组合的值
   */
  getAll(): Array<{ labels?: MetricLabels; value: number }> {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      labels: this.parseKey(key),
      value,
    }));
  }

  /**
   * 获取历史数据
   */
  getHistory(): MetricPoint[] {
    return [...this.history];
  }

  /**
   * 重置计数器
   */
  reset(): void {
    this.values.clear();
    this.history = [];
  }

  private recordPoint(value: number, labels?: MetricLabels): void {
    this.history.push({ timestamp: now(), value, labels });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private labelsKey(labels?: MetricLabels): string {
    if (!labels) return '__default__';
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}=${labels[k]}`)
      .join(',');
  }

  private parseKey(key: string): MetricLabels | undefined {
    if (key === '__default__') return undefined;
    const labels: MetricLabels = {};
    for (const part of key.split(',')) {
      const [k, v] = part.split('=');
      labels[k] = v;
    }
    return labels;
  }
}

/**
 * 仪表盘指标（可增可减）
 */
export class Gauge {
  readonly name: string;
  readonly description: string;
  private values: Map<string, number> = new Map();
  private history: MetricPoint[] = [];
  private maxHistory: number;

  constructor(name: string, description: string, maxHistory: number = 10000) {
    this.name = name;
    this.description = description;
    this.maxHistory = maxHistory;
  }

  /**
   * 设置值
   */
  set(value: number, labels?: MetricLabels): void {
    this.values.set(this.labelsKey(labels), value);
    this.recordPoint(value, labels);
  }

  /**
   * 增加值
   */
  inc(value: number = 1, labels?: MetricLabels): void {
    const key = this.labelsKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
    this.recordPoint(current + value, labels);
  }

  /**
   * 减少值
   */
  dec(value: number = 1, labels?: MetricLabels): void {
    this.inc(-value, labels);
  }

  /**
   * 获取值
   */
  get(labels?: MetricLabels): number {
    return this.values.get(this.labelsKey(labels)) || 0;
  }

  /**
   * 获取历史数据
   */
  getHistory(): MetricPoint[] {
    return [...this.history];
  }

  private recordPoint(value: number, labels?: MetricLabels): void {
    this.history.push({ timestamp: now(), value, labels });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private labelsKey(labels?: MetricLabels): string {
    if (!labels) return '__default__';
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}=${labels[k]}`)
      .join(',');
  }
}

/**
 * 直方图指标
 */
export class Histogram {
  readonly name: string;
  readonly description: string;
  private buckets: number[];
  private bucketCounts: Map<string, number[]> = new Map();
  private sum: Map<string, number> = new Map();
  private count: Map<string, number> = new Map();
  private history: MetricPoint[] = [];
  private maxHistory: number;

  constructor(
    name: string,
    description: string,
    buckets: number[] = [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100],
    maxHistory: number = 10000
  ) {
    this.name = name;
    this.description = description;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.maxHistory = maxHistory;
  }

  /**
   * 观察一个值
   */
  observe(value: number, labels?: MetricLabels): void {
    const key = this.labelsKey(labels);

    // 初始化桶
    if (!this.bucketCounts.has(key)) {
      this.bucketCounts.set(key, new Array(this.buckets.length + 1).fill(0));
      this.sum.set(key, 0);
      this.count.set(key, 0);
    }

    // 更新桶计数
    const counts = this.bucketCounts.get(key)!;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        counts[i]++;
      }
    }
    counts[counts.length - 1]++; // +Inf 桶

    this.sum.set(key, (this.sum.get(key) || 0) + value);
    this.count.set(key, (this.count.get(key) || 0) + 1);

    this.history.push({ timestamp: now(), value, labels });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * 获取分位数
   */
  getQuantile(quantile: number, labels?: MetricLabels): number | undefined {
    const key = this.labelsKey(labels);
    const history = this.history.filter(
      (p) => this.labelsKey(p.labels) === key
    );
    if (history.length === 0) return undefined;

    const sorted = history.map((p) => p.value).sort((a, b) => a - b);
    const idx = Math.floor(quantile * (sorted.length - 1));
    return sorted[idx];
  }

  /**
   * 获取统计信息
   */
  getStats(labels?: MetricLabels): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
  } | undefined {
    const key = this.labelsKey(labels);
    const count = this.count.get(key);
    const sum = this.sum.get(key);
    if (!count || sum === undefined) return undefined;

    const history = this.history.filter(
      (p) => this.labelsKey(p.labels) === key
    );
    const values = history.map((p) => p.value);

    return {
      count,
      sum,
      avg: sum / count,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    };
  }

  /**
   * 获取桶分布
   */
  getBuckets(labels?: MetricLabels): Array<{ bucket: number; count: number }> {
    const key = this.labelsKey(labels);
    const counts = this.bucketCounts.get(key);
    if (!counts) return [];

    return this.buckets.map((bucket, i) => ({
      bucket,
      count: counts[i],
    }));
  }

  private labelsKey(labels?: MetricLabels): string {
    if (!labels) return '__default__';
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}=${labels[k]}`)
      .join(',');
  }
}

/**
 * 指标注册表
 */
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  /**
   * 创建或获取计数器
   */
  counter(name: string, description: string): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter(name, description));
    }
    return this.counters.get(name)!;
  }

  /**
   * 创建或获取仪表盘
   */
  gauge(name: string, description: string): Gauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Gauge(name, description));
    }
    return this.gauges.get(name)!;
  }

  /**
   * 创建或获取直方图
   */
  histogram(name: string, description: string, buckets?: number[]): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Histogram(name, description, buckets));
    }
    return this.histograms.get(name)!;
  }

  /**
   * 获取所有计数器
   */
  getCounters(): Counter[] {
    return Array.from(this.counters.values());
  }

  /**
   * 获取所有仪表盘
   */
  getGauges(): Gauge[] {
    return Array.from(this.gauges.values());
  }

  /**
   * 获取所有直方图
   */
  getHistograms(): Histogram[] {
    return Array.from(this.histograms.values());
  }

  /**
   * 导出所有指标（Prometheus 格式）
   */
  export(): string {
    const lines: string[] = [];

    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.description}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const { labels, value } of counter.getAll()) {
        const labelStr = labels
          ? `{${Object.entries(labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',')}}`
          : '';
        lines.push(`${counter.name}${labelStr} ${value}`);
      }
    }

    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.description}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name} ${gauge.get()}`);
    }

    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.description}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      const stats = histogram.getStats();
      if (stats) {
        lines.push(`${histogram.name}_count ${stats.count}`);
        lines.push(`${histogram.name}_sum ${stats.sum}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 清空所有指标
   */
  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/**
 * 全局指标注册表
 */
export const metricsRegistry = new MetricsRegistry();
