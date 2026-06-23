import type { ID, Timestamp } from '@aether/shared';
import { now, generateId, globalEventBus } from '@aether/shared';
import type {
  ILongTermMemory,
  IShortTermMemory,
  MemoryMessage,
  LongTermMemoryItem,
} from './memory.js';
import { MessageRole } from './memory.js';

/**
 * 记忆巩固策略
 */
export type ConsolidationStrategy =
  | 'importance' // 基于重要性评分
  | 'recency' // 基于时间近度
  | 'frequency' // 基于访问频率
  | 'hybrid'; // 混合策略

/**
 * 记忆巩固配置
 */
export interface ConsolidationConfig {
  /** 巩固策略 */
  strategy: ConsolidationStrategy;
  /** 重要性阈值（0-1） */
  importanceThreshold: number;
  /** 最大巩固记忆数 */
  maxConsolidate: number;
  /** 最小消息年龄（毫秒，太新的消息不巩固） */
  minAgeMs: number;
  /** 是否自动提取摘要 */
  autoSummarize: boolean;
  /** 摘要最大长度 */
  summaryMaxLength: number;
}

/**
 * 默认巩固配置
 */
export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  strategy: 'hybrid',
  importanceThreshold: 0.5,
  maxConsolidate: 20,
  minAgeMs: 60000, // 1 分钟
  autoSummarize: true,
  summaryMaxLength: 500,
};

/**
 * 遗忘策略
 */
export type ForgettingStrategy =
  | 'fifo' // 先进先出
  | 'lru' // 最久未使用
  | 'lfu' // 最少使用频率
  | 'decay' // 时间衰减
  | 'importance-based'; // 基于重要性

/**
 * 遗忘配置
 */
export interface ForgettingConfig {
  /** 遗忘策略 */
  strategy: ForgettingStrategy;
  /** 最大记忆数量 */
  maxMemories: number;
  /** 衰减因子（decay 策略） */
  decayFactor: number;
  /** 最小保留重要性 */
  minImportance: number;
  /** 过期时间（毫秒） */
  expirationMs: number;
}

/**
 * 默认遗忘配置
 */
export const DEFAULT_FORGETTING_CONFIG: ForgettingConfig = {
  strategy: 'importance-based',
  maxMemories: 10000,
  decayFactor: 0.95,
  minImportance: 0.1,
  expirationMs: 30 * 24 * 60 * 60 * 1000, // 30 天
};

/**
 * 巩固结果
 */
export interface ConsolidationResult {
  /** 巩固的记忆数 */
  consolidated: number;
  /** 创建的摘要数 */
  summaries: number;
  /** 巩固的记忆 ID 列表 */
  memoryIds: ID[];
  /** 巩固时间 */
  timestamp: Timestamp;
}

/**
 * 遗忘结果
 */
export interface ForgettingResult {
  /** 遗忘的记忆数 */
  forgotten: number;
  /** 遗忘的记忆 ID 列表 */
  memoryIds: ID[];
  /** 遗忘时间 */
  timestamp: Timestamp;
}

/**
 * 记忆巩固器
 * 将重要的短期记忆巩固到长期记忆
 */
export class MemoryConsolidator {
  private longTermMemory: ILongTermMemory;
  private config: ConsolidationConfig;
  private summaryFn?: (messages: MemoryMessage[]) => Promise<string>;

  constructor(
    longTermMemory: ILongTermMemory,
    config?: Partial<ConsolidationConfig>,
    summaryFn?: (messages: MemoryMessage[]) => Promise<string>
  ) {
    this.longTermMemory = longTermMemory;
    this.config = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
    this.summaryFn = summaryFn;
  }

  /**
   * 执行记忆巩固
   * @param agentId Agent ID
   * @param shortTermMemory 短期记忆
   */
  async consolidate(
    agentId: ID,
    shortTermMemory: IShortTermMemory
  ): Promise<ConsolidationResult> {
    const messages = shortTermMemory.getContext();
    const nowTimestamp = now();

    // 过滤符合条件的消息
    const candidates = messages.filter((msg) => {
      // 跳过系统消息
      if (msg.role === MessageRole.SYSTEM) return false;
      // 跳过太新的消息
      if (nowTimestamp - msg.timestamp < this.config.minAgeMs) return false;
      // 跳过工具消息（通常不需要巩固）
      if (msg.role === MessageRole.TOOL) return false;
      return true;
    });

    if (candidates.length === 0) {
      return {
        consolidated: 0,
        summaries: 0,
        memoryIds: [],
        timestamp: nowTimestamp,
      };
    }

    // 根据策略排序并选择
    const selected = this.selectByStrategy(candidates, nowTimestamp);

    const memoryIds: ID[] = [];
    let summaries = 0;

    // 存储到长期记忆
    for (const msg of selected) {
      const importance = this.calculateImportance(msg, nowTimestamp);

      if (importance >= this.config.importanceThreshold) {
        const item = await this.longTermMemory.store(agentId, msg.content, {
          type: msg.role === MessageRole.USER ? 'fact' : 'summary',
          importance,
          metadata: {
            role: msg.role,
            originalTimestamp: msg.timestamp,
            consolidatedAt: nowTimestamp,
          },
          tags: [msg.role],
        });
        memoryIds.push(item.id);
      }
    }

    // 自动生成摘要
    if (this.config.autoSummarize && this.summaryFn && selected.length > 1) {
      try {
        const summary = await this.summaryFn(selected);
        if (summary && summary.length > 0) {
          const truncated = summary.slice(0, this.config.summaryMaxLength);
          const summaryItem = await this.longTermMemory.store(agentId, truncated, {
            type: 'summary',
            importance: 0.8, // 摘要重要性较高
            metadata: {
              consolidatedAt: nowTimestamp,
              messageCount: selected.length,
            },
            tags: ['summary', 'auto-generated'],
          });
          memoryIds.push(summaryItem.id);
          summaries = 1;
        }
      } catch {
        // 摘要生成失败不影响巩固
      }
    }

    const result: ConsolidationResult = {
      consolidated: memoryIds.length - summaries,
      summaries,
      memoryIds,
      timestamp: nowTimestamp,
    };

    globalEventBus.emit('memory.consolidated', agentId, result, nowTimestamp);

    return result;
  }

  /**
   * 根据策略选择消息
   */
  private selectByStrategy(
    messages: MemoryMessage[],
    nowTimestamp: Timestamp
  ): MemoryMessage[] {
    const sorted = [...messages];

    switch (this.config.strategy) {
      case 'importance':
        sorted.sort((a, b) => b.content.length - a.content.length);
        break;
      case 'recency':
        sorted.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'frequency':
        // 简化：按内容长度（更长的可能更重要）
        sorted.sort((a, b) => b.content.length - a.content.length);
        break;
      case 'hybrid':
      default:
        sorted.sort((a, b) => {
          const scoreA = this.calculateImportance(a, nowTimestamp);
          const scoreB = this.calculateImportance(b, nowTimestamp);
          return scoreB - scoreA;
        });
        break;
    }

    return sorted.slice(0, this.config.maxConsolidate);
  }

  /**
   * 计算消息重要性（0-1）
   */
  private calculateImportance(
    msg: MemoryMessage,
    nowTimestamp: Timestamp
  ): number {
    let score = 0;

    // 内容长度因素（0-0.3）
    const lengthScore = Math.min(msg.content.length / 500, 1) * 0.3;
    score += lengthScore;

    // 时间近度因素（0-0.3）越新越重要
    const age = nowTimestamp - msg.timestamp;
    const recencyScore = Math.max(0, 1 - age / (24 * 60 * 60 * 1000)) * 0.3;
    score += recencyScore;

    // 角色因素（0-0.4）
    if (msg.role === MessageRole.ASSISTANT) {
      score += 0.4; // 助手回复通常更重要
    } else if (msg.role === MessageRole.USER) {
      score += 0.3; // 用户消息
    }

    return Math.min(score, 1);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ConsolidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ConsolidationConfig {
    return { ...this.config };
  }
}

/**
 * 记忆遗忘管理器
 * 根据策略自动遗忘不重要的记忆
 */
export class MemoryForgetter {
  private longTermMemory: ILongTermMemory;
  private config: ForgettingConfig;

  constructor(
    longTermMemory: ILongTermMemory,
    config?: Partial<ForgettingConfig>
  ) {
    this.longTermMemory = longTermMemory;
    this.config = { ...DEFAULT_FORGETTING_CONFIG, ...config };
  }

  /**
   * 执行遗忘
   * @param agentId Agent ID
   */
  async forget(agentId: ID): Promise<ForgettingResult> {
    const nowTimestamp = now();

    // 获取所有记忆
    const { items } = await this.longTermMemory.list(agentId, {
      pageSize: 100000,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });

    if (items.length === 0) {
      return {
        forgotten: 0,
        memoryIds: [],
        timestamp: nowTimestamp,
      };
    }

    // 计算每条记忆的保留分数
    const scored = items.map((item) => ({
      item,
      score: this.calculateRetentionScore(item, nowTimestamp),
    }));

    // 按分数排序（分数低的先遗忘）
    scored.sort((a, b) => a.score - b.score);

    const toForget: LongTermMemoryItem[] = [];

    // 1. 先遗忘低于最小重要性的
    for (const { item, score } of scored) {
      if (item.importance < this.config.minImportance) {
        toForget.push(item);
      }
    }

    // 2. 遗忘过期的
    for (const { item } of scored) {
      if (
        !toForget.includes(item) &&
        nowTimestamp - item.createdAt > this.config.expirationMs
      ) {
        toForget.push(item);
      }
    }

    // 3. 如果超过最大数量，遗忘分数最低的
    const remaining = items.length - toForget.length;
    if (remaining > this.config.maxMemories) {
      const extra = remaining - this.config.maxMemories;
      for (const { item } of scored) {
        if (toForget.includes(item)) continue;
        toForget.push(item);
        if (toForget.length >= items.length - this.config.maxMemories) break;
      }
    }

    // 执行遗忘
    const memoryIds: ID[] = [];
    for (const item of toForget) {
      const deleted = await this.longTermMemory.delete(item.id);
      if (deleted) {
        memoryIds.push(item.id);
      }
    }

    const result: ForgettingResult = {
      forgotten: memoryIds.length,
      memoryIds,
      timestamp: nowTimestamp,
    };

    globalEventBus.emit('memory.forgotten', agentId, result, nowTimestamp);

    return result;
  }

  /**
   * 计算记忆保留分数（0-1，越高越应该保留）
   */
  private calculateRetentionScore(
    item: LongTermMemoryItem,
    nowTimestamp: Timestamp
  ): number {
    let score = 0;

    // 重要性因素（0-0.4）
    score += item.importance * 0.4;

    // 访问频率因素（0-0.3）
    const frequencyScore = Math.min(item.accessCount / 10, 1) * 0.3;
    score += frequencyScore;

    // 时间近度因素（0-0.3）
    const lastAccessed = item.lastAccessedAt || item.createdAt;
    const age = nowTimestamp - lastAccessed;
    const recencyScore = Math.max(0, 1 - age / (7 * 24 * 60 * 60 * 1000)) * 0.3;
    score += recencyScore;

    // 应用衰减因子
    if (this.config.strategy === 'decay') {
      const decayDays = age / (24 * 60 * 60 * 1000);
      score *= Math.pow(this.config.decayFactor, decayDays);
    }

    return score;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ForgettingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ForgettingConfig {
    return { ...this.config };
  }
}

/**
 * 记忆维护管理器
 * 定期执行巩固和遗忘
 */
export class MemoryMaintenance {
  private consolidator: MemoryConsolidator;
  private forgetter: MemoryForgetter;
  private intervalMs: number;
  private timer?: NodeJS.Timeout;
  private running: boolean = false;

  constructor(
    longTermMemory: ILongTermMemory,
    options?: {
      consolidationConfig?: Partial<ConsolidationConfig>;
      forgettingConfig?: Partial<ForgettingConfig>;
      intervalMs?: number;
      summaryFn?: (messages: MemoryMessage[]) => Promise<string>;
    }
  ) {
    this.consolidator = new MemoryConsolidator(
      longTermMemory,
      options?.consolidationConfig,
      options?.summaryFn
    );
    this.forgetter = new MemoryForgetter(
      longTermMemory,
      options?.forgettingConfig
    );
    this.intervalMs = options?.intervalMs ?? 5 * 60 * 1000; // 默认 5 分钟
  }

  /**
   * 启动定期维护
   * @param agentId Agent ID
   * @param shortTermMemory 短期记忆
   */
  start(agentId: ID, shortTermMemory: IShortTermMemory): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.runOnce(agentId, shortTermMemory);
      } finally {
        this.running = false;
      }
    }, this.intervalMs);
  }

  /**
   * 执行一次维护
   */
  async runOnce(
    agentId: ID,
    shortTermMemory: IShortTermMemory
  ): Promise<{ consolidation: ConsolidationResult; forgetting: ForgettingResult }> {
    const consolidation = await this.consolidator.consolidate(
      agentId,
      shortTermMemory
    );
    const forgetting = await this.forgetter.forget(agentId);

    return { consolidation, forgetting };
  }

  /**
   * 停止定期维护
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 获取巩固器
   */
  getConsolidator(): MemoryConsolidator {
    return this.consolidator;
  }

  /**
   * 获取遗忘器
   */
  getForgetter(): MemoryForgetter {
    return this.forgetter;
  }
}
