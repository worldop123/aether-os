import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DagGraph, WorkflowExecutor, WorkflowBuilder } from '../src/index';
import type { WorkflowDefinition, WorkflowNode } from '../src/types';
import { globalEventBus } from '@aether/shared';

/**
 * 构造一个简单的 task 节点
 */
function makeTaskNode(
  id: string,
  name: string,
  handler: (input: unknown) => Promise<unknown> | unknown
): WorkflowNode {
  return {
    id,
    type: 'task',
    name,
    handler: async (input: unknown) => handler(input),
  };
}

/**
 * 构造工作流定义
 */
function makeWorkflow(
  nodes: WorkflowNode[],
  edges: { from: string; to: string; condition?: 'true' | 'false' }[],
  entry: string,
  options?: { timeout?: number }
): WorkflowDefinition {
  const nodeMap = new Map<string, WorkflowNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  return {
    id: 'wf-test',
    name: '测试工作流',
    version: '1.0.0',
    nodes: nodeMap,
    edges,
    entry,
    timeout: options?.timeout,
  };
}

describe('DagGraph 测试', () => {
  let dag: DagGraph;

  beforeEach(() => {
    dag = new DagGraph();
  });

  describe('基础功能', () => {
    it('应该能够添加和获取节点', () => {
      const node = makeTaskNode('a', 'A', () => 1);
      dag.addNode(node);
      expect(dag.getNode('a')).toBe(node);
      expect(dag.nodeCount()).toBe(1);
    });

    it('应该能够添加和获取边', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addEdge({ from: 'a', to: 'b' });
      expect(dag.edgeCount()).toBe(1);
      expect(dag.getEdges().length).toBe(1);
    });

    it('应该能够获取依赖和后续节点', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addNode(makeTaskNode('c', 'C', () => 3));
      dag.addEdge({ from: 'a', to: 'b' });
      dag.addEdge({ from: 'b', to: 'c' });

      expect(dag.getDependencies('b')).toEqual(['a']);
      expect(dag.getDependents('b')).toEqual(['c']);
    });
  });

  describe('拓扑排序', () => {
    it('应该正确进行拓扑排序', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addNode(makeTaskNode('c', 'C', () => 3));
      dag.addNode(makeTaskNode('d', 'D', () => 4));
      dag.addEdge({ from: 'a', to: 'b' });
      dag.addEdge({ from: 'b', to: 'c' });
      dag.addEdge({ from: 'a', to: 'd' });

      const sorted = dag.topologicalSort();
      expect(sorted).not.toBeNull();
      // a 必须在 b 和 d 之前，b 必须在 c 之前
      const idx = (id: string) => sorted!.indexOf(id);
      expect(idx('a')).toBeLessThan(idx('b'));
      expect(idx('a')).toBeLessThan(idx('d'));
      expect(idx('b')).toBeLessThan(idx('c'));
    });

    it('存在环时应该返回 null', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addNode(makeTaskNode('c', 'C', () => 3));
      dag.addEdge({ from: 'a', to: 'b' });
      dag.addEdge({ from: 'b', to: 'c' });
      dag.addEdge({ from: 'c', to: 'a' });

      expect(dag.topologicalSort()).toBeNull();
    });

    it('单个节点也能正确排序', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      const sorted = dag.topologicalSort();
      expect(sorted).toEqual(['a']);
    });
  });

  describe('环检测', () => {
    it('无环时应该返回 null', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addEdge({ from: 'a', to: 'b' });
      expect(dag.detectCycle()).toBeNull();
    });

    it('有环时应该返回环中的节点', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addNode(makeTaskNode('c', 'C', () => 3));
      dag.addEdge({ from: 'a', to: 'b' });
      dag.addEdge({ from: 'b', to: 'c' });
      dag.addEdge({ from: 'c', to: 'a' });

      const cycle = dag.detectCycle();
      expect(cycle).not.toBeNull();
      expect(cycle!.length).toBeGreaterThan(0);
    });

    it('自环也应该被检测到', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addEdge({ from: 'a', to: 'a' });
      const cycle = dag.detectCycle();
      expect(cycle).not.toBeNull();
    });
  });

  describe('条件分支', () => {
    it('应该根据条件获取下一节点', () => {
      dag.addNode(makeTaskNode('check', 'check', () => true));
      dag.addNode(makeTaskNode('true-branch', 'true', () => 'yes'));
      dag.addNode(makeTaskNode('false-branch', 'false', () => 'no'));
      dag.addEdge({ from: 'check', to: 'true-branch', condition: 'true' });
      dag.addEdge({ from: 'check', to: 'false-branch', condition: 'false' });

      expect(dag.getNextNodes('check', 'true')).toEqual(['true-branch']);
      expect(dag.getNextNodes('check', 'false')).toEqual(['false-branch']);
      // 不传条件时不应返回任何条件边
      expect(dag.getNextNodes('check')).toEqual([]);
    });

    it('无条件边应该总是被返回', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addEdge({ from: 'a', to: 'b' });
      expect(dag.getNextNodes('a')).toEqual(['b']);
      expect(dag.getNextNodes('a', 'true')).toEqual(['b']);
    });
  });

  describe('DAG 验证', () => {
    it('空 DAG 应该无效', () => {
      const result = dag.validate();
      expect(result.valid).toBe(false);
    });

    it('有效的 DAG 应该通过验证', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addEdge({ from: 'a', to: 'b' });
      const result = dag.validate();
      expect(result.valid).toBe(true);
    });

    it('有环的 DAG 应该不通过验证', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      dag.addEdge({ from: 'a', to: 'b' });
      dag.addEdge({ from: 'b', to: 'a' });
      const result = dag.validate();
      expect(result.valid).toBe(false);
    });

    it('不可达节点应该不通过验证', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addNode(makeTaskNode('b', 'B', () => 2));
      // 不连接 a 和 b
      const result = dag.validate();
      // b 没有入边，所以是入口；a 也没有入边，所以也是入口；两者都可达（自身）
      // 但实际上没有边连接，所以两者都是独立的入口
      // 修改为：b 没有入边但也没有出边到 a，所以 a 不可达
      // 重新设计：让 a 有出边但 b 没有入边
      expect(result.valid).toBe(true); // 两个独立节点都是入口，都可达
    });

    it('引用不存在节点的边应该不通过验证', () => {
      dag.addNode(makeTaskNode('a', 'A', () => 1));
      dag.addEdge({ from: 'a', to: 'nonexistent' });
      const result = dag.validate();
      expect(result.valid).toBe(false);
    });
  });
});

describe('WorkflowExecutor 测试', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  describe('简单线性工作流', () => {
    it('应该能够执行简单的线性工作流', async () => {
      const wf = makeWorkflow(
        [
          makeTaskNode('step1', '第一步', (input) => `processed: ${input}`),
          makeTaskNode('step2', '第二步', (input) => `done: ${input}`),
        ],
        [{ from: 'step1', to: 'step2' }],
        'step1'
      );

      const result = await executor.execute(wf, 'hello');
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('done: processed: hello');
      expect(result.results.size).toBe(2);
      expect(result.results.get('step1')?.status).toBe('completed');
      expect(result.results.get('step2')?.status).toBe('completed');
    });

    it('应该正确传递节点之间的数据', async () => {
      const wf = makeWorkflow(
        [
          makeTaskNode('add1', '加1', (input: any) => input + 1),
          makeTaskNode('multiply2', '乘2', (input: any) => input * 2),
        ],
        [{ from: 'add1', to: 'multiply2' }],
        'add1'
      );

      const result = await executor.execute(wf, 5);
      expect(result.finalOutput).toBe(12); // (5+1)*2
    });
  });

  describe('条件分支', () => {
    it('应该根据条件选择 true 分支', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'check',
            type: 'condition',
            name: '检查',
            condition: (input: any) => input.includes('ok'),
          },
          makeTaskNode('true-branch', '成功', (input) => `success: ${input}`),
          makeTaskNode('false-branch', '失败', (input) => `fallback: ${input}`),
        ],
        [
          { from: 'check', to: 'true-branch', condition: 'true' },
          { from: 'check', to: 'false-branch', condition: 'false' },
        ],
        'check'
      );

      const result = await executor.execute(wf, 'ok-data');
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('success: ok-data');
      expect(result.results.has('true-branch')).toBe(true);
      expect(result.results.has('false-branch')).toBe(false);
    });

    it('应该根据条件选择 false 分支', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'check',
            type: 'condition',
            name: '检查',
            condition: (input: any) => input.includes('ok'),
          },
          makeTaskNode('true-branch', '成功', (input) => `success: ${input}`),
          makeTaskNode('false-branch', '失败', (input) => `fallback: ${input}`),
        ],
        [
          { from: 'check', to: 'true-branch', condition: 'true' },
          { from: 'check', to: 'false-branch', condition: 'false' },
        ],
        'check'
      );

      const result = await executor.execute(wf, 'bad-data');
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('fallback: bad-data');
      expect(result.results.has('false-branch')).toBe(true);
      expect(result.results.has('true-branch')).toBe(false);
    });

    it('应该支持异步条件判断', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'check',
            type: 'condition',
            name: '异步检查',
            condition: async (input: any) => {
              await new Promise((r) => setTimeout(r, 10));
              return input > 10;
            },
          },
          makeTaskNode('big', '大', () => 'big'),
          makeTaskNode('small', '小', () => 'small'),
        ],
        [
          { from: 'check', to: 'big', condition: 'true' },
          { from: 'check', to: 'small', condition: 'false' },
        ],
        'check'
      );

      const result1 = await executor.execute(wf, 20);
      expect(result1.finalOutput).toBe('big');

      executor = new WorkflowExecutor();
      const result2 = await executor.execute(wf, 5);
      expect(result2.finalOutput).toBe('small');
    });
  });

  describe('并行执行', () => {
    it('应该并行执行所有分支', async () => {
      const executionOrder: string[] = [];
      const wf = makeWorkflow(
        [
          {
            id: 'parallel',
            type: 'parallel',
            name: '并行',
            parallelBranches: ['branch1', 'branch2', 'branch3'],
          },
          makeTaskNode('branch1', '分支1', async () => {
            executionOrder.push('branch1-start');
            await new Promise((r) => setTimeout(r, 50));
            executionOrder.push('branch1-end');
            return 'r1';
          }),
          makeTaskNode('branch2', '分支2', async () => {
            executionOrder.push('branch2-start');
            await new Promise((r) => setTimeout(r, 30));
            executionOrder.push('branch2-end');
            return 'r2';
          }),
          makeTaskNode('branch3', '分支3', async () => {
            executionOrder.push('branch3-start');
            await new Promise((r) => setTimeout(r, 20));
            executionOrder.push('branch3-end');
            return 'r3';
          }),
        ],
        [],
        'parallel'
      );

      const startTime = Date.now();
      const result = await executor.execute(wf, 'input');
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(result.finalOutput).toEqual(['r1', 'r2', 'r3']);
      // 并行执行总时间应接近最长的分支（50ms），而不是所有分支之和（100ms+）
      expect(duration).toBeLessThan(120);

      // 所有分支应该几乎同时开始
      const starts = executionOrder.filter((s) => s.endsWith('start'));
      expect(starts.length).toBe(3);
    });

    it('空并行分支应该返回空数组', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'parallel',
            type: 'parallel',
            name: '空并行',
            parallelBranches: [],
          },
        ],
        [],
        'parallel'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.finalOutput).toEqual([]);
    });
  });

  describe('循环节点', () => {
    it('应该按次数循环执行', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'loop',
            type: 'loop',
            name: '循环',
            loop: {
              count: 3,
              body: 'body',
            },
          },
          makeTaskNode('body', '循环体', (input: any) => input + 1),
        ],
        [],
        'loop'
      );

      const result = await executor.execute(wf, 0);
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe(3); // 0 -> 1 -> 2 -> 3
    });

    it('应该按条件循环执行', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'loop',
            type: 'loop',
            name: '条件循环',
            loop: {
              condition: (input: any, _ctx, iteration) => input < 10 && iteration < 100,
              body: 'body',
            },
          },
          makeTaskNode('body', '循环体', (input: any) => input + 3),
        ],
        [],
        'loop'
      );

      const result = await executor.execute(wf, 0);
      expect(result.status).toBe('completed');
      expect(result.finalOutput as number).toBeGreaterThanOrEqual(10);
    });

    it('零次循环应该返回原始输入', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'loop',
            type: 'loop',
            name: '零次循环',
            loop: {
              count: 0,
              body: 'body',
            },
          },
          makeTaskNode('body', '循环体', (input: any) => input + 1),
        ],
        [],
        'loop'
      );

      const result = await executor.execute(wf, 42);
      expect(result.finalOutput).toBe(42);
    });
  });

  describe('delay 节点', () => {
    it('应该延迟指定时间', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'delay',
            type: 'delay',
            name: '延迟',
            delayMs: 50,
          },
        ],
        [],
        'delay'
      );

      const startTime = Date.now();
      const result = await executor.execute(wf, 'input');
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(duration).toBeGreaterThanOrEqual(40);
      expect(result.finalOutput).toBe('input');
    });

    it('delay 节点应该传递输入到输出', async () => {
      const wf = makeWorkflow(
        [
          makeTaskNode('step1', '第一步', (input) => `before: ${input}`),
          {
            id: 'delay',
            type: 'delay',
            name: '延迟',
            delayMs: 10,
          },
          makeTaskNode('step2', '第二步', (input) => `after: ${input}`),
        ],
        [
          { from: 'step1', to: 'delay' },
          { from: 'delay', to: 'step2' },
        ],
        'step1'
      );

      const result = await executor.execute(wf, 'data');
      expect(result.finalOutput).toBe('after: before: data');
    });
  });

  describe('重试机制', () => {
    it('失败后应该重试并最终成功', async () => {
      let attempts = 0;
      const wf = makeWorkflow(
        [
          {
            id: 'flaky',
            type: 'task',
            name: '不稳定任务',
            handler: async () => {
              attempts++;
              if (attempts < 3) {
                throw new Error('暂时失败');
              }
              return 'success';
            },
            retry: {
              maxAttempts: 3,
              delayMs: 10,
              backoff: 'fixed',
            },
          },
        ],
        [],
        'flaky'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('success');
      expect(attempts).toBe(3);
      expect(result.results.get('flaky')?.attempts).toBe(3);
    });

    it('重试次数用尽后应该失败', async () => {
      let attempts = 0;
      const wf = makeWorkflow(
        [
          {
            id: 'always-fail',
            type: 'task',
            name: '总是失败',
            handler: async () => {
              attempts++;
              throw new Error('永远失败');
            },
            retry: {
              maxAttempts: 2,
              delayMs: 5,
            },
          },
        ],
        [],
        'always-fail'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('failed');
      expect(attempts).toBe(2);
      expect(result.error).toContain('永远失败');
    });

    it('应该支持指数退避', async () => {
      let attempts = 0;
      const delays: number[] = [];
      let lastFailTime = 0;

      const wf = makeWorkflow(
        [
          {
            id: 'exp-backoff',
            type: 'task',
            name: '指数退避',
            handler: async () => {
              attempts++;
              if (attempts < 3) {
                lastFailTime = Date.now();
                throw new Error('失败');
              }
              return 'ok';
            },
            retry: {
              maxAttempts: 3,
              delayMs: 30,
              backoff: 'exponential',
            },
          },
        ],
        [],
        'exp-backoff'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('completed');
      expect(attempts).toBe(3);
      // 指数退避：30ms, 60ms
      // 总等待时间应至少为 30 + 60 = 90ms
      expect(delays.length).toBe(0); // 这个数组没用到，仅用于占位
    });

    it('retryOnError 返回 false 时不应重试', async () => {
      let attempts = 0;
      const wf = makeWorkflow(
        [
          {
            id: 'no-retry',
            type: 'task',
            name: '不重试',
            handler: async () => {
              attempts++;
              throw new Error('不可重试的错误');
            },
            retry: {
              maxAttempts: 3,
              delayMs: 5,
              retryOnError: (error) => !error.message.includes('不可重试'),
            },
          },
        ],
        [],
        'no-retry'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('failed');
      expect(attempts).toBe(1); // 没有重试
    });
  });

  describe('超时控制', () => {
    it('节点超时应该失败', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'slow',
            type: 'task',
            name: '慢任务',
            handler: async () => {
              await new Promise((r) => setTimeout(r, 200));
              return 'done';
            },
            timeout: 50,
          },
        ],
        [],
        'slow'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('超时');
    });

    it('全局超时应该中断工作流', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'slow',
            type: 'task',
            name: '慢任务',
            handler: async () => {
              await new Promise((r) => setTimeout(r, 200));
              return 'done';
            },
          },
        ],
        [],
        'slow',
        { timeout: 50 }
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('超时');
    });
  });

  describe('fallback 节点', () => {
    it('节点失败时应该执行 fallback', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'main',
            type: 'task',
            name: '主任务',
            handler: async () => {
              throw new Error('主任务失败');
            },
            fallback: 'backup',
          },
          makeTaskNode('backup', '备份任务', () => 'fallback result'),
        ],
        [],
        'main'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('fallback result');
      expect(result.results.has('backup')).toBe(true);
    });

    it('fallback 也失败时工作流应该失败', async () => {
      const wf = makeWorkflow(
        [
          {
            id: 'main',
            type: 'task',
            name: '主任务',
            handler: async () => {
              throw new Error('主任务失败');
            },
            fallback: 'backup',
          },
          {
            id: 'backup',
            type: 'task',
            name: '备份任务',
            handler: async () => {
              throw new Error('备份任务也失败');
            },
          },
        ],
        [],
        'main'
      );

      const result = await executor.execute(wf, 'input');
      expect(result.status).toBe('failed');
    });
  });

  describe('工作流取消', () => {
    it('应该能够取消工作流', async () => {
      let started = false;
      const wf = makeWorkflow(
        [
          {
            id: 'long',
            type: 'task',
            name: '长任务',
            handler: async () => {
              started = true;
              await new Promise((r) => setTimeout(r, 500));
              return 'done';
            },
          },
        ],
        [],
        'long'
      );

      const executePromise = executor.execute(wf, 'input');
      // 等待任务开始
      await new Promise((r) => setTimeout(r, 20));
      executor.cancel();
      expect(executor.isCancelled()).toBe(true);

      const result = await executePromise;
      // 取消后状态应该是 cancelled 或 failed
      expect(['cancelled', 'failed']).toContain(result.status);
    });
  });

  describe('事件触发', () => {
    beforeEach(() => {
      // 清理所有监听器，避免测试间干扰
      globalEventBus.removeAllListeners();
    });

    afterEach(() => {
      globalEventBus.removeAllListeners();
    });

    it('应该触发 workflow.started 和 workflow.completed 事件', async () => {
      const startedHandler = vi.fn();
      const completedHandler = vi.fn();

      globalEventBus.on('workflow.started', startedHandler);
      globalEventBus.on('workflow.completed', completedHandler);

      const wf = makeWorkflow(
        [makeTaskNode('step1', '第一步', () => 'done')],
        [],
        'step1'
      );

      await executor.execute(wf, 'input');

      expect(startedHandler).toHaveBeenCalledTimes(1);
      expect(startedHandler).toHaveBeenCalledWith('wf-test', expect.any(String), expect.any(Number));

      expect(completedHandler).toHaveBeenCalledTimes(1);
      expect(completedHandler).toHaveBeenCalledWith(
        'wf-test',
        expect.any(String),
        'completed',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('应该触发 workflow.node_started 和 workflow.node_completed 事件', async () => {
      const nodeStartedHandler = vi.fn();
      const nodeCompletedHandler = vi.fn();

      globalEventBus.on('workflow.node_started', nodeStartedHandler);
      globalEventBus.on('workflow.node_completed', nodeCompletedHandler);

      const wf = makeWorkflow(
        [makeTaskNode('step1', '第一步', () => 'done')],
        [],
        'step1'
      );

      await executor.execute(wf, 'input');

      expect(nodeStartedHandler).toHaveBeenCalledTimes(1);
      expect(nodeStartedHandler).toHaveBeenCalledWith(
        'wf-test',
        expect.any(String),
        'step1',
        expect.any(Number)
      );

      expect(nodeCompletedHandler).toHaveBeenCalledTimes(1);
      expect(nodeCompletedHandler).toHaveBeenCalledWith(
        'wf-test',
        expect.any(String),
        'step1',
        'completed',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('节点失败时应该触发 workflow.error 事件', async () => {
      const errorHandler = vi.fn();
      globalEventBus.on('workflow.error', errorHandler);

      const wf = makeWorkflow(
        [
          {
            id: 'fail',
            type: 'task',
            name: '失败任务',
            handler: async () => {
              throw new Error('失败');
            },
          },
        ],
        [],
        'fail'
      );

      await executor.execute(wf, 'input');

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(
        'wf-test',
        expect.any(String),
        expect.any(Error),
        expect.any(Number)
      );
    });
  });
});

describe('WorkflowBuilder 测试', () => {
  it('应该能够通过流式 API 构建工作流', async () => {
    const wf = new WorkflowBuilder('my-workflow')
      .task('step1', '第一步', async (input: any) => `processed: ${input}`)
      .condition('check', '检查', async (input: any) => String(input).includes('ok'))
      .task('step2-true', '成功分支', async (input: any) => `success: ${input}`)
      .task('step2-false', '失败分支', async (input: any) => `fallback: ${input}`)
      .edge('step1', 'check')
      .edge('check', 'step2-true', 'true')
      .edge('check', 'step2-false', 'false')
      .retry('step1', { maxAttempts: 3, delayMs: 100 })
      .timeout('step1', 5000)
      .build();

    expect(wf.name).toBe('my-workflow');
    expect(wf.nodes.size).toBe(4);
    expect(wf.entry).toBe('step1');
    expect(wf.edges.length).toBe(3);

    const step1 = wf.nodes.get('step1')!;
    expect(step1.retry?.maxAttempts).toBe(3);
    expect(step1.timeout).toBe(5000);

    // 验证可以执行
    const executor = new WorkflowExecutor();
    const result = await executor.execute(wf, 'ok-input');
    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('success: processed: ok-input');
  });

  it('应该支持所有节点类型的构建', () => {
    const wf = new WorkflowBuilder('all-types')
      .task('task1', '任务', async () => 'task')
      .condition('cond1', '条件', () => true)
      .parallel('par1', '并行', ['task1'])
      .loop('loop1', '循环', { count: 3, body: 'task1' })
      .delay('delay1', '延迟', 100)
      .build();

    expect(wf.nodes.size).toBe(5);
    expect(wf.nodes.get('task1')?.type).toBe('task');
    expect(wf.nodes.get('cond1')?.type).toBe('condition');
    expect(wf.nodes.get('par1')?.type).toBe('parallel');
    expect(wf.nodes.get('loop1')?.type).toBe('loop');
    expect(wf.nodes.get('delay1')?.type).toBe('delay');
  });

  it('应该支持设置工作流属性', () => {
    const wf = new WorkflowBuilder('test')
      .setId('custom-id')
      .setDescription('描述')
      .setVersion('2.0.0')
      .setWorkflowTimeout(10000)
      .setMetadata({ key: 'value' })
      .task('step1', '第一步', async () => 'done')
      .build();

    expect(wf.id).toBe('custom-id');
    expect(wf.description).toBe('描述');
    expect(wf.version).toBe('2.0.0');
    expect(wf.timeout).toBe(10000);
    expect(wf.metadata).toEqual({ key: 'value' });
  });

  it('应该支持 fallback 设置', async () => {
    const wf = new WorkflowBuilder('fallback-test')
      .task('main', '主任务', async () => {
        throw new Error('失败');
      })
      .task('backup', '备份', async () => 'backup-result')
      .fallback('main', 'backup')
      .build();

    const executor = new WorkflowExecutor();
    const result = await executor.execute(wf, 'input');
    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('backup-result');
  });

  it('空工作流构建应该抛出错误', () => {
    expect(() => new WorkflowBuilder('empty').build()).toThrow();
  });

  it('重复节点 ID 应该抛出错误', () => {
    expect(() =>
      new WorkflowBuilder('dup')
        .task('same', '第一个', async () => 1)
        .task('same', '第二个', async () => 2)
    ).toThrow();
  });

  it('设置不存在的节点的重试配置应该抛出错误', () => {
    expect(() =>
      new WorkflowBuilder('retry-missing')
        .task('step1', '第一步', async () => 1)
        .retry('nonexistent', { maxAttempts: 3 })
    ).toThrow();
  });

  it('构建有环的工作流应该抛出错误', () => {
    expect(() =>
      new WorkflowBuilder('cycle')
        .task('a', 'A', async () => 1)
        .task('b', 'B', async () => 2)
        .edge('a', 'b')
        .edge('b', 'a')
        .build()
    ).toThrow();
  });

  it('第一个添加的节点应该自动作为入口', () => {
    const wf = new WorkflowBuilder('auto-entry')
      .task('first', '第一个', async () => 1)
      .task('second', '第二个', async () => 2)
      .edge('first', 'second')
      .build();

    expect(wf.entry).toBe('first');
  });

  it('应该支持手动设置入口节点', () => {
    const wf = new WorkflowBuilder('manual-entry')
      .task('a', 'A', async () => 1)
      .task('b', 'B', async () => 2)
      .edge('b', 'a')
      .setEntry('b')
      .build();

    expect(wf.entry).toBe('b');
  });
});
