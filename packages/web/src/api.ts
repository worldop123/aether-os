import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProcessManager, IAgent } from '@aether/core';
import type { MemoryManager, LongTermMemoryItem, VectorSearchResult } from '@aether/memory';
import type { ModelRouter, BudgetController } from '@aether/model-router';
import type { McpManager, IMcpServer, IMcpTool } from '@aether/mcp';
import type { TaskScheduler, IScheduledTask } from '@aether/scheduler';
import { AetherError, NotFoundError, now, globalEventBus } from '@aether/shared';

/**
 * API 路由依赖
 */
export interface ApiDeps {
  processManager: ProcessManager;
  memoryManager: MemoryManager;
  modelRouter: ModelRouter;
  budgetController: BudgetController;
  mcpManager: McpManager;
  taskScheduler: TaskScheduler;
  startTime: number;
}

/**
 * 简单的事件发射器接口（用于 SSE 监听所有事件）
 */
interface SimpleEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * SSE 转发的事件列表
 */
const SSE_EVENTS = [
  'agent.started',
  'agent.paused',
  'agent.resumed',
  'agent.stopped',
  'agent.error',
  'agent.status_changed',
  'memory.added',
  'memory.deleted',
  'memory.cleared',
  'model.request',
  'model.response',
  'model.error',
  'budget.warning',
  'budget.exceeded',
  'mcp.tool_called',
  'mcp.tool_result',
  'mcp.tool_error',
  'mcp.server_connected',
  'mcp.server_disconnected',
  'scheduler.task_created',
  'scheduler.task_cancelled',
  'scheduler.task_executed',
  'scheduler.task_error',
];

/**
 * 发送 JSON 响应
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 发送错误响应
 */
function sendError(res: ServerResponse, status: number, message: string, code?: string): void {
  sendJson(res, status, { error: message, code: code || 'ERROR' });
}

/**
 * 从 AetherError 中提取 HTTP 状态码
 */
function statusForError(error: unknown): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof AetherError) {
    const code = error.code;
    if (code.includes('NOT_FOUND')) return 404;
    if (code.includes('ALREADY_EXISTS')) return 409;
    if (code.includes('INVALID')) return 400;
    return 500;
  }
  return 500;
}

/**
 * 将 Agent 序列化为普通对象
 */
function serializeAgent(agent: IAgent): Record<string, unknown> {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: agent.getStatus(),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    config: agent.config,
    metadata: agent.metadata,
  };
}

/**
 * 将 MCP 服务器序列化为普通对象
 */
async function serializeServer(server: IMcpServer): Promise<Record<string, unknown>> {
  const toolCount = server.isConnected() ? (await server.listTools()).length : 0;
  return {
    name: server.name,
    type: server.config.type,
    description: server.config.description,
    status: server.status,
    connected: server.isConnected(),
    toolCount,
    enabled: server.config.enabled !== false,
  };
}

/**
 * 将 MCP 工具序列化为普通对象
 */
function serializeTool(tool: IMcpTool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    serverName: tool.serverName,
    parameters: tool.parameters,
    inputSchema: tool.inputSchema,
  };
}

/**
 * 将定时任务序列化为普通对象
 */
function serializeTask(task: IScheduledTask): Record<string, unknown> {
  return {
    id: task.id,
    agentId: task.agentId,
    name: task.name,
    description: task.description,
    taskType: task.taskType,
    cron: task.cron,
    payload: task.payload,
    enabled: task.enabled,
    status: task.status,
    createdAt: task.createdAt,
    lastRunAt: task.lastRunAt,
    nextRunAt: task.nextRunAt,
    runCount: task.runCount,
    maxRuns: task.maxRuns,
    metadata: task.metadata,
  };
}

/**
 * REST API 路由处理器
 * 基于简单的路径分段匹配，不引入框架
 */
export class ApiRouter {
  constructor(private deps: ApiDeps) {}

  /**
   * 处理 API 请求
   * @returns true 表示已处理，false 表示未匹配路由
   */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    method: string,
    query: URLSearchParams,
    body: Record<string, unknown>
  ): Promise<boolean> {
    const segments = pathname.split('/').filter(Boolean);
    // segments[0] === 'api'
    if (segments.length < 1 || segments[0] !== 'api') {
      return false;
    }

    const resource = segments[1];

    try {
      switch (resource) {
        case 'status':
          if (method === 'GET') return this.handleGetStatus(res);
          break;
        case 'agents':
          return this.handleAgents(req, res, segments, method, query, body);
        case 'memories':
          return this.handleMemories(res, segments, method, query, body);
        case 'budget':
          return this.handleBudget(res, segments, method, body);
        case 'mcp':
          return this.handleMcp(req, res, segments, method, query, body);
        case 'schedules':
          return this.handleSchedules(res, segments, method, query, body);
        case 'events':
          if (method === 'GET') return this.handleSSE(req, res);
          break;
      }
    } catch (error) {
      const status = statusForError(error);
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof AetherError ? error.code : undefined;
      sendError(res, status, message, code);
      return true;
    }

    // 未匹配的路由
    sendError(res, 404, `API 路由不存在: ${method} ${pathname}`, 'NOT_FOUND');
    return true;
  }

  // ===== 系统状态 =====

  private async handleGetStatus(res: ServerResponse): Promise<boolean> {
    const agents = this.deps.processManager.listAgents();
    const { total: taskCount } = await this.deps.taskScheduler.listTasks();
    const usage = await this.deps.budgetController.getDailyUsage();
    const budget = this.deps.budgetController.getDailyBudget();
    const servers = this.deps.mcpManager.listServers();
    const tools = await this.deps.mcpManager.listAllTools();

    sendJson(res, 200, {
      uptime: Math.floor((now() - this.deps.startTime) / 1000),
      timestamp: now(),
      agentCount: agents.length,
      taskCount,
      budget: {
        dailyBudget: budget,
        dailyUsed: usage.totalTokens,
        percentage: budget > 0 ? usage.totalTokens / budget : 0,
        remaining: budget - usage.totalTokens,
      },
      mcpServerCount: servers.length,
      mcpToolCount: tools.length,
      schedulerRunning: this.deps.taskScheduler.isRunning(),
    });
    return true;
  }

  // ===== Agent 管理 =====

  private async handleAgents(
    req: IncomingMessage,
    res: ServerResponse,
    segments: string[],
    method: string,
    query: URLSearchParams,
    body: Record<string, unknown>
  ): Promise<boolean> {
    // GET /api/agents
    if (segments.length === 2 && method === 'GET') {
      const status = query.get('status');
      const agents = this.deps.processManager.listAgents(status as any);
      sendJson(res, 200, agents.map(serializeAgent));
      return true;
    }

    // POST /api/agents
    if (segments.length === 2 && method === 'POST') {
      const name = body.name as string;
      if (!name) {
        sendError(res, 400, '缺少必填参数: name', 'MISSING_PARAMETER');
        return true;
      }
      const description = body.description as string | undefined;
      const model = body.model as string | undefined;
      const agent = await this.deps.processManager.createAgent(name, {
        description,
        defaultModel: model,
      });
      sendJson(res, 201, serializeAgent(agent));
      return true;
    }

    // /api/agents/:id/...
    if (segments.length >= 3) {
      const agentId = segments[2];
      const agent = this.deps.processManager.getAgent(agentId);
      if (!agent) {
        sendError(res, 404, `Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
        return true;
      }

      // GET /api/agents/:id
      if (segments.length === 3 && method === 'GET') {
        sendJson(res, 200, serializeAgent(agent));
        return true;
      }

      // POST /api/agents/:id/start|stop|pause|resume
      if (segments.length === 4 && method === 'POST') {
        const action = segments[3];
        switch (action) {
          case 'start':
            await this.deps.processManager.startAgent(agentId);
            sendJson(res, 200, { ok: true, agentId, status: 'running' });
            return true;
          case 'stop':
            await this.deps.processManager.stopAgent(agentId);
            sendJson(res, 200, { ok: true, agentId, status: 'stopped' });
            return true;
          case 'pause':
            await this.deps.processManager.pauseAgent(agentId);
            sendJson(res, 200, { ok: true, agentId, status: 'paused' });
            return true;
          case 'resume':
            await this.deps.processManager.resumeAgent(agentId);
            sendJson(res, 200, { ok: true, agentId, status: 'running' });
            return true;
        }
      }
    }

    return false;
  }

  // ===== 记忆管理 =====

  private async handleMemories(
    res: ServerResponse,
    segments: string[],
    method: string,
    query: URLSearchParams,
    body: Record<string, unknown>
  ): Promise<boolean> {
    const longTerm = this.deps.memoryManager.longTerm;

    // GET /api/memories/search?q=&limit=
    if (segments.length === 3 && segments[2] === 'search' && method === 'GET') {
      const q = query.get('q') || '';
      const limit = parseInt(query.get('limit') || '10', 10);
      const agentId = query.get('agentId') || undefined;
      const results = await this.searchMemories(agentId, q, limit);
      sendJson(res, 200, results.map((r) => ({ ...r.item, similarity: r.similarity })));
      return true;
    }

    // GET /api/memories?agentId=&type=&limit=
    if (segments.length === 2 && method === 'GET') {
      const agentId = query.get('agentId') || undefined;
      const type = query.get('type') || undefined;
      const limit = parseInt(query.get('limit') || '20', 10);
      const { items, total } = await this.listMemories(agentId, type, limit);
      sendJson(res, 200, { items, total });
      return true;
    }

    // POST /api/memories
    if (segments.length === 2 && method === 'POST') {
      const agentId = body.agentId as string;
      const content = body.content as string;
      if (!agentId || !content) {
        sendError(res, 400, '缺少必填参数: agentId, content', 'MISSING_PARAMETER');
        return true;
      }
      const item = await longTerm.store(agentId, content, {
        type: body.type as LongTermMemoryItem['type'] | undefined,
        importance: body.importance as number | undefined,
        tags: body.tags as string[] | undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      });
      sendJson(res, 201, item);
      return true;
    }

    // DELETE /api/memories/:id
    if (segments.length === 3 && method === 'DELETE') {
      const memoryId = segments[2];
      const deleted = await longTerm.delete(memoryId);
      if (!deleted) {
        sendError(res, 404, `记忆 ${memoryId} 不存在`, 'MEMORY_NOT_FOUND');
        return true;
      }
      sendJson(res, 200, { ok: true, deleted: true, id: memoryId });
      return true;
    }

    return false;
  }

  /**
   * 列出记忆（支持跨 Agent 聚合）
   */
  private async listMemories(
    agentId: string | undefined,
    type: string | undefined,
    limit: number
  ): Promise<{ items: LongTermMemoryItem[]; total: number }> {
    const longTerm = this.deps.memoryManager.longTerm;
    if (agentId) {
      const result = await longTerm.list(agentId, {
        type: type as LongTermMemoryItem['type'] | undefined,
        pageSize: limit,
      });
      return result;
    }

    // 无 agentId 时聚合所有 Agent 的记忆
    const agents = this.deps.processManager.listAgents();
    const allItems: LongTermMemoryItem[] = [];
    for (const agent of agents) {
      const { items } = await longTerm.list(agent.id, {
        type: type as LongTermMemoryItem['type'] | undefined,
        pageSize: 1000,
      });
      allItems.push(...items);
    }
    allItems.sort((a, b) => b.createdAt - a.createdAt);
    const total = allItems.length;
    return { items: allItems.slice(0, limit), total };
  }

  /**
   * 搜索记忆（支持跨 Agent 聚合）
   */
  private async searchMemories(
    agentId: string | undefined,
    query: string,
    limit: number
  ): Promise<VectorSearchResult[]> {
    const longTerm = this.deps.memoryManager.longTerm;
    if (agentId) {
      return longTerm.search(agentId, query, { topK: limit });
    }

    const agents = this.deps.processManager.listAgents();
    const allResults: VectorSearchResult[] = [];
    for (const agent of agents) {
      const results = await longTerm.search(agent.id, query, { topK: limit });
      allResults.push(...results);
    }
    allResults.sort((a, b) => b.similarity - a.similarity);
    return allResults.slice(0, limit);
  }

  // ===== 预算管理 =====

  private async handleBudget(
    res: ServerResponse,
    segments: string[],
    method: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    // GET /api/budget
    if (segments.length === 2 && method === 'GET') {
      const usage = await this.deps.budgetController.getDailyUsage();
      const budget = this.deps.budgetController.getDailyBudget();
      const percentage = await this.deps.budgetController.getBudgetPercentage();
      sendJson(res, 200, {
        dailyBudget: budget,
        dailyUsed: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        percentage,
        remaining: budget - usage.totalTokens,
      });
      return true;
    }

    // POST /api/budget
    if (segments.length === 2 && method === 'POST') {
      const budget = body.budget as number;
      if (budget === undefined) {
        sendError(res, 400, '缺少必填参数: budget', 'MISSING_PARAMETER');
        return true;
      }
      const agentId = body.agentId as string | undefined;
      this.deps.budgetController.setDailyBudget(budget, agentId);
      sendJson(res, 200, { ok: true, dailyBudget: budget, agentId: agentId || null });
      return true;
    }

    return false;
  }

  // ===== MCP 管理 =====

  private async handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    segments: string[],
    method: string,
    query: URLSearchParams,
    body: Record<string, unknown>
  ): Promise<boolean> {
    // GET /api/mcp/servers
    if (segments.length === 3 && segments[2] === 'servers' && method === 'GET') {
      const servers = this.deps.mcpManager.listServers();
      const data = await Promise.all(servers.map(serializeServer));
      sendJson(res, 200, data);
      return true;
    }

    // GET /api/mcp/tools
    if (segments.length === 3 && segments[2] === 'tools' && method === 'GET') {
      const tools = await this.deps.mcpManager.listAllTools();
      sendJson(res, 200, tools.map(serializeTool));
      return true;
    }

    // POST /api/mcp/tools/:name/execute
    if (segments.length === 5 && segments[2] === 'tools' && segments[4] === 'execute' && method === 'POST') {
      const toolName = segments[3];
      const args = (body.args as Record<string, unknown>) || {};
      const serverName = body.serverName as string | undefined;
      const result = await this.deps.mcpManager.executeTool(toolName, args, serverName);
      sendJson(res, 200, result);
      return true;
    }

    return false;
  }

  // ===== 定时任务管理 =====

  private async handleSchedules(
    res: ServerResponse,
    segments: string[],
    method: string,
    query: URLSearchParams,
    body: Record<string, unknown>
  ): Promise<boolean> {
    // GET /api/schedules
    if (segments.length === 2 && method === 'GET') {
      const agentId = query.get('agentId') || undefined;
      const { items, total } = await this.deps.taskScheduler.listTasks({ agentId: agentId || undefined });
      sendJson(res, 200, { items: items.map(serializeTask), total });
      return true;
    }

    // POST /api/schedules
    if (segments.length === 2 && method === 'POST') {
      const name = body.name as string;
      const agentId = body.agentId as string;
      const cron = body.cron as string;
      if (!name || !agentId || !cron) {
        sendError(res, 400, '缺少必填参数: name, agentId, cron', 'MISSING_PARAMETER');
        return true;
      }
      const task = await this.deps.taskScheduler.schedule({
        name,
        agentId,
        cron,
        taskType: (body.taskType as any) || 'custom',
        payload: (body.payload as Record<string, unknown>) || {},
        description: body.description as string | undefined,
        enabled: body.enabled as boolean | undefined,
      });
      sendJson(res, 201, serializeTask(task));
      return true;
    }

    // /api/schedules/:id/...
    if (segments.length >= 3) {
      const taskId = segments[2];

      // DELETE /api/schedules/:id
      if (segments.length === 3 && method === 'DELETE') {
        const cancelled = await this.deps.taskScheduler.cancel(taskId);
        if (!cancelled) {
          sendError(res, 404, `任务 ${taskId} 不存在`, 'NOT_FOUND');
          return true;
        }
        sendJson(res, 200, { ok: true, cancelled: true, id: taskId });
        return true;
      }

      // POST /api/schedules/:id/run
      if (segments.length === 4 && segments[3] === 'run' && method === 'POST') {
        const result = await this.deps.taskScheduler.executeNow(taskId);
        sendJson(res, 200, result);
        return true;
      }
    }

    return false;
  }

  // ===== Server-Sent Events =====

  private handleSSE(req: IncomingMessage, res: ServerResponse): boolean {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // 发送初始连接事件
    res.write(`data: ${JSON.stringify({ event: 'connected', timestamp: now() })}\n\n`);

    const bus = globalEventBus as unknown as SimpleEventEmitter;
    const listeners: Array<{ event: string; listener: (...args: unknown[]) => void }> = [];

    for (const event of SSE_EVENTS) {
      const listener = (...args: unknown[]): void => {
        try {
          res.write(`data: ${JSON.stringify({ event, args, timestamp: now() })}\n\n`);
        } catch {
          // 写入失败时忽略（客户端可能已断开）
        }
      };
      listeners.push({ event, listener });
      bus.on(event, listener);
    }

    // 定期发送心跳，保持连接
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        // 忽略
      }
    }, 30000);

    // 客户端断开时清理
    req.on('close', () => {
      clearInterval(heartbeat);
      for (const { event, listener } of listeners) {
        bus.off(event, listener);
      }
    });

    return true;
  }
}
