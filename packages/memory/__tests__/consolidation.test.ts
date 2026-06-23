import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryConsolidator,
  MemoryForgetter,
  MemoryMaintenance,
  LongTermMemory,
  ShortTermMemory,
  MessageRole,
  DEFAULT_CONSOLIDATION_CONFIG,
  DEFAULT_FORGETTING_CONFIG,
} from '../src/index.js';
import type { MemoryMessage } from '../src/index.js';
import { now, generateId } from '@aether/shared';

describe('MemoryConsolidator 测试', () => {
  let longTerm: LongTermMemory;
  let shortTerm: ShortTermMemory;
  let consolidator: MemoryConsolidator;

  beforeEach(() => {
    longTerm = new LongTermMemory();
    shortTerm = new ShortTermMemory(100);
    consolidator = new MemoryConsolidator(longTerm, { minAgeMs: 0 });
  });

  it('应该巩固重要消息到长期记忆', async () => {
    // 添加一些消息
    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '这是一个重要的长消息，包含了很多有用的信息，应该被巩固到长期记忆中。',
    });
    shortTerm.addMessage({
      role: MessageRole.ASSISTANT,
      content: '这是一个详细的回复，提供了很多有价值的信息和解释。',
    });

    const result = await consolidator.consolidate('agent-1', shortTerm);

    expect(result.consolidated).toBeGreaterThan(0);
    expect(result.memoryIds.length).toBeGreaterThan(0);

    // 验证记忆已存储
    const memories = await longTerm.list('agent-1');
    expect(memories.total).toBeGreaterThan(0);
  });

  it('应该跳过系统消息', async () => {
    shortTerm.addMessage({
      role: MessageRole.SYSTEM,
      content: '系统提示词',
    });
    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '用户消息'.repeat(50),
    });

    const result = await consolidator.consolidate('agent-1', shortTerm);

    // 系统消息不应被巩固
    const memories = await longTerm.list('agent-1');
    for (const m of memories.items) {
      expect(m.content).not.toBe('系统提示词');
    }
  });

  it('应该跳过太新的消息', async () => {
    consolidator = new MemoryConsolidator(longTerm, { minAgeMs: 10000 });

    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '很新的消息'.repeat(50),
    });

    const result = await consolidator.consolidate('agent-1', shortTerm);
    expect(result.consolidated).toBe(0);
  });

  it('应该支持自动摘要', async () => {
    const summaryFn = vi.fn().mockResolvedValue('这是对话摘要');
    consolidator = new MemoryConsolidator(
      longTerm,
      { minAgeMs: 0, autoSummarize: true },
      summaryFn
    );

    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '消息1'.repeat(50),
    });
    shortTerm.addMessage({
      role: MessageRole.ASSISTANT,
      content: '回复1'.repeat(50),
    });

    const result = await consolidator.consolidate('agent-1', shortTerm);

    expect(summaryFn).toHaveBeenCalled();
    expect(result.summaries).toBe(1);

    // 验证摘要已存储（查找包含摘要内容的记忆）
    const memories = await longTerm.list('agent-1');
    const summaryMemory = memories.items.find((m) => m.content === '这是对话摘要');
    expect(summaryMemory).toBeDefined();
    expect(summaryMemory!.type).toBe('summary');
  });

  it('应该根据重要性阈值过滤', async () => {
    consolidator = new MemoryConsolidator(longTerm, {
      minAgeMs: 0,
      importanceThreshold: 0.9, // 很高的阈值
    });

    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '短消息',
    });

    const result = await consolidator.consolidate('agent-1', shortTerm);
    expect(result.consolidated).toBe(0);
  });

  it('应该支持不同策略', async () => {
    const strategies = ['importance', 'recency', 'frequency', 'hybrid'] as const;

    for (const strategy of strategies) {
      const lt = new LongTermMemory();
      const st = new ShortTermMemory(100);
      const cons = new MemoryConsolidator(lt, { minAgeMs: 0, strategy });

      st.addMessage({ role: MessageRole.USER, content: '消息A'.repeat(50) });
      st.addMessage({ role: MessageRole.ASSISTANT, content: '回复B'.repeat(50) });

      const result = await cons.consolidate('agent-1', st);
      expect(result.memoryIds.length).toBeGreaterThan(0);
    }
  });

  it('空消息列表应该返回空结果', async () => {
    const result = await consolidator.consolidate('agent-1', shortTerm);
    expect(result.consolidated).toBe(0);
    expect(result.memoryIds.length).toBe(0);
  });

  it('应该能更新配置', () => {
    consolidator.updateConfig({ importanceThreshold: 0.8 });
    const config = consolidator.getConfig();
    expect(config.importanceThreshold).toBe(0.8);
  });
});

describe('MemoryForgetter 测试', () => {
  let longTerm: LongTermMemory;
  let forgetter: MemoryForgetter;

  beforeEach(async () => {
    longTerm = new LongTermMemory();
    forgetter = new MemoryForgetter(longTerm, {
      maxMemories: 5,
      minImportance: 0.3,
      expirationMs: 100,
    });

    // 添加一些测试记忆
    for (let i = 0; i < 10; i++) {
      await longTerm.store('agent-1', `记忆内容 ${i}`, {
        importance: i < 3 ? 0.1 : 0.6, // 前 3 个重要性低
        type: 'fact',
      });
    }
  });

  it('应该遗忘低于最小重要性的记忆', async () => {
    const result = await forgetter.forget('agent-1');

    expect(result.forgotten).toBeGreaterThan(0);

    // 验证低重要性记忆被删除
    const remaining = await longTerm.list('agent-1');
    for (const m of remaining.items) {
      expect(m.importance).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('应该限制最大记忆数量', async () => {
    // 先遗忘低重要性的
    await forgetter.forget('agent-1');

    // 现在应该不超过 5 条
    const remaining = await longTerm.list('agent-1');
    expect(remaining.total).toBeLessThanOrEqual(5);
  });

  it('应该遗忘过期记忆', async () => {
    // 等待过期
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await forgetter.forget('agent-1');
    expect(result.forgotten).toBeGreaterThan(0);
  });

  it('空记忆应该返回空结果', async () => {
    const lt = new LongTermMemory();
    const f = new MemoryForgetter(lt);
    const result = await f.forget('agent-1');
    expect(result.forgotten).toBe(0);
  });

  it('应该能更新配置', () => {
    forgetter.updateConfig({ maxMemories: 100 });
    const config = forgetter.getConfig();
    expect(config.maxMemories).toBe(100);
  });
});

describe('MemoryMaintenance 测试', () => {
  it('应该能执行一次维护', async () => {
    const longTerm = new LongTermMemory();
    const shortTerm = new ShortTermMemory(100);

    shortTerm.addMessage({
      role: MessageRole.USER,
      content: '重要消息'.repeat(50),
    });

    const maintenance = new MemoryMaintenance(longTerm, {
      consolidationConfig: { minAgeMs: 0 },
      forgettingConfig: { maxMemories: 100, minImportance: 0 },
    });

    const result = await maintenance.runOnce('agent-1', shortTerm);

    expect(result.consolidation).toBeDefined();
    expect(result.forgetting).toBeDefined();
  });

  it('应该能启动和停止定期维护', async () => {
    const longTerm = new LongTermMemory();
    const shortTerm = new ShortTermMemory(100);

    const maintenance = new MemoryMaintenance(longTerm, {
      consolidationConfig: { minAgeMs: 0 },
      intervalMs: 100,
    });

    maintenance.start('agent-1', shortTerm);

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 250));

    maintenance.stop();

    // 应该没有抛出错误
    expect(true).toBe(true);
  });

  it('应该能获取巩固器和遗忘器', () => {
    const longTerm = new LongTermMemory();
    const maintenance = new MemoryMaintenance(longTerm);

    expect(maintenance.getConsolidator()).toBeDefined();
    expect(maintenance.getForgetter()).toBeDefined();
  });
});

describe('默认配置', () => {
  it('DEFAULT_CONSOLIDATION_CONFIG 应该有合理的默认值', () => {
    expect(DEFAULT_CONSOLIDATION_CONFIG.strategy).toBe('hybrid');
    expect(DEFAULT_CONSOLIDATION_CONFIG.importanceThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONSOLIDATION_CONFIG.importanceThreshold).toBeLessThan(1);
    expect(DEFAULT_CONSOLIDATION_CONFIG.maxConsolidate).toBeGreaterThan(0);
  });

  it('DEFAULT_FORGETTING_CONFIG 应该有合理的默认值', () => {
    expect(DEFAULT_FORGETTING_CONFIG.strategy).toBe('importance-based');
    expect(DEFAULT_FORGETTING_CONFIG.maxMemories).toBeGreaterThan(0);
    expect(DEFAULT_FORGETTING_CONFIG.minImportance).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_FORGETTING_CONFIG.expirationMs).toBeGreaterThan(0);
  });
});
