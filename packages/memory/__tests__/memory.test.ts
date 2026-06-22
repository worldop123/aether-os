import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ShortTermMemory,
  LongTermMemory,
  MemoryManager,
  MessageRole,
} from '../src/memory';
import { globalEventBus } from '@aether/shared';

describe('ShortTermMemory 短期记忆测试', () => {
  describe('基础功能', () => {
    it('应该正确创建短期记忆实例', () => {
      const memory = new ShortTermMemory();
      expect(memory.getMessageCount()).toBe(0);
      expect(memory.getMaxMessages()).toBe(50); // 默认值
    });

    it('应该支持自定义最大消息数', () => {
      const memory = new ShortTermMemory(10);
      expect(memory.getMaxMessages()).toBe(10);
    });

    it('应该能够添加消息', () => {
      const memory = new ShortTermMemory();
      const message = memory.addMessage({
        role: MessageRole.USER,
        content: 'Hello',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe(MessageRole.USER);
      expect(message.content).toBe('Hello');
      expect(message.timestamp).toBeGreaterThan(0);
      expect(memory.getMessageCount()).toBe(1);
    });

    it('应该能够获取上下文', () => {
      const memory = new ShortTermMemory();
      memory.addMessage({ role: MessageRole.USER, content: 'msg1' });
      memory.addMessage({ role: MessageRole.ASSISTANT, content: 'msg2' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg3' });

      const context = memory.getContext();
      expect(context.length).toBe(3);
      expect(context[0].content).toBe('msg1');
      expect(context[2].content).toBe('msg3');
    });

    it('应该支持限制返回数量', () => {
      const memory = new ShortTermMemory();
      memory.addMessage({ role: MessageRole.USER, content: 'msg1' });
      memory.addMessage({ role: MessageRole.ASSISTANT, content: 'msg2' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg3' });

      const context = memory.getContext(2);
      expect(context.length).toBe(2);
      expect(context[0].content).toBe('msg2');
      expect(context[1].content).toBe('msg3');
    });

    it('应该能够清空记忆', () => {
      const memory = new ShortTermMemory();
      memory.addMessage({ role: MessageRole.USER, content: 'msg1' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg2' });

      expect(memory.getMessageCount()).toBe(2);
      memory.clear();
      expect(memory.getMessageCount()).toBe(0);
    });
  });

  describe('FIFO 淘汰', () => {
    it('超过容量时应该淘汰最早的消息', () => {
      const memory = new ShortTermMemory(3);

      memory.addMessage({ role: MessageRole.USER, content: 'msg1' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg2' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg3' });
      expect(memory.getMessageCount()).toBe(3);

      memory.addMessage({ role: MessageRole.USER, content: 'msg4' });
      expect(memory.getMessageCount()).toBe(3);

      const context = memory.getContext();
      expect(context[0].content).toBe('msg2');
      expect(context[2].content).toBe('msg4');
    });

    it('设置更小的最大消息数时应该淘汰多余消息', () => {
      const memory = new ShortTermMemory(5);
      memory.addMessage({ role: MessageRole.USER, content: 'msg1' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg2' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg3' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg4' });
      memory.addMessage({ role: MessageRole.USER, content: 'msg5' });

      expect(memory.getMessageCount()).toBe(5);

      memory.setMaxMessages(3);
      expect(memory.getMessageCount()).toBe(3);

      const context = memory.getContext();
      expect(context[0].content).toBe('msg3');
      expect(context[2].content).toBe('msg5');
    });
  });

  describe('Token 估算', () => {
    it('应该估算 token 数量', () => {
      const memory = new ShortTermMemory();
      memory.addMessage({ role: MessageRole.USER, content: 'Hello world' }); // 11 字符 ≈ 3 tokens

      const tokenCount = memory.getTokenCount();
      expect(tokenCount).toBeGreaterThan(0);
      expect(typeof tokenCount).toBe('number');
    });

    it('空记忆的 token 数应该为 0', () => {
      const memory = new ShortTermMemory();
      expect(memory.getTokenCount()).toBe(0);
    });
  });

  describe('setMaxMessages', () => {
    it('应该能够设置最大消息数', () => {
      const memory = new ShortTermMemory(10);
      expect(memory.getMaxMessages()).toBe(10);

      memory.setMaxMessages(20);
      expect(memory.getMaxMessages()).toBe(20);
    });

    it('设置小于 1 的值应该抛出错误', () => {
      const memory = new ShortTermMemory();
      expect(() => memory.setMaxMessages(0)).toThrow();
      expect(() => memory.setMaxMessages(-1)).toThrow();
    });
  });
});

describe('LongTermMemory 长期记忆测试', () => {
  let longTermMemory: LongTermMemory;
  const testAgentId = 'test-agent-1';

  beforeEach(() => {
    longTermMemory = new LongTermMemory();
  });

  describe('存储和获取', () => {
    it('应该能够存储记忆', async () => {
      const item = await longTermMemory.store(testAgentId, '这是一条测试记忆');

      expect(item.id).toBeDefined();
      expect(item.agentId).toBe(testAgentId);
      expect(item.content).toBe('这是一条测试记忆');
      expect(item.type).toBe('fact'); // 默认类型
      expect(item.importance).toBe(0.5); // 默认重要性
      expect(item.accessCount).toBe(0);
      expect(item.createdAt).toBeGreaterThan(0);
    });

    it('应该支持自定义类型和重要性', async () => {
      const item = await longTermMemory.store(testAgentId, '用户喜欢蓝色', {
        type: 'preference',
        importance: 0.9,
        tags: ['preference', 'color'],
      });

      expect(item.type).toBe('preference');
      expect(item.importance).toBe(0.9);
      expect(item.tags).toEqual(['preference', 'color']);
    });

    it('应该能够通过 ID 获取记忆', async () => {
      const stored = await longTermMemory.store(testAgentId, '测试记忆');
      const retrieved = await longTermMemory.get(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('测试记忆');
    });

    it('获取不存在的记忆应该返回 null', async () => {
      const result = await longTermMemory.get('non-existent');
      expect(result).toBeNull();
    });

    it('获取记忆时应该更新访问信息', async () => {
      const stored = await longTermMemory.store(testAgentId, '测试记忆');
      expect(stored.accessCount).toBe(0);

      await longTermMemory.get(stored.id);
      const retrieved = await longTermMemory.get(stored.id);

      expect(retrieved?.accessCount).toBe(2);
    });
  });

  describe('删除记忆', () => {
    it('应该能够删除记忆', async () => {
      const item = await longTermMemory.store(testAgentId, '要删除的记忆');
      const result = await longTermMemory.delete(item.id);

      expect(result).toBe(true);
      expect(await longTermMemory.get(item.id)).toBeNull();
    });

    it('删除不存在的记忆应该返回 false', async () => {
      const result = await longTermMemory.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('搜索记忆', () => {
    it('应该能够搜索相关记忆', async () => {
      await longTermMemory.store(testAgentId, '用户喜欢吃苹果和香蕉', { type: 'preference' });
      await longTermMemory.store(testAgentId, '用户住在北京', { type: 'fact' });
      await longTermMemory.store(testAgentId, '用户每天早上吃苹果', { type: 'experience' });

      const results = await longTermMemory.search(testAgentId, '苹果', {
        threshold: 0.1, // 降低阈值以便测试
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    it('搜索结果应该按相似度排序', async () => {
      await longTermMemory.store(testAgentId, '苹果苹果苹果');
      await longTermMemory.store(testAgentId, '香蕉橙子葡萄');

      const results = await longTermMemory.search(testAgentId, '苹果', {
        threshold: 0.1,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      if (results.length >= 2) {
        expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
      }
    });

    it('应该支持 topK 参数', async () => {
      for (let i = 0; i < 10; i++) {
        await longTermMemory.store(testAgentId, `记忆 ${i} 包含苹果`);
      }

      const results = await longTermMemory.search(testAgentId, '苹果', {
        topK: 3,
        threshold: 0.1,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('应该支持按类型过滤', async () => {
      await longTermMemory.store(testAgentId, '用户喜欢苹果', { type: 'preference' });
      await longTermMemory.store(testAgentId, '今天吃了苹果', { type: 'experience' });

      const results = await longTermMemory.search(testAgentId, '苹果', {
        type: 'preference',
        threshold: 0.1,
      });

      expect(results.length).toBe(1);
      expect(results[0].item.type).toBe('preference');
    });

    it('搜索应该更新访问计数', async () => {
      const item = await longTermMemory.store(testAgentId, '苹果香蕉');

      await longTermMemory.search(testAgentId, '苹果', { threshold: 0.1 });
      const retrieved = await longTermMemory.get(item.id);

      expect(retrieved?.accessCount).toBe(2); // 1 次搜索 + 1 次 get
    });
  });

  describe('列出记忆', () => {
    it('应该能够列出指定 Agent 的所有记忆', async () => {
      await longTermMemory.store(testAgentId, '记忆1');
      await longTermMemory.store(testAgentId, '记忆2');
      await longTermMemory.store('other-agent', '其他记忆');

      const result = await longTermMemory.list(testAgentId);
      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
    });

    it('应该支持分页', async () => {
      for (let i = 0; i < 15; i++) {
        await longTermMemory.store(testAgentId, `记忆 ${i}`);
      }

      const page1 = await longTermMemory.list(testAgentId, { page: 1, pageSize: 5 });
      expect(page1.items.length).toBe(5);
      expect(page1.total).toBe(15);

      const page2 = await longTermMemory.list(testAgentId, { page: 2, pageSize: 5 });
      expect(page2.items.length).toBe(5);
    });

    it('应该支持按类型过滤', async () => {
      await longTermMemory.store(testAgentId, '事实记忆', { type: 'fact' });
      await longTermMemory.store(testAgentId, '偏好记忆', { type: 'preference' });
      await longTermMemory.store(testAgentId, '经验记忆', { type: 'experience' });

      const result = await longTermMemory.list(testAgentId, { type: 'fact' });
      expect(result.total).toBe(1);
      expect(result.items[0].type).toBe('fact');
    });

    it('应该支持排序', async () => {
      await longTermMemory.store(testAgentId, '低重要性', { importance: 0.2 });
      await longTermMemory.store(testAgentId, '高重要性', { importance: 0.9 });

      const result = await longTermMemory.list(testAgentId, {
        sortBy: 'importance',
        sortOrder: 'desc',
      });

      expect(result.items[0].importance).toBe(0.9);
      expect(result.items[1].importance).toBe(0.2);
    });
  });

  describe('更新重要性', () => {
    it('应该能够更新记忆重要性', async () => {
      const item = await longTermMemory.store(testAgentId, '测试记忆', { importance: 0.5 });

      await longTermMemory.updateImportance(item.id, 0.9);
      const updated = await longTermMemory.get(item.id);

      expect(updated?.importance).toBe(0.9);
    });

    it('更新不存在的记忆应该抛出错误', async () => {
      await expect(longTermMemory.updateImportance('non-existent', 0.5)).rejects.toHaveProperty('code', 'MEMORY_NOT_FOUND');
    });

    it('更新超出范围的重要性应该抛出错误', async () => {
      const item = await longTermMemory.store(testAgentId, '测试记忆');

      await expect(longTermMemory.updateImportance(item.id, -0.1)).rejects.toThrow();
      await expect(longTermMemory.updateImportance(item.id, 1.1)).rejects.toThrow();
    });
  });

  describe('清空记忆', () => {
    it('应该能够清空指定 Agent 的所有记忆', async () => {
      await longTermMemory.store(testAgentId, '记忆1');
      await longTermMemory.store(testAgentId, '记忆2');
      await longTermMemory.store('other-agent', '其他记忆');

      await longTermMemory.clear(testAgentId);

      const result = await longTermMemory.list(testAgentId);
      expect(result.total).toBe(0);

      const otherResult = await longTermMemory.list('other-agent');
      expect(otherResult.total).toBe(1);
    });
  });

  describe('事件触发', () => {
    it('存储记忆时应该触发 memory.added 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('memory.added', handler);

      const item = await longTermMemory.store(testAgentId, '测试记忆');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(item.id, testAgentId, expect.any(Number));

      globalEventBus.off('memory.added', handler);
    });

    it('删除记忆时应该触发 memory.deleted 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('memory.deleted', handler);

      const item = await longTermMemory.store(testAgentId, '测试记忆');
      await longTermMemory.delete(item.id);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(item.id, testAgentId, expect.any(Number));

      globalEventBus.off('memory.deleted', handler);
    });

    it('清空记忆时应该触发 memory.cleared 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('memory.cleared', handler);

      await longTermMemory.store(testAgentId, '测试记忆');
      await longTermMemory.clear(testAgentId);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(testAgentId, expect.any(Number));

      globalEventBus.off('memory.cleared', handler);
    });
  });
});

describe('MemoryManager 记忆管理器测试', () => {
  const testAgentId = 'test-agent-1';

  describe('基础功能', () => {
    it('应该正确创建记忆管理器', () => {
      const manager = new MemoryManager(testAgentId);
      expect(manager.shortTerm).toBeDefined();
      expect(manager.longTerm).toBeDefined();
    });

    it('应该支持注入自定义的短期和长期记忆', () => {
      const shortTerm = new ShortTermMemory(10);
      const longTerm = new LongTermMemory();
      const manager = new MemoryManager(testAgentId, shortTerm, longTerm);

      expect(manager.shortTerm).toBe(shortTerm);
      expect(manager.longTerm).toBe(longTerm);
    });
  });

  describe('getFullContext', () => {
    it('应该返回短期记忆上下文', async () => {
      const manager = new MemoryManager(testAgentId);
      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '你好' });
      manager.shortTerm.addMessage({ role: MessageRole.ASSISTANT, content: '你好！' });

      const context = await manager.getFullContext();
      expect(context.length).toBe(2);
    });

    it('应该包含相关的长期记忆', async () => {
      const manager = new MemoryManager(testAgentId);

      // 添加长期记忆
      await manager.longTerm.store(testAgentId, '用户的名字是张三', {
        type: 'fact',
        importance: 0.9,
      });

      // 添加短期记忆
      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '你还记得我的名字吗？' });

      const context = await manager.getFullContext('名字');
      expect(context.length).toBeGreaterThan(1); // 至少有 1 条长期记忆 + 1 条短期记忆

      // 第一条应该是长期记忆
      expect(context[0].role).toBe(MessageRole.SYSTEM);
      expect(context[0].content).toContain('长期记忆');
    });

    it('应该支持禁用长期记忆', async () => {
      const manager = new MemoryManager(testAgentId);

      await manager.longTerm.store(testAgentId, '用户的名字是张三');
      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '你好' });

      const context = await manager.getFullContext('名字', { includeLongTerm: false });
      expect(context.length).toBe(1); // 只有短期记忆
    });

    it('没有查询词时不包含长期记忆', async () => {
      const manager = new MemoryManager(testAgentId);

      await manager.longTerm.store(testAgentId, '用户的名字是张三');
      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '你好' });

      const context = await manager.getFullContext();
      expect(context.length).toBe(1); // 只有短期记忆
    });

    it('应该支持限制短期记忆数量', async () => {
      const manager = new MemoryManager(testAgentId);

      for (let i = 0; i < 10; i++) {
        manager.shortTerm.addMessage({ role: MessageRole.USER, content: `消息 ${i}` });
      }

      const context = await manager.getFullContext(undefined, { maxShortTerm: 3 });
      expect(context.length).toBe(3);
    });
  });

  describe('consolidateToLongTerm', () => {
    it('应该将短期记忆巩固到长期记忆', async () => {
      const manager = new MemoryManager(testAgentId);

      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '我喜欢苹果' });
      manager.shortTerm.addMessage({ role: MessageRole.ASSISTANT, content: '好的，我记住了' });
      manager.shortTerm.addMessage({ role: MessageRole.SYSTEM, content: '系统消息' });

      await manager.consolidateToLongTerm(testAgentId);

      const result = await manager.longTerm.list(testAgentId);
      // 应该只保存用户和助手的消息，不保存系统消息
      expect(result.total).toBe(2);
    });

    it('应该支持指定要巩固的消息 ID', async () => {
      const manager = new MemoryManager(testAgentId);

      const msg1 = manager.shortTerm.addMessage({ role: MessageRole.USER, content: '消息1' });
      manager.shortTerm.addMessage({ role: MessageRole.USER, content: '消息2' });
      const msg3 = manager.shortTerm.addMessage({ role: MessageRole.USER, content: '消息3' });

      await manager.consolidateToLongTerm(testAgentId, [msg1.id, msg3.id]);

      const result = await manager.longTerm.list(testAgentId);
      expect(result.total).toBe(2);
    });
  });
});
