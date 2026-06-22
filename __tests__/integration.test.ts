import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { TaskScheduler } from '@aether/scheduler';
import { globalEventBus, EVENTS } from '@aether/shared';

describe('集成测试 - 完整 Agent 工作流', () => {
  let processManager: ProcessManager;
  let memoryManager: MemoryManager;
  let modelRouter: ModelRouter;
  let budgetController: BudgetController;
  let mcpManager: McpManager;
  let taskScheduler: TaskScheduler;

  beforeAll(() => {
    // 初始化所有组件
    processManager = new ProcessManager();
    memoryManager = new MemoryManager('test-agent');
    modelRouter = new ModelRouter();
    budgetController = new BudgetController();
    mcpManager = new McpManager();
    taskScheduler = new TaskScheduler();

    // 注册 mock 模型提供商
    modelRouter.registerProvider(new MockModelProvider());
  });

  afterAll(async () => {
    // 清理
    await taskScheduler.stop();
    globalEventBus.removeAllListeners();
  });

  describe('Agent 生命周期管理', () => {
    it('应该能够创建并启动 Agent', async () => {
      const agent = await processManager.createAgent('test-agent', {
        defaultModel: 'mock-small',
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe('running');
      expect(agent.id).toBeDefined();
    });

    it('应该能够暂停和恢复 Agent', async () => {
      const agent = await processManager.createAgent('pause-test-agent');
      
      await processManager.pauseAgent(agent.id);
      expect(agent.status).toBe('paused');

      await processManager.resumeAgent(agent.id);
      expect(agent.status).toBe('running');
    });

    it('应该能够停止 Agent', async () => {
      const agent = await processManager.createAgent('stop-test-agent');
      
      await processManager.stopAgent(agent.id);
      expect(agent.status).toBe('stopped');
    });

    it('应该能够列出所有 Agent', async () => {
      const agents = processManager.listAgents();
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].id).toBeDefined();
      expect(agents[0].name).toBeDefined();
    });
  });

  describe('记忆系统集成', () => {
    it('应该能够添加和检索短期记忆', () => {
      const message = memoryManager.shortTerm.addMessage({
        role: 'user',
        content: '你好，我叫张三',
      });

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.content).toBe('你好，我叫张三');

      const context = memoryManager.shortTerm.getContext();
      expect(context.length).toBeGreaterThan(0);
    });

    it('应该能够添加和搜索长期记忆', async () => {
      const memory = await memoryManager.longTerm.store('test-agent', '用户喜欢蓝色和绿色', {
        type: 'preference',
        importance: 0.8,
      });

      expect(memory).toBeDefined();
      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('用户喜欢蓝色和绿色');

      // 搜索相关记忆（使用内容中存在的关键词）
      const results = await memoryManager.longTerm.search('test-agent', '蓝色', {
        threshold: 0.3,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.content).toContain('蓝色');
    });

    it('应该能够获取完整上下文（短期+长期）', async () => {
      // 添加一些短期记忆
      memoryManager.shortTerm.addMessage({
        role: 'user',
        content: '今天天气怎么样？',
      });

      // 获取完整上下文
      const fullContext = await memoryManager.getFullContext('颜色偏好');
      expect(fullContext.length).toBeGreaterThan(0);
    });
  });

  describe('模型路由集成', () => {
    it('应该能够通过模型路由器发送聊天请求', async () => {
      const response = await modelRouter.route({
        messages: [
          { role: 'system', content: '你是一个助手' },
          { role: 'user', content: '你好' },
        ],
      });

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.message.role).toBe('assistant');
      expect(response.usage.totalTokens).toBeGreaterThan(0);
    });

    it('应该能够生成嵌入向量', async () => {
      const response = await modelRouter.routeEmbedding({
        input: '测试文本',
      });

      expect(response).toBeDefined();
      expect(response.embeddings).toBeDefined();
      expect(response.embeddings.length).toBe(1);
      expect(response.embeddings[0].length).toBe(1536); // mock 模型返回 1536 维
    });

    it('应该能够列出所有可用模型', () => {
      const models = modelRouter.listAllModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBeDefined();
      expect(models[0].name).toBeDefined();
    });
  });

  describe('预算控制集成', () => {
    it('应该能够跟踪 token 使用量', async () => {
      const initialUsage = await budgetController.getDailyUsage();
      
      // 记录一些 token 使用
      await budgetController.trackUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: Date.now(),
        model: 'mock-small',
        agentId: 'test-agent',
      });

      const newUsage = await budgetController.getDailyUsage();
      expect(newUsage.totalTokens).toBe(initialUsage.totalTokens + 150);
    });

    it('应该能够检查预算状态', async () => {
      const percentage = await budgetController.getBudgetPercentage();
      expect(typeof percentage).toBe('number');
      expect(percentage).toBeGreaterThanOrEqual(0);
    });

    it('应该能够设置和重置预算', async () => {
      budgetController.setDailyBudget(50000);
      expect(budgetController.getDailyBudget()).toBe(50000);

      await budgetController.resetDaily();
      const usage = await budgetController.getDailyUsage();
      expect(usage.totalTokens).toBe(0);
    });
  });

  describe('MCP 工具集成', () => {
    it('应该能够列出内置工具', async () => {
      const tools = await mcpManager.listAllTools();
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('get_current_time');
      expect(toolNames).toContain('calculate');
      expect(toolNames).toContain('echo');
    });

    it('应该能够执行内置工具', async () => {
      const result = await mcpManager.executeTool('calculate', {
        expression: '2 + 3 * 4',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).result).toBe(14);
    });

    it('应该能够获取当前时间工具', async () => {
      const result = await mcpManager.executeTool('get_current_time', {
        timezone: 'Asia/Shanghai',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('当前时间');
    });

    it('应该能够列出 MCP 服务器', () => {
      const servers = mcpManager.listServers();
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0].name).toBe('builtin');
    });
  });

  describe('任务调度集成', () => {
    it('应该能够创建定时任务', async () => {
      const task = await taskScheduler.schedule({
        name: '测试任务',
        agentId: 'test-agent',
        cron: '* * * * *', // 每分钟
        taskType: 'custom',
        payload: { message: 'hello' },
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.name).toBe('测试任务');
      expect(task.enabled).toBe(true);
    });

    it('应该能够列出定时任务', async () => {
      const { items, total } = await taskScheduler.listTasks();
      expect(total).toBeGreaterThan(0);
      expect(items.length).toBeGreaterThan(0);
    });

    it('应该能够立即执行任务', async () => {
      const task = await taskScheduler.schedule({
        name: '立即执行测试',
        agentId: 'test-agent',
        cron: '0 0 * * *',
        taskType: 'custom',
        payload: { test: true },
      });

      const result = await taskScheduler.executeNow(task.id);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('应该能够取消任务', async () => {
      const task = await taskScheduler.schedule({
        name: '待取消任务',
        agentId: 'test-agent',
        cron: '* * * * *',
        taskType: 'custom',
        payload: {},
      });

      const result = await taskScheduler.cancel(task.id);
      expect(result).toBe(true);

      const { items } = await taskScheduler.listTasks({ status: 'cancelled' as any });
      const cancelledTask = items.find(t => t.id === task.id);
      expect(cancelledTask).toBeDefined();
    });
  });

  describe('事件驱动集成', () => {
    it('应该能够监听 Agent 状态变化事件', () => {
      return new Promise<void>(async (resolve) => {
        // 创建一个运行中的 Agent
        const agent = await processManager.createAgent('event-test-agent-3');
        
        // 注册监听器，监听从 running 到 paused 的变化
        const handler = (agentId: string, oldStatus: string, newStatus: string) => {
          if (agentId === agent.id && oldStatus === 'running' && newStatus === 'paused') {
            expect(agentId).toBe(agent.id);
            expect(oldStatus).toBe('running');
            expect(newStatus).toBe('paused');
            globalEventBus.off(EVENTS.AGENT_STATUS_CHANGED, handler);
            resolve();
          }
        };
        
        globalEventBus.on(EVENTS.AGENT_STATUS_CHANGED, handler);

        // 暂停 Agent，触发状态变化
        await processManager.pauseAgent(agent.id);
      });
    });

    it('应该能够监听记忆添加事件', () => {
      return new Promise<void>(async (resolve) => {
        const uniqueContent = `测试事件记忆-${Date.now()}`;
        
        const handler = (memoryId: string, agentId: string, timestamp: number) => {
          // 检查是否是我们刚添加的记忆（通过 agentId 和时间接近来判断）
          if (agentId === 'test-agent' && Math.abs(Date.now() - timestamp) < 5000) {
            expect(memoryId).toBeDefined();
            expect(agentId).toBe('test-agent');
            expect(typeof timestamp).toBe('number');
            globalEventBus.off(EVENTS.MEMORY_ADDED, handler);
            resolve();
          }
        };
        
        globalEventBus.on(EVENTS.MEMORY_ADDED, handler);

        await memoryManager.longTerm.store('test-agent', uniqueContent, {
          type: 'fact',
        });
      });
    });
  });

  describe('端到端完整流程', () => {
    it('应该完成从创建到停止的完整 Agent 工作流', async () => {
      // 1. 创建 Agent
      const agent = await processManager.createAgent('e2e-test-agent', {
        defaultModel: 'mock-small',
      });
      expect(agent.status).toBe('running');

      // 2. 添加记忆
      await memoryManager.longTerm.store(agent.id, '用户是 VIP 客户', {
        type: 'fact',
        importance: 0.9,
      });
      memoryManager.shortTerm.addMessage({
        role: 'user',
        content: '你好，请帮我查询订单',
      });

      // 3. 搜索相关记忆
      const memories = await memoryManager.longTerm.search(agent.id, 'VIP', {
        threshold: 0.3,
      });
      expect(memories.length).toBeGreaterThan(0);

      // 4. 调用模型
      const response = await modelRouter.route({
        messages: [
          { role: 'system', content: '你是一个客服助手' },
          { role: 'user', content: '查询我的订单状态' },
        ],
        model: 'mock-small',
      });
      expect(response.message.content).toBeDefined();

      // 5. 调用工具
      const toolResult = await mcpManager.executeTool('echo', {
        message: '订单查询结果',
      });
      expect(toolResult.success).toBe(true);

      // 6. 记录 token 使用
      await budgetController.trackUsage({
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        timestamp: Date.now(),
        model: response.model,
        agentId: agent.id,
      });

      // 7. 创建定时任务
      const task = await taskScheduler.schedule({
        name: '每日总结',
        agentId: agent.id,
        cron: '0 23 * * *',
        taskType: 'custom',
        payload: { type: 'daily_summary' },
      });
      expect(task.enabled).toBe(true);

      // 8. 停止 Agent
      await processManager.stopAgent(agent.id);
      expect(agent.status).toBe('stopped');

      // 验证整个流程没有错误
      expect(true).toBe(true);
    });
  });
});
