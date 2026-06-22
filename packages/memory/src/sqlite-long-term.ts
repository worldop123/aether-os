import type { ID, Timestamp, Metadata } from '@aether/shared';
import { generateId, now, DEFAULTS, globalEventBus, MemoryError } from '@aether/shared';
import type { Database } from 'better-sqlite3';
import type {
  ILongTermMemory,
  LongTermMemoryItem,
  VectorSearchResult,
} from './memory.js';

/**
 * 基于 SQLite 的长期记忆实现
 * 支持向量存储和余弦相似度检索（向量存储为 JSON 字符串）
 */
export class SqliteLongTermMemory implements ILongTermMemory {
  private dbPath: string;
  private db: Database | null = null;
  private initialized: boolean = false;

  // 预编译语句缓存
  private stmtInsert!: ReturnType<Database['prepare']>;
  private stmtGetById!: ReturnType<Database['prepare']>;
  private stmtDeleteById!: ReturnType<Database['prepare']>;
  private stmtListByAgent!: ReturnType<Database['prepare']>;
  private stmtCountByAgent!: ReturnType<Database['prepare']>;
  private stmtUpdateImportance!: ReturnType<Database['prepare']>;
  private stmtUpdateAccess!: ReturnType<Database['prepare']>;
  private stmtClearByAgent!: ReturnType<Database['prepare']>;
  private stmtClearAll!: ReturnType<Database['prepare']>;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  /**
   * 初始化持久化存储
   * 动态导入 better-sqlite3，创建表和预编译语句
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);
      this.createTables();
      this.prepareStatements();
      this.initialized = true;
    } catch (error) {
      throw new MemoryError(
        `初始化 SQLite 长期记忆失败: ${error instanceof Error ? error.message : String(error)}`,
        'SQLITE_INIT_ERROR'
      );
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        importance REAL NOT NULL,
        embedding TEXT,
        metadata TEXT,
        tags TEXT,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)`);
  }

  /**
   * 预编译 SQL 语句以提升性能
   */
  private prepareStatements(): void {
    if (!this.db) return;

    this.stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, agent_id, content, type, importance, embedding, metadata, tags, created_at, last_accessed_at, access_count)
      VALUES (@id, @agent_id, @content, @type, @importance, @embedding, @metadata, @tags, @created_at, @last_accessed_at, @access_count)
    `);

    this.stmtGetById = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    this.stmtDeleteById = this.db.prepare('DELETE FROM memories WHERE id = ?');
    this.stmtListByAgent = this.db.prepare('SELECT * FROM memories WHERE agent_id = ?');
    this.stmtCountByAgent = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?');
    this.stmtUpdateImportance = this.db.prepare(`
      UPDATE memories SET importance = @importance WHERE id = @id
    `);
    this.stmtUpdateAccess = this.db.prepare(`
      UPDATE memories SET last_accessed_at = @lastAccessedAt, access_count = access_count + 1 WHERE id = @id
    `);
    this.stmtClearByAgent = this.db.prepare('DELETE FROM memories WHERE agent_id = ?');
    this.stmtClearAll = this.db.prepare('DELETE FROM memories');
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new MemoryError('SQLite 长期记忆尚未初始化，请先调用 initialize()', 'SQLITE_NOT_INITIALIZED');
    }
  }

  /**
   * 将数据库行转换为 LongTermMemoryItem
   */
  private rowToItem(row: any): LongTermMemoryItem {
    return {
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      type: row.type,
      importance: row.importance,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
    };
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
    this.ensureInitialized();

    const nowTimestamp = now();
    const item: LongTermMemoryItem = {
      id: generateId('mem'),
      agentId,
      content,
      type: options?.type || 'fact',
      importance: options?.importance ?? 0.5,
      embedding: options?.embedding,
      accessCount: 0,
      createdAt: nowTimestamp,
      lastAccessedAt: nowTimestamp,
      metadata: options?.metadata,
      tags: options?.tags,
    };

    this.stmtInsert.run({
      id: item.id,
      agent_id: item.agentId,
      content: item.content,
      type: item.type,
      importance: item.importance,
      embedding: item.embedding ? JSON.stringify(item.embedding) : null,
      metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      tags: item.tags ? JSON.stringify(item.tags) : null,
      created_at: item.createdAt,
      last_accessed_at: item.lastAccessedAt,
      access_count: item.accessCount,
    });

    globalEventBus.emit('memory.added', item.id, agentId, nowTimestamp);

    return item;
  }

  /**
   * 搜索相关记忆
   * 如果记忆有 embedding 且 query 有 embedding，用余弦相似度检索；
   * 否则降级为关键词匹配
   */
  async search(
    agentId: ID,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      type?: LongTermMemoryItem['type'];
      embedding?: number[];
    }
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const topK = options?.topK ?? DEFAULTS.VECTOR_SEARCH_TOP_K;
    const threshold = options?.threshold ?? DEFAULTS.VECTOR_SIMILARITY_THRESHOLD;
    const queryEmbedding = options?.embedding;

    // 获取该 Agent 的所有记忆
    const rows = this.stmtListByAgent.all(agentId) as any[];
    const agentMemories = rows
      .map((row) => this.rowToItem(row))
      .filter((m) => !options?.type || m.type === options.type);

    const results: VectorSearchResult[] = [];
    const useVectorSearch = !!queryEmbedding;

    for (const item of agentMemories) {
      let similarity: number;

      if (useVectorSearch && item.embedding && item.embedding.length > 0) {
        // 向量检索：余弦相似度
        similarity = this.cosineSimilarity(queryEmbedding!, item.embedding);
      } else {
        // 降级为关键词匹配
        similarity = this.calculateSimilarity(
          query.toLowerCase(),
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
      await this.updateAccess(result.item.id);
    }

    return topResults;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
   * 根据 ID 获取记忆
   */
  async get(memoryId: ID): Promise<LongTermMemoryItem | null> {
    this.ensureInitialized();

    const row = this.stmtGetById.get(memoryId) as any;
    if (!row) return null;

    await this.updateAccess(memoryId);
    // 重新获取以反映递增后的 access_count 和更新的 last_accessed_at
    const updatedRow = this.stmtGetById.get(memoryId) as any;
    return this.rowToItem(updatedRow);
  }

  /**
   * 删除一条记忆
   */
  async delete(memoryId: ID): Promise<boolean> {
    this.ensureInitialized();

    const row = this.stmtGetById.get(memoryId) as any;
    if (!row) return false;

    this.stmtDeleteById.run(memoryId);
    globalEventBus.emit('memory.deleted', memoryId, row.agent_id, now());

    return true;
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
    this.ensureInitialized();

    let items = (this.stmtListByAgent.all(agentId) as any[])
      .map((row) => this.rowToItem(row))
      .filter((m) => !options?.type || m.type === options.type);

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
    this.ensureInitialized();

    const row = this.stmtGetById.get(memoryId) as any;
    if (!row) {
      throw new MemoryError(`记忆 ${memoryId} 不存在`, 'MEMORY_NOT_FOUND');
    }

    if (importance < 0 || importance > 1) {
      throw new MemoryError('重要性评分必须在 0-1 之间', 'INVALID_IMPORTANCE');
    }

    this.stmtUpdateImportance.run({ importance, id: memoryId });
  }

  /**
   * 更新记忆访问信息（递增 accessCount，更新 lastAccessedAt）
   */
  async updateAccess(memoryId: ID): Promise<void> {
    this.ensureInitialized();
    this.stmtUpdateAccess.run({ lastAccessedAt: now(), id: memoryId });
  }

  /**
   * 清空指定 Agent 的所有长期记忆
   */
  async clear(agentId: ID): Promise<void> {
    this.ensureInitialized();

    this.stmtClearByAgent.run(agentId);
    globalEventBus.emit('memory.cleared', agentId, now());
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
