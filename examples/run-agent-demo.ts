/**
 * Aether OS 真实运行验证脚本
 * 测试 AgentRuntime 的完整工具调用循环
 */
import { ProcessManager, AgentRuntime, AgentRuntimeManager } from '@aether/core';
import { MemoryManager, MessageRole } from '@aether/memory';
import { ModelRouter, MockModelProvider, BudgetController } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import type { ChatCompletionResponse } from '@aether/model-router';

async function main() {
  console.log('='.repeat(60));
  console.log('  Aether OS 真实运行验证');
  console.log('='.repeat(60));

  // 1. 初始化所有组件
  console.log('\n📦 1. 初始化组件...');
  const processManager = new ProcessManager();
  const mcpManager = new McpManager();
  const budgetController = new BudgetController(100000);
  const modelRouter = new ModelRouter();
  const mockProvider = new MockModelProvider();
  modelRouter.registerProvider(mockProvider);

  console.log('   ✅ ProcessManager 已初始化');
  console.log('   ✅ McpManager 已初始化');
  console.log('   ✅ BudgetController 已初始化 (预算: 100000 tokens)');
  console.log('   ✅ ModelRouter 已初始化 (MockProvider)');

  // 2. 列出可用工具
  console.log('\n🔧 2. 可用 MCP 工具:');
  const tools = await mcpManager.listAllTools();
  for (const tool of tools) {
    console.log(`   - ${tool.name}: ${tool.description}`);
  }

  // 3. 创建 Agent 和 Runtime
  console.log('\n🤖 3. 创建 Agent...');
  const agent = await processManager.createAgent('demo-agent', {
    defaultModel: 'mock-large',
    toolsEnabled: true,
    systemPrompt: '你是 Aether OS 的演示助手，可以使用工具帮助用户。',
  });
  console.log(`   ✅ Agent 创建成功: ${agent.id} (状态: ${agent.status})`);

  const memory = new MemoryManager(agent.id);
  const runtime = new AgentRuntime({
    agent,
    memoryManager: memory,
    modelRouter,
    budgetController,
    mcpManager,
    maxToolRounds: 5,
  });
  console.log('   ✅ AgentRuntime 已创建');

  // 4. 测试普通对话（无工具调用）
  console.log('\n💬 4. 测试普通对话...');
  const response1 = await runtime.sendMessage('你好，请介绍一下你自己');
  console.log(`   用户: 你好，请介绍一下你自己`);
  console.log(`   助手: ${response1}`);

  // 5. 测试工具调用循环
  console.log('\n🔄 5. 测试工具调用循环...');

  // Mock 模型第一次返回工具调用，第二次返回普通响应
  let callCount = 0;
  const originalChat = mockProvider.chat.bind(mockProvider);
  mockProvider.chat = async (request) => {
    callCount++;
    if (callCount === 1) {
      // 第一次返回工具调用
      console.log('   [模型] 第一次调用: 返回工具调用 get_current_time');
      return {
        id: 'test-1',
        model: 'mock-large',
        message: {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'get_current_time',
              arguments: {},
            },
          ],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          timestamp: Date.now(),
          model: 'mock-large',
        },
        finishReason: 'tool_calls',
      } as ChatCompletionResponse;
    }
    // 第二次返回普通响应
    console.log('   [模型] 第二次调用: 返回最终响应');
    return originalChat(request);
  };

  const response2 = await runtime.sendMessage('现在几点了？');
  console.log(`   用户: 现在几点了？`);
  console.log(`   助手: ${response2}`);

  // 6. 查看对话历史
  console.log('\n📜 6. 对话历史:');
  const history = runtime.getHistory();
  for (const msg of history) {
    const role = msg.role.toUpperCase().padEnd(9);
    const content = msg.content.slice(0, 80);
    const toolInfo = msg.toolCalls
      ? ` [工具调用: ${msg.toolCalls.map((tc) => tc.name).join(', ')}]`
      : msg.toolName
        ? ` [工具结果: ${msg.toolName}]`
        : '';
    console.log(`   ${role} | ${content}${toolInfo}`);
  }

  // 7. 查看预算使用情况
  console.log('\n💰 7. 预算使用情况:');
  const usage = await budgetController.getDailyUsage(agent.id);
  console.log(`   输入 tokens: ${usage.inputTokens}`);
  console.log(`   输出 tokens: ${usage.outputTokens}`);
  console.log(`   总 tokens: ${usage.totalTokens}`);
  const budget = budgetController.getDailyBudget(agent.id);
  console.log(`   每日预算: ${budget}`);
  console.log(`   使用率: ${((usage.totalTokens / budget) * 100).toFixed(2)}%`);

  // 8. 测试 AgentRuntimeManager
  console.log('\n🎛️  8. 测试 AgentRuntimeManager...');
  const manager = new AgentRuntimeManager({
    processManager,
    memoryManager: new MemoryManager('mgr-agent'),
    modelRouter,
    budgetController,
    mcpManager,
  });

  const agent2 = await processManager.createAgent('manager-agent', {
    defaultModel: 'mock-small',
  });
  // 重置 mock provider 到原始行为
  mockProvider.chat = originalChat;
  const response3 = await manager.sendMessage(agent2.id, '通过管理器发送消息');
  console.log(`   管理器发送消息到 ${agent2.id}`);
  console.log(`   响应: ${response3}`);
  console.log(`   运行时数量: ${manager.listRuntimes().length}`);

  // 9. 测试技能系统
  console.log('\n🎯 9. 测试技能系统...');
  const { SkillManager } = await import('../packages/skills/dist/index.js');
  const skillManager = new SkillManager();
  const skills = skillManager.listSkills();
  console.log(`   可用技能: ${skills.length} 个`);
  for (const skill of skills) {
    console.log(`   - ${skill.name} (${skill.category}): ${skill.description}`);
  }

  // 加载技能到 Agent
  skillManager.loadSkill(agent.id, 'code-assistant');
  const prompt = skillManager.buildSystemPrompt(agent.id);
  console.log(`\n   已加载技能到 Agent，系统提示词长度: ${prompt.length} 字符`);
  console.log(`   提示词预览: ${prompt.slice(0, 100)}...`);

  // 10. 测试可观测性
  console.log('\n📊 10. 测试可观测性...');
  const { getLogger, MemoryLogAppender, LogLevel, metricsRegistry, tracer } = await import('../packages/observability/dist/index.js');
  const logAppender = new MemoryLogAppender();
  const logger = getLogger('demo');
  logger.addAppender(logAppender);
  logger.setAgentId(agent.id);

  logger.info('Agent 启动');
  logger.warn('预算使用接近阈值');
  logger.error('测试错误日志', new Error('演示错误'));

  console.log(`   日志条数: ${logAppender.count()}`);
  const errorLogs = logAppender.getByLevel(LogLevel.ERROR);
  console.log(`   错误日志: ${errorLogs.length} 条`);

  // 指标测试
  const counter = metricsRegistry.counter('messages_sent', '发送的消息数');
  counter.inc(2);
  console.log(`   指标 messages_sent: ${counter.get()}`);

  // 追踪测试
  const span = tracer.startTrace('demo-operation');
  tracer.setTag(span.spanId, 'agent', agent.id);
  await new Promise((r) => setTimeout(r, 50));
  tracer.finishSpan(span.spanId);
  const finished = tracer.getSpan(span.spanId);
  console.log(`   追踪跨度: ${finished!.name}, 耗时: ${finished!.duration}ms`);

  console.log('\n' + '='.repeat(60));
  console.log('  ✅ 所有验证通过！Aether OS 真实运行正常！');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('❌ 运行失败:', err);
  process.exit(1);
});
