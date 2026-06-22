import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TaskStatus,
  TaskScheduler,
  SqlitePersistence,
} from '../src/scheduler';

describe('TaskScheduler 持久化测试', () => {
  let persistence: SqlitePersistence;

  beforeEach(async () => {
    persistence = new SqlitePersistence(':memory:');
    await persistence.initialize();
  });

  afterEach(async () => {
    await persistence.close();
  });

  describe('setPersistence', () => {
    it('应该能够设置持久化存储', () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);
      // 不报错即表示成功
      expect(scheduler).toBeDefined();
    });
  });

  describe('schedule 持久化', () => {
    it('schedule 后任务应该被持久化', async () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);

      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: { message: 'hello' },
      });

      // 从持久化存储加载，验证任务已保存
      const persistedTasks = await persistence.loadScheduledTasks();
      expect(persistedTasks.length).toBe(1);
      expect(persistedTasks[0].id).toBe(task.id);
      expect(persistedTasks[0].name).toBe('测试任务');
      expect(persistedTasks[0].agentId).toBe('agent-1');
      expect(persistedTasks[0].cron).toBe('* * * * *');
    });

    it('多个任务都应该被持久化', async () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);

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
        cron: '0 * * * *',
        payload: {},
      });

      const persistedTasks = await persistence.loadScheduledTasks();
      expect(persistedTasks.length).toBe(2);
    });

    it('未设置持久化时 schedule 不应报错', async () => {
      const scheduler = new TaskScheduler();
      // 不调用 setPersistence

      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      expect(task).toBeDefined();
    });
  });

  describe('cancel 持久化', () => {
    it('cancel 后任务状态应该被持久化', async () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);

      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await scheduler.cancel(task.id);

      const persistedTasks = await persistence.loadScheduledTasks();
      expect(persistedTasks.length).toBe(1);
      expect(persistedTasks[0].status).toBe(TaskStatus.CANCELLED);
      expect(persistedTasks[0].enabled).toBe(false);
    });
  });

  describe('start 从持久化加载任务', () => {
    it('start 时应该从持久化存储加载任务到内存', async () => {
      // 第一个调度器创建并持久化任务
      const scheduler1 = new TaskScheduler();
      scheduler1.setPersistence(persistence);

      const task = await scheduler1.schedule({
        agentId: 'agent-1',
        name: '持久化任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: { data: 'test' },
      });

      // 第二个调度器共享同一个持久化存储
      const scheduler2 = new TaskScheduler();
      scheduler2.setPersistence(persistence);

      // 启动前内存中没有任务
      const beforeStart = await scheduler2.listTasks();
      expect(beforeStart.total).toBe(0);

      // 启动后应该从持久化存储加载任务
      await scheduler2.start();

      const afterStart = await scheduler2.listTasks();
      expect(afterStart.total).toBe(1);
      expect(afterStart.items[0].id).toBe(task.id);
      expect(afterStart.items[0].name).toBe('持久化任务');
      expect(afterStart.items[0].agentId).toBe('agent-1');

      await scheduler2.stop();
    });

    it('加载的任务应该保留运行时状态', async () => {
      const scheduler1 = new TaskScheduler();
      scheduler1.setPersistence(persistence);

      const task = await scheduler1.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
        metadata: { key: 'value' },
      });

      // 取消任务，改变状态
      await scheduler1.cancel(task.id);

      // 第二个调度器加载
      const scheduler2 = new TaskScheduler();
      scheduler2.setPersistence(persistence);
      await scheduler2.start();

      const loaded = await scheduler2.getTask(task.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe(TaskStatus.CANCELLED);
      expect(loaded?.enabled).toBe(false);
      expect(loaded?.metadata).toEqual({ key: 'value' });

      await scheduler2.stop();
    });

    it('加载任务后应该能正常执行', async () => {
      const scheduler1 = new TaskScheduler();
      scheduler1.setPersistence(persistence);

      const task = await scheduler1.schedule({
        agentId: 'agent-1',
        name: '可执行任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: { test: 'data' },
      });

      // 第二个调度器加载并执行
      const scheduler2 = new TaskScheduler();
      scheduler2.setPersistence(persistence);
      await scheduler2.start();

      const result = await scheduler2.executeNow(task.id);
      expect(result.success).toBe(true);
      expect(result.taskId).toBe(task.id);

      await scheduler2.stop();
    });

    it('不应覆盖内存中已存在的任务', async () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);

      // 先创建一个内存中的任务
      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '内存任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      // 启动时不应该覆盖已有任务
      await scheduler.start();

      const loaded = await scheduler.getTask(task.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe('内存任务');

      await scheduler.stop();
    });
  });

  describe('executeNow 持久化', () => {
    it('executeNow 后任务状态应该被持久化', async () => {
      const scheduler = new TaskScheduler();
      scheduler.setPersistence(persistence);

      const task = await scheduler.schedule({
        agentId: 'agent-1',
        name: '测试任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await scheduler.executeNow(task.id);

      // 验证执行次数已持久化
      const persistedTasks = await persistence.loadScheduledTasks();
      expect(persistedTasks.length).toBe(1);
      expect(persistedTasks[0].runCount).toBe(1);
    });
  });

  describe('文件数据库持久化', () => {
    it('应该支持跨进程的文件数据库持久化', async () => {
      const dbPath = '/tmp/aether-test-scheduler-' + Date.now() + '.db';
      const filePersistence = new SqlitePersistence(dbPath);
      await filePersistence.initialize();

      // 第一个调度器创建任务
      const scheduler1 = new TaskScheduler();
      scheduler1.setPersistence(filePersistence);

      const task = await scheduler1.schedule({
        agentId: 'agent-1',
        name: '文件持久化任务',
        taskType: 'custom',
        cron: '* * * * *',
        payload: {},
      });

      await filePersistence.close();

      // 用新的持久化实例打开同一个文件
      const filePersistence2 = new SqlitePersistence(dbPath);
      await filePersistence2.initialize();

      const scheduler2 = new TaskScheduler();
      scheduler2.setPersistence(filePersistence2);
      await scheduler2.start();

      const loaded = await scheduler2.getTask(task.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe('文件持久化任务');

      await scheduler2.stop();
      await filePersistence2.close();

      // 清理
      const fs = await import('fs');
      fs.unlinkSync(dbPath);
    });
  });
});
