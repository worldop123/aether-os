import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus,
  TaskScheduler,
  SqlitePersistence,
} from '../src/scheduler';
import { globalEventBus } from '@aether/shared';

describe('TaskScheduler 测试', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler();
  });

  describe('基础功能', () => {
    it('应该正确创建调度器', () => {
      expect(scheduler.isRunning()).toBe(false);
    });

    it('应该能够启动调度器', async () => {
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('应该能够停止调度器', async () => {
      await scheduler.start();
      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('重复启动应该不报错', async () => {
      await scheduler.start();
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('重复停止应该不报错', async () => {
      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('任务管理', () => {
    it('应该能够创建任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: { message: 'hello' },
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.name).toBe('测试任务');
      expect(task.agentId).toBe('agent-1');
      expect(task.taskType).toBe('custom');
      expect(task.enabled).toBe(true);
      expect(task.status).toBe(TaskStatus.PENDING);
    });

    it('应该能够获取任务', async () => {
      const created = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const task = await scheduler.getTask(created.id);
      expect(task).toBeDefined();
      expect(task?.id).toBe(created.id);
    });

    it('获取不存在的任务应该返回 null', async () => {
      const task = await scheduler.getTask('non-existent');
      expect(task).toBeNull();
    });

    it('应该能够列出任务', async () => {
      await scheduler.schedule({
        agentId: 'agent-1',
        name: '任务1',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });
      await scheduler.schedule({
        agentId: 'agent-2',
        name: '任务2',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const { items, total } = await scheduler.listTasks();
      expect(total).toBe(2);
      expect(items.length).toBe(2);
    });

    it('应该能够按 Agent 过滤任务', async () => {
      await scheduler.schedule({
        agentId: 'agent-1',
        name: '任务1',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });
      await scheduler.schedule({
        agentId: 'agent-2',
        name: '任务2',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const { items, total } = await scheduler.listTasks({ agentId: 'agent-1' });
      expect(total).toBe(1);
      expect(items[0].agentId).toBe('agent-1');
    });

    it('应该能够按状态过滤任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '任务1',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const { items, total } = await scheduler.listTasks({ status: TaskStatus.PENDING });
      expect(total).toBe(1);
      expect(items[0].status).toBe(TaskStatus.PENDING);
    });

    it('应该能够按启用状态过滤任务', async () => {
      await scheduler.schedule({
        agentId: 'agent-1',
        name: '任务1',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
        enabled: true,
      });
      await scheduler.schedule({
        agentId: 'agent-1',
        name: '任务2',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
        enabled: false,
      });

      const { items, total } = await scheduler.listTasks({ enabled: true });
      expect(total).toBe(1);
      expect(items[0].enabled).toBe(true);
    });

    it('应该支持分页', async () => {
      for (let i = 0; i < 5; i++) {
        await scheduler.schedule({
          agentId: 'agent-1',
          name: `任务${i}`,
          taskType: 'custom',
          cron: '* * * * *',
          payload: {},
        });
      }

      const { items, total } = await scheduler.listTasks({ page: 1, pageSize: 2 });
      expect(total).toBe(5);
      expect(items.length).toBe(2);
    });
  });

  describe('任务操作', () => {
    it('应该能够取消任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const result = await scheduler.cancel(task.id);
      expect(result).toBe(true);

      const updatedTask = await scheduler.getTask(task.id);
      expect(updatedTask?.status).toBe(TaskStatus.CANCELLED);
      expect(updatedTask?.enabled).toBe(false);
    });

    it('取消不存在的任务应该返回 false', async () => {
      const result = await scheduler.cancel('non-existent');
      expect(result).toBe(false);
    });

    it('应该能够立即执行任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: { test: 'data' },
      });

      const result = await scheduler.executeNow(task.id);
      expect(result.success).toBe(true);
      expect(result.taskId).toBe(task.id);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('立即执行不存在的任务应该抛出错误', async () => {
      await expect(scheduler.executeNow('non-existent')).rejects.toThrow();
    });

    it('应该能够启用任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
        enabled: false,
      });

      const result = await scheduler.enableTask(task.id);
      expect(result).toBe(true);

      const updatedTask = await scheduler.getTask(task.id);
      expect(updatedTask?.enabled).toBe(true);
    });

    it('应该能够禁用任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const result = await scheduler.disableTask(task.id);
      expect(result).toBe(true);

      const updatedTask = await scheduler.getTask(task.id);
      expect(updatedTask?.enabled).toBe(false);
    });

    it('应该能够更新任务', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      const updated = await scheduler.updateTask(task.id, {
        name: '更新后的任务',
        description: '新的描述',
      });

      expect(updated.name).toBe('更新后的任务');
      expect(updated.description).toBe('新的描述');
    });

    it('更新不存在的任务应该抛出错误', async () => {
      await expect(
        scheduler.updateTask('non-existent', { name: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('执行历史', () => {
    it('应该能够获取执行历史', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await scheduler.executeNow(task.id);
      await scheduler.executeNow(task.id);

      const history = await scheduler.getExecutionHistory(task.id);
      expect(history.length).toBe(2);
    });

    it('应该能够限制历史记录数量', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      for (let i = 0; i < 5; i++) {
        await scheduler.executeNow(task.id);
      }

      const history = await scheduler.getExecutionHistory(task.id, 3);
      expect(history.length).toBe(3);
    });

    it('历史记录应该按时间倒序排列', async () => {
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await scheduler.executeNow(task.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await scheduler.executeNow(task.id);

      const history = await scheduler.getExecutionHistory(task.id);
      expect(history[0].startedAt).toBeGreaterThan(history[1].startedAt);
    });
  });

  describe('事件触发', () => {
    it('创建任务时应该触发事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('scheduler.task_created', handler);

      await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      expect(handler).toHaveBeenCalled();

      globalEventBus.off('scheduler.task_created', handler);
    });

    it('取消任务时应该触发事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('scheduler.task_cancelled', handler);

      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await scheduler.cancel(task.id);
      expect(handler).toHaveBeenCalled();

      globalEventBus.off('scheduler.task_cancelled', handler);
    });
  });
});

describe('SqlitePersistence 测试', () => {
  let persistence: SqlitePersistence;

  beforeEach(async () => {
    persistence = new SqlitePersistence(':memory:');
    await persistence.initialize();
  });

  afterEach(async () => {
    await persistence.close();
  });

  describe('Agent 状态持久化', () => {
    it('应该能够保存和加载 Agent 状态', async () => {
      const agentState = {
        id: 'agent-1',
        name: '测试 Agent',
        description: '测试描述',
        status: 'running' as any,
        config: { temperature: 0.7 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { key: 'value' },
      };

      await persistence.saveAgentState(agentState);

      const loaded = await persistence.loadAgentState('agent-1');
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('agent-1');
      expect(loaded?.name).toBe('测试 Agent');
      expect(loaded?.status).toBe('running');
      expect(loaded?.config.temperature).toBe(0.7);
    });

    it('应该能够加载所有 Agent 状态', async () => {
      await persistence.saveAgentState({
        id: 'agent-1',
        name: 'Agent 1',
        status: 'idle' as any,
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      });
      await persistence.saveAgentState({
        id: 'agent-2',
        name: 'Agent 2',
        status: 'running' as any,
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      });

      const all = await persistence.loadAllAgentStates();
      expect(all.length).toBe(2);
    });

    it('应该能够删除 Agent 状态', async () => {
      await persistence.saveAgentState({
        id: 'agent-1',
        name: '测试 Agent',
        status: 'idle' as any,
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      });

      const result = await persistence.deleteAgentState('agent-1');
      expect(result).toBe(true);

      const loaded = await persistence.loadAgentState('agent-1');
      expect(loaded).toBeNull();
    });

    it('删除不存在的 Agent 应该返回 false', async () => {
      const result = await persistence.deleteAgentState('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('记忆持久化', () => {
    it('应该能够保存和加载记忆', async () => {
      const memory = {
        id: 'mem-1',
        agentId: 'agent-1',
        content: '这是一条记忆',
        type: 'fact',
        importance: 0.8,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
      };

      await persistence.saveMemory(memory);

      const loaded = await persistence.loadMemory('agent-1');
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('mem-1');
      expect(loaded[0].content).toBe('这是一条记忆');
    });

    it('应该能够删除记忆', async () => {
      await persistence.saveMemory({
        id: 'mem-1',
        agentId: 'agent-1',
        content: '测试记忆',
        type: 'fact',
        importance: 0.5,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
      });

      const result = await persistence.deleteMemory('mem-1');
      expect(result).toBe(true);

      const loaded = await persistence.loadMemory('agent-1');
      expect(loaded.length).toBe(0);
    });

    it('应该能够更新记忆访问信息', async () => {
      await persistence.saveMemory({
        id: 'mem-1',
        agentId: 'agent-1',
        content: '测试记忆',
        type: 'fact',
        importance: 0.5,
        createdAt: Date.now(),
        lastAccessedAt: Date.now() - 1000,
        accessCount: 0,
      });

      await persistence.updateMemoryAccess('mem-1');

      const loaded = await persistence.loadMemory('agent-1');
      expect(loaded[0].accessCount).toBe(1);
    });
  });

  describe('Token 使用持久化', () => {
    it('应该能够保存和查询 token 使用量', async () => {
      const now = Date.now();

      await persistence.saveTokenUsage({
        id: 'usage-1',
        agentId: 'agent-1',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        timestamp: now,
      });

      await persistence.saveTokenUsage({
        id: 'usage-2',
        agentId: 'agent-1',
        model: 'gpt-4',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        timestamp: now,
      });

      const usage = await persistence.getDailyTokenUsage(now, 'agent-1');
      expect(usage.inputTokens).toBe(300);
      expect(usage.outputTokens).toBe(150);
      expect(usage.totalTokens).toBe(450);
    });
  });
});
