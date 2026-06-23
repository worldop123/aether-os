import type { ID, Timestamp, Metadata } from '@aether/shared';
import { generateId, now, DEFAULTS, globalEventBus } from '@aether/shared';
import { MemoryError } from '@aether/shared';
import { cosineSimilarity } from './vector.js';

/**
 * Embedding 函数类型
 * 接收文本，返回其向量嵌入
 */
export type EmbeddingFn = (text: string) => Promise<number[]>;

/**
 * 消息角色
 */
export enum MessageRole {
  /** 系统消息 */
  SYSTEM = 'system',
  /** 用户消息 */
  USER = 'user',
  /** 助手消息 */
  ASSISTANT = 'assistant',
  /** 工具消息 */
  TOOL = 'tool',
}

/**
 * 记忆消息类型
 */
export interface MemoryMessage {
  /** 消息 ID */
  id: ID;
  /** 角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Timestamp;
  /** 元数据 */
  metadata?: Metadata;
  /** 工具调用 ID（仅 tool 角色） */
  toolCallId?: string;
  /** 工具名称（仅 tool 角色） */
  toolName?: string;
  /** 工具调用列表（仅 assistant 角色，当模型决定调用工具时） */
  toolCalls?: Array<{
    /** 调用 ID */
    id: string;
    /** 工具名称 */
    name: string;
    /** 工具参数 */
    arguments: Record<string, unknown>;
  }>;
}

/**
 * 短期记忆实现类
 * 用于存储当前对话上下文，有容量限制，FIFO 淘汰
 */
export class ShortTermMemory implements IShortTermMemory {
  private messages: MemoryMessage[] = [];
  private maxMessages: number;

  constructor(maxMessages: number = DEFAULTS.SHORT_TERM_MEMORY_LIMIT) {
    this.maxMessages = maxMessages;
  }

  /**
   * 获取当前上下文消息列表
   * @param limit 可选，限制返回数量
   */
  getContext(limit?: number): MemoryMessage[] {
    if (limit && limit < this.messages.length) {
      return this.messages.slice(-limit);
    }
    return [...this.messages];
  }

  /**
   * 添加一条消息到短期记忆
   * @param message 消息内容
   */
  addMessage(message: Omit<MemoryMessage, 'id' | 'timestamp'>): MemoryMessage {
    const newMessage: MemoryMessage = {
      ...message,
      id: generateId('msg'),
      timestamp: now(),
    };

    this.messages.push(newMessage);

    // FIFO 淘汰
    while (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    return newMessage;
  }

  /**
   * 清空短期记忆
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * 获取当前记忆的 token 估算数量
   * MVP 版本：简单按字符数估算（约 4 字符 = 1 token）
   */
  getTokenCount(): number {
    const totalChars = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * 获取消息数量
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * 设置最大消息数
   * @param maxMessages 最大消息数量
   */
  setMaxMessages(maxMessages: number): void {
    if (maxMessages < 1) {
      throw new MemoryError('最大消息数必须大于 0', 'INVALID_MAX_MESSAGES');
    }
    this.maxMessages = maxMessages;

    // 如果当前消息数超过新限制，进行淘汰
    while (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  /**
   * 获取最大消息数
   */
  getMaxMessages(): number {
    return this.maxMessages;
  }
}

/**
 * 短期记忆接口
 * 用于存储当前对话上下文，有容量限制
 */
export interface IShortTermMemory {
  /**
   * 获取当前上下文消息列表
   * @param limit 可选，限制返回数量
   */
  getContext(limit?: number): MemoryMessage[];

  /**
   * 添加一条消息到短期记忆
   * @param message 消息内容
   */
  addMessage(message: Omit<MemoryMessage, 'id' | 'timestamp'>): MemoryMessage;

  /**
   * 清空短期记忆
   */
  clear(): void;

  /**
   * 获取当前记忆的 token 估算数量
   */
  getTokenCount(): number;

  /**
   * 获取消息数量
   */
  getMessageCount(): number;

  /**
   * 设置最大消息数
   * @param maxMessages 最大消息数量
   */
  setMaxMessages(maxMessages: number): void;

  /**
   * 获取最大消息数
   */
  getMaxMessages(): number;
}

/**
 * 长期记忆条目
 */
export interface LongTermMemoryItem {
  /** 记忆 ID */
  id: ID;
  /** 所属 Agent ID */
  agentId: ID;
  /** 记忆内容 */
  content: string;
  /** 向量嵌入（可选，MVP 阶段可简化） */
  embedding?: number[];
  /** 记忆类型 */
  type: 'fact' | 'experience' | 'preference' | 'summary' | 'custom';
  /** 重要性评分 (0-1) */
  importance: number;
  /** 访问次数 */
  accessCount: number;
  /** 创建时间 */
  createdAt: Timestamp;
  /** 最后访问时间 */
  lastAccessedAt: Timestamp;
  /** 元数据 */
  metadata?: Metadata;
  /** 标签 */
  tags?: string[];
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult {
  /** 记忆条目 */
  item: LongTermMemoryItem;
  /** 相似度分数 (0-1) */
  similarity: number;
}

/**
 * 长期记忆实现类（内存版本）
 * 支持向量检索（注入 embeddingFn 时）和关键词匹配（降级方案）
 */
export class LongTermMemory implements ILongTermMemory {
  private memories: Map<ID, LongTermMemoryItem> = new Map();
  private embeddingFn?: EmbeddingFn;

  /**
   * @param options 可选配置
   *   - embeddingFn: 文本到向量的嵌入函数。注入后 store() 会自动生成 embedding，
   *                  search() 会用余弦相似度排序；未注入时降级为关键词匹配。
   */
  constructor(options?: { embeddingFn?: EmbeddingFn }) {
    this.embeddingFn = options?.embeddingFn;
  }

  /**
   * 存储一条长期记忆
   */
  async store(
    agentId: ID,
    content: string,
    options?: {
      type?: LongTermMemoryItem['type'];
      importance?: number;
      embedding?: number[];
      metadata?: Metadata;
      tags?: string[];
    }
  ): Promise<LongTermMemoryItem> {
    const nowTimestamp = now();

    // 优先使用调用方显式传入的 embedding；否则若注入了 embeddingFn，则自动生成
    let embedding = options?.embedding;
    if (embedding === undefined && this.embeddingFn) {
      try {
        embedding = await this.embeddingFn(content);
      } catch {
        // embedding 生成失败时不阻断存储，降级为无向量记忆
        embedding = undefined;
      }
    }

    const item: LongTermMemoryItem = {
      id: generateId('mem'),
      agentId,
      content,
      type: options?.type || 'fact',
      importance: options?.importance ?? 0.5,
      embedding,
      accessCount: 0,
      createdAt: nowTimestamp,
      lastAccessedAt: nowTimestamp,
      metadata: options?.metadata,
      tags: options?.tags,
    };

    this.memories.set(item.id, item);

    globalEventBus.emit('memory.added', item.id, agentId, nowTimestamp);

    return item;
  }

  /**
   * 搜索相关记忆
   * 如果注入了 embeddingFn 且记忆有 embedding，用余弦相似度检索；
   * 否则降级为关键词匹配
   */
  async search(
    agentId: ID,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      type?: LongTermMemoryItem['type'];
    }
  ): Promise<VectorSearchResult[]> {
    const topK = options?.topK ?? DEFAULTS.VECTOR_SEARCH_TOP_K;
    const threshold = options?.threshold ?? DEFAULTS.VECTOR_SIMILARITY_THRESHOLD;

    // 获取该 Agent 的所有记忆
    const agentMemories = Array.from(this.memories.values()).filter(
      (m) => m.agentId === agentId && (!options?.type || m.type === options.type)
    );

    // 如果注入了 embeddingFn，为 query 生成 embedding 以支持向量检索
    let queryEmbedding: number[] | undefined;
    if (this.embeddingFn) {
      try {
        queryEmbedding = await this.embeddingFn(query);
      } catch {
        queryEmbedding = undefined;
      }
    }

    // 是否启用向量检索：需要 query embedding 且至少有一条记忆有 embedding
    const useVectorSearch =
      !!queryEmbedding && agentMemories.some((m) => m.embedding && m.embedding.length > 0);

    const queryLower = query.toLowerCase();
    const results: VectorSearchResult[] = [];

    for (const item of agentMemories) {
      let similarity: number;

      if (useVectorSearch && item.embedding && item.embedding.length > 0) {
        // 向量检索：余弦相似度
        similarity = cosineSimilarity(queryEmbedding!, item.embedding);
      } else {
        // 降级为关键词匹配
        similarity = this.calculateSimilarity(
          queryLower,
          item.content.toLowerCase(),
          item.importance
        );
      }

      if (similarity >= threshold) {
        results.push({ item, similarity });
      }
    }

    // 按相似度排序，取 topK
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);

    // 更新访问信息
    for (const result of topResults) {
      this.updateAccessInfo(result.item.id);
    }

    return topResults;
  }

  /**
   * 计算相似度（基于子字符串匹配 + 重要性权重）
   * 对中英文都友好的简单算法
   */
  private calculateSimilarity(query: string, content: string, importance: number): number {
    if (!query || !content) {
      return 0;
    }

    // 简单的相似度计算：查询字符串在内容中出现的次数 + 长度比例
    let matchCount = 0;
    let pos = 0;
    while ((pos = content.indexOf(query, pos)) !== -1) {
      matchCount++;
      pos += query.length;
    }

    if (matchCount === 0) {
      // 如果没有完全匹配，检查部分匹配（每个字符）
      let charMatches = 0;
      for (const char of query) {
        if (content.includes(char)) {
          charMatches++;
        }
      }
      const charRatio = query.length > 0 ? charMatches / query.length : 0;
      return charRatio * 0.3 * (0.5 + importance * 0.5);
    }

    // 基于匹配次数和长度比例计算相似度
    // 完全匹配至少给 0.8 的基础相似度
    const lengthRatio = Math.min(query.length / content.length, 1);
    const baseSimilarity = Math.min(0.8 + (matchCount - 1) * 0.1 + lengthRatio * 0.1, 1);

    // 结合重要性加权
    return baseSimilarity * (0.5 + importance * 0.5);
  }

  /**
   * 更新记忆访问信息
   */
  private updateAccessInfo(memoryId: ID): void {
    const item = this.memories.get(memoryId);
    if (item) {
      item.accessCount++;
      item.lastAccessedAt = now();
    }
  }

  /**
   * 根据 ID 获取记忆
   */
  async get(memoryId: ID): Promise<LongTermMemoryItem | null> {
    const item = this.memories.get(memoryId);
    if (item) {
      this.updateAccessInfo(memoryId);
      return { ...item };
    }
    return null;
  }

  /**
   * 删除一条记忆
   */
  async delete(memoryId: ID): Promise<boolean> {
    const item = this.memories.get(memoryId);
    if (item) {
      this.memories.delete(memoryId);
      globalEventBus.emit('memory.deleted', memoryId, item.agentId, now());
      return true;
    }
    return false;
  }

  /**
   * 列出指定 Agent 的所有记忆
   */
  async list(
    agentId: ID,
    options?: {
      page?: number;
      pageSize?: number;
      type?: LongTermMemoryItem['type'];
      sortBy?: 'createdAt' | 'lastAccessedAt' | 'importance' | 'accessCount';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    items: LongTermMemoryItem[];
    total: number;
  }> {
    let items = Array.from(this.memories.values()).filter(
      (m) => m.agentId === agentId && (!options?.type || m.type === options.type)
    );

    // 排序
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';

    items.sort((a, b) => {
      const aVal = a[sortBy] as number;
      const bVal = b[sortBy] as number;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const total = items.length;

    // 分页
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    items = items.slice(start, end);

    return { items, total };
  }

  /**
   * 更新记忆重要性
   */
  async updateImportance(memoryId: ID, importance: number): Promise<void> {
    const item = this.memories.get(memoryId);
    if (!item) {
      throw new MemoryError(`记忆 ${memoryId} 不存在`, 'MEMORY_NOT_FOUND');
    }

    if (importance < 0 || importance > 1) {
      throw new MemoryError('重要性评分必须在 0-1 之间', 'INVALID_IMPORTANCE');
    }

    item.importance = importance;
  }

  /**
   * 清空指定 Agent 的所有长期记忆
   */
  async clear(agentId: ID): Promise<void> {
    const agentMemories = Array.from(this.memories.values()).filter(
      (m) => m.agentId === agentId
    );

    for (const item of agentMemories) {
      this.memories.delete(item.id);
    }

    globalEventBus.emit('memory.cleared', agentId, now());
  }
}

/**
 * 长期记忆接口
 * 用于持久化存储重要信息，支持向量检索
 */
export interface ILongTermMemory {
  /**
   * 存储一条长期记忆
   * @param agentId Agent ID
   * @param content 记忆内容
   * @param options 可选配置
   */
  store(
    agentId: ID,
    content: string,
    options?: {
      type?: LongTermMemoryItem['type'];
      importance?: number;
      embedding?: number[];
      metadata?: Metadata;
      tags?: string[];
    }
  ): Promise<LongTermMemoryItem>;

  /**
   * 搜索相关记忆（向量相似度搜索）
   * @param agentId Agent ID
   * @param query 查询内容
   * @param options 搜索选项
   */
  search(
    agentId: ID,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      type?: LongTermMemoryItem['type'];
    }
  ): Promise<VectorSearchResult[]>;

  /**
   * 根据 ID 获取记忆
   * @param memoryId 记忆 ID
   */
  get(memoryId: ID): Promise<LongTermMemoryItem | null>;

  /**
   * 删除一条记忆
   * @param memoryId 记忆 ID
   */
  delete(memoryId: ID): Promise<boolean>;

  /**
   * 列出指定 Agent 的所有记忆
   * @param agentId Agent ID
   * @param options 分页和过滤选项
   */
  list(
    agentId: ID,
    options?: {
      page?: number;
      pageSize?: number;
      type?: LongTermMemoryItem['type'];
      sortBy?: 'createdAt' | 'lastAccessedAt' | 'importance' | 'accessCount';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    items: LongTermMemoryItem[];
    total: number;
  }>;

  /**
   * 更新记忆重要性
   * @param memoryId 记忆 ID
   * @param importance 新的重要性评分
   */
  updateImportance(memoryId: ID, importance: number): Promise<void>;

  /**
   * 清空指定 Agent 的所有长期记忆
   * @param agentId Agent ID
   */
  clear(agentId: ID): Promise<void>;
}

/**
 * 记忆管理器实现类
 * 统一管理短期记忆和长期记忆
 */
export class MemoryManager implements IMemoryManager {
  readonly shortTerm: IShortTermMemory;
  readonly longTerm: ILongTermMemory;
  private agentId: ID;

  constructor(agentId: ID, shortTerm?: IShortTermMemory, longTerm?: ILongTermMemory) {
    this.agentId = agentId;
    this.shortTerm = shortTerm || new ShortTermMemory();
    this.longTerm = longTerm || new LongTermMemory();
  }

  /**
   * 获取完整上下文（短期记忆 + 相关长期记忆）
   */
  async getFullContext(
    query?: string,
    options?: {
      maxShortTerm?: number;
      maxLongTerm?: number;
      includeLongTerm?: boolean;
    }
  ): Promise<MemoryMessage[]> {
    const maxShortTerm = options?.maxShortTerm || this.shortTerm.getMaxMessages();
    const maxLongTerm = options?.maxLongTerm || 5;
    const includeLongTerm = options?.includeLongTerm ?? true;

    // 获取短期记忆
    const shortTermMessages = this.shortTerm.getContext(maxShortTerm);

    if (!includeLongTerm || !query) {
      return shortTermMessages;
    }

    // 搜索相关长期记忆
    const longTermResults = await this.longTerm.search(this.agentId, query, {
      topK: maxLongTerm,
    });

    // 将长期记忆转换为消息格式，放在上下文的前面
    const longTermMessages: MemoryMessage[] = longTermResults.map((result) => ({
      id: result.item.id,
      role: MessageRole.SYSTEM,
      content: `[长期记忆] ${result.item.content}`,
      timestamp: result.item.createdAt,
      metadata: {
        type: 'long_term_memory',
        similarity: result.similarity,
        importance: result.item.importance,
      },
    }));

    // 合并：长期记忆在前，短期记忆在后
    return [...longTermMessages, ...shortTermMessages];
  }

  /**
   * 将重要的短期记忆保存到长期记忆
   */
  async consolidateToLongTerm(agentId: ID, messageIds?: ID[]): Promise<void> {
    const messages = this.shortTerm.getContext();

    let messagesToConsolidate: MemoryMessage[];
    if (messageIds) {
      messagesToConsolidate = messages.filter((m) => messageIds.includes(m.id));
    } else {
      // 默认保存用户和助手的消息
      messagesToConsolidate = messages.filter(
        (m) => m.role === MessageRole.USER || m.role === MessageRole.ASSISTANT
      );
    }

    for (const message of messagesToConsolidate) {
      await this.longTerm.store(agentId, message.content, {
        type: 'experience',
        importance: 0.6,
        metadata: {
          source: 'short_term_consolidation',
          originalRole: message.role,
        },
      });
    }
  }
}

/**
 * 记忆管理器接口
 * 统一管理短期记忆和长期记忆
 */
export interface IMemoryManager {
  /** 短期记忆 */
  readonly shortTerm: IShortTermMemory;
  /** 长期记忆 */
  readonly longTerm: ILongTermMemory;

  /**
   * 获取完整上下文（短期记忆 + 相关长期记忆）
   * @param query 当前查询，用于检索相关长期记忆
   * @param options 配置选项
   */
  getFullContext(
    query?: string,
    options?: {
      maxShortTerm?: number;
      maxLongTerm?: number;
      includeLongTerm?: boolean;
    }
  ): Promise<MemoryMessage[]>;

  /**
   * 将重要的短期记忆保存到长期记忆
   * @param agentId Agent ID
   * @param messageIds 要保存的消息 ID 列表
   */
  consolidateToLongTerm(agentId: ID, messageIds?: ID[]): Promise<void>;
}
