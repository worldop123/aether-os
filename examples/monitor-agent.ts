/**
 * Aether OS - 监控 Agent 示例
 * 
 * 这个示例展示了如何使用 Aether OS 的核心功能：
 * - Agent 生命周期管理
 * - 记忆系统（短期记忆 + 长期记忆）
 * - 模型路由与预算控制
 * - MCP 工具调用
 * - 定时任务调度
 * - 事件监听
 */

import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, BudgetController, MockModelProvider } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { TaskScheduler } from '@aether/scheduler';
import { globalEventBus } from '@aether/shared';

/**
 * 监控 Agent 类
 * 用于定期监控系统状态并记录重要信息
 */
class MonitorAgent {
  private agentId: string;
  private processManager: ProcessManager;
  private memoryManager: MemoryManager;
  private modelRouter: ModelRouter;
  private budgetController: BudgetController;
  private mcpManager: McpManager;
  private taskScheduler: TaskScheduler;
  private taskId?: string;

  constructor(agentName: string) {
    this.agentId = agentName;
    
    // 初始化核心组件
    this.processManager = new ProcessManager();
    this.memoryManager = new MemoryManager(this.agentId);
    this.modelRouter = new ModelRouter();
    this.budgetController = new BudgetController();
    this.mcpManager = new McpManager();
    this.taskScheduler = new TaskScheduler();

    // 注册模型提供商
    this.modelRouter.registerProvider(new MockModelProvider());

    // 注册事件监听器
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听 Agent 事件
    globalEventBus.on('agent.started', (agentId) => {
      console.log(`[事件] Agent ${agentId} 已启动`);
    });

    globalEventBus.on('agent.stopped', (agentId) => {
      console.log(`[事件] Agent ${agentId} 已停止`);
    });

    // 监听记忆事件
    globalEventBus.on('memory.added', (memoryId, agentId) => {
      console.log(`[事件] 记忆 ${memoryId} 已添加到 Agent ${agentId}`);
    });

    // 监听模型事件
    globalEventBus.on('model.request', (model, inputTokens) => {
      console.log(`[事件] 模型 ${model} 请求，输入 tokens: ${inputTokens}`);
    });

    globalEventBus.on('budget.warning', (currentUsage, budget) => {
      console.warn(`[警告] 预算使用已达 ${((currentUsage / budget) * 100).toFixed(1)}%`);
    });

    // 监听 MCP 事件
    globalEventBus.on('mcp.tool_called', (toolName, serverName) => {
      console.log(`[事件] 工具 ${toolName} 被调用（服务器: ${serverName}）`);
    });

    // 监听调度器事件
    globalEventBus.on('scheduler.task_executed', (taskId, agentId) => {
      console.log(`[事件] 任务 ${taskId} 已执行（Agent: ${agentId}）`);
    });
  }

  /**
   * 初始化监控 Agent
   */
  async initialize(): Promise<void> {
    console.log('=== 初始化监控 Agent ===');

    // 创建 Agent
    const agent = await this.processManager.createAgent(this.agentId, {
      defaultModel: 'mock-small',
      systemPrompt: '你是一个系统监控助手，负责监控系统状态并记录重要信息。',
    });

    console.log(`Agent 创建成功: ${agent.id}`);
    console.log(`Agent 状态: ${agent.getStatus()}`);

    // 存储初始记忆
    await this.memoryManager.longTerm.store(this.agentId, '监控 Agent 已初始化完成', {
      type: 'experience',
      importance: 0.7,
      tags: ['system', 'initialization'],
    });

    console.log('初始记忆已存储');
  }

  /**
   * 执行系统检查
   */
  async performSystemCheck(): Promise<void> {
    console.log('\n=== 执行系统检查 ===');

    // 使用 MCP 工具获取当前时间
    const timeResult = await this.mcpManager.executeTool('get_current_time', {}, 'builtin');
    console.log('当前时间:', timeResult);

    // 使用 MCP 工具进行计算
    const calcResult = await this.mcpManager.executeTool('calculate', { expression: '2 + 3 * 4' }, 'builtin');
    console.log('计算结果:', calcResult);

    // 记录检查结果到短期记忆
    this.memoryManager.shortTerm.addMessage({
      role: 'system',
      content: `系统检查完成 - 时间: ${new Date().toISOString()}`,
    });

    // 将重要信息保存到长期记忆
    await this.memoryManager.longTerm.store(this.agentId, `系统检查正常 - ${new Date().toLocaleString()}`, {
      type: 'experience',
      importance: 0.5,
      tags: ['system', 'check'],
    });

    // 获取当前上下文
    const context = await this.memoryManager.getFullContext('系统检查', {
      maxShortTerm: 5,
      maxLongTerm: 3,
    });

    console.log(`当前上下文包含 ${context.length} 条消息`);
  }

  /**
   * 启动定时监控任务
   */
  startMonitoring(intervalMinutes: number = 5): void {
    console.log('\n=== 启动定时监控任务 ===');

    // 创建定时任务
    const task = this.taskScheduler.schedule({
      name: '系统监控',
      agentId: this.agentId,
      cron: `*/${intervalMinutes} * * * *`, // 每 N 分钟执行一次
      taskType: 'custom',
      payload: {
        action: 'system_check',
      },
      enabled: true,
    });

    this.taskId = task.id;
    console.log(`定时任务已创建: ${task.id}`);
    console.log(`执行频率: 每 ${intervalMinutes} 分钟`);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.taskId) {
      this.taskScheduler.cancel(this.taskId);
      console.log(`定时任务 ${this.taskId} 已取消`);
    }
  }

  /**
   * 查看预算状态
   */
  async printBudgetStatus(): Promise<void> {
    console.log('\n=== 预算状态 ===');
    
    const dailyBudget = this.budgetController.getDailyBudget();
    const dailyUsage = await this.budgetController.getDailyUsage();
    const percentage = await this.budgetController.getBudgetPercentage();

    console.log(`每日预算: ${dailyBudget} tokens`);
    console.log(`今日使用: ${dailyUsage.totalTokens} tokens`);
    console.log(`使用比例: ${(percentage * 100).toFixed(1)}%`);
    console.log(`剩余: ${dailyBudget - dailyUsage.totalTokens} tokens`);
  }

  /**
   * 列出所有记忆
   */
  async listMemories(): Promise<void> {
    console.log('\n=== 长期记忆列表 ===');

    const { items, total } = await this.memoryManager.longTerm.list(this.agentId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    console.log(`共 ${total} 条记忆:`);
    for (const item of items) {
      console.log(`  - [${item.type}] ${item.content.substring(0, 50)}... (重要性: ${item.importance})`);
    }
  }

  /**
   * 搜索相关记忆
   */
  async searchMemories(query: string): Promise<void> {
    console.log(`\n=== 搜索记忆: "${query}" ===`);

    const results = await this.memoryManager.longTerm.search(this.agentId, query, {
      topK: 5,
      threshold: 0.3,
    });

    console.log(`找到 ${results.length} 条相关记忆:`);
    for (const result of results) {
      console.log(`  - [相似度: ${result.similarity.toFixed(3)}] ${result.item.content.substring(0, 60)}...`);
    }
  }

  /**
   * 关闭监控 Agent
   */
  async shutdown(): Promise<void> {
    console.log('\n=== 关闭监控 Agent ===');

    this.stopMonitoring();

    // 停止 Agent
    await this.processManager.stopAgent(this.agentId);

    // 保存最终状态到记忆
    await this.memoryManager.longTerm.store(this.agentId, '监控 Agent 已关闭', {
      type: 'experience',
      importance: 0.6,
      tags: ['system', 'shutdown'],
    });

    console.log('监控 Agent 已关闭');
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('Aether OS - 监控 Agent 示例');
  console.log('============================\n');

  // 创建监控 Agent
  const monitor = new MonitorAgent('system-monitor');

  try {
    // 初始化
    await monitor.initialize();

    // 执行系统检查
    await monitor.performSystemCheck();

    // 查看预算状态
    await monitor.printBudgetStatus();

    // 列出记忆
    await monitor.listMemories();

    // 搜索记忆
    await monitor.searchMemories('系统');

    // 启动定时监控（演示用，实际会每分钟执行）
    monitor.startMonitoring(1);

    // 等待一下，观察事件
    console.log('\n等待 2 秒观察定时任务...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 关闭
    await monitor.shutdown();

    console.log('\n=== 示例运行完成 ===');
    console.log('这个示例展示了 Aether OS 的核心功能：');
    console.log('  1. Agent 生命周期管理');
    console.log('  2. 短期记忆和长期记忆系统');
    console.log('  3. 模型路由与预算控制');
    console.log('  4. MCP 工具调用');
    console.log('  5. 定时任务调度');
    console.log('  6. 事件驱动架构');

  } catch (error) {
    console.error('运行出错:', error);
    await monitor.shutdown();
    process.exit(1);
  }
}

// 运行示例
main();
