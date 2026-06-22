/**
 * 基础 Agent 使用示例
 * 
 * 这个示例展示了如何使用 Aether OS 的核心功能：
 * - 创建和管理 Agent
 * - 使用记忆系统
 * - 调用模型
 * - 使用 MCP 工具
 */

import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { globalEventBus, EVENTS } from '@aether/shared';

async function main() {
  console.log('🚀 Aether OS - 基础 Agent 示例');
  console.log('='.repeat(50));

  // 1. 初始化组件
  console.log('\n📦 初始化组件...');
  
  const processManager = new ProcessManager();
  const memoryManager = new MemoryManager('demo-agent');
  const modelRouter = new ModelRouter();
  const budgetController = new BudgetController();
  const mcpManager = new McpManager();

  // 注册模型提供商
  modelRouter.registerProvider(new MockModelProvider());

  console.log('✅ 组件初始化完成');

  // 2. 监听事件
  console.log('\n📡 设置事件监听...');
  
  globalEventBus.on(EVENTS.AGENT_STATUS_CHANGED, (agentId, oldStatus, newStatus) => {
    console.log(`   [事件] Agent ${agentId} 状态: ${oldStatus} → ${newStatus}`);
  });

  globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, agentId) => {
    console.log(`   [事件] 新记忆添加: ${memoryId}`);
  });

  console.log('✅ 事件监听已设置');

  // 3. 创建 Agent
  console.log('\n🤖 创建 Agent...');
  
  const agent = await processManager.createAgent('demo-agent', {
    defaultModel: 'mock-small',
    systemPrompt: '你是一个友好的助手，乐于助人。',
    temperature: 0.7,
    maxTokens: 1000,
  });

  console.log(`✅ Agent 创建成功`);
  console.log(`   ID: ${agent.id}`);
  console.log(`   名称: ${agent.name}`);
  console.log(`   状态: ${agent.status}`);
  console.log(`   创建时间: ${new Date(agent.createdAt).toLocaleString()}`);

  // 4. 添加记忆
  console.log('\n🧠 添加记忆...');

  // 添加短期记忆（对话历史）
  memoryManager.shortTerm.addMessage({
    role: 'user',
    content: '你好，我叫小明，我是一名软件工程师。',
  });

  memoryManager.shortTerm.addMessage({
    role: 'assistant',
    content: '你好小明！很高兴认识你。作为软件工程师，你今天想聊些什么呢？',
  });

  console.log('   ✅ 已添加 2 条短期记忆');

  // 添加长期记忆
  await memoryManager.longTerm.store(agent.id, '用户叫小明，是软件工程师', {
    type: 'fact',
    importance: 0.9,
  });

  await memoryManager.longTerm.store(agent.id, '用户喜欢咖啡和编程', {
    type: 'preference',
    importance: 0.7,
  });

  await memoryManager.longTerm.store(agent.id, '用户使用 JavaScript 和 TypeScript', {
    type: 'fact',
    importance: 0.8,
  });

  console.log('   ✅ 已添加 3 条长期记忆');

  // 5. 搜索记忆
  console.log('\n🔍 搜索记忆...');

  const results = await memoryManager.longTerm.search(agent.id, '编程语言', {
    threshold: 0.3,
    topK: 5,
  });

  console.log(`   找到 ${results.length} 条相关记忆:`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. [${result.item.type}] ${result.item.content} (相似度: ${result.similarity.toFixed(2)})`);
  });

  // 6. 获取完整上下文
  console.log('\n📝 获取完整上下文...');

  const fullContext = await memoryManager.getFullContext('用户背景');
  console.log(`   完整上下文包含 ${fullContext.length} 条消息`);
  fullContext.forEach((msg, index) => {
    console.log(`   ${index + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
  });

  // 7. 调用模型
  console.log('\n🤖 调用模型...');

  const response = await modelRouter.route({
    messages: [
      { role: 'system', content: '你是一个友好的助手' },
      { role: 'user', content: '请介绍一下你自己' },
    ],
    model: 'mock-small',
  });

  console.log(`   ✅ 模型响应`);
  console.log(`   模型: ${response.model}`);
  console.log(`   回复: ${response.message.content}`);
  console.log(`   Token 使用: ${response.usage.totalTokens}`);

  // 8. 记录预算
  console.log('\n💰 记录预算...');

  await budgetController.trackUsage({
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.totalTokens,
    timestamp: Date.now(),
    model: response.model,
    agentId: agent.id,
  });

  const budgetStatus = await budgetController.getBudgetPercentage();
  console.log(`   今日预算使用: ${budgetStatus.toFixed(2)}%`);

  // 9. 使用 MCP 工具
  console.log('\n🔧 使用 MCP 工具...');

  // 列出所有工具
  const tools = await mcpManager.listAllTools();
  console.log(`   可用工具: ${tools.map(t => t.name).join(', ')}`);

  // 执行计算器工具
  const calcResult = await mcpManager.executeTool('calculate', {
    expression: '2 + 3 * 4',
  });

  if (calcResult.success) {
    console.log(`   计算器结果: 2 + 3 * 4 = ${(calcResult.data as any).result}`);
  }

  // 执行获取时间工具
  const timeResult = await mcpManager.executeTool('get_current_time', {
    timezone: 'Asia/Shanghai',
  });

  if (timeResult.success) {
    console.log(`   当前时间: ${timeResult.content}`);
  }

  // 10. 暂停和恢复 Agent
  console.log('\n⏸️  暂停 Agent...');
  await processManager.pauseAgent(agent.id);
  console.log(`   当前状态: ${agent.status}`);

  console.log('\n▶️  恢复 Agent...');
  await processManager.resumeAgent(agent.id);
  console.log(`   当前状态: ${agent.status}`);

  // 11. 列出所有 Agent
  console.log('\n📋 列出所有 Agent...');
  const agents = processManager.listAgents();
  console.log(`   共 ${agents.length} 个 Agent:`);
  agents.forEach(a => {
    console.log(`   - ${a.name} (${a.id}) [${a.status}]`);
  });

  // 12. 停止 Agent
  console.log('\n🛑 停止 Agent...');
  await processManager.stopAgent(agent.id);
  console.log(`   当前状态: ${agent.status}`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ 示例运行完成！');
  console.log('\n💡 提示:');
  console.log('   - 停止后的 Agent 不能重新启动（终态设计）');
  console.log('   - 所有状态变化都会触发事件');
  console.log('   - 记忆系统支持短期和长期两种类型');
  console.log('   - MCP 工具可以轻松扩展');
}

main().catch(console.error);
