import { spawn, type ChildProcess } from 'node:child_process';
import type {
  McpServerConfig,
  IMcpTool,
  McpToolParameter,
  McpToolResult,
} from './mcp.js';
import { McpError, now } from '@aether/shared';

/**
 * JSON-RPC 2.0 请求消息
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 响应消息
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * MCP 远程工具信息
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP 工具调用结果（远程返回的原始结构）
 */
interface McpCallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * 待处理的请求
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** 默认超时时间（30 秒） */
const DEFAULT_TIMEOUT = 30000;

/**
 * MCP stdio 客户端
 * 通过子进程启动 MCP 服务器，使用 JSON-RPC 2.0 over stdio 通信
 * 遵循 MCP 协议规范：https://modelcontextprotocol.io/
 */
export class StdioMcpClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private closed = false;
  private spawnError: Error | null = null;
  private readonly config: McpServerConfig;
  private readonly timeout: number;

  constructor(config: McpServerConfig) {
    this.config = config;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * 连接到 MCP 服务器（启动子进程并完成 initialize 握手）
   */
  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new McpError(
        'stdio 客户端需要 command 配置',
        'MCP_CONFIG_ERROR'
      );
    }

    if (this.process) {
      return;
    }

    const env = { ...process.env, ...this.config.env };

    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: false,
    });

    this.process.on('error', (err: Error) => {
      this.spawnError = err;
      this.failPending(
        new McpError(`MCP 进程错误: ${err.message}`, 'MCP_PROCESS_ERROR')
      );
    });

    this.process.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data);
      });
    }

    // 等待潜在的 spawn 错误浮现（error 事件在下一个 tick 触发）
    await new Promise<void>((resolve) => setImmediate(resolve));

    if (this.spawnError) {
      throw new McpError(
        `启动 MCP 进程失败: ${this.spawnError.message}`,
        'MCP_SPAWN_ERROR'
      );
    }

    // 完成 initialize 握手
    await this.initialize();
  }

  /**
   * initialize 握手
   */
  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'aether-os', version: '1.0.0' },
    });
    // 发送 initialized 通知（无需响应）
    this.sendNotification('notifications/initialized', {});
  }

  /**
   * 获取远程工具列表
   */
  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.sendRequest('tools/list', {});
    const data = result as { tools?: McpToolInfo[] };
    return data.tools ?? [];
  }

  /**
   * 调用远程工具
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return result as McpCallResult;
  }

  /**
   * 发送 JSON-RPC 请求并等待响应
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new McpError('MCP 客户端已关闭', 'MCP_CLOSED'));
        return;
      }

      if (!this.process || !this.process.stdin) {
        reject(new McpError('MCP 进程未启动', 'MCP_NOT_CONNECTED'));
        return;
      }

      if (this.spawnError) {
        reject(
          new McpError(
            `MCP 进程错误: ${this.spawnError.message}`,
            'MCP_PROCESS_ERROR'
          )
        );
        return;
      }

      const id = this.nextId++;
      const message: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new McpError(
            `MCP 请求超时: ${method} (${this.timeout}ms)`,
            'MCP_TIMEOUT'
          )
        );
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const line = JSON.stringify(message) + '\n';
      this.process.stdin.write(line, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          clearTimeout(timer);
          reject(
            new McpError(
              `写入 MCP 进程失败: ${err.message}`,
              'MCP_WRITE_ERROR'
            )
          );
        }
      });
    });
  }

  /**
   * 发送 JSON-RPC 通知（无需响应）
   */
  private sendNotification(method: string, params: unknown): void {
    if (this.closed || !this.process || !this.process.stdin) {
      return;
    }
    const message = { jsonrpc: '2.0', method, params };
    const line = JSON.stringify(message) + '\n';
    try {
      this.process.stdin.write(line);
    } catch {
      // 忽略通知写入错误
    }
  }

  /**
   * 处理子进程 stdout 数据
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf8');
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        this.handleMessage(msg);
      } catch {
        // 忽略无法解析的消息
      }
    }
  }

  /**
   * 处理 JSON-RPC 响应消息
   */
  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id === undefined || msg.id === null) {
      // 通知或无 id 消息，忽略
      return;
    }
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    this.pendingRequests.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(
        new McpError(
          `MCP 错误: ${msg.error.message}`,
          'MCP_REMOTE_ERROR',
          { code: msg.error.code, data: msg.error.data }
        )
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  /**
   * 处理子进程退出
   */
  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.closed) {
      // close() 触发的退出，无需处理
      return;
    }
    this.closed = true;
    this.failPending(
      new McpError(
        `MCP 进程意外退出: code=${code}, signal=${signal}`,
        'MCP_PROCESS_EXIT'
      )
    );
  }

  /**
   * 使所有待处理请求失败
   */
  private failPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * 优雅关闭子进程
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    // 先让待处理请求失败
    this.failPending(new McpError('MCP 客户端已关闭', 'MCP_CLOSED'));

    const proc = this.process;
    if (!proc) {
      return;
    }

    // 尝试优雅关闭 stdin 并发送 SIGTERM
    try {
      proc.stdin?.end();
    } catch {
      // 忽略
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // 忽略
        }
        finish();
      }, 1000);

      proc.once('exit', () => {
        clearTimeout(killTimer);
        finish();
      });

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(killTimer);
        finish();
      }
    });

    this.process = null;
  }
}

/**
 * 将 JSON Schema 转换为 McpToolParameter 数组
 */
function convertSchemaToParameters(
  schema?: Record<string, unknown>
): McpToolParameter[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return [];
  const required = (schema.required as string[] | undefined) ?? [];

  const params: McpToolParameter[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') continue;
    params.push({
      name,
      type: (prop.type as McpToolParameter['type']) ?? 'string',
      description: prop.description as string | undefined,
      required: required.includes(name),
      default: prop.default,
      enum: prop.enum as unknown[] | undefined,
    });
  }
  return params;
}

/**
 * 远程 MCP 工具适配器
 * 包装远程 MCP 服务器上的工具，实现 IMcpTool 接口
 */
export class RemoteMcpTool implements IMcpTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: McpToolParameter[];
  readonly serverName: string;
  readonly inputSchema?: Record<string, unknown>;
  private readonly client: StdioMcpClient;

  constructor(
    client: StdioMcpClient,
    serverName: string,
    info: McpToolInfo
  ) {
    this.client = client;
    this.serverName = serverName;
    this.name = info.name;
    this.description = info.description ?? '';
    this.inputSchema = info.inputSchema;
    this.parameters = convertSchemaToParameters(info.inputSchema);
  }

  /**
   * 执行远程工具
   */
  async execute(args: Record<string, unknown>): Promise<McpToolResult> {
    const startTime = now();
    try {
      const result = await this.client.callTool(this.name, args);
      const textParts: string[] = [];
      for (const item of result.content ?? []) {
        if (item.type === 'text' && item.text !== undefined) {
          textParts.push(item.text);
        }
      }
      const content = textParts.join('\n');
      return {
        success: !result.isError,
        content,
        duration: now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        duration: now() - startTime,
      };
    }
  }
}
