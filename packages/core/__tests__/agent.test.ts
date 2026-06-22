import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent, ProcessManager, AgentStatus } from '../src/agent';
import { globalEventBus } from '@aether/shared';

describe('Agent 类测试', () => {
  describe('基础功能', () => {
    it('应该正确创建 Agent 实例', () => {
      const agent = new Agent('test-agent');
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe(AgentStatus.IDLE);
      expect(agent.createdAt).toBeGreaterThan(0);
      expect(agent.updatedAt).toBe(agent.createdAt);
    });

    it('应该支持自定义配置', () => {
      const config = {
        defaultModel: 'gpt-4',
        temperature: 0.7,
        memoryEnabled: false,
      };
      const agent = new Agent('test-agent', config);
      expect(agent.config.defaultModel).toBe('gpt-4');
      expect(agent.config.temperature).toBe(0.7);
      expect(agent.config.memoryEnabled).toBe(false);
    });

    it('应该支持元数据', () => {
      const metadata = { owner: 'user1', priority: 'high' };
      const agent = new Agent('test-agent', {}, metadata);
      expect(agent.metadata).toEqual(metadata);
    });

    it('应该有默认配置', () => {
      const agent = new Agent('test-agent');
      expect(agent.config.memoryEnabled).toBe(true);
      expect(agent.config.toolsEnabled).toBe(true);
    });
  });

  describe('状态管理', () => {
    it('应该能够启动 Agent', async () => {
      const agent = new Agent('test-agent');
      expect(agent.status).toBe(AgentStatus.IDLE);

      await agent.start();
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('启动已运行的 Agent 应该是幂等的', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      await agent.start(); // 第二次启动
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('应该能够暂停 Agent', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      expect(agent.status).toBe(AgentStatus.RUNNING);

      await agent.pause();
      expect(agent.status).toBe(AgentStatus.PAUSED);
    });

    it('暂停非运行状态的 Agent 应该抛出错误', async () => {
      const agent = new Agent('test-agent');
      await expect(agent.pause()).rejects.toThrow();
    });

    it('应该能够恢复 Agent', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      await agent.pause();
      expect(agent.status).toBe(AgentStatus.PAUSED);

      await agent.resume();
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('恢复非暂停状态的 Agent 应该抛出错误', async () => {
      const agent = new Agent('test-agent');
      await expect(agent.resume()).rejects.toThrow();
    });

    it('应该能够停止 Agent', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      expect(agent.status).toBe(AgentStatus.RUNNING);

      await agent.stop();
      expect(agent.status).toBe(AgentStatus.STOPPED);
    });

    it('停止已停止的 Agent 应该是幂等的', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      await agent.stop();
      await agent.stop(); // 第二次停止
      expect(agent.status).toBe(AgentStatus.STOPPED);
    });

    it('已停止的 Agent 不能重新启动', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      await agent.stop();

      await expect(agent.start()).rejects.toHaveProperty('code', 'AGENT_STOPPED');
    });

    it('状态变化应该更新 updatedAt', async () => {
      const agent = new Agent('test-agent');
      const initialUpdatedAt = agent.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await agent.start();

      expect(agent.updatedAt).toBeGreaterThan(initialUpdatedAt);
    });
  });

  describe('消息处理', () => {
    it('运行中的 Agent 应该能处理消息', async () => {
      const agent = new Agent('test-agent');
      await agent.start();

      const response = await agent.sendMessage('Hello');
      expect(response).toBe('Echo: Hello');
    });

    it('非运行状态的 Agent 不能处理消息', async () => {
      const agent = new Agent('test-agent');
      await expect(agent.sendMessage('Hello')).rejects.toHaveProperty('code', 'AGENT_NOT_RUNNING');
    });

    it('暂停状态的 Agent 不能处理消息', async () => {
      const agent = new Agent('test-agent');
      await agent.start();
      await agent.pause();

      await expect(agent.sendMessage('Hello')).rejects.toHaveProperty('code', 'AGENT_NOT_RUNNING');
    });
  });

  describe('事件触发', () => {
    it('启动时应该触发 agent.started 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('agent.started', handler);

      const agent = new Agent('test-agent');
      await agent.start();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(agent.id, expect.any(Number));

      globalEventBus.off('agent.started', handler);
    });

    it('暂停时应该触发 agent.paused 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('agent.paused', handler);

      const agent = new Agent('test-agent');
      await agent.start();
      await agent.pause();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(agent.id, expect.any(Number));

      globalEventBus.off('agent.paused', handler);
    });

    it('恢复时应该触发 agent.resumed 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('agent.resumed', handler);

      const agent = new Agent('test-agent');
      await agent.start();
      await agent.pause();
      await agent.resume();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(agent.id, expect.any(Number));

      globalEventBus.off('agent.resumed', handler);
    });

    it('停止时应该触发 agent.stopped 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('agent.stopped', handler);

      const agent = new Agent('test-agent');
      await agent.start();
      await agent.stop();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(agent.id, expect.any(Number));

      globalEventBus.off('agent.stopped', handler);
    });

    it('状态变化时应该触发 agent.status_changed 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('agent.status_changed', handler);

      const agent = new Agent('test-agent');
      await agent.start();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        agent.id,
        AgentStatus.IDLE,
        AgentStatus.RUNNING,
        expect.any(Number)
      );

      globalEventBus.off('agent.status_changed', handler);
    });
  });

  describe('getStatus 方法', () => {
    it('应该返回当前状态', () => {
      const agent = new Agent('test-agent');
      expect(agent.getStatus()).toBe(AgentStatus.IDLE);
    });
  });
});

describe('ProcessManager 类测试', () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  describe('创建和查询 Agent', () => {
    it('应该能够创建 Agent', async () => {
      const agent = await manager.createAgent('test-agent');
      expect(agent).toBeDefined();
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe(AgentStatus.RUNNING); // 创建后自动启动
    });

    it('应该能够通过 ID 获取 Agent', async () => {
      const created = await manager.createAgent('test-agent');
      const found = manager.getAgent(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('获取不存在的 Agent 应该返回 undefined', () => {
      const found = manager.getAgent('non-existent');
      expect(found).toBeUndefined();
    });

    it('应该能够列出所有 Agent', async () => {
      await manager.createAgent('agent1');
      await manager.createAgent('agent2');
      await manager.createAgent('agent3');

      const agents = manager.listAgents();
      expect(agents.length).toBe(3);
    });

    it('应该能够按状态过滤 Agent', async () => {
      const agent1 = await manager.createAgent('agent1');
      const agent2 = await manager.createAgent('agent2');
      await manager.pauseAgent(agent1.id);

      const runningAgents = manager.listAgents(AgentStatus.RUNNING);
      expect(runningAgents.length).toBe(1);
      expect(runningAgents[0].id).toBe(agent2.id);

      const pausedAgents = manager.listAgents(AgentStatus.PAUSED);
      expect(pausedAgents.length).toBe(1);
      expect(pausedAgents[0].id).toBe(agent1.id);
    });

    it('应该能够检查 Agent 是否存在', async () => {
      const agent = await manager.createAgent('test-agent');

      expect(manager.hasAgent(agent.id)).toBe(true);
      expect(manager.hasAgent('non-existent')).toBe(false);
    });

    it('应该能够获取 Agent 状态', async () => {
      const agent = await manager.createAgent('test-agent');
      expect(manager.getAgentStatus(agent.id)).toBe(AgentStatus.RUNNING);
    });

    it('获取不存在 Agent 的状态应该抛出错误', () => {
      expect(() => manager.getAgentStatus('non-existent')).toThrow();
      try {
        manager.getAgentStatus('non-existent');
      } catch (error: any) {
        expect(error.code).toBe('AGENT_NOT_FOUND');
      }
    });
  });

  describe('Agent 生命周期管理', () => {
    it('应该能够暂停 Agent', async () => {
      const agent = await manager.createAgent('test-agent');
      expect(agent.status).toBe(AgentStatus.RUNNING);

      await manager.pauseAgent(agent.id);
      expect(agent.status).toBe(AgentStatus.PAUSED);
    });

    it('应该能够恢复 Agent', async () => {
      const agent = await manager.createAgent('test-agent');
      await manager.pauseAgent(agent.id);
      expect(agent.status).toBe(AgentStatus.PAUSED);

      await manager.resumeAgent(agent.id);
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('应该能够停止 Agent', async () => {
      const agent = await manager.createAgent('test-agent');
      expect(agent.status).toBe(AgentStatus.RUNNING);

      await manager.stopAgent(agent.id);
      expect(agent.status).toBe(AgentStatus.STOPPED);
    });

    it('应该能够删除 Agent', async () => {
      const agent = await manager.createAgent('test-agent');
      expect(manager.hasAgent(agent.id)).toBe(true);

      await manager.removeAgent(agent.id);
      expect(manager.hasAgent(agent.id)).toBe(false);
    });

    it('删除 Agent 时应该先停止它', async () => {
      const agent = await manager.createAgent('test-agent');
      const stopSpy = vi.spyOn(agent, 'stop');

      await manager.removeAgent(agent.id);

      expect(stopSpy).toHaveBeenCalled();
    });

    it('操作不存在的 Agent 应该抛出错误', async () => {
      await expect(manager.startAgent('non-existent')).rejects.toHaveProperty('code', 'AGENT_NOT_FOUND');
      await expect(manager.pauseAgent('non-existent')).rejects.toHaveProperty('code', 'AGENT_NOT_FOUND');
      await expect(manager.resumeAgent('non-existent')).rejects.toHaveProperty('code', 'AGENT_NOT_FOUND');
      await expect(manager.stopAgent('non-existent')).rejects.toHaveProperty('code', 'AGENT_NOT_FOUND');
      await expect(manager.removeAgent('non-existent')).rejects.toHaveProperty('code', 'AGENT_NOT_FOUND');
    });
  });
});
