/**
 * @file monitor-agent-demo.ts
 * @description Aether OS - 后台监控 Agent 完整 Demo
 *
 * 本示例演示一个完整的后台监控 Agent 工作流程：
 * - 创建 Agent，配置定时任务（TaskScheduler + cron 表达式）
 * - 注册自定义任务处理器（模拟监控网站状态：成功/失败/恢复）
 * - 用 MemoryManager 记录监控结果到长期记忆
 * - 用 BudgetController 跟踪 token 使用，触发预算警告
 * - 用 globalEventBus 监听 agent.status_changed / scheduler.task_executed / budget.warning 等事件
 * - 运行一段时间后优雅停止，打印汇总报告
 *
 * 运行方式：
 *   npx tsx examples/monitor-agent-demo.ts
 *   或编译后：node dist/examples/monitor-agent-demo.js
 *
 * 注意：示例主要展示用法，监控检查为模拟数据，不需要真实网络环境。
 */

import { ProcessManager, AgentStatus } from '@aether/core';
import type { IAgent } from '@aether/core';
import { MemoryManager, MessageRole } from '@aether/memory';
import { BudgetController } from '@aether/model-router';
import { TaskScheduler, TaskStatus } from '@aether/scheduler';
import type { TaskExecutionResult } from '@aether/scheduler';
import { globalEventBus, EVENTS, now, sleep } from '@aether/shared';

// ============================================================
// 类型定义
// ============================================================

/** 监控场景类型 */
type MonitorScenario = 'success' | 'failure' | 'recovery';

/** 监控检查结果 */
interface MonitorResult {
  url: string;
  scenario: MonitorScenario;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  message: string;
}

// ============================================================
// 全局状态（用于汇总报告）
// ============================================================

const monitorResults: MonitorResult[] = [];
const eventLog: string[] = [];

/** Demo 运行时长（毫秒），任务要求 30 秒 */
const RUN_DURATION_MS = 30_000;
/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL_MS = 5_000;

// ============================================================
// 主函数
// ============================================================

async function main(): Promise<void> {
  console.log('🛡️  Aether OS - 后台监控 Agent Demo');
  console.log('='.repeat(60));
  console.log(`运行时长: ${RUN_DURATION_MS / 1000} 秒\n`);

  // ---- 1. 初始化核心组件 ----
  console.log('📦 1. 初始化核心组件');
  console.log('-'.repeat(40));

  const processManager = new ProcessManager();
  const memoryManager = new MemoryManager('monitor-agent-demo');
  const budgetController = new BudgetController();
  const taskScheduler = new TaskScheduler();

  // 设置较低的预算以便演示 budget.warning 事件
  // 每次检查消耗约 80 tokens，3 次后约 240 tokens
  // 预算设为 200，第 2 次后达 80%（触发警告），第 3 次后超 100%（触发超限）
  const AGENT_DAILY_BUDGET = 200;
  budgetController.setDailyBudget(AGENT_DAILY_BUDGET);

  console.log(`✅ ProcessManager、MemoryManager、BudgetController、TaskScheduler 已就绪`);
  console.log(`   每日 token 预算: ${AGENT_DAILY_BUDGET}（设低以演示预算警告）\n`);

  // ---- 2. 注册事件监听 ----
  console.log('📡 2. 注册事件监听');
  console.log('-'.repeat(40));

  // Agent 状态变化事件
  globalEventBus.on(EVENTS.AGENT_STATUS_CHANGED, (agentId, oldStatus, newStatus, ts) => {
    const line = `[事件] Agent 状态变化: ${oldStatus} → ${newStatus} (agent: ${agentId}, 时间: ${new Date(ts).toLocaleTimeString()})`;
    console.log(`   ${line}`);
    eventLog.push(line);
  });

  // 调度器任务创建事件
  globalEventBus.on(EVENTS.SCHEDULER_TASK_CREATED, (taskId, agentId, ts) => {
    const line = `[事件] 定时任务已创建: ${taskId} (agent: ${agentId})`;
    console.log(`   ${line}`);
    eventLog.push(line);
  });

  // 调度器任务执行完成事件
  globalEventBus.on(EVENTS.SCHEDULER_TASK_EXECUTED, (taskId, agentId, ts) => {
    const line = `[事件] 定时任务已执行: ${taskId} (agent: ${agentId}, 时间: ${new Date(ts).toLocaleTimeString()})`;
    console.log(`   ${line}`);
    eventLog.push(line);
  });

  // 调度器任务错误事件
  globalEventBus.on(EVENTS.SCHEDULER_TASK_ERROR, (taskId, agentId, error, ts) => {
    const line = `[事件] 定时任务执行出错: ${taskId} - ${error.message}`;
    console.warn(`   ⚠️  ${line}`);
    eventLog.push(line);
  });

  // 预算警告事件
  globalEventBus.on(EVENTS.BUDGET_WARNING, (currentUsage, budget, ts) => {
    const pct = ((currentUsage / budget) * 100).toFixed(1);
    const line = `[事件] 预算警告: 已用 ${currentUsage}/${budget} tokens (${pct}%)`;
    console.warn(`   ⚠️  ${line}`);
    eventLog.push(line);
  });

  // 预算超限事件
  globalEventBus.on(EVENTS.BUDGET_EXCEEDED, (currentUsage, budget, ts) => {
    const pct = ((currentUsage / budget) * 100).toFixed(1);
    const line = `[事件] 预算超限: 已用 ${currentUsage}/${budget} tokens (${pct}%)`;
    console.error(`   🚨 ${line}`);
    eventLog.push(line);
  });

  // 记忆添加事件
  globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, agentId, ts) => {
    const line = `[事件] 记忆已添加: ${memoryId} (agent: ${agentId})`;
    console.log(`   ${line}`);
    eventLog.push(line);
  });

  console.log('✅ 已注册 7 个事件监听器\n');

  // ---- 3. 创建 Agent ----
  console.log('🤖 3. 创建监控 Agent');
  console.log('-'.repeat(40));

  const agent: IAgent = await processManager.createAgent('website-monitor', {
    defaultModel: 'mock-small',
    systemPrompt: '你是一个网站监控助手，负责定期检查网站状态并记录结果。',
    memoryEnabled: true,
    toolsEnabled: true,
  });

  console.log(`✅ Agent 创建成功`);
  console.log(`   ID: ${agent.id}`);
  console.log(`   名称: ${agent.name}`);
  console.log(`   状态: ${agent.status}`);
  console.log(`   创建时间: ${new Date(agent.createdAt).toLocaleString()}\n`);

  // ---- 4. 注册自定义任务处理器 ----
  console.log('🔧 4. 注册自定义任务处理器');
  console.log('-'.repeat(40));

  // 注册 'custom' 类型的任务处理器，模拟网站监控
  taskScheduler.registerTaskHandler('custom', async (task) => {
    const url = (task.payload.url as string) || 'https://api.example.com';
    const scenario = (task.payload.scenario as MonitorScenario) || 'success';

    // 模拟监控检查
    let result: MonitorResult;
    switch (scenario) {
      case 'success':
        result = {
          url,
          scenario,
          statusCode: 200,
          responseTime: 150,
          timestamp: now(),
          message: '服务正常',
        };
        break;
      case 'failure':
        result = {
          url,
          scenario,
          statusCode: 503,
          responseTime: 5000,
          timestamp: now(),
          message: '服务不可用（超时）',
        };
        break;
      case 'recovery':
        result = {
          url,
          scenario,
          statusCode: 200,
          responseTime: 200,
          timestamp: now(),
          message: '服务已恢复',
        };
        break;
      default:
        result = {
          url,
          scenario: 'success',
          statusCode: 200,
          responseTime: 100,
          timestamp: now(),
          message: '未知场景，按正常处理',
        };
    }

    // 将检查结果存入长期记忆
    const importance = scenario === 'failure' ? 0.9 : scenario === 'recovery' ? 0.8 : 0.5;
    await memoryManager.longTerm.store(agent.id, result.message, {
      type: 'experience',
      importance,
      tags: ['monitor', scenario, url],
      metadata: {
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        url: result.url,
      },
    });

    // 同时记录到短期记忆
    memoryManager.shortTerm.addMessage({
      role: MessageRole.SYSTEM,
      content: `[监控] ${result.url} → ${result.message} (HTTP ${result.statusCode}, ${result.responseTime}ms)`,
    });

    // 跟踪 token 使用（模拟分析网站响应消耗的 token）
    const inputTokens = 60;
    const outputTokens = 20;
    await budgetController.trackUsage({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      timestamp: now(),
      model: 'mock-small',
      agentId: agent.id,
    });

    monitorResults.push(result);
    return result;
  });

  console.log("✅ 已注册 'custom' 任务处理器（模拟网站监控）\n");

  // ---- 5. 创建定时任务 ----
  console.log('⏰ 5. 创建定时任务');
  console.log('-'.repeat(40));

  // 用 cron 表达式 `*/2 * * * *`（每 2 分钟执行一次）
  // Demo 中用 executeNow 立即执行几次，不依赖 cron 触发
  const monitorTask = await taskScheduler.schedule({
    name: '网站状态监控',
    agentId: agent.id,
    description: '每 2 分钟检查一次网站状态',
    taskType: 'custom',
    cron: '*/2 * * * *',
    payload: {
      url: 'https://api.example.com',
      scenario: 'success' as MonitorScenario,
    },
    enabled: true,
  });

  console.log(`✅ 定时任务已创建`);
  console.log(`   任务 ID: ${monitorTask.id}`);
  console.log(`   任务名称: ${monitorTask.name}`);
  console.log(`   Cron 表达式: ${monitorTask.cron}（每 2 分钟）`);
  console.log(`   下次执行: ${monitorTask.nextRunAt ? new Date(monitorTask.nextRunAt).toLocaleString() : '未安排'}\n`);

  // ---- 6. 启动调度器 ----
  console.log('🚀 6. 启动调度器');
  console.log('-'.repeat(40));

  await taskScheduler.start();
  console.log(`✅ 调度器运行状态: ${taskScheduler.isRunning() ? '运行中' : '已停止'}\n`);

  // ---- 7. 立即执行 3 次监控检查（成功/失败/恢复）----
  console.log('🔍 7. 立即执行 3 次监控检查');
  console.log('-'.repeat(40));

  const scenarios: MonitorScenario[] = ['success', 'failure', 'recovery'];
  const scenarioDescriptions: Record<MonitorScenario, string> = {
    success: '网站正常响应',
    failure: '网站超时不可用',
    recovery: '网站从故障中恢复',
  };

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n   📌 第 ${i + 1} 次检查 — 场景: ${scenario}（${scenarioDescriptions[scenario]}）`);

    // 更新任务 payload 以设置本次监控场景
    await taskScheduler.updateTask(monitorTask.id, {
      payload: {
        url: 'https://api.example.com',
        scenario,
      },
    });

    // 立即执行任务
    const execResult: TaskExecutionResult = await taskScheduler.executeNow(monitorTask.id);

    if (execResult.success) {
      const result = execResult.result as MonitorResult;
      console.log(`   ✅ 检查完成: ${result.message}`);
      console.log(`      URL: ${result.url}`);
      console.log(`      状态码: ${result.statusCode}`);
      console.log(`      响应时间: ${result.responseTime}ms`);
      console.log(`      执行耗时: ${execResult.duration}ms`);
    } else {
      console.error(`   ❌ 检查失败: ${execResult.error}`);
    }
  }

  console.log('');

  // ---- 8. 搜索相关记忆 ----
  console.log('🔎 8. 搜索相关监控记忆');
  console.log('-'.repeat(40));

  const searchQuery = '网站监控 服务状态';
  console.log(`搜索查询: "${searchQuery}"\n`);

  const searchResults = await memoryManager.longTerm.search(agent.id, searchQuery, {
    topK: 5,
    threshold: 0.1,
  });

  console.log(`找到 ${searchResults.length} 条相关记忆:`);
  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    console.log(`   ${i + 1}. [相似度: ${r.similarity.toFixed(3)}] ${r.item.content}`);
    console.log(`      类型: ${r.item.type}, 重要性: ${r.item.importance}, 标签: ${r.item.tags?.join(', ') || '无'}`);
  }
  console.log('');

  // ---- 9. 打印中期报告 ----
  console.log('📊 9. 中期报告');
  console.log('-'.repeat(40));

  await printBudgetStatus(budgetController, agent.id);
  await printMemorySummary(memoryManager, agent.id);
  console.log('');

  // ---- 10. 运行 30 秒（观察调度器）----
  console.log(`⏳ 10. 调度器运行中，等待 ${RUN_DURATION_MS / 1000} 秒...`);
  console.log('-'.repeat(40));

  const heartbeats = RUN_DURATION_MS / HEARTBEAT_INTERVAL_MS;
  for (let i = 0; i < heartbeats; i++) {
    await sleep(HEARTBEAT_INTERVAL_MS);
    const usage = await budgetController.getDailyUsage(agent.id);
    const taskInfo = await taskScheduler.getTask(monitorTask.id);
    console.log(
      `   [心跳 ${i + 1}/${heartbeats}] 已运行 ${(i + 1) * (HEARTBEAT_INTERVAL_MS / 1000)}s | ` +
        `token: ${usage.totalTokens} | 任务执行次数: ${taskInfo?.runCount ?? 0} | Agent 状态: ${agent.status}`
    );
  }
  console.log('');

  // ---- 11. 优雅停止 ----
  console.log('🛑 11. 优雅停止');
  console.log('-'.repeat(40));

  // 取消定时任务
  const cancelled = await taskScheduler.cancel(monitorTask.id);
  console.log(`定时任务已取消: ${cancelled}`);

  // 停止调度器
  await taskScheduler.stop();
  console.log(`调度器运行状态: ${taskScheduler.isRunning() ? '运行中' : '已停止'}`);

  // 停止 Agent
  await processManager.stopAgent(agent.id);
  console.log(`Agent 状态: ${agent.status}`);

  // 记录关闭事件到长期记忆
  await memoryManager.longTerm.store(agent.id, '监控 Agent 已正常关闭', {
    type: 'experience',
    importance: 0.7,
    tags: ['system', 'shutdown'],
  });
  console.log('✅ 资源已清理\n');

  // ---- 12. 打印汇总报告 ----
  console.log('📋 12. 汇总报告');
  console.log('='.repeat(60));

  printSummary(agent, monitorTask.id, taskScheduler);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo 运行完成！');
  console.log('\n💡 本 Demo 展示的功能:');
  console.log('   1. Agent 生命周期管理（创建 → 运行 → 停止）');
  console.log('   2. TaskScheduler 定时任务（cron 表达式 + executeNow）');
  console.log('   3. 自定义任务处理器（模拟网站监控）');
  console.log('   4. MemoryManager 长期记忆（存储 + 检索监控结果）');
  console.log('   5. BudgetController token 预算跟踪（警告 + 超限事件）');
  console.log('   6. globalEventBus 事件驱动架构（7 种事件监听）');
  console.log('   7. 优雅停止与资源清理');
}

// ============================================================
// 辅助函数
// ============================================================

/** 打印预算状态 */
async function printBudgetStatus(
  budgetController: BudgetController,
  agentId: string
): Promise<void> {
  const dailyBudget = budgetController.getDailyBudget(agentId);
  const dailyUsage = await budgetController.getDailyUsage(agentId);
  const percentage = await budgetController.getBudgetPercentage(agentId);

  console.log('   💰 预算状态:');
  console.log(`      每日预算: ${dailyBudget} tokens`);
  console.log(`      已使用: ${dailyUsage.totalTokens} tokens (输入: ${dailyUsage.inputTokens}, 输出: ${dailyUsage.outputTokens})`);
  console.log(`      使用比例: ${(percentage * 100).toFixed(1)}%`);
  console.log(`      剩余: ${Math.max(0, dailyBudget - dailyUsage.totalTokens)} tokens`);
}

/** 打印记忆摘要 */
async function printMemorySummary(memoryManager: MemoryManager, agentId: string): Promise<void> {
  const { items, total } = await memoryManager.longTerm.list(agentId, {
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  console.log(`   🧠 记忆摘要 (共 ${total} 条):`);
  for (const item of items.slice(0, 10)) {
    console.log(
      `      - [${item.type}] ${item.content.substring(0, 40)}... (重要性: ${item.importance}, 访问: ${item.accessCount}次)`
    );
  }
  if (items.length > 10) {
    console.log(`      ... 还有 ${items.length - 10} 条`);
  }
}

/** 打印汇总报告 */
function printSummary(agent: IAgent, taskId: string, scheduler: TaskScheduler): void {
  console.log('\n--- Agent 信息 ---');
  console.log(`  ID: ${agent.id}`);
  console.log(`  名称: ${agent.name}`);
  console.log(`  最终状态: ${agent.status}`);
  console.log(`  创建时间: ${new Date(agent.createdAt).toLocaleString()}`);

  console.log('\n--- 监控检查结果 ---');
  console.log(`  总检查次数: ${monitorResults.length}`);
  const successCount = monitorResults.filter((r) => r.scenario === 'success').length;
  const failureCount = monitorResults.filter((r) => r.scenario === 'failure').length;
  const recoveryCount = monitorResults.filter((r) => r.scenario === 'recovery').length;
  console.log(`  成功: ${successCount} 次`);
  console.log(`  失败: ${failureCount} 次`);
  console.log(`  恢复: ${recoveryCount} 次`);
  for (const r of monitorResults) {
    console.log(`    • [${r.scenario}] ${r.message} (HTTP ${r.statusCode}, ${r.responseTime}ms)`);
  }

  console.log('\n--- 事件日志 ---');
  console.log(`  共记录 ${eventLog.length} 个事件`);
  for (const line of eventLog.slice(0, 20)) {
    console.log(`    ${line}`);
  }
  if (eventLog.length > 20) {
    console.log(`    ... 还有 ${eventLog.length - 20} 条事件`);
  }
}

// ============================================================
// 入口
// ============================================================

main().catch((error) => {
  console.error('❌ Demo 运行出错:', error);
  process.exit(1);
});
