/**
 * Web UI 服务器启动脚本
 */
import { WebServer } from '@aether/web';
import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { TaskScheduler } from '@aether/scheduler';

async function main() {
  const pm = new ProcessManager();
  const mm = new MemoryManager('web-agent');
  const mr = new ModelRouter();
  mr.registerProvider(new MockModelProvider());
  const bc = new BudgetController(100000);
  const mcp = new McpManager();
  const ts = new TaskScheduler();
  await ts.start();

  // 预创建一个 Agent
  const agent = await pm.createAgent('web-demo-agent', {
    defaultModel: 'mock-small',
  });
  console.log(`Agent 已创建: ${agent.id}`);

  const server = new WebServer({
    processManager: pm,
    memoryManager: mm,
    modelRouter: mr,
    budgetController: bc,
    mcpManager: mcp,
    taskScheduler: ts,
    port: 3456,
    host: '127.0.0.1',
  });

  await server.start();
  console.log('Web 服务器已启动: http://127.0.0.1:3456');
  console.log('按 Ctrl+C 停止');
}

main().catch(console.error);
