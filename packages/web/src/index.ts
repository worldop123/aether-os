/**
 * @aether/web - Aether OS Web 管理界面模块
 *
 * 提供基于 Node.js 原生 http 模块的 Web 管理界面，
 * 支持 Agent 状态/记忆/日志查看和可视化任务调度。
 */

export { WebServer } from './server.js';
export type { WebServerOptions } from './server.js';
export { ApiRouter } from './api.js';
export type { ApiDeps } from './api.js';
