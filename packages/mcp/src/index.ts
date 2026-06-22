/**
 * @aether/mcp - Aether OS MCP 工具系统模块
 *
 * 包含 MCP 服务器管理和工具调用的接口定义
 */

export { McpServerStatus, McpTool, McpServer, McpManager } from './mcp.js';
export { StdioMcpClient, RemoteMcpTool } from './stdio-client.js';
export type { McpToolInfo } from './stdio-client.js';
export type {
  McpToolParameter,
  IMcpTool,
  McpToolResult,
  McpServerConfig,
  IMcpServer,
  IMcpManager,
  McpToolCallEvent,
  McpToolResultEvent,
} from './mcp.js';
