import type { ID, Metadata } from '@aether/shared';
import type { IModelProvider } from '@aether/model-router';
import type {
  IMemoryManager,
  LongTermMemoryItem,
  VectorSearchResult,
  MemoryMessage,
} from './memory.js';
import { MemoryManager, LongTermMemory } from './memory.js';
import type { EmbeddingFn } from './memory.js';

/**
 * 带向量检索能力的 MemoryManager 装饰器
 *
 * 包装一个 {@link IMemoryManager}（默认创建 {@link MemoryManager}），
 * 利用注入的 {@link IModelProvider} 自动为长期记忆生成 embedding：
 * - store 时自动调用 provider.embed() 生成向量
 * - search 时用余弦相似度排序
 *
 * 这一层把"模型提供商"与"记忆存储"解耦：
 * 上层只需传入 IModelProvider，即可获得向量检索能力，
 * 而无需关心 embedding 生成的细节。
 */
export class VectorMemoryManager {
  private provider: IModelProvider;
  private embeddingModel?: string;
  readonly manager: IMemoryManager;

  /**
   * @param agentId Agent ID
   * @param provider 模型提供商，需支持 embed()
   * @param options 可选配置
   *   - manager: 已存在的 IMemoryManager 实例（不传则自动创建带 embeddingFn 的 MemoryManager）
   *   - embeddingModel: 指定 embedding 使用的模型 ID
   */
  constructor(
    agentId: ID,
    provider: IModelProvider,
    options?: {
      manager?: IMemoryManager;
      embeddingModel?: string;
    }
  ) {
    this.provider = provider;
    this.embeddingModel = options?.embeddingModel;

    if (options?.manager) {
      this.manager = options.manager;
    } else {
      // 默认创建一个注入了 embeddingFn 的 LongTermMemory + MemoryManager
      const embeddingFn: EmbeddingFn = async (text: string) => {
        return this.generateEmbedding(text);
      };
      const longTerm = new LongTermMemory({ embeddingFn });
      this.manager = new MemoryManager(agentId, undefined, longTerm);
    }
  }

  /**
   * 短期记忆（代理到内部 manager）
   */
  get shortTerm() {
    return this.manager.shortTerm;
  }

  /**
   * 长期记忆（代理到内部 manager）
   */
  get longTerm() {
    return this.manager.longTerm;
  }

  /**
   * 使用注入的 IModelProvider 生成文本的 embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.provider.embed({
      input: text,
      model: this.embeddingModel,
    });
    return response.embeddings[0];
  }

  /**
   * 存储一条长期记忆，自动生成 embedding
   */
  async store(
    agentId: ID,
    content: string,
    options?: {
      type?: LongTermMemoryItem['type'];
      importance?: number;
      metadata?: Metadata;
      tags?: string[];
    }
  ): Promise<LongTermMemoryItem> {
    return this.manager.longTerm.store(agentId, content, options);
  }

  /**
   * 搜索相关记忆（向量检索）
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
    return this.manager.longTerm.search(agentId, query, options);
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
    return this.manager.getFullContext(query, options);
  }

  /**
   * 将重要的短期记忆保存到长期记忆
   */
  async consolidateToLongTerm(agentId: ID, messageIds?: ID[]): Promise<void> {
    return this.manager.consolidateToLongTerm(agentId, messageIds);
  }
}
