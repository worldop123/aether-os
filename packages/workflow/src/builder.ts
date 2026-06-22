import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  NodeType,
} from './types.js';
import { generateId } from '@aether/shared';
import { DagGraph } from './dag.js';

/**
 * 工作流构建器（流式 API）
 *
 * @example
 * ```typescript
 * const wf = new WorkflowBuilder('my-workflow')
 *   .task('step1', '第一步', async (input) => `processed: ${input}`)
 *   .condition('check', '检查', async (input) => input.includes('ok'))
 *   .task('step2-true', '成功分支', async (input) => `success: ${input}`)
 *   .task('step2-false', '失败分支', async (input) => `fallback: ${input}`)
 *   .edge('step1', 'check')
 *   .edge('check', 'step2-true', 'true')
 *   .edge('check', 'step2-false', 'false')
 *   .retry('step1', { maxAttempts: 3, delayMs: 100 })
 *   .timeout('step1', 5000)
 *   .build();
 * ```
 */
export class WorkflowBuilder {
  private id: string;
  private name: string;
  private description?: string;
  private version: string = '1.0.0';
  private nodes: Map<string, WorkflowNode> = new Map();
  private edges: WorkflowEdge[] = [];
  private entry?: string;
  private workflowTimeout?: number;
  private metadata?: Record<string, unknown>;
  /** 记录节点添加顺序，用于自动设置 entry */
  private nodeOrder: string[] = [];

  constructor(name: string) {
    this.name = name;
    this.id = generateId('wf');
  }

  /**
   * 设置工作流 ID
   */
  setId(id: string): this {
    this.id = id;
    return this;
  }

  /**
   * 设置工作流描述
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * 设置工作流版本
   */
  setVersion(version: string): this {
    this.version = version;
    return this;
  }

  /**
   * 设置全局超时
   */
  setWorkflowTimeout(timeout: number): this {
    this.workflowTimeout = timeout;
    return this;
  }

  /**
   * 设置元数据
   */
  setMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
    return this;
  }

  /**
   * 设置入口节点
   */
  setEntry(nodeId: string): this {
    this.entry = nodeId;
    return this;
  }

  /**
   * 添加 task 节点
   */
  task(
    id: string,
    name: string,
    handler: (input: unknown, context: import('./types.js').WorkflowContext) => Promise<unknown>,
    options?: { description?: string; metadata?: Record<string, unknown> }
  ): this {
    return this.addNode({
      id,
      type: 'task',
      name,
      description: options?.description,
      handler,
      metadata: options?.metadata,
    });
  }

  /**
   * 添加 condition 节点
   */
  condition(
    id: string,
    name: string,
    conditionFn: (input: unknown, context: import('./types.js').WorkflowContext) => Promise<boolean> | boolean,
    options?: { description?: string; metadata?: Record<string, unknown> }
  ): this {
    return this.addNode({
      id,
      type: 'condition',
      name,
      description: options?.description,
      condition: conditionFn,
      metadata: options?.metadata,
    });
  }

  /**
   * 添加 parallel 节点
   */
  parallel(
    id: string,
    name: string,
    branches: string[],
    options?: { description?: string; metadata?: Record<string, unknown> }
  ): this {
    return this.addNode({
      id,
      type: 'parallel',
      name,
      description: options?.description,
      parallelBranches: branches,
      metadata: options?.metadata,
    });
  }

  /**
   * 添加 loop 节点
   */
  loop(
    id: string,
    name: string,
    loopConfig: {
      count?: number;
      condition?: (input: unknown, context: import('./types.js').WorkflowContext, iteration: number) => boolean;
      body: string;
    },
    options?: { description?: string; metadata?: Record<string, unknown> }
  ): this {
    return this.addNode({
      id,
      type: 'loop',
      name,
      description: options?.description,
      loop: loopConfig,
      metadata: options?.metadata,
    });
  }

  /**
   * 添加 delay 节点
   */
  delay(
    id: string,
    name: string,
    delayMs: number,
    options?: { description?: string; metadata?: Record<string, unknown> }
  ): this {
    return this.addNode({
      id,
      type: 'delay',
      name,
      description: options?.description,
      delayMs,
      metadata: options?.metadata,
    });
  }

  /**
   * 添加通用节点
   */
  addNode(node: WorkflowNode): this {
    if (this.nodes.has(node.id)) {
      throw new Error(`节点 ID ${node.id} 已存在`);
    }
    this.nodes.set(node.id, node);
    this.nodeOrder.push(node.id);
    // 第一个添加的节点作为默认入口
    if (!this.entry) {
      this.entry = node.id;
    }
    return this;
  }

  /**
   * 添加边
   */
  edge(from: string, to: string, condition?: 'true' | 'false'): this {
    this.edges.push({ from, to, condition });
    return this;
  }

  /**
   * 设置节点的重试配置
   */
  retry(
    nodeId: string,
    retry: {
      maxAttempts: number;
      delayMs?: number;
      backoff?: 'fixed' | 'exponential';
      retryOnError?: (error: Error) => boolean;
    }
  ): this {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`节点 ${nodeId} 不存在`);
    }
    node.retry = retry;
    return this;
  }

  /**
   * 设置节点的超时
   */
  timeout(nodeId: string, timeoutMs: number): this {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`节点 ${nodeId} 不存在`);
    }
    node.timeout = timeoutMs;
    return this;
  }

  /**
   * 设置节点的 fallback
   */
  fallback(nodeId: string, fallbackNodeId: string): this {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`节点 ${nodeId} 不存在`);
    }
    node.fallback = fallbackNodeId;
    return this;
  }

  /**
   * 获取节点
   */
  getNode(nodeId: string): WorkflowNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * 构建工作流定义
   */
  build(): WorkflowDefinition {
    if (this.nodes.size === 0) {
      throw new Error('工作流中没有任何节点');
    }
    if (!this.entry) {
      throw new Error('工作流没有入口节点');
    }
    if (!this.nodes.has(this.entry)) {
      throw new Error(`入口节点 ${this.entry} 不存在`);
    }

    // 验证 DAG
    const dag = new DagGraph();
    for (const node of this.nodes.values()) {
      dag.addNode(node);
    }
    for (const edge of this.edges) {
      dag.addEdge(edge);
    }
    const validation = dag.validate();
    if (!validation.valid) {
      throw new Error(`工作流 DAG 验证失败: ${validation.errors.join('; ')}`);
    }

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      nodes: new Map(this.nodes),
      edges: [...this.edges],
      entry: this.entry,
      timeout: this.workflowTimeout,
      metadata: this.metadata,
    };
  }
}
