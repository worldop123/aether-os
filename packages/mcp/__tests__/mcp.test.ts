import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  McpTool,
  McpServer,
  McpManager,
  McpServerStatus,
} from '../src/mcp';
import { globalEventBus } from '@aether/shared';

describe('McpTool 测试', () => {
  describe('基础功能', () => {
    it('应该正确创建工具', () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      expect(tool.name).toBe('test-tool');
      expect(tool.description).toBe('测试工具');
      expect(tool.serverName).toBe('test-server');
    });

    it('应该能够执行工具', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [],
        'test-server',
        async () => ({ success: true, content: 'Hello World' })
      );

      const result = await tool.execute({});
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello World');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('应该返回执行耗时', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [],
        'test-server',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { success: true, content: 'ok' };
        }
      );

      const result = await tool.execute({});
      expect(result.duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('参数验证', () => {
    it('应该验证必填参数', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [
          {
            name: 'message',
            type: 'string',
            required: true,
          },
        ],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少必填参数');
    });

    it('应该验证参数类型', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [
          {
            name: 'count',
            type: 'number',
            required: true,
          },
        ],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      const result = await tool.execute({ count: 'not-a-number' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('应该是数字类型');
    });

    it('应该验证字符串类型参数', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [
          {
            name: 'name',
            type: 'string',
            required: true,
          },
        ],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      const result = await tool.execute({ name: 123 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('应该是字符串类型');
    });

    it('应该验证布尔类型参数', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [
          {
            name: 'enabled',
            type: 'boolean',
            required: true,
          },
        ],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      const result = await tool.execute({ enabled: 'true' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('应该是布尔类型');
    });
  });

  describe('错误处理', () => {
    it('应该捕获执行中的错误', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [],
        'test-server',
        async () => {
          throw new Error('执行失败');
        }
      );

      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toBe('执行失败');
    });
  });
});

describe('McpServer 测试', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      description: '测试服务器',
      type: 'local',
    });
  });

  describe('基础功能', () => {
    it('应该正确创建服务器', () => {
      expect(server.name).toBe('test-server');
      expect(server.status).toBe(McpServerStatus.DISCONNECTED);
      expect(server.isConnected()).toBe(false);
    });

    it('应该能够连接服务器', async () => {
      await server.connect();
      expect(server.status).toBe(McpServerStatus.CONNECTED);
      expect(server.isConnected()).toBe(true);
    });

    it('应该能够断开连接', async () => {
      await server.connect();
      await server.disconnect();
      expect(server.status).toBe(McpServerStatus.DISCONNECTED);
      expect(server.isConnected()).toBe(false);
    });

    it('重复连接应该不报错', async () => {
      await server.connect();
      await server.connect(); // 第二次连接
      expect(server.isConnected()).toBe(true);
    });

    it('重复断开应该不报错', async () => {
      await server.disconnect(); // 已经是断开状态
      expect(server.isConnected()).toBe(false);
    });

    it('应该能够获取服务器信息', async () => {
      const info = await server.getServerInfo();
      expect(info.name).toBe('test-server');
      expect(info.version).toBe('1.0.0');
    });
  });

  describe('工具管理', () => {
    beforeEach(async () => {
      await server.connect();
    });

    it('应该能够注册工具', async () => {
      const tool = new McpTool(
        'test-tool',
        '测试工具',
        [],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );

      server.registerTool(tool);
      const tools = await server.listTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('test-tool');
    });

    it('应该能够调用工具', async () => {
      const tool = new McpTool(
        'echo',
        '回显工具',
        [
          {
            name: 'message',
            type: 'string',
            required: true,
          },
        ],
        'test-server',
        async (args) => ({
          success: true,
          content: `Echo: ${args.message}`,
        })
      );

      server.registerTool(tool);
      const result = await server.callTool('echo', { message: 'Hello' });
      expect(result.success).toBe(true);
      expect(result.content).toBe('Echo: Hello');
    });

    it('调用不存在的工具应该返回错误', async () => {
      const result = await server.callTool('non-existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('未连接时列出工具应该抛出错误', async () => {
      const disconnectedServer = new McpServer({
        name: 'disconnected',
        type: 'local',
      });

      await expect(disconnectedServer.listTools()).rejects.toThrow();
    });

    it('未连接时调用工具应该抛出错误', async () => {
      const disconnectedServer = new McpServer({
        name: 'disconnected',
        type: 'local',
      });

      await expect(disconnectedServer.callTool('test', {})).rejects.toThrow();
    });
  });

  describe('事件触发', () => {
    it('连接时应该触发事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('mcp.server_connected', handler);

      await server.connect();
      expect(handler).toHaveBeenCalledWith('test-server', expect.any(Number));

      globalEventBus.off('mcp.server_connected', handler);
    });

    it('断开时应该触发事件', async () => {
      const handler = vi.fn();
      globalEventBus.on('mcp.server_disconnected', handler);

      await server.connect();
      await server.disconnect();
      expect(handler).toHaveBeenCalledWith('test-server', expect.any(Number));

      globalEventBus.off('mcp.server_disconnected', handler);
    });

    it('调用工具时应该触发事件', async () => {
      const calledHandler = vi.fn();
      const resultHandler = vi.fn();

      globalEventBus.on('mcp.tool_called', calledHandler);
      globalEventBus.on('mcp.tool_result', resultHandler);

      await server.connect();
      const tool = new McpTool(
        'test',
        '测试',
        [],
        'test-server',
        async () => ({ success: true, content: 'ok' })
      );
      server.registerTool(tool);

      await server.callTool('test', {});

      expect(calledHandler).toHaveBeenCalledWith('test', 'test-server', expect.any(Number));
      expect(resultHandler).toHaveBeenCalledWith('test', 'test-server', expect.any(Number), expect.any(Number));

      globalEventBus.off('mcp.tool_called', calledHandler);
      globalEventBus.off('mcp.tool_result', resultHandler);
    });
  });
});

describe('McpManager 测试', () => {
  let manager: McpManager;

  beforeEach(() => {
    manager = new McpManager();
  });

  describe('内置工具', () => {
    it('应该有内置的 builtin 服务器', () => {
      const servers = manager.listServers();
      expect(servers.length).toBeGreaterThan(0);
      expect(servers.some((s) => s.name === 'builtin')).toBe(true);
    });

    it('内置服务器应该有 get_current_time 工具', async () => {
      const tool = await manager.findTool('get_current_time');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_current_time');
    });

    it('内置服务器应该有 calculate 工具', async () => {
      const tool = await manager.findTool('calculate');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('calculate');
    });

    it('内置服务器应该有 echo 工具', async () => {
      const tool = await manager.findTool('echo');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('echo');
    });
  });

  describe('服务器管理', () => {
    it('应该能够加载服务器', async () => {
      const server = await manager.loadServer({
        name: 'custom-server',
        description: '自定义服务器',
        type: 'local',
        enabled: false,
      });

      expect(server.name).toBe('custom-server');
      expect(manager.getServer('custom-server')).toBeDefined();
    });

    it('加载已存在的服务器应该抛出错误', async () => {
      await expect(
        manager.loadServer({
          name: 'builtin',
          type: 'local',
        })
      ).rejects.toThrow();
    });

    it('应该能够卸载服务器', async () => {
      await manager.loadServer({
        name: 'to-remove',
        type: 'local',
        enabled: false,
      });

      const result = await manager.unloadServer('to-remove');
      expect(result).toBe(true);
      expect(manager.getServer('to-remove')).toBeUndefined();
    });

    it('卸载不存在的服务器应该返回 false', async () => {
      const result = await manager.unloadServer('non-existent');
      expect(result).toBe(false);
    });

    it('应该能够列出所有服务器', () => {
      const servers = manager.listServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBeGreaterThan(0);
    });
  });

  describe('工具执行', () => {
    beforeEach(async () => {
      await manager.connectAll();
    });

    it('应该能够执行 echo 工具', async () => {
      const result = await manager.executeTool('echo', { message: 'Hello World' });
      expect(result.success).toBe(true);
      expect(result.content).toContain('Hello World');
    });

    it('应该能够执行 calculate 工具', async () => {
      const result = await manager.executeTool('calculate', { expression: '1 + 2 * 3' });
      expect(result.success).toBe(true);
      expect(result.content).toContain('7');
    });

    it('应该能够执行 get_current_time 工具', async () => {
      const result = await manager.executeTool('get_current_time', {});
      expect(result.success).toBe(true);
      expect(result.content).toContain('当前时间');
    });

    it('执行不存在的工具应该抛出错误', async () => {
      await expect(
        manager.executeTool('non-existent-tool', {})
      ).rejects.toThrow();
    });

    it('应该支持指定服务器执行', async () => {
      const result = await manager.executeTool(
        'echo',
        { message: 'test' },
        'builtin'
      );
      expect(result.success).toBe(true);
    });

    it('指定不存在的服务器应该抛出错误', async () => {
      await expect(
        manager.executeTool('echo', { message: 'test' }, 'non-existent')
      ).rejects.toThrow();
    });
  });

  describe('连接管理', () => {
    it('应该能够连接所有服务器', async () => {
      await manager.connectAll();
      const servers = manager.listServers();
      for (const server of servers) {
        if (server.config.enabled !== false) {
          expect(server.isConnected()).toBe(true);
        }
      }
    });

    it('应该能够断开所有服务器', async () => {
      await manager.connectAll();
      await manager.disconnectAll();

      const servers = manager.listServers();
      for (const server of servers) {
        expect(server.isConnected()).toBe(false);
      }
    });

    it('应该能够重新加载服务器', async () => {
      await manager.connectAll();
      await manager.reloadServer('builtin');

      const server = manager.getServer('builtin');
      expect(server?.isConnected()).toBe(true);
    });

    it('重新加载不存在的服务器应该抛出错误', async () => {
      await expect(manager.reloadServer('non-existent')).rejects.toThrow();
    });
  });

  describe('工具查找', () => {
    beforeEach(async () => {
      await manager.connectAll();
    });

    it('应该能够查找存在的工具', async () => {
      const tool = await manager.findTool('echo');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('echo');
    });

    it('查找不存在的工具应该返回 undefined', async () => {
      const tool = await manager.findTool('non-existent');
      expect(tool).toBeUndefined();
    });

    it('应该能够列出所有工具', async () => {
      const tools = await manager.listAllTools();
      expect(tools.length).toBeGreaterThanOrEqual(3); // 至少有 3 个内置工具
    });
  });
});
