import { describe, it, expect, afterEach } from 'vitest';
import { StdioMcpClient, RemoteMcpTool } from '../src/stdio-client';
import { McpServer, McpServerStatus } from '../src/mcp';
import type { McpServerConfig } from '../src/mcp';

/**
 * Mock MCP 服务器脚本（CommonJS，通过 node -e 启动）
 * 实现 JSON-RPC 2.0 over stdio，支持 initialize / tools/list / tools/call
 */
const mockServerScript = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'mock',version:'1.0.0'}}}) + '\\n');
  } else if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{tools:[{name:'echo',description:'回显工具',inputSchema:{type:'object',properties:{msg:{type:'string',description:'消息内容'}},required:['msg']}}]}}) + '\\n');
  } else if (msg.method === 'tools/call') {
    const text = 'echo: ' + (msg.params.arguments.msg || '');
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:text}]}}) + '\\n');
  }
});
`;

/** 不响应任何请求的慢服务器脚本 */
const silentServerScript = `process.stdin.resume();`;

function createMockConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: 'mock-server',
    type: 'stdio',
    command: 'node',
    args: ['-e', mockServerScript],
    timeout: 5000,
    ...overrides,
  };
}

describe('StdioMcpClient 测试', () => {
  let clients: StdioMcpClient[] = [];

  afterEach(async () => {
    for (const client of clients) {
      await client.close().catch(() => {});
    }
    clients = [];
  });

  function track<T extends StdioMcpClient>(client: T): T {
    clients.push(client);
    return client;
  }

  describe('构造', () => {
    it('应该正确创建客户端', () => {
      const client = new StdioMcpClient(createMockConfig());
      expect(client).toBeInstanceOf(StdioMcpClient);
    });

    it('没有 command 配置时 connect 应该抛错', async () => {
      const client = track(
        new StdioMcpClient({
          name: 'no-command',
          type: 'stdio',
          command: undefined,
        })
      );
      await expect(client.connect()).rejects.toThrow(/command/);
    });
  });

  describe('initialize 握手', () => {
    it('应该成功完成 initialize 握手', async () => {
      const client = track(new StdioMcpClient(createMockConfig()));
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('连接不存在的命令应该抛错', async () => {
      const client = track(
        new StdioMcpClient({
          name: 'bad',
          type: 'stdio',
          command: 'this-command-does-not-exist-12345',
          args: [],
          timeout: 2000,
        })
      );
      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('tools/list', () => {
    it('应该获取远程工具列表', async () => {
      const client = track(new StdioMcpClient(createMockConfig()));
      await client.connect();
      const tools = await client.listTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('echo');
      expect(tools[0].description).toBe('回显工具');
      expect(tools[0].inputSchema).toBeDefined();
    });
  });

  describe('tools/call', () => {
    it('应该能够调用远程工具', async () => {
      const client = track(new StdioMcpClient(createMockConfig()));
      await client.connect();
      const result = await client.callTool('echo', { msg: 'Hello MCP' });
      expect(result.content).toBeDefined();
      expect(result.content!.length).toBeGreaterThan(0);
      expect(result.content![0].text).toBe('echo: Hello MCP');
    });

    it('调用工具返回的内容应该包含 text 类型', async () => {
      const client = track(new StdioMcpClient(createMockConfig()));
      await client.connect();
      const result = await client.callTool('echo', { msg: 'test' });
      expect(result.content![0].type).toBe('text');
    });
  });

  describe('close 关闭', () => {
    it('应该能够优雅关闭连接', async () => {
      const client = new StdioMcpClient(createMockConfig());
      await client.connect();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('关闭后再次调用应该不报错', async () => {
      const client = new StdioMcpClient(createMockConfig());
      await client.connect();
      await client.close();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('关闭后调用 listTools 应该抛错', async () => {
      const client = new StdioMcpClient(createMockConfig());
      await client.connect();
      await client.close();
      await expect(client.listTools()).rejects.toThrow();
    });
  });

  describe('超时处理', () => {
    it('请求超时应该抛错', async () => {
      const client = track(
        new StdioMcpClient({
          name: 'slow',
          type: 'stdio',
          command: 'node',
          args: ['-e', silentServerScript],
          timeout: 200,
        })
      );
      // connect 内部会调用 initialize，由于服务器不响应，会超时
      await expect(client.connect()).rejects.toThrow(/超时|timeout/i);
    });
  });
});

describe('RemoteMcpTool 测试', () => {
  let clients: StdioMcpClient[] = [];

  afterEach(async () => {
    for (const client of clients) {
      await client.close().catch(() => {});
    }
    clients = [];
  });

  it('应该正确包装远程工具', async () => {
    const client = new StdioMcpClient(createMockConfig());
    clients.push(client);
    await client.connect();
    const tools = await client.listTools();

    const tool = new RemoteMcpTool(client, 'mock-server', tools[0]);
    expect(tool.name).toBe('echo');
    expect(tool.description).toBe('回显工具');
    expect(tool.serverName).toBe('mock-server');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.parameters.length).toBe(1);
    expect(tool.parameters[0].name).toBe('msg');
    expect(tool.parameters[0].type).toBe('string');
    expect(tool.parameters[0].required).toBe(true);
  });

  it('execute 应该调用远程工具并返回结果', async () => {
    const client = new StdioMcpClient(createMockConfig());
    clients.push(client);
    await client.connect();
    const tools = await client.listTools();

    const tool = new RemoteMcpTool(client, 'mock-server', tools[0]);
    const result = await tool.execute({ msg: 'Hello Remote' });
    expect(result.success).toBe(true);
    expect(result.content).toBe('echo: Hello Remote');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('execute 在远程错误时应该返回失败结果', async () => {
    const client = new StdioMcpClient(createMockConfig());
    clients.push(client);
    // 不连接直接调用，execute 内部会捕获错误
    const tool = new RemoteMcpTool(client, 'mock-server', {
      name: 'echo',
      description: '回显工具',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
    });
    const result = await tool.execute({ msg: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('McpServer stdio 集成测试', () => {
  it('应该通过 stdio 连接真实 MCP 服务器并注册远程工具', async () => {
    const server = new McpServer(createMockConfig({ name: 'stdio-server' }));
    await server.connect();
    expect(server.status).toBe(McpServerStatus.CONNECTED);
    expect(server.isConnected()).toBe(true);

    const tools = await server.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('echo');
    expect(tools[0].serverName).toBe('stdio-server');

    const result = await server.callTool('echo', { msg: 'integration' });
    expect(result.success).toBe(true);
    expect(result.content).toBe('echo: integration');

    await server.disconnect();
    expect(server.isConnected()).toBe(false);
  });

  it('stdio 连接失败时状态应为 ERROR', async () => {
    const server = new McpServer({
      name: 'bad-stdio',
      type: 'stdio',
      command: 'this-command-does-not-exist-12345',
      args: [],
      timeout: 2000,
    });
    await expect(server.connect()).rejects.toThrow();
    expect(server.status).toBe(McpServerStatus.ERROR);
  });

  it('local 类型保持原有本地连接行为', async () => {
    const server = new McpServer({
      name: 'local-server',
      type: 'local',
    });
    await server.connect();
    expect(server.status).toBe(McpServerStatus.CONNECTED);
    await server.disconnect();
    expect(server.status).toBe(McpServerStatus.DISCONNECTED);
  });
});
