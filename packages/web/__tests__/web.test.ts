import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, BudgetController, MockModelProvider } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { TaskScheduler } from '@aether/scheduler';
import { WebServer } from '../src/server';

/**
 * 创建测试用 WebServer 实例
 */
function createTestServer(port: number): WebServer {
  const processManager = new ProcessManager();
  const memoryManager = new MemoryManager('default');
  const modelRouter = new ModelRouter();
  const budgetController = new BudgetController();
  const mcpManager = new McpManager();
  const taskScheduler = new TaskScheduler();

  modelRouter.registerProvider(new MockModelProvider());

  return new WebServer({
    port,
    host: '127.0.0.1',
    processManager,
    memoryManager,
    modelRouter,
    budgetController,
    mcpManager,
    taskScheduler,
  });
}

/**
 * 发送 HTTP 请求的辅助函数
 */
async function request(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const options: RequestInit = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe('WebServer 测试', () => {
  let server: WebServer;
  let baseUrl: string;
  let port: number;

  beforeAll(async () => {
    port = 41000 + Math.floor(Math.random() * 1000);
    server = createTestServer(port);
    await server.start();
    baseUrl = server.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('服务器启停', () => {
    it('应该成功启动并返回正确的 URL', () => {
      expect(server.url).toBe(`http://127.0.0.1:${port}`);
    });

    it('应该能够正常停止', async () => {
      const testPort = 42000 + Math.floor(Math.random() * 1000);
      const s = createTestServer(testPort);
      await s.start();
      await s.stop();
      // 停止后不应抛出异常
      expect(true).toBe(true);
    });
  });

  describe('GET /api/status', () => {
    it('应该返回正确的系统状态结构', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/status');
      expect(status).toBe(200);
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('agentCount');
      expect(data).toHaveProperty('taskCount');
      expect(data).toHaveProperty('budget');
      expect(data).toHaveProperty('mcpServerCount');
      expect(data).toHaveProperty('mcpToolCount');
      expect(typeof (data as any).uptime).toBe('number');
      expect(typeof (data as any).agentCount).toBe('number');
      expect((data as any).budget).toHaveProperty('dailyBudget');
      expect((data as any).budget).toHaveProperty('dailyUsed');
      expect((data as any).budget).toHaveProperty('percentage');
      expect((data as any).budget).toHaveProperty('remaining');
    });
  });

  describe('GET /api/agents', () => {
    it('应该返回数组', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/agents');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('POST /api/agents', () => {
    it('应该成功创建 Agent', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/api/agents', {
        name: '测试Agent',
        description: '测试用Agent',
        model: 'mock-small',
      });
      expect(status).toBe(201);
      expect(data).toHaveProperty('id');
      expect((data as any).name).toBe('测试Agent');
      expect((data as any).description).toBe('测试用Agent');
      expect((data as any).status).toBe('running');
    });

    it('缺少 name 参数应返回 400', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/api/agents', {
        description: '无名称',
      });
      expect(status).toBe(400);
      expect((data as any).error).toBeDefined();
    });

    it('创建后应该出现在列表中', async () => {
      const createRes = await request(baseUrl, 'POST', '/api/agents', {
        name: '列表验证Agent',
      });
      const agentId = (createRes.data as any).id;
      const listRes = await request(baseUrl, 'GET', '/api/agents');
      const agents = listRes.data as any[];
      expect(agents.some((a) => a.id === agentId)).toBe(true);
    });
  });

  describe('Agent 生命周期操作', () => {
    it('应该能够暂停和恢复 Agent', async () => {
      const createRes = await request(baseUrl, 'POST', '/api/agents', {
        name: '生命周期测试Agent',
      });
      const agentId = (createRes.data as any).id;

      const pauseRes = await request(baseUrl, 'POST', `/api/agents/${agentId}/pause`, {});
      expect(pauseRes.status).toBe(200);
      expect((pauseRes.data as any).status).toBe('paused');

      const resumeRes = await request(baseUrl, 'POST', `/api/agents/${agentId}/resume`, {});
      expect(resumeRes.status).toBe(200);
      expect((resumeRes.data as any).status).toBe('running');

      const stopRes = await request(baseUrl, 'POST', `/api/agents/${agentId}/stop`, {});
      expect(stopRes.status).toBe(200);
      expect((stopRes.data as any).status).toBe('stopped');
    });

    it('获取不存在的 Agent 应返回 404', async () => {
      const { status } = await request(baseUrl, 'GET', '/api/agents/non-existent-agent');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/memories', () => {
    it('应该返回记忆列表结构', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/memories');
      expect(status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(Array.isArray((data as any).items)).toBe(true);
    });

    it('应该能够添加和搜索记忆', async () => {
      // 先创建 Agent
      const agentRes = await request(baseUrl, 'POST', '/api/agents', {
        name: '记忆测试Agent',
      });
      const agentId = (agentRes.data as any).id;

      // 添加记忆
      const addRes = await request(baseUrl, 'POST', '/api/memories', {
        agentId,
        content: 'Aether OS 是一个 AI Agent 操作系统',
        type: 'fact',
        importance: 0.8,
      });
      expect(addRes.status).toBe(201);
      expect((addRes.data as any).content).toBe('Aether OS 是一个 AI Agent 操作系统');

      // 搜索记忆
      const searchRes = await request(
        baseUrl,
        'GET',
        `/api/memories/search?q=${encodeURIComponent('Aether')}&limit=5`
      );
      expect(searchRes.status).toBe(200);
      expect(Array.isArray(searchRes.data)).toBe(true);
      expect((searchRes.data as any[]).length).toBeGreaterThan(0);
      expect((searchRes.data as any[])[0].content).toContain('Aether');
    });
  });

  describe('GET /api/budget', () => {
    it('应该返回预算状态', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/budget');
      expect(status).toBe(200);
      expect(data).toHaveProperty('dailyBudget');
      expect(data).toHaveProperty('dailyUsed');
      expect(data).toHaveProperty('percentage');
      expect(data).toHaveProperty('remaining');
      expect(typeof (data as any).dailyBudget).toBe('number');
      expect(typeof (data as any).percentage).toBe('number');
    });
  });

  describe('POST /api/budget', () => {
    it('应该能够设置预算', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/api/budget', {
        budget: 50000,
      });
      expect(status).toBe(200);
      expect((data as any).ok).toBe(true);
      expect((data as any).dailyBudget).toBe(50000);

      // 验证设置生效
      const getRes = await request(baseUrl, 'GET', '/api/budget');
      expect((getRes.data as any).dailyBudget).toBe(50000);
    });
  });

  describe('GET /api/mcp/tools', () => {
    it('应该返回工具列表', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/mcp/tools');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      // 内置工具服务器应该有工具
      expect((data as any[]).length).toBeGreaterThan(0);
      const tool = (data as any[])[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('serverName');
    });
  });

  describe('GET /api/mcp/servers', () => {
    it('应该返回服务器列表', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/mcp/servers');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect((data as any[]).length).toBeGreaterThan(0);
      const server = (data as any[])[0];
      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('type');
      expect(server).toHaveProperty('connected');
    });
  });

  describe('POST /api/mcp/tools/:name/execute', () => {
    it('应该能够执行 echo 工具', async () => {
      const { status, data } = await request(
        baseUrl,
        'POST',
        '/api/mcp/tools/echo/execute',
        { args: { message: 'hello world' } }
      );
      expect(status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).content).toContain('hello world');
    });
  });

  describe('GET /api/schedules', () => {
    it('应该返回任务列表结构', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/schedules');
      expect(status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(Array.isArray((data as any).items)).toBe(true);
    });
  });

  describe('POST /api/schedules', () => {
    it('应该能够创建定时任务', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/api/schedules', {
        name: '测试任务',
        agentId: 'test-agent',
        cron: '* * * * *',
        taskType: 'custom',
        payload: { message: 'hello' },
      });
      expect(status).toBe(201);
      expect((data as any).id).toBeDefined();
      expect((data as any).name).toBe('测试任务');
      expect((data as any).cron).toBe('* * * * *');
    });

    it('缺少必填参数应返回 400', async () => {
      const { status } = await request(baseUrl, 'POST', '/api/schedules', {
        name: '不完整任务',
      });
      expect(status).toBe(400);
    });
  });

  describe('静态文件服务', () => {
    it('GET / 应返回 HTML', async () => {
      const res = await fetch(`${baseUrl}/`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(text).toContain('Aether OS');
    });

    it('GET /style.css 应返回 CSS', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
      expect(text).toContain('--');
    });

    it('GET /app.js 应返回 JavaScript', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');
      expect(text).toContain('API');
    });
  });

  describe('404 处理', () => {
    it('不存在的 API 路由应返回 404', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/api/nonexistent');
      expect(status).toBe(404);
      expect((data as any).error).toBeDefined();
    });

    it('不存在的静态文件应回退到 index.html', async () => {
      const res = await fetch(`${baseUrl}/nonexistent-page`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).toContain('Aether OS');
    });
  });

  describe('CORS 头', () => {
    it('应该包含 CORS 头', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('OPTIONS 预检请求应返回 204', async () => {
      const res = await fetch(`${baseUrl}/api/status`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
    });
  });
});
