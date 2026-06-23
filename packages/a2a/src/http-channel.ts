import type { ID } from '@aether/shared';
import { now, generateId, globalEventBus } from '@aether/shared';
import type { A2AMessage, IA2AChannel } from './types.js';
import type { MessageHandler } from './channel.js';

/**
 * HTTP A2A 通道配置
 */
export interface HttpA2AChannelConfig {
  /** 本节点的 Agent ID */
  agentId: ID;
  /** 本节点 HTTP 服务器监听端口 */
  port?: number;
  /** 本节点主机地址 */
  host?: string;
  /** 远程节点注册表：agentId -> url */
  remoteEndpoints?: Map<ID, string>;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 自定义 fetch 实现（用于测试） */
  fetchImpl?: typeof fetch;
}

/**
 * HTTP A2A 通道
 * 基于 HTTP 协议实现跨进程/跨机器的 Agent 通信
 *
 * 工作原理：
 * - 每个节点启动一个 HTTP 服务器接收消息
 * - 发送消息时，根据目标 Agent ID 查找远程端点 URL
 * - 通过 HTTP POST 发送消息到远程端点
 * - 广播消息发送给所有已知的远程端点
 */
export class HttpA2AChannel implements IA2AChannel {
  readonly agentId: ID;
  private port: number;
  private host: string;
  private timeout: number;
  private fetchImpl: typeof fetch;
  private remoteEndpoints: Map<ID, string>;
  private handlers: MessageHandler[] = [];
  private server?: any;
  private closed: boolean = false;

  constructor(config: HttpA2AChannelConfig) {
    this.agentId = config.agentId;
    this.port = config.port ?? 0; // 0 表示随机端口
    this.host = config.host ?? '127.0.0.1';
    this.timeout = config.timeout ?? 5000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.remoteEndpoints = new Map(config.remoteEndpoints ?? []);
  }

  /**
   * 启动 HTTP 服务器
   */
  async start(): Promise<void> {
    if (this.server) return;

    // 使用 Node.js http 模块
    const http = await import('node:http');
    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }

      if (req.url !== '/a2a/message') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      try {
        const body = await this.readBody(req);
        const message = JSON.parse(body) as A2AMessage;

        // 触发接收事件
        globalEventBus.emit(
          'a2a.message_received',
          message.id,
          message.from,
          String(message.to),
          now()
        );

        // 调用本地处理器
        for (const handler of [...this.handlers]) {
          try {
            handler(message);
          } catch {
            // 处理器异常不影响其他处理器
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });

    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(this.port, this.host, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.server = server;
        resolve();
      });
    });
  }

  /**
   * 注册消息处理器
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * 移除消息处理器
   */
  offMessage(handler: MessageHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  /**
   * 发送消息
   */
  async send(message: A2AMessage): Promise<void> {
    if (this.closed) {
      throw new Error('通道已关闭');
    }

    globalEventBus.emit(
      'a2a.message_sent',
      message.id,
      message.from,
      String(message.to),
      now()
    );

    if (message.to === '*') {
      // 广播：发送给所有远程端点
      await this.broadcast(message);
    } else {
      // 单播：发送给指定 Agent
      await this.unicast(message);
    }
  }

  /**
   * 单播消息
   */
  private async unicast(message: A2AMessage): Promise<void> {
    const url = this.remoteEndpoints.get(message.to as ID);
    if (!url) {
      throw new Error(`未找到 Agent ${message.to} 的远程端点`);
    }

    await this.post(url, message);
  }

  /**
   * 广播消息
   */
  private async broadcast(message: A2AMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [agentId, url] of this.remoteEndpoints) {
      if (agentId === message.from) continue;

      promises.push(
        this.post(url, message).catch(() => {
          // 广播失败不阻塞其他发送
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * 发送 HTTP POST 请求
   */
  private async post(url: string, message: A2AMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(`${url}/a2a/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 读取请求体
   */
  private readBody(req: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  /**
   * 注册远程端点
   */
  registerEndpoint(agentId: ID, url: string): void {
    this.remoteEndpoints.set(agentId, url);
  }

  /**
   * 注销远程端点
   */
  unregisterEndpoint(agentId: ID): boolean {
    return this.remoteEndpoints.delete(agentId);
  }

  /**
   * 获取本节点的 URL
   */
  getLocalUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * 获取本节点监听端口
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 获取所有已注册的远程端点
   */
  getRemoteEndpoints(): Map<ID, string> {
    return new Map(this.remoteEndpoints);
  }

  /**
   * 关闭通道
   */
  async close(): Promise<void> {
    this.closed = true;
    this.handlers.length = 0;

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
      this.server = undefined;
    }
  }

  /**
   * 检查是否已关闭
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * 创建 HTTP A2A 通道并自动启动
 */
export async function createHttpChannel(
  config: HttpA2AChannelConfig
): Promise<HttpA2AChannel> {
  const channel = new HttpA2AChannel(config);
  await channel.start();
  return channel;
}
