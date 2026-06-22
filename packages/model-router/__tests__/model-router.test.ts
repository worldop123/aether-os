import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockModelProvider,
  ModelRouter,
  BudgetController,
} from '../src/model-router';
import { globalEventBus } from '@aether/shared';

describe('MockModelProvider 测试', () => {
  let provider: MockModelProvider;

  beforeEach(() => {
    provider = new MockModelProvider();
  });

  describe('基础功能', () => {
    it('应该正确创建 Mock 提供商', () => {
      expect(provider.id).toBe('mock');
      expect(provider.name).toBe('Mock Provider');
      expect(provider.isAvailable()).toBe(true);
    });

    it('应该支持自定义 ID 和名称', () => {
      const customProvider = new MockModelProvider('custom', 'Custom Provider');
      expect(customProvider.id).toBe('custom');
      expect(customProvider.name).toBe('Custom Provider');
    });

    it('应该有默认的模型列表', () => {
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该能够获取模型信息', () => {
      const model = provider.getModelInfo('mock-small');
      expect(model).toBeDefined();
      expect(model?.id).toBe('mock-small');
      expect(model?.contextWindow).toBe(4096);
    });

    it('获取不存在的模型应该返回 undefined', () => {
      const model = provider.getModelInfo('non-existent');
      expect(model).toBeUndefined();
    });
  });

  describe('聊天补全', () => {
    it('应该返回模拟的聊天响应', async () => {
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.id).toBeDefined();
      expect(response.model).toBe('mock-small');
      expect(response.message.role).toBe('assistant');
      expect(response.message.content).toContain('Mock response to');
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
      expect(response.finishReason).toBe('stop');
    });

    it('应该支持指定模型', async () => {
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'mock-large',
      });

      expect(response.model).toBe('mock-large');
    });

    it('使用不存在的模型应该抛出错误', async () => {
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });

    it('应该支持 maxTokens 参数', async () => {
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 50,
      });

      expect(response.usage.outputTokens).toBeLessThanOrEqual(50);
    });
  });

  describe('嵌入向量', () => {
    it('应该返回模拟的嵌入向量', async () => {
      const response = await provider.embed({
        input: 'Hello world',
      });

      expect(response.embeddings).toBeDefined();
      expect(response.embeddings.length).toBe(1);
      expect(response.embeddings[0].length).toBe(1536);
      expect(response.model).toBe('mock-small');
    });

    it('应该支持多个输入', async () => {
      const response = await provider.embed({
        input: ['Hello', 'World'],
      });

      expect(response.embeddings.length).toBe(2);
    });

    it('嵌入向量应该是归一化的', async () => {
      const response = await provider.embed({
        input: 'Hello',
      });

      const embedding = response.embeddings[0];
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('使用不存在的模型应该抛出错误', async () => {
      await expect(
        provider.embed({
          input: 'Hello',
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });
});

describe('ModelRouter 测试', () => {
  let router: ModelRouter;
  let mockProvider: MockModelProvider;

  beforeEach(() => {
    router = new ModelRouter();
    mockProvider = new MockModelProvider();
    router.registerProvider(mockProvider);
  });

  describe('提供商管理', () => {
    it('应该能够注册提供商', () => {
      const providers = router.listProviders();
      expect(providers.length).toBe(1);
      expect(providers[0].id).toBe('mock');
    });

    it('应该能够注销提供商', () => {
      const result = router.unregisterProvider('mock');
      expect(result).toBe(true);
      expect(router.listProviders().length).toBe(0);
    });

    it('注销不存在的提供商应该返回 false', () => {
      const result = router.unregisterProvider('non-existent');
      expect(result).toBe(false);
    });

    it('应该能够列出所有模型', () => {
      const models = router.listAllModels();
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('路由聊天请求', () => {
    it('应该能够路由聊天请求', async () => {
      const response = await router.route({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
      expect(response.message.content).toContain('Mock response to');
    });

    it('应该支持指定模型', async () => {
      const response = await router.route(
        {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        { preferredModel: 'mock-large' }
      );

      expect(response.model).toBe('mock-large');
    });

    it('应该支持指定提供商', async () => {
      const response = await router.route(
        {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        { preferredProvider: 'mock' }
      );

      expect(response).toBeDefined();
    });

    it('指定不存在的模型应该抛出错误', async () => {
      await expect(
        router.route(
          {
            messages: [{ role: 'user', content: 'Hello' }],
          },
          { preferredModel: 'non-existent' }
        )
      ).rejects.toThrow();
    });

    it('指定不存在的提供商应该抛出错误', async () => {
      await expect(
        router.route(
          {
            messages: [{ role: 'user', content: 'Hello' }],
          },
          { preferredProvider: 'non-existent' }
        )
      ).rejects.toThrow();
    });

    it('没有提供商时应该抛出错误', async () => {
      const emptyRouter = new ModelRouter();
      await expect(
        emptyRouter.route({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('路由嵌入请求', () => {
    it('应该能够路由嵌入请求', async () => {
      const response = await router.routeEmbedding({
        input: 'Hello',
      });

      expect(response.embeddings.length).toBe(1);
    });

    it('应该支持指定模型', async () => {
      const response = await router.routeEmbedding(
        {
          input: 'Hello',
        },
        { preferredModel: 'mock-large' }
      );

      expect(response.model).toBe('mock-large');
    });
  });

  describe('getBestModel', () => {
    it('应该能够获取最佳模型', () => {
      const best = router.getBestModel({ strategy: 'cheapest' });
      expect(best).toBeDefined();
      expect(best?.id).toBe('mock-small'); // 最便宜的应该是 small
    });

    it('应该支持按质量优先选择', () => {
      const best = router.getBestModel({ strategy: 'best-quality' });
      expect(best).toBeDefined();
      expect(best?.id).toBe('mock-large'); // 质量最好的应该是 large
    });

    it('应该支持按速度优先选择', () => {
      const best = router.getBestModel({ strategy: 'fastest' });
      expect(best).toBeDefined();
      expect(best?.id).toBe('mock-small'); // 最快的应该是 small
    });

    it('应该支持工具调用过滤', () => {
      const best = router.getBestModel({ requiresTools: true });
      expect(best).toBeDefined();
      expect(best?.supportsTools).toBe(true);
    });

    it('没有符合条件的模型应该返回 undefined', () => {
      const best = router.getBestModel({ minContextWindow: 100000 });
      expect(best).toBeUndefined();
    });
  });

  describe('getProviderForModel', () => {
    it('应该能够获取模型的提供商', () => {
      const provider = router.getProviderForModel('mock-small');
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('mock');
    });

    it('获取不存在模型的提供商应该返回 undefined', () => {
      const provider = router.getProviderForModel('non-existent');
      expect(provider).toBeUndefined();
    });
  });
});

describe('BudgetController 测试', () => {
  let controller: BudgetController;

  beforeEach(() => {
    controller = new BudgetController(100000);
  });

  describe('基础功能', () => {
    it('应该正确创建预算控制器', () => {
      expect(controller.getDailyBudget()).toBe(100000);
    });

    it('应该有默认预算', () => {
      const defaultController = new BudgetController();
      expect(defaultController.getDailyBudget()).toBeGreaterThan(0);
    });

    it('应该能够设置每日预算', () => {
      controller.setDailyBudget(50000);
      expect(controller.getDailyBudget()).toBe(50000);
    });

    it('设置负数预算应该抛出错误', () => {
      expect(() => controller.setDailyBudget(-100)).toThrow();
    });

    it('应该能够设置 Agent 特定预算', () => {
      controller.setDailyBudget(10000, 'agent-1');
      expect(controller.getDailyBudget('agent-1')).toBe(10000);
      expect(controller.getDailyBudget()).toBe(100000); // 全局预算不变
    });
  });

  describe('使用追踪', () => {
    it('应该能够记录 token 使用', async () => {
      await controller.trackUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: Date.now(),
        model: 'mock-small',
      });

      const usage = await controller.getDailyUsage();
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });

    it('应该能够追踪 Agent 特定的使用', async () => {
      await controller.trackUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: Date.now(),
        model: 'mock-small',
        agentId: 'agent-1',
      });

      const agentUsage = await controller.getDailyUsage('agent-1');
      expect(agentUsage.totalTokens).toBe(150);

      const globalUsage = await controller.getDailyUsage();
      expect(globalUsage.totalTokens).toBe(150);
    });

    it('应该能够检查预算是否足够', async () => {
      const hasBudget = await controller.checkBudget(1000);
      expect(hasBudget).toBe(true);
    });

    it('预算不足时应该返回 false', async () => {
      controller.setDailyBudget(100);
      await controller.trackUsage({
        inputTokens: 50,
        outputTokens: 50,
        totalTokens: 100,
        timestamp: Date.now(),
        model: 'mock-small',
      });

      const hasBudget = await controller.checkBudget(10);
      expect(hasBudget).toBe(false);
    });

    it('应该能够获取预算使用百分比', async () => {
      controller.setDailyBudget(1000);
      await controller.trackUsage({
        inputTokens: 200,
        outputTokens: 300,
        totalTokens: 500,
        timestamp: Date.now(),
        model: 'mock-small',
      });

      const percentage = await controller.getBudgetPercentage();
      expect(percentage).toBe(0.5);
    });
  });

  describe('重置和历史', () => {
    it('应该能够重置每日使用量', async () => {
      await controller.trackUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: Date.now(),
        model: 'mock-small',
      });

      await controller.resetDaily();

      const usage = await controller.getDailyUsage();
      expect(usage.totalTokens).toBe(0);
    });

    it('应该能够重置特定 Agent 的使用量', async () => {
      await controller.trackUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: Date.now(),
        model: 'mock-small',
        agentId: 'agent-1',
      });

      await controller.resetDaily('agent-1');

      const agentUsage = await controller.getDailyUsage('agent-1');
      expect(agentUsage.totalTokens).toBe(0);

      // 全局使用量应该不变
      const globalUsage = await controller.getDailyUsage();
      expect(globalUsage.totalTokens).toBe(150);
    });

    it('应该能够获取使用历史', async () => {
      for (let i = 0; i < 5; i++) {
        await controller.trackUsage({
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
          timestamp: Date.now() + i * 1000,
          model: 'mock-small',
        });
      }

      const history = await controller.getUsageHistory();
      expect(history.length).toBe(5);
    });

    it('应该支持限制历史记录数量', async () => {
      for (let i = 0; i < 10; i++) {
        await controller.trackUsage({
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
          timestamp: Date.now() + i * 1000,
          model: 'mock-small',
        });
      }

      const history = await controller.getUsageHistory({ limit: 3 });
      expect(history.length).toBe(3);
    });

    it('应该支持按 Agent 过滤历史', async () => {
      await controller.trackUsage({
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        timestamp: Date.now(),
        model: 'mock-small',
        agentId: 'agent-1',
      });
      await controller.trackUsage({
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        timestamp: Date.now(),
        model: 'mock-small',
        agentId: 'agent-2',
      });

      const history = await controller.getUsageHistory({ agentId: 'agent-1' });
      expect(history.length).toBe(1);
      expect(history[0].agentId).toBe('agent-1');
    });
  });

  describe('事件触发', () => {
    it('预算达到警告阈值时应该触发警告事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('budget.warning', handler);

      controller.setDailyBudget(1000);
      await controller.trackUsage({
        inputTokens: 400,
        outputTokens: 450,
        totalTokens: 850, // 85%，超过 80% 阈值
        timestamp: Date.now(),
        model: 'mock-small',
      });

      expect(handler).toHaveBeenCalled();

      globalEventBus.off('budget.warning', handler);
    });

    it('预算超限时应该触发超限事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('budget.exceeded', handler);

      controller.setDailyBudget(1000);
      await controller.trackUsage({
        inputTokens: 600,
        outputTokens: 500,
        totalTokens: 1100, // 110%，超过预算
        timestamp: Date.now(),
        model: 'mock-small',
      });

      expect(handler).toHaveBeenCalled();

      globalEventBus.off('budget.exceeded', handler);
    });
  });
});
