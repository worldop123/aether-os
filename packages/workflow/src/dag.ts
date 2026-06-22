import type { WorkflowEdge, WorkflowNode } from './types.js';

/**
 * DAG 图结构
 * 用于管理工作流节点和边的依赖关系
 */
export class DagGraph {
  /** 节点表：nodeId -> WorkflowNode */
  private nodeMap: Map<string, WorkflowNode> = new Map();
  /** 边列表 */
  private edgeList: WorkflowEdge[] = [];
  /** 邻接表：from -> edges[] */
  private outEdges: Map<string, WorkflowEdge[]> = new Map();
  /** 逆邻接表：to -> edges[] */
  private inEdges: Map<string, WorkflowEdge[]> = new Map();

  /**
   * 添加节点
   */
  addNode(node: WorkflowNode): this {
    this.nodeMap.set(node.id, node);
    if (!this.outEdges.has(node.id)) {
      this.outEdges.set(node.id, []);
    }
    if (!this.inEdges.has(node.id)) {
      this.inEdges.set(node.id, []);
    }
    return this;
  }

  /**
   * 添加边
   */
  addEdge(edge: WorkflowEdge): this {
    // 确保端点存在于邻接表中（即使节点尚未添加，也保留边结构）
    if (!this.outEdges.has(edge.from)) {
      this.outEdges.set(edge.from, []);
    }
    if (!this.inEdges.has(edge.to)) {
      this.inEdges.set(edge.to, []);
    }
    this.edgeList.push(edge);
    this.outEdges.get(edge.from)!.push(edge);
    this.inEdges.get(edge.to)!.push(edge);
    return this;
  }

  /**
   * 获取节点
   */
  getNode(nodeId: string): WorkflowNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  /**
   * 获取所有节点
   */
  getNodes(): WorkflowNode[] {
    return Array.from(this.nodeMap.values());
  }

  /**
   * 获取所有边
   */
  getEdges(): WorkflowEdge[] {
    return [...this.edgeList];
  }

  /**
   * 节点数量
   */
  nodeCount(): number {
    return this.nodeMap.size;
  }

  /**
   * 边数量
   */
  edgeCount(): number {
    return this.edgeList.length;
  }

  /**
   * 获取指定节点的依赖（前驱节点）
   */
  getDependencies(nodeId: string): string[] {
    const edges = this.inEdges.get(nodeId) || [];
    const deps = new Set<string>();
    for (const e of edges) {
      deps.add(e.from);
    }
    return Array.from(deps);
  }

  /**
   * 获取指定节点的后续节点
   */
  getDependents(nodeId: string): string[] {
    const edges = this.outEdges.get(nodeId) || [];
    const deps = new Set<string>();
    for (const e of edges) {
      deps.add(e.to);
    }
    return Array.from(deps);
  }

  /**
   * 获取下一节点（支持条件分支）
   * @param nodeId 当前节点
   * @param condition 条件结果（'true' 或 'false'），用于选择 condition 节点的分支
   */
  getNextNodes(nodeId: string, condition?: 'true' | 'false'): string[] {
    const edges = this.outEdges.get(nodeId) || [];
    const result: string[] = [];
    for (const e of edges) {
      if (e.condition === undefined) {
        // 无条件边，总是包含
        result.push(e.to);
      } else if (condition !== undefined && e.condition === condition) {
        // 条件边，匹配条件时包含
        result.push(e.to);
      }
    }
    return result;
  }

  /**
   * 拓扑排序（Kahn 算法）
   * @returns 拓扑排序结果，若存在环则返回 null
   */
  topologicalSort(): string[] | null {
    // 计算每个节点的入度（仅考虑无条件边，因为条件边在运行时才决定）
    const inDegree = new Map<string, number>();
    for (const id of this.nodeMap.keys()) {
      inDegree.set(id, 0);
    }
    for (const edge of this.edgeList) {
      if (edge.condition !== undefined) continue; // 跳过条件边
      if (!inDegree.has(edge.to)) inDegree.set(edge.to, 0);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    // 入度为 0 的节点入队
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(id);
      const outE = this.outEdges.get(id) || [];
      for (const e of outE) {
        if (e.condition !== undefined) continue;
        const newDeg = (inDegree.get(e.to) || 0) - 1;
        inDegree.set(e.to, newDeg);
        if (newDeg === 0) queue.push(e.to);
      }
    }

    // 如果排序后节点数少于图中节点数，说明存在环
    if (sorted.length < this.nodeMap.size) {
      return null;
    }
    return sorted;
  }

  /**
   * 检测环
   * @returns 环中的节点 ID 列表，若无环则返回 null
   */
  detectCycle(): string[] | null {
    // DFS 三色标记法
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.nodeMap.keys()) {
      color.set(id, WHITE);
    }
    const parent = new Map<string, string | null>();
    let cycleEntry: string | null = null;

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const outE = this.outEdges.get(nodeId) || [];
      for (const e of outE) {
        if (e.condition !== undefined) continue; // 条件边不参与环检测
        if (!this.nodeMap.has(e.to)) continue;
        const c = color.get(e.to);
        if (c === GRAY) {
          // 找到环
          parent.set(e.to, nodeId);
          cycleEntry = e.to;
          return true;
        }
        if (c === WHITE) {
          parent.set(e.to, nodeId);
          if (dfs(e.to)) return true;
        }
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const id of this.nodeMap.keys()) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) {
          // 重建环
          const cycle: string[] = [];
          let cur: string | null = cycleEntry;
          const seen = new Set<string>();
          while (cur && !seen.has(cur)) {
            seen.add(cur);
            cycle.push(cur);
            cur = parent.get(cur) ?? null;
          }
          return cycle.reverse();
        }
      }
    }
    return null;
  }

  /**
   * 验证 DAG 有效性
   * @returns 验证结果，包含是否有效和错误信息
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. 检查是否有节点
    if (this.nodeMap.size === 0) {
      errors.push('DAG 中没有节点');
      return { valid: false, errors };
    }

    // 2. 检查环
    const cycle = this.detectCycle();
    if (cycle) {
      errors.push(`DAG 中存在环: ${cycle.join(' -> ')}`);
    }

    // 3. 检查所有边的端点是否都存在于节点表中
    for (const edge of this.edgeList) {
      if (!this.nodeMap.has(edge.from)) {
        errors.push(`边的起点 ${edge.from} 不存在于节点表中`);
      }
      if (!this.nodeMap.has(edge.to)) {
        errors.push(`边的终点 ${edge.to} 不存在于节点表中`);
      }
    }

    // 4. 检查每个节点是否可达（从入度为 0 的节点出发）
    // 找到所有入度为 0 的节点作为起点
    const roots: string[] = [];
    for (const id of this.nodeMap.keys()) {
      const inE = this.inEdges.get(id) || [];
      // 入度为 0 意味着没有任何边指向它
      if (inE.length === 0) roots.push(id);
    }
    if (roots.length === 0) {
      errors.push('DAG 中没有入口节点（所有节点都有入边）');
    }

    // BFS 检查可达性
    const reachable = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const outE = this.outEdges.get(id) || [];
      for (const e of outE) {
        if (this.nodeMap.has(e.to) && !reachable.has(e.to)) {
          queue.push(e.to);
        }
      }
    }
    for (const id of this.nodeMap.keys()) {
      if (!reachable.has(id)) {
        errors.push(`节点 ${id} 不可达`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
