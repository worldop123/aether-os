import type { ID, Timestamp, Metadata } from '@aether/shared';
import type { AgentStatus, AgentConfig } from '@aether/core';
import { generateId, now, globalEventBus } from '@aether/shared';
import { SchedulerError, NotFoundError } from '@aether/shared';

/**
 * 任务类型
 */
export type TaskType =
  | 'agent_message' // 发送消息给 Agent
  | 'agent_start' // 启动 Agent
  | 'agent_stop' // 停止 Agent
  | 'memory_consolidate' // 记忆巩固
  | 'budget_reset' // 预算重置
  | 'custom'; // 自定义任务

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 等待执行 */
  PENDING = 'pending',
  /** 执行中 */
  RUNNING = 'running',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 已失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
}

/**
 * 定时任务实现类
 */
export class ScheduledTask implements IScheduledTask {
  readonly id: ID;
  readonly agentId: ID;
  readonly name: string;
  readonly description?: string;
  readonly taskType: TaskType;
  readonly cron: string;
  readonly payload: Record<string, unknown>;
  private _enabled: boolean;
  private _status: TaskStatus;
  readonly createdAt: Timestamp;
  private _lastRunAt?: Timestamp;
  private _nextRunAt?: Timestamp;
  private _runCount: number;
  readonly maxRuns?: number;
  readonly metadata?: Metadata;

  constructor(options: CreateScheduledTaskOptions) {
    this.id = generateId('task');
    this.agentId = options.agentId;
    this.name = options.name;
    this.description = options.description;
    this.taskType = options.taskType;
    this.cron = options.cron;
    this.payload = options.payload;
    this._enabled = options.enabled ?? true;
    this._status = TaskStatus.PENDING;
    this.createdAt = now();
    this._runCount = 0;
    this.maxRuns = options.maxRuns;
    this.metadata = options.metadata;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get status(): TaskStatus {
    return this._status;
  }

  get lastRunAt(): Timestamp | undefined {
    return this._lastRunAt;
  }

  get nextRunAt(): Timestamp | undefined {
    return this._nextRunAt;
  }

  get runCount(): number {
    return this._runCount;
  }

  /**
   * 设置启用状态
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * 设置状态
   */
  setStatus(status: TaskStatus): void {
    this._status = status;
  }

  /**
   * 记录执行
   */
  recordExecution(): void {
    this._lastRunAt = now();
    this._runCount++;
  }

  /**
   * 设置下次执行时间
   */
  setNextRunAt(time: Timestamp): void {
    this._nextRunAt = time;
  }

  /**
   * 更新任务信息
   */
  update(updates: Partial<Omit<CreateScheduledTaskOptions, 'agentId' | 'taskType'>>): void {
    if (updates.name !== undefined) {
      (this as any).name = updates.name;
    }
    if (updates.description !== undefined) {
      (this as any).description = updates.description;
    }
    if (updates.cron !== undefined) {
      (this as any).cron = updates.cron;
    }
    if (updates.payload !== undefined) {
      (this as any).payload = updates.payload;
    }
    if (updates.enabled !== undefined) {
      this._enabled = updates.enabled;
    }
    if (updates.maxRuns !== undefined) {
      (this as any).maxRuns = updates.maxRuns;
    }
    if (updates.metadata !== undefined) {
      (this as any).metadata = updates.metadata;
    }
  }
}

/**
 * 定时任务接口
 */
export interface IScheduledTask {
  /** 任务 ID */
  readonly id: ID;
  /** 所属 Agent ID */
  readonly agentId: ID;
  /** 任务名称 */
  readonly name: string;
  /** 任务描述 */
  readonly description?: string;
  /** 任务类型 */
  readonly taskType: TaskType;
  /** Cron 表达式 */
  readonly cron: string;
  /** 任务载荷 */
  readonly payload: Record<string, unknown>;
  /** 是否启用 */
  readonly enabled: boolean;
  /** 任务状态 */
  readonly status: TaskStatus;
  /** 创建时间 */
  readonly createdAt: Timestamp;
  /** 最后执行时间 */
  readonly lastRunAt?: Timestamp;
  /** 下次执行时间 */
  readonly nextRunAt?: Timestamp;
  /** 执行次数 */
  readonly runCount: number;
  /** 最大执行次数（可选，0 表示无限） */
  readonly maxRuns?: number;
  /** 元数据 */
  readonly metadata?: Metadata;
}

/**
 * 创建定时任务的参数
 */
export interface CreateScheduledTaskOptions {
  /** 所属 Agent ID */
  agentId: ID;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 任务类型 */
  taskType: TaskType;
  /** Cron 表达式 */
  cron: string;
  /** 任务载荷 */
  payload: Record<string, unknown>;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 最大执行次数 */
  maxRuns?: number;
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  /** 任务 ID */
  taskId: ID;
  /** 是否成功 */
  success: boolean;
  /** 执行开始时间 */
  startedAt: Timestamp;
  /** 执行结束时间 */
  endedAt: Timestamp;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 结果数据 */
  result?: unknown;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 简单的 Cron 解析器（MVP 简化版）
 * 只支持基本的分钟级调度
 */
function parseCron(cron: string): { minute: number; hour: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const minute = parts[0];
  const hour = parts[1];

  // 简化：只支持数字和 *
  const minuteVal = minute === '*' ? -1 : parseInt(minute, 10);
  const hourVal = hour === '*' ? -1 : parseInt(hour, 10);

  if (isNaN(minuteVal) || isNaN(hourVal)) return null;

  return { minute: minuteVal, hour: hourVal };
}

/**
 * 计算下次执行时间（简化版）
 */
function calculateNextRun(cron: string, from: Timestamp): Timestamp | null {
  const parsed = parseCron(cron);
  if (!parsed) return null;

  const date = new Date(from);
  date.setSeconds(0, 0);

  // 简化实现：每分钟检查一次，如果匹配就执行
  // 对于 MVP 来说，我们用更简单的方式：如果是 * * * * * 就每分钟执行
  // 如果是具体时间，就计算到下一次匹配的时间

  if (parsed.minute === -1 && parsed.hour === -1) {
    // 每分钟执行
    date.setMinutes(date.getMinutes() + 1);
    return date.getTime();
  }

  if (parsed.minute !== -1 && parsed.hour === -1) {
    // 每小时的第 N 分钟执行
    const targetMinute = parsed.minute;
    if (date.getMinutes() < targetMinute) {
      date.setMinutes(targetMinute);
    } else {
      date.setHours(date.getHours() + 1);
      date.setMinutes(targetMinute);
    }
    return date.getTime();
  }

  if (parsed.minute !== -1 && parsed.hour !== -1) {
    // 每天的指定时间执行
    const targetHour = parsed.hour;
    const targetMinute = parsed.minute;

    if (
      date.getHours() < targetHour ||
      (date.getHours() === targetHour && date.getMinutes() < targetMinute)
    ) {
      date.setHours(targetHour, targetMinute);
    } else {
      date.setDate(date.getDate() + 1);
      date.setHours(targetHour, targetMinute);
    }
    return date.getTime();
  }

  return null;
}

/**
 * 任务调度器实现类
 * 基于 setTimeout 的简单调度
 */
export class TaskScheduler implements ITaskScheduler {
  private tasks: Map<ID, ScheduledTask> = new Map();
  private timers: Map<ID, NodeJS.Timeout> = new Map();
  private executionHistory: Map<ID, TaskExecutionResult[]> = new Map();
  private _running: boolean = false;
  private taskHandlers: Map<TaskType, (task: IScheduledTask) => Promise<unknown>> = new Map();

  constructor() {
    // 注册默认的自定义任务处理器
    this.registerTaskHandler('custom', async (task) => {
      return { type: 'custom', payload: task.payload };
    });
  }

  /**
   * 注册任务处理器
   */
  registerTaskHandler(
    taskType: TaskType,
    handler: (task: IScheduledTask) => Promise<unknown>
  ): void {
    this.taskHandlers.set(taskType, handler);
  }

  /**
   * 创建定时任务
   */
  async schedule(options: CreateScheduledTaskOptions): Promise<IScheduledTask> {
    const task = new ScheduledTask(options);
    this.tasks.set(task.id, task);
    this.executionHistory.set(task.id, []);

    // 计算下次执行时间
    const nextRun = calculateNextRun(task.cron, now());
    if (nextRun) {
      task.setNextRunAt(nextRun);
    }

    // 如果调度器正在运行且任务已启用，设置定时器
    if (this._running && task.enabled) {
      this.scheduleTask(task);
    }

    globalEventBus.emit('scheduler.task_created', task.id, task.agentId, now());

    return task;
  }

  /**
   * 设置任务的定时器
   */
  private scheduleTask(task: ScheduledTask): void {
    if (!task.enabled || !task.nextRunAt) return;

    // 清除旧的定时器
    const oldTimer = this.timers.get(task.id);
    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    const delay = task.nextRunAt - now();
    if (delay <= 0) {
      // 已经过了执行时间，立即执行
      this.executeTask(task);
      return;
    }

    const timer = setTimeout(() => {
      this.executeTask(task);
    }, delay);

    this.timers.set(task.id, timer);
  }

  /**
   * 执行任务
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    if (!task.enabled) return;

    // 检查是否达到最大执行次数
    if (task.maxRuns && task.runCount >= task.maxRuns) {
      task.setEnabled(false);
      return;
    }

    task.setStatus(TaskStatus.RUNNING);
    const startedAt = now();

    try {
      const handler = this.taskHandlers.get(task.taskType);
      const result = handler ? await handler(task) : undefined;

      const endedAt = now();
      const duration = endedAt - startedAt;

      task.recordExecution();
      task.setStatus(TaskStatus.COMPLETED);

      // 记录执行历史
      const history = this.executionHistory.get(task.id) || [];
      history.push({
        taskId: task.id,
        success: true,
        startedAt,
        endedAt,
        duration,
        result,
      });
      this.executionHistory.set(task.id, history);

      globalEventBus.emit('scheduler.task_executed', task.id, task.agentId, now());

      // 计算下次执行时间
      const nextRun = calculateNextRun(task.cron, now());
      if (nextRun) {
        task.setNextRunAt(nextRun);
        // 继续调度
        if (this._running && task.enabled) {
          this.scheduleTask(task);
        }
      }
    } catch (error) {
      const endedAt = now();
      const duration = endedAt - startedAt;

      task.setStatus(TaskStatus.FAILED);

      // 记录执行历史
      const history = this.executionHistory.get(task.id) || [];
      history.push({
        taskId: task.id,
        success: false,
        startedAt,
        endedAt,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      this.executionHistory.set(task.id, history);

      globalEventBus.emit('scheduler.task_error', task.id, task.agentId, error as Error, now());

      // 计算下次执行时间
      const nextRun = calculateNextRun(task.cron, now());
      if (nextRun) {
        task.setNextRunAt(nextRun);
        // 继续调度
        if (this._running && task.enabled) {
          this.scheduleTask(task);
        }
      }
    }
  }

  /**
   * 取消定时任务
   */
  async cancel(taskId: ID): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 清除定时器
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    task.setStatus(TaskStatus.CANCELLED);
    task.setEnabled(false);

    globalEventBus.emit('scheduler.task_cancelled', taskId, task.agentId, now());

    return true;
  }

  /**
   * 立即执行任务
   */
  async executeNow(taskId: ID): Promise<TaskExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`任务 ${taskId} 不存在`);
    }

    const startedAt = now();

    try {
      const handler = this.taskHandlers.get(task.taskType);
      const result = handler ? await handler(task) : undefined;

      const endedAt = now();
      const duration = endedAt - startedAt;

      task.recordExecution();

      const executionResult: TaskExecutionResult = {
        taskId,
        success: true,
        startedAt,
        endedAt,
        duration,
        result,
      };

      // 记录执行历史
      const history = this.executionHistory.get(taskId) || [];
      history.push(executionResult);
      this.executionHistory.set(taskId, history);

      return executionResult;
    } catch (error) {
      const endedAt = now();
      const duration = endedAt - startedAt;

      return {
        taskId,
        success: false,
        startedAt,
        endedAt,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取指定任务
   */
  async getTask(taskId: ID): Promise<IScheduledTask | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 列出任务
   */
  async listTasks(options?: {
    agentId?: ID;
    status?: TaskStatus;
    taskType?: TaskType;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: IScheduledTask[];
    total: number;
  }> {
    let items = Array.from(this.tasks.values());

    if (options?.agentId) {
      items = items.filter((t) => t.agentId === options.agentId);
    }
    if (options?.status) {
      items = items.filter((t) => t.status === options.status);
    }
    if (options?.taskType) {
      items = items.filter((t) => t.taskType === options.taskType);
    }
    if (options?.enabled !== undefined) {
      items = items.filter((t) => t.enabled === options.enabled);
    }

    const total = items.length;

    // 分页
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    items = items.slice(start, end);

    return { items, total };
  }

  /**
   * 启用任务
   */
  async enableTask(taskId: ID): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.setEnabled(true);

    if (this._running) {
      const nextRun = calculateNextRun(task.cron, now());
      if (nextRun) {
        task.setNextRunAt(nextRun);
        this.scheduleTask(task);
      }
    }

    return true;
  }

  /**
   * 禁用任务
   */
  async disableTask(taskId: ID): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.setEnabled(false);

    // 清除定时器
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    return true;
  }

  /**
   * 更新任务
   */
  async updateTask(
    taskId: ID,
    updates: Partial<Omit<CreateScheduledTaskOptions, 'agentId' | 'taskType'>>
  ): Promise<IScheduledTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`任务 ${taskId} 不存在`);
    }

    task.update(updates);

    // 如果 cron 变了，重新计算下次执行时间
    if (updates.cron !== undefined && this._running && task.enabled) {
      const nextRun = calculateNextRun(task.cron, now());
      if (nextRun) {
        task.setNextRunAt(nextRun);
        this.scheduleTask(task);
      }
    }

    return task;
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this._running) return;

    this._running = true;

    // 为所有已启用的任务设置定时器
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        const nextRun = calculateNextRun(task.cron, now());
        if (nextRun) {
          task.setNextRunAt(nextRun);
          this.scheduleTask(task);
        }
      }
    }
  }

  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    this._running = false;

    // 清除所有定时器
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * 检查调度器是否在运行
   */
  isRunning(): boolean {
    return this._running;
  }

  /**
   * 获取任务执行历史
   */
  async getExecutionHistory(taskId: ID, limit?: number): Promise<TaskExecutionResult[]> {
    const history = this.executionHistory.get(taskId) || [];
    const result = [...history].reverse(); // 最新的在前

    if (limit) {
      return result.slice(0, limit);
    }

    return result;
  }
}

/**
 * 任务调度器接口
 * 负责管理和执行定时任务
 */
export interface ITaskScheduler {
  /**
   * 创建定时任务
   * @param options 任务配置
   */
  schedule(options: CreateScheduledTaskOptions): Promise<IScheduledTask>;

  /**
   * 取消定时任务
   * @param taskId 任务 ID
   */
  cancel(taskId: ID): Promise<boolean>;

  /**
   * 立即执行任务
   * @param taskId 任务 ID
   */
  executeNow(taskId: ID): Promise<TaskExecutionResult>;

  /**
   * 获取指定任务
   * @param taskId 任务 ID
   */
  getTask(taskId: ID): Promise<IScheduledTask | null>;

  /**
   * 列出任务
   * @param options 过滤选项
   */
  listTasks(options?: {
    agentId?: ID;
    status?: TaskStatus;
    taskType?: TaskType;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: IScheduledTask[];
    total: number;
  }>;

  /**
   * 启用任务
   * @param taskId 任务 ID
   */
  enableTask(taskId: ID): Promise<boolean>;

  /**
   * 禁用任务
   * @param taskId 任务 ID
   */
  disableTask(taskId: ID): Promise<boolean>;

  /**
   * 更新任务
   * @param taskId 任务 ID
   * @param updates 更新内容
   */
  updateTask(
    taskId: ID,
    updates: Partial<Omit<CreateScheduledTaskOptions, 'agentId' | 'taskType'>>
  ): Promise<IScheduledTask>;

  /**
   * 启动调度器
   */
  start(): Promise<void>;

  /**
   * 停止调度器
   */
  stop(): Promise<void>;

  /**
   * 检查调度器是否在运行
   */
  isRunning(): boolean;

  /**
   * 获取任务执行历史
   * @param taskId 任务 ID
   * @param limit 限制数量
   */
  getExecutionHistory(taskId: ID, limit?: number): Promise<TaskExecutionResult[]>;
}

/**
 * Agent 状态持久化数据
 */
export interface AgentStateData {
  /** Agent ID */
  id: ID;
  /** Agent 名称 */
  name: string;
  /** Agent 描述 */
  description?: string;
  /** Agent 状态 */
  status: AgentStatus;
  /** Agent 配置 */
  config: AgentConfig;
  /** 创建时间 */
  createdAt: Timestamp;
  /** 最后更新时间 */
  updatedAt: Timestamp;
  /** 元数据 */
  metadata: Metadata;
}

/**
 * SQLite 持久化实现类
 * MVP 阶段可以先用内存实现，后续再完善
 */
export class SqlitePersistence implements IPersistence {
  private dbPath: string;
  private db: any = null; // better-sqlite3 Database 实例
  private initialized: boolean = false;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  /**
   * 初始化持久化存储
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 动态导入 better-sqlite3
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);

      // 创建表
      this.createTables();

      this.initialized = true;
    } catch (error) {
      // 如果 better-sqlite3 不可用，使用内存实现（MVP 降级方案）
      console.warn('better-sqlite3 不可用，使用内存实现');
      this.db = null;
      this.initialized = true;
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) return;

    // agents 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT NOT NULL
      )
    `);

    // memories 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        importance REAL NOT NULL,
        embedding TEXT,
        metadata TEXT,
        tags TEXT,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // tasks 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        task_type TEXT NOT NULL,
        cron TEXT NOT NULL,
        payload TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        max_runs INTEGER,
        metadata TEXT
      )
    `);

    // token_usage 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建索引
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id)`);
  }

  // ===== Agent 状态 =====

  async saveAgentState(agentState: AgentStateData): Promise<void> {
    if (!this.db) {
      // 内存实现（简化）
      return;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (id, name, description, status, config, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agentState.id,
      agentState.name,
      agentState.description || null,
      agentState.status,
      JSON.stringify(agentState.config),
      agentState.createdAt,
      agentState.updatedAt,
      JSON.stringify(agentState.metadata)
    );
  }

  async loadAgentState(agentId: ID): Promise<AgentStateData | null> {
    if (!this.db) return null;

    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      config: JSON.parse(row.config),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata),
    };
  }

  async loadAllAgentStates(): Promise<AgentStateData[]> {
    if (!this.db) return [];

    const rows = this.db.prepare('SELECT * FROM agents').all();
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      config: JSON.parse(row.config),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata),
    }));
  }

  async deleteAgentState(agentId: ID): Promise<boolean> {
    if (!this.db) return false;

    const result = this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    return result.changes > 0;
  }

  // ===== 记忆数据 =====

  async saveMemory(memory: {
    id: ID;
    agentId: ID;
    content: string;
    type: string;
    importance: number;
    embedding?: number[];
    metadata?: Metadata;
    tags?: string[];
    createdAt: Timestamp;
    lastAccessedAt: Timestamp;
    accessCount: number;
  }): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, agent_id, content, type, importance, embedding, metadata, tags, created_at, last_accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.agentId,
      memory.content,
      memory.type,
      memory.importance,
      memory.embedding ? JSON.stringify(memory.embedding) : null,
      memory.metadata ? JSON.stringify(memory.metadata) : null,
      memory.tags ? JSON.stringify(memory.tags) : null,
      memory.createdAt,
      memory.lastAccessedAt,
      memory.accessCount
    );
  }

  async loadMemory(agentId: ID): Promise<
    Array<{
      id: ID;
      agentId: ID;
      content: string;
      type: string;
      importance: number;
      embedding?: number[];
      metadata?: Metadata;
      tags?: string[];
      createdAt: Timestamp;
      lastAccessedAt: Timestamp;
      accessCount: number;
    }>
  > {
    if (!this.db) return [];

    const rows = this.db.prepare('SELECT * FROM memories WHERE agent_id = ?').all(agentId);
    return rows.map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      type: row.type,
      importance: row.importance,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
    }));
  }

  async deleteMemory(memoryId: ID): Promise<boolean> {
    if (!this.db) return false;

    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
    return result.changes > 0;
  }

  async updateMemoryAccess(memoryId: ID): Promise<void> {
    if (!this.db) return;

    this.db.prepare(`
      UPDATE memories 
      SET last_accessed_at = ?, access_count = access_count + 1 
      WHERE id = ?
    `).run(now(), memoryId);
  }

  // ===== 任务数据 =====

  async saveScheduledTask(task: IScheduledTask): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, agent_id, name, description, task_type, cron, payload, enabled, status, created_at, last_run_at, next_run_at, run_count, max_runs, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.agentId,
      task.name,
      task.description || null,
      task.taskType,
      task.cron,
      JSON.stringify(task.payload),
      task.enabled ? 1 : 0,
      task.status,
      task.createdAt,
      task.lastRunAt || null,
      task.nextRunAt || null,
      task.runCount,
      task.maxRuns || null,
      task.metadata ? JSON.stringify(task.metadata) : null
    );
  }

  async loadScheduledTasks(): Promise<IScheduledTask[]> {
    if (!this.db) return [];

    const rows = this.db.prepare('SELECT * FROM tasks').all();
    return rows.map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      name: row.name,
      description: row.description || undefined,
      taskType: row.task_type,
      cron: row.cron,
      payload: JSON.parse(row.payload),
      enabled: row.enabled === 1,
      status: row.status,
      createdAt: row.created_at,
      lastRunAt: row.last_run_at || undefined,
      nextRunAt: row.next_run_at || undefined,
      runCount: row.run_count,
      maxRuns: row.max_runs || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async deleteScheduledTask(taskId: ID): Promise<boolean> {
    if (!this.db) return false;

    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    return result.changes > 0;
  }

  // ===== Token 使用数据 =====

  async saveTokenUsage(usage: {
    id: ID;
    agentId?: ID;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    timestamp: Timestamp;
  }): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO token_usage (id, agent_id, model, input_tokens, output_tokens, total_tokens, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      usage.id,
      usage.agentId || null,
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      usage.timestamp
    );
  }

  async getDailyTokenUsage(date: Timestamp, agentId?: ID): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> {
    if (!this.db) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    // 计算当天的开始和结束时间
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    let query = `
      SELECT 
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens
      FROM token_usage 
      WHERE timestamp >= ? AND timestamp <= ?
    `;

    const params: any[] = [startOfDay.getTime(), endOfDay.getTime()];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    const row = this.db.prepare(query).get(...params);

    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
    };
  }

  // ===== 通用 =====

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) {
      return fn();
    }

    const tx = this.db.transaction(() => fn());
    return tx();
  }
}

/**
 * 持久化接口
 * 负责数据的持久化存储和加载
 */
export interface IPersistence {
  // ===== Agent 状态 =====
  /**
   * 保存 Agent 状态
   * @param agentState Agent 状态数据
   */
  saveAgentState(agentState: AgentStateData): Promise<void>;

  /**
   * 加载 Agent 状态
   * @param agentId Agent ID
   */
  loadAgentState(agentId: ID): Promise<AgentStateData | null>;

  /**
   * 加载所有 Agent 状态
   */
  loadAllAgentStates(): Promise<AgentStateData[]>;

  /**
   * 删除 Agent 状态
   * @param agentId Agent ID
   */
  deleteAgentState(agentId: ID): Promise<boolean>;

  // ===== 记忆数据 =====
  /**
   * 保存记忆
   * @param memory 记忆数据
   */
  saveMemory(memory: {
    id: ID;
    agentId: ID;
    content: string;
    type: string;
    importance: number;
    embedding?: number[];
    metadata?: Metadata;
    tags?: string[];
    createdAt: Timestamp;
    lastAccessedAt: Timestamp;
    accessCount: number;
  }): Promise<void>;

  /**
   * 加载指定 Agent 的所有记忆
   * @param agentId Agent ID
   */
  loadMemory(agentId: ID): Promise<
    Array<{
      id: ID;
      agentId: ID;
      content: string;
      type: string;
      importance: number;
      embedding?: number[];
      metadata?: Metadata;
      tags?: string[];
      createdAt: Timestamp;
      lastAccessedAt: Timestamp;
      accessCount: number;
    }>
  >;

  /**
   * 删除记忆
   * @param memoryId 记忆 ID
   */
  deleteMemory(memoryId: ID): Promise<boolean>;

  /**
   * 更新记忆访问信息
   * @param memoryId 记忆 ID
   */
  updateMemoryAccess(memoryId: ID): Promise<void>;

  // ===== 任务数据 =====
  /**
   * 保存定时任务
   * @param task 任务数据
   */
  saveScheduledTask(task: IScheduledTask): Promise<void>;

  /**
   * 加载所有定时任务
   */
  loadScheduledTasks(): Promise<IScheduledTask[]>;

  /**
   * 删除定时任务
   * @param taskId 任务 ID
   */
  deleteScheduledTask(taskId: ID): Promise<boolean>;

  // ===== Token 使用数据 =====
  /**
   * 保存 token 使用记录
   * @param usage 使用记录
   */
  saveTokenUsage(usage: {
    id: ID;
    agentId?: ID;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    timestamp: Timestamp;
  }): Promise<void>;

  /**
   * 获取指定日期的 token 使用量
   * @param date 日期（时间戳）
   * @param agentId Agent ID（可选）
   */
  getDailyTokenUsage(date: Timestamp, agentId?: ID): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;

  // ===== 通用 =====
  /**
   * 初始化持久化存储
   */
  initialize(): Promise<void>;

  /**
   * 关闭持久化存储
   */
  close(): Promise<void>;

  /**
   * 执行事务
   * @param fn 事务函数
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
