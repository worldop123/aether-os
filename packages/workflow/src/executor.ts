import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowNode,
  NodeExecutionResult,
  NodeStatus,
} from './types.js';
import type { DagGraph } from './dag.js';
import { generateId, now, globalEventBus, withTimeout, sleep } from '@aether/shared';

/**
 * 工作流执行器
 * 负责按 DAG 拓扑顺序执行工作流节点
 */
export class WorkflowExecutor {
  /** 当前执行是否已取消 */
  private cancelled: boolean = false;
  /** 当前执行 ID */
  private currentExecutionId: string | null = null;
  /** 当前工作流 ID */
  private currentWorkflowId: string | null = null;

  /**
   * 执行工作流
   * @param workflow 工作流定义
   * @param input 输入数据
   * @param dag 可选的 DAG 图（如果未提供，会从工作流定义构建）
   */
  async execute(
    workflow: WorkflowDefinition,
    input: unknown,
    dag?: DagGraph
  ): Promise<WorkflowExecutionResult> {
    const executionId = generateId('wfexec');
    this.currentExecutionId = executionId;
    this.currentWorkflowId = workflow.id;
    this.cancelled = false;

    const startTime = now();
    const context: WorkflowContext = {
      workflowId: workflow.id,
      executionId,
      variables: {},
      startTime,
    };

    // 触发 workflow.started 事件
    globalEventBus.emit('workflow.started', workflow.id, executionId, startTime);

    const results = new Map<string, NodeExecutionResult>();
    let finalOutput: unknown = input;
    let finalStatus: NodeStatus = 'completed';
    let errorMessage: string | undefined;

    try {
      // 全局超时控制
      const globalTimeout = workflow.timeout;
      const executePromise = this.executeFromNode(
        workflow,
        workflow.entry,
        input,
        context,
        results,
        dag
      );

      if (globalTimeout) {
        finalOutput = await withTimeout(executePromise, globalTimeout, '工作流执行超时');
      } else {
        finalOutput = await executePromise;
      }
    } catch (error) {
      finalStatus = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      const ts = now();
      globalEventBus.emit('workflow.error', workflow.id, executionId, error as Error, ts);
    } finally {
      const endTime = now();
      const duration = endTime - startTime;

      // 触发 workflow.completed 事件
      globalEventBus.emit('workflow.completed', workflow.id, executionId, finalStatus, duration, endTime);

      // 如果被取消，状态设为 cancelled
      if (this.cancelled && finalStatus === 'completed') {
        finalStatus = 'cancelled';
      }

      return {
        executionId,
        workflowId: workflow.id,
        status: finalStatus,
        results,
        startTime,
        endTime,
        duration,
        finalOutput,
        error: errorMessage,
      };
    }
  }

  /**
   * 从指定节点开始执行
   */
  private async executeFromNode(
    workflow: WorkflowDefinition,
    nodeId: string,
    input: unknown,
    context: WorkflowContext,
    results: Map<string, NodeExecutionResult>,
    dag?: DagGraph
  ): Promise<unknown> {
    if (this.cancelled) {
      return input;
    }

    const node = workflow.nodes.get(nodeId);
    if (!node) {
      throw new Error(`节点 ${nodeId} 不存在`);
    }

    // 如果已经执行过（例如循环），跳过
    // 注意：循环场景下需要允许重新执行，这里通过外部控制是否调用

    const result = await this.executeNode(workflow, node, input, context, results, dag);
    results.set(nodeId, result);

    if (result.status === 'failed') {
      throw new Error(`节点 ${node.name}(${nodeId}) 执行失败: ${result.error}`);
    }

    if (result.status === 'skipped' || result.status === 'cancelled') {
      return result.output;
    }

    const output = result.output;

    // 根据节点类型决定下一步
    if (node.type === 'condition') {
      // 条件节点：根据结果选择 true/false 分支
      const branch = output === true ? 'true' : 'false';
      const nextNodes = dag ? dag.getNextNodes(nodeId, branch) : this.getNextNodesFromWorkflow(workflow, nodeId, branch);
      if (nextNodes.length === 0) {
        return output;
      }
      // 条件分支只走一个分支，传递原始输入（而非布尔结果）给分支
      return this.executeFromNode(workflow, nextNodes[0], input, context, results, dag);
    }

    if (node.type === 'parallel') {
      // 并行节点：output 已经是各分支结果数组
      // 并行节点之后，按普通节点继续执行
      const nextNodes = dag ? dag.getNextNodes(nodeId) : this.getNextNodesFromWorkflow(workflow, nodeId);
      if (nextNodes.length === 0) {
        return output;
      }
      // 并行节点后通常只有一个汇聚节点
      return this.executeFromNode(workflow, nextNodes[0], output, context, results, dag);
    }

    if (node.type === 'loop') {
      // 循环节点：output 是循环结束后 body 节点的最后输出
      const nextNodes = dag ? dag.getNextNodes(nodeId) : this.getNextNodesFromWorkflow(workflow, nodeId);
      if (nextNodes.length === 0) {
        return output;
      }
      return this.executeFromNode(workflow, nextNodes[0], output, context, results, dag);
    }

    // task / delay 节点：继续后续节点
    const nextNodes = dag ? dag.getNextNodes(nodeId) : this.getNextNodesFromWorkflow(workflow, nodeId);
    if (nextNodes.length === 0) {
      return output;
    }

    // 如果有多个后续节点，并行执行
    if (nextNodes.length > 1) {
      const outputs = await Promise.all(
        nextNodes.map((nextId) =>
          this.executeFromNode(workflow, nextId, output, context, results, dag)
        )
      );
      return outputs;
    }

    return this.executeFromNode(workflow, nextNodes[0], output, context, results, dag);
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: WorkflowContext,
    results: Map<string, NodeExecutionResult>,
    dag?: DagGraph
  ): Promise<NodeExecutionResult> {
    const startedAt = now();
    globalEventBus.emit('workflow.node_started', workflow.id, context.executionId, node.id, startedAt);

    // 检查取消
    if (this.cancelled) {
      const completedAt = now();
      const result: NodeExecutionResult = {
        nodeId: node.id,
        status: 'cancelled',
        input,
        startedAt,
        completedAt,
        duration: completedAt - startedAt,
        attempts: 0,
      };
      globalEventBus.emit('workflow.node_completed', workflow.id, context.executionId, node.id, 'cancelled', 0, completedAt);
      return result;
    }

    let attempts = 0;
    let lastError: Error | undefined;
    const maxAttempts = node.retry?.maxAttempts ?? 1;

    while (attempts < maxAttempts) {
      if (this.cancelled) break;
      attempts++;

      try {
        let output: unknown;

        if (node.type === 'task') {
          if (!node.handler) {
            throw new Error(`任务节点 ${node.name} 没有定义 handler`);
          }
          output = await this.runWithTimeout(node.handler(input, context), node.timeout);
        } else if (node.type === 'condition') {
          if (!node.condition) {
            throw new Error(`条件节点 ${node.name} 没有定义 condition`);
          }
          output = await this.runWithTimeout(Promise.resolve(node.condition(input, context)), node.timeout);
        } else if (node.type === 'delay') {
          const delayMs = node.delayMs ?? 0;
          await sleep(delayMs);
          output = input;
        } else if (node.type === 'parallel') {
          const branches = node.parallelBranches || [];
          if (branches.length === 0) {
            output = [];
          } else {
            const branchResults = await Promise.all(
              branches.map((branchId) => {
                const branchNode = workflow.nodes.get(branchId);
                if (!branchNode) {
                  throw new Error(`并行分支节点 ${branchId} 不存在`);
                }
                return this.executeNode(workflow, branchNode, input, context, results, dag);
              })
            );
            output = branchResults.map((r) => r.output);
          }
        } else if (node.type === 'loop') {
          output = await this.executeLoop(workflow, node, input, context, results, dag);
        } else {
          throw new Error(`未知的节点类型: ${(node as WorkflowNode).type}`);
        }

        const completedAt = now();
        const result: NodeExecutionResult = {
          nodeId: node.id,
          status: 'completed',
          input,
          output,
          startedAt,
          completedAt,
          duration: completedAt - startedAt,
          attempts,
        };
        globalEventBus.emit('workflow.node_completed', workflow.id, context.executionId, node.id, 'completed', result.duration!, completedAt);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否应该重试
        if (attempts < maxAttempts) {
          const shouldRetry = node.retry?.retryOnError ? node.retry.retryOnError(lastError) : true;
          if (!shouldRetry) break;

          // 等待重试延迟
          if (node.retry?.delayMs) {
            const delay = node.retry.delayMs;
            const backoff = node.retry.backoff ?? 'fixed';
            const actualDelay = backoff === 'exponential' ? delay * Math.pow(2, attempts - 1) : delay;
            await sleep(actualDelay);
          }
          continue;
        }
        // 重试次数用尽
        break;
      }
    }

    // 执行失败，尝试 fallback
    if (node.fallback) {
      const fallbackNode = workflow.nodes.get(node.fallback);
      if (fallbackNode) {
        try {
          const fallbackResult = await this.executeNode(workflow, fallbackNode, input, context, results, dag);
          // 存储 fallback 节点的结果
          results.set(fallbackNode.id, fallbackResult);
          // fallback 成功则用 fallback 的结果
          if (fallbackResult.status === 'completed') {
            return fallbackResult;
          }
        } catch {
          // fallback 也失败，继续抛出原错误
        }
      }
    }

    const completedAt = now();
    const result: NodeExecutionResult = {
      nodeId: node.id,
      status: 'failed',
      input,
      error: lastError?.message,
      startedAt,
      completedAt,
      duration: completedAt - startedAt,
      attempts,
    };
    globalEventBus.emit('workflow.node_completed', workflow.id, context.executionId, node.id, 'failed', result.duration!, completedAt);
    return result;
  }

  /**
   * 执行循环节点
   */
  private async executeLoop(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: WorkflowContext,
    results: Map<string, NodeExecutionResult>,
    dag?: DagGraph
  ): Promise<unknown> {
    if (!node.loop) {
      throw new Error(`循环节点 ${node.name} 没有定义 loop 配置`);
    }

    const { count, condition, body } = node.loop;
    let currentInput = input;
    let iteration = 0;

    const maxIterations = count ?? Number.MAX_SAFE_INTEGER;

    while (iteration < maxIterations) {
      if (this.cancelled) break;

      // 检查条件（如果定义了 condition）
      if (condition && !condition(currentInput, context, iteration)) {
        break;
      }

      // 执行循环体
      const bodyNode = workflow.nodes.get(body);
      if (!bodyNode) {
        throw new Error(`循环体节点 ${body} 不存在`);
      }

      // 循环体每次执行使用唯一 key 存储结果（避免覆盖）
      const bodyResult = await this.executeNode(workflow, bodyNode, currentInput, context, results, dag);
      results.set(`${body}#${iteration}`, bodyResult);

      if (bodyResult.status === 'failed') {
        throw new Error(`循环体节点 ${bodyNode.name} 执行失败: ${bodyResult.error}`);
      }

      currentInput = bodyResult.output;
      iteration++;
    }

    return currentInput;
  }

  /**
   * 带超时执行
   */
  private async runWithTimeout<T>(promise: Promise<T>, timeout?: number): Promise<T> {
    if (!timeout) return promise;
    return withTimeout(promise, timeout, `节点执行超时（${timeout}ms）`);
  }

  /**
   * 从工作流定义中获取下一节点（不依赖 DagGraph）
   */
  private getNextNodesFromWorkflow(
    workflow: WorkflowDefinition,
    nodeId: string,
    condition?: 'true' | 'false'
  ): string[] {
    const result: string[] = [];
    for (const edge of workflow.edges) {
      if (edge.from !== nodeId) continue;
      if (edge.condition === undefined) {
        result.push(edge.to);
      } else if (condition !== undefined && edge.condition === condition) {
        result.push(edge.to);
      }
    }
    return result;
  }

  /**
   * 取消当前执行
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * 检查是否已取消
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * 获取当前执行 ID
   */
  getCurrentExecutionId(): string | null {
    return this.currentExecutionId;
  }

  /**
   * 获取当前工作流 ID
   */
  getCurrentWorkflowId(): string | null {
    return this.currentWorkflowId;
  }
}
