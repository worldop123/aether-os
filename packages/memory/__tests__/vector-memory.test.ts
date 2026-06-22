import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LongTermMemory, MemoryManager, MessageRole } from '../src/memory';
import { VectorMemoryManager } from '../src/vector-memory-manager';
import { MockModelProvider } from '@aether/model-router';
import { hashEmbedding, cosineSimilarity } from '../src/vector';

const testAgentId = 'test-agent-1';

/**
 * 基于文本的确定性 embedding 函数（用于测试）
 * 使用 hashEmbedding 生成确定性向量，确保相同文本得到相同向量
 */
function deterministicEmbedding(text: string): Promise<number[]> {
  return Promise.resolve(hashEmbedding(text, 64));
}

describe('LongTermMemory 向量检索测试', () => {
  describe('注入 embeddingFn 后的存储', () => {
    it('store 时应该自动生成 embedding', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });
      const item = await memory.store(testAgentId, '用户喜欢苹果');

      expect(item.embedding).toBeDefined();
      expect(item.embedding?.length).toBe(64);
    });

    it('显式传入的 embedding 应该优先于 embeddingFn', async () => {
      const embeddingFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
      const memory = new LongTermMemory({ embeddingFn });
      const customEmbedding = [1, 0, 0, 0];

      const item = await memory.store(testAgentId, 'test', { embedding: customEmbedding });

      expect(item.embedding).toEqual(customEmbedding);
      expect(embeddingFn).not.toHaveBeenCalled();
    });

    it('embeddingFn 抛错时不应该阻断存储', async () => {
      const embeddingFn = vi.fn().mockRejectedValue(new Error('embed failed'));
      const memory = new LongTermMemory({ embeddingFn });

      const item = await memory.store(testAgentId, '测试记忆');

      expect(item.id).toBeDefined();
      expect(item.content).toBe('测试记忆');
      expect(item.embedding).toBeUndefined();
    });

    it('不注入 embeddingFn 时存储的记忆没有 embedding', async () => {
      const memory = new LongTermMemory();
      const item = await memory.store(testAgentId, '测试记忆');

      expect(item.embedding).toBeUndefined();
    });
  });

  describe('注入 embeddingFn 后的搜索', () => {
    it('应该用向量检索返回相关记忆', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      await memory.store(testAgentId, '用户喜欢吃苹果和香蕉');
      await memory.store(testAgentId, '用户住在北京');
      await memory.store(testAgentId, '苹果是一种水果');

      const results = await memory.search(testAgentId, '苹果', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      // 包含"苹果"的记忆应该排名靠前
      expect(results[0].item.content).toContain('苹果');
    });

    it('语义相似的记忆应该排名靠前', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      // 共享多个词的记忆，向量相似度更高
      await memory.store(testAgentId, 'the cat sat on the mat');
      await memory.store(testAgentId, 'the dog ran in the park');
      await memory.store(testAgentId, 'completely different topic xyz');

      const results = await memory.search(testAgentId, 'the cat sat on the mat', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      // 完全相同的记忆应该排名第一（相似度为 1）
      expect(results[0].item.content).toBe('the cat sat on the mat');
      expect(results[0].similarity).toBeCloseTo(1, 5);
    });

    it('搜索结果应该按相似度降序排序', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      await memory.store(testAgentId, 'apple banana');
      await memory.store(testAgentId, 'apple orange');
      await memory.store(testAgentId, 'grape melon');

      const results = await memory.search(testAgentId, 'apple banana', {
        threshold: 0.0,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
      }
    });

    it('完全匹配的查询相似度应该为 1', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });
      await memory.store(testAgentId, 'hello world');

      const results = await memory.search(testAgentId, 'hello world', {
        threshold: 0.99,
      });

      expect(results.length).toBe(1);
      expect(results[0].similarity).toBeCloseTo(1, 5);
    });

    it('搜索应该更新访问计数', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });
      const item = await memory.store(testAgentId, 'hello world');

      await memory.search(testAgentId, 'hello world', { threshold: 0.5 });
      const retrieved = await memory.get(item.id);

      expect(retrieved?.accessCount).toBe(2); // 1 次搜索 + 1 次 get
    });

    it('应该支持 topK 参数', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      for (let i = 0; i < 10; i++) {
        await memory.store(testAgentId, `memory item ${i}`);
      }

      const results = await memory.search(testAgentId, 'memory item', {
        topK: 3,
        threshold: 0.0,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('应该支持按类型过滤', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      await memory.store(testAgentId, 'apple', { type: 'preference' });
      await memory.store(testAgentId, 'apple', { type: 'experience' });

      const results = await memory.search(testAgentId, 'apple', {
        type: 'preference',
        threshold: 0.0,
      });

      expect(results.length).toBe(1);
      expect(results[0].item.type).toBe('preference');
    });

    it('应该支持 threshold 过滤', async () => {
      const memory = new LongTermMemory({ embeddingFn: deterministicEmbedding });

      await memory.store(testAgentId, 'hello world');
      await memory.store(testAgentId, 'completely different xyz');

      // 高阈值：只返回非常相似的
      const highThresholdResults = await memory.search(testAgentId, 'hello world', {
        threshold: 0.99,
      });
      expect(highThresholdResults.length).toBe(1);
      expect(highThresholdResults[0].item.content).toBe('hello world');
    });
  });

  describe('无 embeddingFn 时降级为关键词匹配', () => {
    it('不注入 embeddingFn 时应该使用关键词匹配', async () => {
      const memory = new LongTermMemory();

      await memory.store(testAgentId, '用户喜欢吃苹果');
      await memory.store(testAgentId, '用户住在北京');

      const results = await memory.search(testAgentId, '苹果', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.content).toContain('苹果');
    });

    it('不注入 embeddingFn 时存储的记忆没有 embedding', async () => {
      const memory = new LongTermMemory();
      const item = await memory.store(testAgentId, '测试记忆');

      expect(item.embedding).toBeUndefined();
    });

    it('关键词匹配的现有测试行为应该保持不变', async () => {
      const memory = new LongTermMemory();

      await memory.store(testAgentId, '苹果苹果苹果');
      await memory.store(testAgentId, '香蕉橙子葡萄');

      const results = await memory.search(testAgentId, '苹果', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      if (results.length >= 2) {
        expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
      }
    });
  });

  describe('向后兼容性', () => {
    it('无参数构造应该正常工作', () => {
      const memory = new LongTermMemory();
      expect(memory).toBeInstanceOf(LongTermMemory);
    });

    it('空 options 构造应该正常工作', () => {
      const memory = new LongTermMemory({});
      expect(memory).toBeInstanceOf(LongTermMemory);
    });
  });
});

describe('VectorMemoryManager 装饰器测试', () => {
  describe('基础功能', () => {
    it('应该正确创建 VectorMemoryManager', () => {
      const provider = new MockModelProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      expect(manager).toBeInstanceOf(VectorMemoryManager);
      expect(manager.manager).toBeDefined();
      expect(manager.shortTerm).toBeDefined();
      expect(manager.longTerm).toBeDefined();
    });

    it('应该支持注入自定义的 manager', () => {
      const provider = new MockModelProvider();
      const innerManager = new MemoryManager(testAgentId);
      const manager = new VectorMemoryManager(testAgentId, provider, {
        manager: innerManager,
      });

      expect(manager.manager).toBe(innerManager);
    });
  });

  describe('store 和 search', () => {
    it('store 时应该通过 provider 自动生成 embedding', async () => {
      const provider = new MockModelProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      const item = await manager.store(testAgentId, '用户喜欢苹果');

      expect(item.id).toBeDefined();
      // MockModelProvider.embed 返回 1536 维向量
      expect(item.embedding).toBeDefined();
      expect(item.embedding?.length).toBe(1536);
    });

    it('search 时应该用向量检索', async () => {
      const provider = new MockModelProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      await manager.store(testAgentId, '用户喜欢苹果');
      await manager.store(testAgentId, '用户住在北京');

      // MockModelProvider 生成随机向量，相似度可能很低，使用低阈值
      const results = await manager.search(testAgentId, '苹果', {
        threshold: 0.0,
      });

      // 应该能返回结果（不报错）
      expect(results).toBeDefined();
    });

    it('应该代理 getFullContext', async () => {
      const provider = new MockModelProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '你好' });

      const context = await manager.getFullContext();
      expect(context.length).toBe(1);
    });

    it('应该代理 consolidateToLongTerm', async () => {
      const provider = new MockModelProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '我喜欢苹果' });
      manager.shortTerm.addMessage({ role: MessageRole.ASSISTANT, content: '好的' });

      await manager.consolidateToLongTerm(testAgentId);

      const result = await manager.longTerm.list(testAgentId);
      expect(result.total).toBe(2);
    });
  });

  describe('使用确定性 provider 测试向量检索', () => {
    /**
     * 自定义确定性 provider，基于 hashEmbedding 生成向量
     * 确保相同文本生成相同向量，相似文本有较高相似度
     */
    class DeterministicMockProvider extends MockModelProvider {
      async embed(request: any) {
        const inputs = Array.isArray(request.input) ? request.input : [request.input];
        const embeddings = inputs.map((text: string) => hashEmbedding(text, 64));
        return {
          embeddings,
          model: 'deterministic-mock',
          usage: { promptTokens: 10, totalTokens: 10 },
        };
      }
    }

    it('用确定性 provider 时语义相似的记忆应该排名靠前', async () => {
      const provider = new DeterministicMockProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      await manager.store(testAgentId, 'the cat sat on the mat');
      await manager.store(testAgentId, 'the dog ran in the park');
      await manager.store(testAgentId, 'completely different xyz topic');

      const results = await manager.search(testAgentId, 'the cat sat on the mat', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.content).toBe('the cat sat on the mat');
      expect(results[0].similarity).toBeCloseTo(1, 5);
    });

    it('store 后记忆应该有 embedding', async () => {
      const provider = new DeterministicMockProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      const item = await manager.store(testAgentId, 'hello world');

      expect(item.embedding).toBeDefined();
      expect(item.embedding?.length).toBe(64);
      // 应该是归一化的
      const norm = Math.sqrt(
        item.embedding!.reduce((sum, v) => sum + v * v, 0)
      );
      expect(norm).toBeCloseTo(1, 5);
    });

    it('多次 store 相同内容应该生成相同 embedding', async () => {
      const provider = new DeterministicMockProvider();
      const manager = new VectorMemoryManager(testAgentId, provider);

      const item1 = await manager.store(testAgentId, 'same content');
      const item2 = await manager.store(testAgentId, 'same content');

      expect(item1.embedding).toEqual(item2.embedding);
    });
  });
});
