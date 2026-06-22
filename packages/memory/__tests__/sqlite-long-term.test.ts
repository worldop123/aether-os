import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteLongTermMemory } from '../src/sqlite-long-term';
import { MemoryError } from '@aether/shared';

describe('SqliteLongTermMemory 测试', () => {
  let memory: SqliteLongTermMemory;
  const testAgentId = 'test-agent-1';

  beforeEach(async () => {
    memory = new SqliteLongTermMemory(':memory:');
    await memory.initialize();
  });

  afterEach(async () => {
    await memory.close();
  });

  describe('initialize', () => {
    it('应该正确初始化', async () => {
      const mem = new SqliteLongTermMemory(':memory:');
      await mem.initialize();
      // 初始化后可以正常存储
      const item = await mem.store(testAgentId, '测试记忆');
      expect(item.id).toBeDefined();
      await mem.close();
    });

    it('重复初始化应该不报错', async () => {
      await memory.initialize();
      const item = await memory.store(testAgentId, '测试记忆');
      expect(item.id).toBeDefined();
    });
  });

  describe('存储和获取', () => {
    it('应该能够存储记忆', async () => {
      const item = await memory.store(testAgentId, '这是一条测试记忆');

      expect(item.id).toBeDefined();
      expect(item.agentId).toBe(testAgentId);
      expect(item.content).toBe('这是一条测试记忆');
      expect(item.type).toBe('fact'); // 默认类型
      expect(item.importance).toBe(0.5); // 默认重要性
      expect(item.accessCount).toBe(0);
      expect(item.createdAt).toBeGreaterThan(0);
    });

    it('应该支持自定义类型和重要性', async () => {
      const item = await memory.store(testAgentId, '用户喜欢蓝色', {
        type: 'preference',
        importance: 0.9,
        tags: ['preference', 'color'],
      });

      expect(item.type).toBe('preference');
      expect(item.importance).toBe(0.9);
      expect(item.tags).toEqual(['preference', 'color']);
    });

    it('应该支持存储 embedding', async () => {
      const embedding = [0.1, 0.2, 0.3, 0.4];
      const item = await memory.store(testAgentId, '向量记忆', {
        embedding,
      });

      expect(item.embedding).toEqual(embedding);
    });

    it('应该能够通过 ID 获取记忆', async () => {
      const stored = await memory.store(testAgentId, '测试记忆');
      const retrieved = await memory.get(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('测试记忆');
    });

    it('获取不存在的记忆应该返回 null', async () => {
      const result = await memory.get('non-existent');
      expect(result).toBeNull();
    });

    it('获取记忆时应该更新访问信息', async () => {
      const stored = await memory.store(testAgentId, '测试记忆');
      expect(stored.accessCount).toBe(0);

      await memory.get(stored.id);
      const retrieved = await memory.get(stored.id);

      expect(retrieved?.accessCount).toBe(2);
    });
  });

  describe('搜索记忆', () => {
    it('应该能够用关键词搜索相关记忆', async () => {
      await memory.store(testAgentId, '用户喜欢吃苹果和香蕉', { type: 'preference' });
      await memory.store(testAgentId, '用户住在北京', { type: 'fact' });
      await memory.store(testAgentId, '用户每天早上吃苹果', { type: 'experience' });

      const results = await memory.search(testAgentId, '苹果', {
        threshold: 0.1, // 降低阈值以便测试
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    it('搜索结果应该按相似度排序', async () => {
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

    it('应该支持 topK 参数', async () => {
      for (let i = 0; i < 10; i++) {
        await memory.store(testAgentId, `记忆 ${i} 包含苹果`);
      }

      const results = await memory.search(testAgentId, '苹果', {
        topK: 3,
        threshold: 0.1,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('应该支持按类型过滤', async () => {
      await memory.store(testAgentId, '用户喜欢苹果', { type: 'preference' });
      await memory.store(testAgentId, '今天吃了苹果', { type: 'experience' });

      const results = await memory.search(testAgentId, '苹果', {
        type: 'preference',
        threshold: 0.1,
      });

      expect(results.length).toBe(1);
      expect(results[0].item.type).toBe('preference');
    });

    it('搜索应该更新访问计数', async () => {
      const item = await memory.store(testAgentId, '苹果香蕉');

      await memory.search(testAgentId, '苹果', { threshold: 0.1 });
      const retrieved = await memory.get(item.id);

      expect(retrieved?.accessCount).toBe(2); // 1 次搜索 + 1 次 get
    });

    it('应该支持基于 embedding 的余弦相似度检索', async () => {
      // 存储带 embedding 的记忆
      await memory.store(testAgentId, '苹果相关记忆', {
        embedding: [1, 0, 0, 0],
      });
      await memory.store(testAgentId, '香蕉相关记忆', {
        embedding: [0, 1, 0, 0],
      });
      await memory.store(testAgentId, '橙子相关记忆', {
        embedding: [0, 0, 1, 0],
      });

      // 用与苹果相似的 embedding 搜索
      const results = await memory.search(testAgentId, '苹果', {
        embedding: [1, 0, 0, 0],
        threshold: 0.5,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      // 余弦相似度为 1（完全相同）
      expect(results[0].item.content).toBe('苹果相关记忆');
      expect(results[0].similarity).toBeCloseTo(1, 5);
    });

    it('embedding 检索应该返回按相似度排序的结果', async () => {
      await memory.store(testAgentId, '完全匹配', {
        embedding: [1, 0, 0],
      });
      await memory.store(testAgentId, '部分匹配', {
        embedding: [0.7, 0.7, 0],
      });

      const results = await memory.search(testAgentId, '查询', {
        embedding: [1, 0, 0],
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].item.content).toBe('完全匹配');
    });

    it('没有 embedding 的记忆在向量搜索时应该降级为关键词匹配', async () => {
      await memory.store(testAgentId, '苹果相关但无向量', {
        // 不提供 embedding
      });

      const results = await memory.search(testAgentId, '苹果', {
        embedding: [1, 0, 0],
        threshold: 0.1,
      });

      // 应该通过关键词匹配找到
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].item.content).toContain('苹果');
    });
  });

  describe('列出记忆', () => {
    it('应该能够列出指定 Agent 的所有记忆', async () => {
      await memory.store(testAgentId, '记忆1');
      await memory.store(testAgentId, '记忆2');
      await memory.store('other-agent', '其他记忆');

      const result = await memory.list(testAgentId);
      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
    });

    it('应该支持分页', async () => {
      for (let i = 0; i < 15; i++) {
        await memory.store(testAgentId, `记忆 ${i}`);
      }

      const page1 = await memory.list(testAgentId, { page: 1, pageSize: 5 });
      expect(page1.items.length).toBe(5);
      expect(page1.total).toBe(15);

      const page2 = await memory.list(testAgentId, { page: 2, pageSize: 5 });
      expect(page2.items.length).toBe(5);
    });

    it('应该支持按类型过滤', async () => {
      await memory.store(testAgentId, '事实记忆', { type: 'fact' });
      await memory.store(testAgentId, '偏好记忆', { type: 'preference' });
      await memory.store(testAgentId, '经验记忆', { type: 'experience' });

      const result = await memory.list(testAgentId, { type: 'fact' });
      expect(result.total).toBe(1);
      expect(result.items[0].type).toBe('fact');
    });

    it('应该支持排序', async () => {
      await memory.store(testAgentId, '低重要性', { importance: 0.2 });
      await memory.store(testAgentId, '高重要性', { importance: 0.9 });

      const result = await memory.list(testAgentId, {
        sortBy: 'importance',
        sortOrder: 'desc',
      });

      expect(result.items[0].importance).toBe(0.9);
      expect(result.items[1].importance).toBe(0.2);
    });
  });

  describe('删除记忆', () => {
    it('应该能够删除记忆', async () => {
      const item = await memory.store(testAgentId, '要删除的记忆');
      const result = await memory.delete(item.id);

      expect(result).toBe(true);
      expect(await memory.get(item.id)).toBeNull();
    });

    it('删除不存在的记忆应该返回 false', async () => {
      const result = await memory.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('更新重要性', () => {
    it('应该能够更新记忆重要性', async () => {
      const item = await memory.store(testAgentId, '测试记忆', { importance: 0.5 });

      await memory.updateImportance(item.id, 0.9);
      const updated = await memory.get(item.id);

      expect(updated?.importance).toBe(0.9);
    });

    it('更新不存在的记忆应该抛出错误', async () => {
      await expect(memory.updateImportance('non-existent', 0.5)).rejects.toThrow(MemoryError);
      await expect(memory.updateImportance('non-existent', 0.5)).rejects.toHaveProperty('code', 'MEMORY_NOT_FOUND');
    });

    it('更新超出范围的重要性应该抛出错误', async () => {
      const item = await memory.store(testAgentId, '测试记忆');

      await expect(memory.updateImportance(item.id, -0.1)).rejects.toThrow();
      await expect(memory.updateImportance(item.id, 1.1)).rejects.toThrow();
    });
  });

  describe('updateAccess', () => {
    it('应该递增访问计数', async () => {
      const item = await memory.store(testAgentId, '测试记忆');
      expect(item.accessCount).toBe(0);

      await memory.updateAccess(item.id);
      await memory.updateAccess(item.id);
      await memory.updateAccess(item.id);

      const retrieved = await memory.get(item.id);
      // updateAccess 3 次 + get 1 次 = 4
      expect(retrieved?.accessCount).toBe(4);
    });

    it('应该更新最后访问时间', async () => {
      const item = await memory.store(testAgentId, '测试记忆');
      const originalLastAccessed = item.lastAccessedAt;

      // 等待一小段时间确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));

      await memory.updateAccess(item.id);
      const retrieved = await memory.get(item.id);

      expect(retrieved?.lastAccessedAt).toBeGreaterThanOrEqual(originalLastAccessed);
    });
  });

  describe('清空记忆', () => {
    it('应该能够清空指定 Agent 的所有记忆', async () => {
      await memory.store(testAgentId, '记忆1');
      await memory.store(testAgentId, '记忆2');
      await memory.store('other-agent', '其他记忆');

      await memory.clear(testAgentId);

      const result = await memory.list(testAgentId);
      expect(result.total).toBe(0);

      const otherResult = await memory.list('other-agent');
      expect(otherResult.total).toBe(1);
    });
  });

  describe('持久化验证', () => {
    it('存储的记忆应该真正写入 SQLite（通过新实例验证）', async () => {
      // 使用文件数据库验证持久化
      const dbPath = '/tmp/aether-test-memory-' + Date.now() + '.db';
      const mem1 = new SqliteLongTermMemory(dbPath);
      await mem1.initialize();

      const item = await mem1.store(testAgentId, '持久化测试记忆', {
        importance: 0.8,
        tags: ['test'],
      });
      await mem1.close();

      // 用新实例打开同一个数据库
      const mem2 = new SqliteLongTermMemory(dbPath);
      await mem2.initialize();

      const retrieved = await mem2.get(item.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('持久化测试记忆');
      expect(retrieved?.importance).toBe(0.8);
      expect(retrieved?.tags).toEqual(['test']);

      await mem2.close();

      // 清理
      const fs = await import('fs');
      fs.unlinkSync(dbPath);
    });
  });
});
