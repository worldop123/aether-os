import type { ID, Timestamp, Metadata } from '@aether/shared';
import { now, globalEventBus } from '@aether/shared';
import { McpError } from '@aether/shared';
import { StdioMcpClient, RemoteMcpTool } from './stdio-client.js';

/**
 * 安全的数学表达式求值器（递归下降解析器）
 * 支持 + - * / % () 和数字，不使用 eval，杜绝代码注入风险
 *
 * 文法：
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor)*
 *   factor     := number | '(' expression ')' | ('-' | '+') factor
 */
function safeEvalMath(expression: string): number {
  let pos = 0;
  const src = expression;

  const skipSpaces = (): void => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };

  const parseNumber = (): number => {
    skipSpaces();
    let num = '';
    while (pos < src.length && /[\d.]/.test(src[pos])) {
      num += src[pos];
      pos++;
    }
    if (num === '') {
      throw new Error(`位置 ${pos} 处期望数字`);
    }
    const value = parseFloat(num);
    if (Number.isNaN(value)) {
      throw new Error(`无效数字: ${num}`);
    }
    return value;
  };

  const parseFactor = (): number => {
    skipSpaces();
    if (pos >= src.length) {
      throw new Error('表达式不完整');
    }
    const ch = src[pos];
    if (ch === '(') {
      pos++; // 跳过 '('
      const value = parseExpression();
      skipSpaces();
      if (src[pos] !== ')') {
        throw new Error(`位置 ${pos} 处期望 ')'`);
      }
      pos++; // 跳过 ')'
      return value;
    }
    if (ch === '-') {
      pos++;
      return -parseFactor();
    }
    if (ch === '+') {
      pos++;
      return parseFactor();
    }
    return parseNumber();
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    skipSpaces();
    while (pos < src.length && (src[pos] === '*' || src[pos] === '/' || src[pos] === '%')) {
      const op = src[pos];
      pos++;
      const right = parseFactor();
      if (op === '*') value = value * right;
      else if (op === '/') {
        if (right === 0) throw new Error('除零错误');
        value = value / right;
      } else {
        if (right === 0) throw new Error('模零错误');
        value = value % right;
      }
      skipSpaces();
    }
    return value;
  };

  const parseExpression = (): number => {
    let value = parseTerm();
    skipSpaces();
    while (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
      const op = src[pos];
      pos++;
      const right = parseTerm();
      if (op === '+') value = value + right;
      else value = value - right;
      skipSpaces();
    }
    return value;
  };

  skipSpaces();
  const result = parseExpression();
  skipSpaces();
  if (pos < src.length) {
    throw new Error(`位置 ${pos} 处存在未识别字符 '${src[pos]}'`);
  }
  return result;
}

/**
 * MCP 工具参数定义
 */
export interface McpToolParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 参数描述 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 枚举值 */
  enum?: unknown[];
  /** 子参数（object 类型） */
  properties?: Record<string, McpToolParameter>;
  /** 数组项类型（array 类型） */
  items?: McpToolParameter;
}

/**
 * MCP 工具实现类
 */
export class McpTool implements IMcpTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: McpToolParameter[];
  readonly serverName: string;
  readonly inputSchema?: Record<string, unknown>;
  private handler: (args: Record<string, unknown>) => Promise<McpToolResult>;

  constructor(
    name: string,
    description: string,
    parameters: McpToolParameter[],
    serverName: string,
    handler: (args: Record<string, unknown>) => Promise<McpToolResult>
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.serverName = serverName;
    this.handler = handler;
  }

  /**
   * 执行工具
   */
  async execute(args: Record<string, unknown>): Promise<McpToolResult> {
    const startTime = now();

    try {
      // 验证参数
      this.validateArgs(args);

      const result = await this.handler(args);
      const duration = now() - startTime;

      return {
        ...result,
        duration,
      };
    } catch (error) {
      const duration = now() - startTime;
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  /**
   * 验证参数
   */
  private validateArgs(args: Record<string, unknown>): void {
    for (const param of this.parameters) {
      if (param.required && !(param.name in args)) {
        throw new McpError(
          `缺少必填参数: ${param.name}`,
          'MISSING_REQUIRED_PARAMETER'
        );
      }

      if (param.name in args && args[param.name] !== undefined) {
        const value = args[param.name];
        const type = typeof value;

        if (param.type === 'string' && type !== 'string') {
          throw new McpError(
            `参数 ${param.name} 应该是字符串类型`,
            'INVALID_PARAMETER_TYPE'
          );
        }
        if (param.type === 'number' && type !== 'number') {
          throw new McpError(
            `参数 ${param.name} 应该是数字类型`,
            'INVALID_PARAMETER_TYPE'
          );
        }
        if (param.type === 'boolean' && type !== 'boolean') {
          throw new McpError(
            `参数 ${param.name} 应该是布尔类型`,
            'INVALID_PARAMETER_TYPE'
          );
        }
      }
    }
  }
}

/**
 * MCP 工具定义
 */
export interface IMcpTool {
  /** 工具名称 */
  readonly name: string;
  /** 工具描述 */
  readonly description: string;
  /** 工具参数 */
  readonly parameters: McpToolParameter[];
  /** 所属服务器名称 */
  readonly serverName: string;
  /** 工具输入 schema（JSON Schema） */
  readonly inputSchema?: Record<string, unknown>;

  /**
   * 执行工具
   * @param args 工具参数
   */
  execute(args: Record<string, unknown>): Promise<McpToolResult>;
}

/**
 * MCP 工具执行结果
 */
export interface McpToolResult {
  /** 是否成功 */
  success: boolean;
  /** 结果内容 */
  content: string;
  /** 结构化数据 */
  data?: unknown;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  /** 服务器名称 */
  name: string;
  /** 服务器描述 */
  description?: string;
  /** 服务器类型 */
  type: 'stdio' | 'http' | 'sse' | 'local';
  /** 命令（stdio 类型） */
  command?: string;
  /** 参数（stdio 类型） */
  args?: string[];
  /** URL（http/sse 类型） */
  url?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * MCP 服务器连接状态
 */
export enum McpServerStatus {
  /** 未连接 */
  DISCONNECTED = 'disconnected',
  /** 连接中 */
  CONNECTING = 'connecting',
  /** 已连接 */
  CONNECTED = 'connected',
  /** 错误 */
  ERROR = 'error',
}

/**
 * MCP 服务器实现类（本地工具服务器）
 * 支持 local 类型（本地工具）和 stdio 类型（通过子进程连接真实 MCP 服务器）
 */
export class McpServer implements IMcpServer {
  readonly name: string;
  readonly config: McpServerConfig;
  private _status: McpServerStatus;
  private tools: Map<string, IMcpTool> = new Map();
  private stdioClient?: StdioMcpClient;

  constructor(config: McpServerConfig & { initialStatus?: McpServerStatus }) {
    this.name = config.name;
    this.config = config;
    // 支持设置初始状态，默认为 DISCONNECTED
    this._status = config.initialStatus ?? McpServerStatus.DISCONNECTED;
  }

  /** 当前状态 */
  get status(): McpServerStatus {
    return this._status;
  }

  /**
   * 注册工具到服务器
   */
  registerTool(tool: IMcpTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 连接到 MCP 服务器
   * - stdio 类型：通过 StdioMcpClient 启动子进程并完成握手，拉取远程工具
   * - local/其他类型：直接设置为已连接状态
   */
  async connect(): Promise<void> {
    if (this._status === McpServerStatus.CONNECTED) {
      return;
    }

    this._status = McpServerStatus.CONNECTING;

    try {
      if (this.config.type === 'stdio' && this.config.command) {
        await this.connectStdio();
      } else {
        // 本地服务器：模拟连接延迟
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      this._status = McpServerStatus.CONNECTED;
      globalEventBus.emit('mcp.server_connected', this.name, now());
    } catch (error) {
      this._status = McpServerStatus.ERROR;
      // 清理可能已创建的 stdio 客户端
      if (this.stdioClient) {
        await this.stdioClient.close().catch(() => {});
        this.stdioClient = undefined;
      }
      throw error;
    }
  }

  /**
   * 通过 stdio 连接真实 MCP 服务器
   */
  private async connectStdio(): Promise<void> {
    this.stdioClient = new StdioMcpClient(this.config);
    await this.stdioClient.connect();

    // 拉取远程工具列表并注册为本地工具
    const remoteTools = await this.stdioClient.listTools();
    for (const toolInfo of remoteTools) {
      const tool = new RemoteMcpTool(this.stdioClient, this.name, toolInfo);
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this._status === McpServerStatus.DISCONNECTED) {
      return;
    }

    // 关闭 stdio 客户端（如有）
    if (this.stdioClient) {
      await this.stdioClient.close().catch(() => {});
      this.stdioClient = undefined;
    }

    this._status = McpServerStatus.DISCONNECTED;
    globalEventBus.emit('mcp.server_disconnected', this.name, now());
  }

  /**
   * 列出服务器上的所有工具
   */
  async listTools(): Promise<IMcpTool[]> {
    if (this._status !== McpServerStatus.CONNECTED) {
      throw new McpError(
        `服务器 ${this.name} 未连接`,
        'SERVER_NOT_CONNECTED'
      );
    }

    return Array.from(this.tools.values());
  }

  /**
   * 调用指定工具
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (this._status !== McpServerStatus.CONNECTED) {
      throw new McpError(
        `服务器 ${this.name} 未连接`,
        'SERVER_NOT_CONNECTED'
      );
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        content: '',
        error: `工具 ${toolName} 不存在`,
        duration: 0,
      };
    }

    // 触发工具调用事件
    globalEventBus.emit('mcp.tool_called', toolName, this.name, now());

    const startTime = now();
    try {
      const result = await tool.execute(args);
      const duration = now() - startTime;

      // 触发工具结果事件
      globalEventBus.emit('mcp.tool_result', toolName, this.name, duration, now());

      return result;
    } catch (error) {
      const duration = now() - startTime;

      // 触发工具错误事件
      globalEventBus.emit('mcp.tool_error', toolName, this.name, error as Error, now());

      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  /**
   * 检查服务器是否已连接
   */
  isConnected(): boolean {
    return this._status === McpServerStatus.CONNECTED;
  }

  /**
   * 获取服务器信息
   */
  async getServerInfo(): Promise<{
    name: string;
    version?: string;
    capabilities?: string[];
  }> {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: ['tools'],
    };
  }
}

/**
 * MCP 服务器接口
 * 代表一个 MCP 服务器连接
 */
export interface IMcpServer {
  /** 服务器名称 */
  readonly name: string;
  /** 服务器配置 */
  readonly config: McpServerConfig;
  /** 连接状态 */
  readonly status: McpServerStatus;

  /**
   * 连接到 MCP 服务器
   */
  connect(): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 列出服务器上的所有工具
   */
  listTools(): Promise<IMcpTool[]>;

  /**
   * 调用指定工具
   * @param toolName 工具名称
   * @param args 工具参数
   */
  callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult>;

  /**
   * 检查服务器是否已连接
   */
  isConnected(): boolean;

  /**
   * 获取服务器信息
   */
  getServerInfo(): Promise<{
    name: string;
    version?: string;
    capabilities?: string[];
  }>;
}

/**
 * MCP 管理器实现类
 * 负责管理所有 MCP 服务器和工具
 */
export class McpManager implements IMcpManager {
  private servers: Map<string, IMcpServer> = new Map();

  constructor() {
    // 初始化内置工具服务器
    this.initBuiltinServer();
  }

  /**
   * 初始化内置工具服务器
   */
  private initBuiltinServer(): void {
    const server = new McpServer({
      name: 'builtin',
      description: '内置工具服务器',
      type: 'local',
      enabled: true,
      initialStatus: McpServerStatus.CONNECTED,
    });

    // 注册内置工具
    server.registerTool(this.createGetCurrentTimeTool());
    server.registerTool(this.createCalculateTool());
    server.registerTool(this.createEchoTool());

    this.servers.set('builtin', server);
  }

  /**
   * 创建获取当前时间工具
   */
  private createGetCurrentTimeTool(): IMcpTool {
    return new McpTool(
      'get_current_time',
      '获取当前时间',
      [
        {
          name: 'timezone',
          type: 'string',
          description: '时区，默认 UTC',
          required: false,
          default: 'UTC',
        },
      ],
      'builtin',
      async (args) => {
        const timezone = (args.timezone as string) || 'UTC';
        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone });

        return {
          success: true,
          content: `当前时间（${timezone}）：${timeStr}`,
          data: {
            timestamp: now.getTime(),
            isoString: now.toISOString(),
            timezone,
          },
        };
      }
    );
  }

  /**
   * 创建计算工具
   * 使用安全的递归下降解析器替代 eval，避免代码注入风险
   */
  private createCalculateTool(): IMcpTool {
    return new McpTool(
      'calculate',
      '执行数学计算',
      [
        {
          name: 'expression',
          type: 'string',
          description: '数学表达式，如 "1 + 2 * 3"',
          required: true,
        },
      ],
      'builtin',
      async (args) => {
        const expression = args.expression as string;

        try {
          const result = safeEvalMath(expression);

          return {
            success: true,
            content: `计算结果：${expression} = ${result}`,
            data: {
              expression,
              result,
            },
          };
        } catch (error) {
          return {
            success: false,
            content: '',
            error: `计算失败：${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    );
  }

  /**
   * 创建回显工具
   */
  private createEchoTool(): IMcpTool {
    return new McpTool(
      'echo',
      '回显输入的消息',
      [
        {
          name: 'message',
          type: 'string',
          description: '要回显的消息',
          required: true,
        },
      ],
      'builtin',
      async (args) => {
        const message = args.message as string;

        return {
          success: true,
          content: `Echo: ${message}`,
          data: {
            message,
            length: message.length,
          },
        };
      }
    );
  }

  /**
   * 加载 MCP 服务器
   */
  async loadServer(config: McpServerConfig): Promise<IMcpServer> {
    if (this.servers.has(config.name)) {
      throw new McpError(
        `服务器 ${config.name} 已存在`,
        'SERVER_ALREADY_EXISTS'
      );
    }

    const server = new McpServer(config);
    this.servers.set(config.name, server);

    // 如果配置为启用，自动连接
    if (config.enabled !== false) {
      await server.connect();
    }

    return server;
  }

  /**
   * 卸载 MCP 服务器
   */
  async unloadServer(serverName: string): Promise<boolean> {
    const server = this.servers.get(serverName);
    if (!server) {
      return false;
    }

    if (server.isConnected()) {
      await server.disconnect();
    }

    return this.servers.delete(serverName);
  }

  /**
   * 获取指定服务器
   */
  getServer(serverName: string): IMcpServer | undefined {
    return this.servers.get(serverName);
  }

  /**
   * 列出所有已加载的服务器
   */
  listServers(): IMcpServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * 列出所有可用的工具（来自所有服务器）
   */
  async listAllTools(): Promise<IMcpTool[]> {
    const allTools: IMcpTool[] = [];

    for (const server of this.servers.values()) {
      if (server.isConnected()) {
        const tools = await server.listTools();
        allTools.push(...tools);
      }
    }

    return allTools;
  }

  /**
   * 执行工具
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string
  ): Promise<McpToolResult> {
    let server: IMcpServer | undefined;

    if (serverName) {
      server = this.servers.get(serverName);
      if (!server) {
        throw new McpError(
          `服务器 ${serverName} 不存在`,
          'SERVER_NOT_FOUND'
        );
      }
    } else {
      // 查找包含该工具的服务器
      for (const s of this.servers.values()) {
        if (s.isConnected()) {
          const tools = await s.listTools();
          if (tools.some((t) => t.name === toolName)) {
            server = s;
            break;
          }
        }
      }

      if (!server) {
        throw new McpError(
          `找不到工具 ${toolName}`,
          'TOOL_NOT_FOUND'
        );
      }
    }

    return await server.callTool(toolName, args);
  }

  /**
   * 根据名称查找工具
   */
  async findTool(toolName: string): Promise<IMcpTool | undefined> {
    for (const server of this.servers.values()) {
      if (server.isConnected()) {
        const tools = await server.listTools();
        const tool = tools.find((t) => t.name === toolName);
        if (tool) {
          return tool;
        }
      }
    }
    return undefined;
  }

  /**
   * 连接所有已启用的服务器
   */
  async connectAll(): Promise<void> {
    const connectPromises: Promise<void>[] = [];

    for (const server of this.servers.values()) {
      if (server.config.enabled !== false && !server.isConnected()) {
        connectPromises.push(server.connect());
      }
    }

    await Promise.all(connectPromises);
  }

  /**
   * 断开所有服务器连接
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const server of this.servers.values()) {
      if (server.isConnected()) {
        disconnectPromises.push(server.disconnect());
      }
    }

    await Promise.all(disconnectPromises);
  }

  /**
   * 重新加载指定服务器
   */
  async reloadServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new McpError(
        `服务器 ${serverName} 不存在`,
        'SERVER_NOT_FOUND'
      );
    }

    if (server.isConnected()) {
      await server.disconnect();
    }

    await server.connect();
  }
}

/**
 * MCP 管理器接口
 * 负责管理所有 MCP 服务器和工具
 */
export interface IMcpManager {
  /**
   * 加载 MCP 服务器
   * @param config 服务器配置
   */
  loadServer(config: McpServerConfig): Promise<IMcpServer>;

  /**
   * 卸载 MCP 服务器
   * @param serverName 服务器名称
   */
  unloadServer(serverName: string): Promise<boolean>;

  /**
   * 获取指定服务器
   * @param serverName 服务器名称
   */
  getServer(serverName: string): IMcpServer | undefined;

  /**
   * 列出所有已加载的服务器
   */
  listServers(): IMcpServer[];

  /**
   * 列出所有可用的工具（来自所有服务器）
   */
  listAllTools(): Promise<IMcpTool[]>;

  /**
   * 执行工具
   * @param toolName 工具名称
   * @param args 工具参数
   * @param serverName 可选，指定服务器名称
   */
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string
  ): Promise<McpToolResult>;

  /**
   * 根据名称查找工具
   * @param toolName 工具名称
   */
  findTool(toolName: string): Promise<IMcpTool | undefined>;

  /**
   * 连接所有已启用的服务器
   */
  connectAll(): Promise<void>;

  /**
   * 断开所有服务器连接
   */
  disconnectAll(): Promise<void>;

  /**
   * 重新加载指定服务器
   * @param serverName 服务器名称
   */
  reloadServer(serverName: string): Promise<void>;
}

/**
 * MCP 工具调用事件数据
 */
export interface McpToolCallEvent {
  /** 工具名称 */
  toolName: string;
  /** 服务器名称 */
  serverName: string;
  /** 调用参数 */
  args: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Timestamp;
}

/**
 * MCP 工具结果事件数据
 */
export interface McpToolResultEvent {
  /** 工具名称 */
  toolName: string;
  /** 服务器名称 */
  serverName: string;
  /** 是否成功 */
  success: boolean;
  /** 执行耗时 */
  duration: number;
  /** 时间戳 */
  timestamp: Timestamp;
}
