import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname, resolve, normalize } from 'node:path';
import type { ProcessManager } from '@aether/core';
import type { MemoryManager } from '@aether/memory';
import type { ModelRouter, BudgetController } from '@aether/model-router';
import type { McpManager } from '@aether/mcp';
import type { TaskScheduler } from '@aether/scheduler';
import { now } from '@aether/shared';
import { ApiRouter } from './api.js';

/**
 * Web 服务器选项
 */
export interface WebServerOptions {
  port?: number;
  host?: string;
  processManager: ProcessManager;
  memoryManager: MemoryManager;
  modelRouter: ModelRouter;
  budgetController: BudgetController;
  mcpManager: McpManager;
  taskScheduler: TaskScheduler;
}

/**
 * 静态文件 MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * 读取请求体
 */
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolveBody({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是有效的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Web 服务器类
 * 基于 Node.js 原生 http 模块实现，不引入 express
 */
export class WebServer {
  private readonly port: number;
  private readonly host: string;
  private readonly server: http.Server;
  private readonly apiRouter: ApiRouter;
  private readonly startTime: number;
  private readonly publicDir: string;
  private listening: boolean = false;

  constructor(options: WebServerOptions) {
    this.port = options.port ?? 3000;
    this.host = options.host ?? 'localhost';
    this.startTime = now();
    this.apiRouter = new ApiRouter({
      processManager: options.processManager,
      memoryManager: options.memoryManager,
      modelRouter: options.modelRouter,
      budgetController: options.budgetController,
      mcpManager: options.mcpManager,
      taskScheduler: options.taskScheduler,
      startTime: this.startTime,
    });
    this.publicDir = fileURLToPath(new URL('./public/', import.meta.url));
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        res.end(JSON.stringify({ error: message }));
      });
    });
  }

  /**
   * 启动 Web 服务器
   */
  async start(): Promise<void> {
    if (this.listening) return;
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        this.listening = true;
        resolve();
      });
    });
  }

  /**
   * 停止 Web 服务器
   */
  async stop(): Promise<void> {
    if (!this.listening) return;
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        this.listening = false;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 获取服务器 URL
   */
  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 设置 CORS 头
    this.setCorsHeaders(res);

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.searchParams;
    const method = req.method || 'GET';

    // API 路由
    if (pathname.startsWith('/api/')) {
      let body: Record<string, unknown> = {};
      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        try {
          body = await readBody(req);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '请求体不是有效的 JSON', code: 'INVALID_JSON' }));
          return;
        }
      }
      await this.apiRouter.handle(req, res, pathname, method, query, body);
      return;
    }

    // 静态文件服务
    await this.serveStatic(res, pathname);
  }

  /**
   * 设置 CORS 头
   */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * 提供静态文件服务
   */
  private async serveStatic(
    res: http.ServerResponse,
    pathname: string
  ): Promise<void> {
    // 根路径映射到 index.html
    let filePath = pathname === '/' ? '/index.html' : pathname;

    // 安全：规范化路径，防止目录遍历
    const resolved = resolve(this.publicDir, normalize(filePath).replace(/^\//, ''));

    // 确保解析后的路径在 publicDir 内
    if (!resolved.startsWith(this.publicDir)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '禁止访问', code: 'FORBIDDEN' }));
      return;
    }

    try {
      const content = await readFile(resolved);
      const ext = extname(resolved).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      // 文件不存在，返回 index.html（SPA 回退）
      try {
        const indexPath = join(this.publicDir, 'index.html');
        const indexContent = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexContent);
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '资源不存在', code: 'NOT_FOUND' }));
      }
    }
  }
}
