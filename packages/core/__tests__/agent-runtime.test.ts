import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent, AgentStatus, ProcessManager, AgentRuntime, AgentRuntimeManager } from '../src/index.js';
import { MemoryManager, MessageRole } from '@aether/memory';
import { MockModelProvider, ModelRouter, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import type { ChatCompletionResponse } from '@aether/model-router';

describe('AgentRuntime 测试', () => {
  describe('基础功能', () => {
    it('应该正确创建 AgentRuntime', async () => {
      const agent = new Agent('test', { defaultModel: 'mock-small' });
      await agent.start();
      const memory = new MemoryManager('test-agent');
      const router = new ModelRouter();
      router.registerProvider(new MockModelProvider());

      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
      });

      expect(runtime.agent).toBe(agent);
      expect(runtime.getHistory().length).toBe(0);
    });

    it('没有模型路由器时应该回退到 echo 模式', async () => {
      const agent = new Agent('test');
      await agent.start();
      const memory = new MemoryManager('test-agent');

      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
      });

      const response = await runtime.sendMessage('你好');
      expect(response).toBe('Echo: 你好');

      // 验证消息已存入记忆
      const history = runtime.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].role).toBe(MessageRole.USER);
      expect(history[0].content).toBe('你好');
      expect(history[1].role).toBe(MessageRole.ASSISTANT);
      expect(history[1].content).toBe('Echo: 你好');
    });

    it('没有模型路由器和记忆时也应该工作', async () => {
      const agent = new Agent('test');
      await agent.start();

      const runtime = new AgentRuntime({ agent });
      const response = await runtime.sendMessage('测试');
      expect(response).toBe('Echo: 测试');
    });
  });

  describe('模型集成', () => {
    let agent: Agent;
    let memory: MemoryManager;
    let router: ModelRouter;
    let budget: BudgetController;

    beforeEach(async () => {
      agent = new Agent('test', { defaultModel: 'mock-small' });
      await agent.start();
      memory = new MemoryManager(agent.id);
      router = new ModelRouter();
      router.registerProvider(new MockModelProvider());
      budget = new BudgetController(100000);
    });

    it('应该通过模型路由器获取响应', async () => {
      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        budgetController: budget,
      });

      const response = await runtime.sendMessage('你好');
      expect(response).toContain('Mock response');
      expect(response).toContain('你好');

      // 验证记忆中有用户和助手消息
      const history = runtime.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((m) => m.role === MessageRole.USER && m.content === '你好')).toBe(true);
      expect(history.some((m) => m.role === MessageRole.ASSISTANT)).toBe(true);
    });

    it('应该将系统提示词加入记忆', async () => {
      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        systemPrompt: '你是一个助手',
      });

      const history = runtime.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].role).toBe(MessageRole.SYSTEM);
      expect(history[0].content).toBe('你是一个助手');
    });

    it('预算耗尽时应该返回提示消息', async () => {
      const smallBudget = new BudgetController(10); // 极小预算
      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        budgetController: smallBudget,
      });

      const response = await runtime.sendMessage('你好');
      expect(response).toContain('预算已耗尽');
    });

    it('clearHistory 应该清除历史但保留系统提示词', async () => {
      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        systemPrompt: '系统提示',
      });

      await runtime.sendMessage('消息1');
      expect(runtime.getHistory().length).toBeGreaterThan(1);

      runtime.clearHistory();
      const history = runtime.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].role).toBe(MessageRole.SYSTEM);
      expect(history[0].content).toBe('系统提示');
    });
  });

  describe('工具调用循环', () => {
    it('应该执行工具调用并循环', async () => {
      const agent = new Agent('tool-test', {
        defaultModel: 'mock-large',
        toolsEnabled: true,
      });
      await agent.start();

      const memory = new MemoryManager(agent.id);
      const router = new ModelRouter();
      const mockProvider = new MockModelProvider();
      router.registerProvider(mockProvider);
      const mcpManager = new McpManager();

      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        mcpManager,
        maxToolRounds: 5,
      });

      // Mock 模型第一次返回工具调用，第二次返回普通响应
      let callCount = 0;
      const originalChat = mockProvider.chat.bind(mockProvider);
      mockProvider.chat = async (request) => {
        callCount++;
        if (callCount === 1) {
          // 第一次返回工具调用
          return {
            id: 'test-1',
            model: 'mock-large',
            message: {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'call-1',
                  name: 'get_current_time',
                  arguments: {},
                },
              ],
            },
            usage: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              timestamp: Date.now(),
              model: 'mock-large',
            },
            finishReason: 'tool_calls',
          } as ChatCompletionResponse;
        }
        // 第二次返回普通响应
        return originalChat(request);
      };

      const response = await runtime.sendMessage('现在几点？');
      expect(response).toContain('Mock response');

      // 验证记忆中包含工具调用和工具结果
      const history = runtime.getHistory();
      const hasToolCall = history.some(
        (m) => m.role === MessageRole.ASSISTANT && m.toolCalls && m.toolCalls.length > 0
      );
      const hasToolResult = history.some(
        (m) => m.role === MessageRole.TOOL && m.toolName === 'get_current_time'
      );
      expect(hasToolCall).toBe(true);
      expect(hasToolResult).toBe(true);
    });

    it('达到最大循环次数应该停止', async () => {
      const agent = new Agent('loop-test', {
        defaultModel: 'mock-large',
        toolsEnabled: true,
      });
      await agent.start();

      const memory = new MemoryManager(agent.id);
      const router = new ModelRouter();
      const mockProvider = new MockModelProvider();
      router.registerProvider(mockProvider);
      const mcpManager = new McpManager();

      const runtime = new AgentRuntime({
        agent,
        memoryManager: memory,
        modelRouter: router,
        mcpManager,
        maxToolRounds: 2,
      });

      // Mock 模型始终返回工具调用
      mockProvider.chat = async () => {
        return {
          id: 'test-loop',
          model: 'mock-large',
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-loop',
                name: 'get_current_time',
                arguments: {},
              },
            ],
          },
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            timestamp: Date.now(),
            model: 'mock-large',
          },
          finishReason: 'tool_calls',
        } as ChatCompletionResponse;
      };

      const response = await runtime.sendMessage('循环测试');
      expect(response).toContain('最大工具调用次数');
    });
  });

  describe('AgentRuntimeManager', () => {
    it('应该管理多个 AgentRuntime', async () => {
      const pm = new ProcessManager();
      const memory = new MemoryManager('mgr-test');
      const router = new ModelRouter();
      router.registerProvider(new MockModelProvider());

      const manager = new AgentRuntimeManager({
        processManager: pm,
        memoryManager: memory,
        modelRouter: router,
      });

      const agent = await pm.createAgent('test-agent', { defaultModel: 'mock-small' });
      const runtime = manager.createRuntime(agent.id);

      expect(runtime).toBeDefined();
      expect(manager.getRuntime(agent.id)).toBe(runtime);
      expect(manager.listRuntimes().length).toBe(1);

      const response = await manager.sendMessage(agent.id, '你好');
      expect(response).toContain('Mock response');

      expect(manager.removeRuntime(agent.id)).toBe(true);
      expect(manager.listRuntimes().length).toBe(0);
    });

    it('sendMessage 应该自动创建运行时', async () => {
      const pm = new ProcessManager();
      const router = new ModelRouter();
      router.registerProvider(new MockModelProvider());

      const manager = new AgentRuntimeManager({
        processManager: pm,
        modelRouter: router,
      });

      const agent = await pm.createAgent('auto-runtime', { defaultModel: 'mock-small' });
      const response = await manager.sendMessage(agent.id, '测试');
      expect(response).toContain('Mock response');
      expect(manager.getRuntime(agent.id)).toBeDefined();
    });

    it('不存在的 Agent 应该抛出错误', async () => {
      const pm = new ProcessManager();
      const manager = new AgentRuntimeManager({ processManager: pm });

      await expect(manager.sendMessage('nonexistent', 'msg')).rejects.toThrow();
    });
  });
});
