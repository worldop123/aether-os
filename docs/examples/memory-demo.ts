/**
 * 记忆系统演示
 * 
 * 这个示例展示了 Aether OS 记忆系统的完整功能：
 * - 短期记忆（对话上下文）
 * - 长期记忆（持久化存储 + 检索）
 * - 记忆管理器（统一管理）
 * - 记忆巩固（短期 → 长期）
 */

import { MemoryManager, ShortTermMemory, LongTermMemory } from '@aether/memory';
import { globalEventBus, EVENTS } from '@aether/shared';

async function main() {
  console.log('🧠 Aether OS - 记忆系统演示');
  console.log('='.repeat(60));

  // 1. 短期记忆演示
  console.log('\n📝 一、短期记忆演示');
  console.log('-'.repeat(40));

  const shortTerm = new ShortTermMemory(10); // 容量 10 条

  console.log('\n添加对话消息...');
  
  // 添加一些对话消息
  const messages = [
    { role: 'system' as const, content: '你是一个友好的助手' },
    { role: 'user' as const, content: '你好，我叫张三' },
    { role: 'assistant' as const, content: '你好张三！很高兴认识你。有什么可以帮你的吗？' },
    { role: 'user' as const, content: '我想了解一下天气' },
    { role: 'assistant' as const, content: '好的，请问你想查询哪个城市的天气？' },
    { role: 'user' as const, content: '北京的天气怎么样？' },
    { role: 'assistant' as const, content: '北京今天晴，温度 25°C，空气质量良好。' },
    { role: 'user' as const, content: '明天呢？' },
    { role: 'assistant' as const, content: '北京明天多云，温度 22-28°C，建议带伞。' },
    { role: 'user' as const, content: '好的，谢谢' },
  ];

  messages.forEach(msg => {
    const result = shortTerm.addMessage(msg);
    console.log(`  + [${msg.role}] ${msg.content.substring(0, 30)}...`);
  });

  console.log(`\n当前消息数: ${shortTerm.getMessageCount()}`);
  console.log(`估算 Token 数: ${shortTerm.getTokenCount()}`);

  // 测试 FIFO 淘汰
  console.log('\n测试 FIFO 淘汰机制（添加第 11 条消息）...');
  shortTerm.addMessage({
    role: 'assistant',
    content: '不客气！如果还有其他问题，随时问我。',
  });

  console.log(`当前消息数: ${shortTerm.getMessageCount()}`);
  console.log(`第一条消息已被淘汰（system 消息被移除）`);

  // 获取上下文
  console.log('\n获取对话上下文:');
  const context = shortTerm.getContext();
  context.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}] ${msg.content.substring(0, 40)}...`);
  });

  // 清空短期记忆
  console.log('\n清空短期记忆...');
  shortTerm.clear();
  console.log(`清空后消息数: ${shortTerm.getMessageCount()}`);

  // 2. 长期记忆演示
  console.log('\n💾 二、长期记忆演示');
  console.log('-'.repeat(40));

  const longTerm = new LongTermMemory();
  const agentId = 'demo-agent-001';

  // 监听记忆添加事件
  globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, aid, timestamp) => {
    if (aid === agentId) {
      console.log(`  [事件] 记忆已保存: ${memoryId}`);
    }
  });

  console.log('\n添加长期记忆...');

  // 添加各种类型的记忆
  const memories = [
    { content: '用户叫张三，今年 28 岁', type: 'fact', importance: 0.9 },
    { content: '用户是一名软件工程师，在互联网公司工作', type: 'fact', importance: 0.8 },
    { content: '用户喜欢喝咖啡，尤其是美式咖啡', type: 'preference', importance: 0.7 },
    { content: '用户喜欢编程，常用语言是 JavaScript 和 TypeScript', type: 'fact', importance: 0.85 },
    { content: '用户住在北京朝阳区', type: 'fact', importance: 0.6 },
    { content: '用户喜欢打篮球，每周打两次', type: 'preference', importance: 0.5 },
    { content: '用户的宠物是一只叫"豆豆"的金毛犬', type: 'fact', importance: 0.75 },
    { content: '用户喜欢听摇滚音乐', type: 'preference', importance: 0.4 },
    { content: '用户最近在学习 Rust 编程语言', type: 'fact', importance: 0.7 },
    { content: '用户的生日是 1996 年 3 月 15 日', type: 'fact', importance: 0.8 },
  ];

  for (const mem of memories) {
    await longTerm.store(agentId, mem.content, {
      type: mem.type as any,
      importance: mem.importance,
    });
  }

  console.log(`\n已添加 ${memories.length} 条长期记忆`);

  // 列出所有记忆
  console.log('\n列出所有记忆（按重要性排序）:');
  const allMemories = await longTerm.list(agentId, {
    sortBy: 'importance',
    sortOrder: 'desc',
  });

  allMemories.items.forEach((mem, index) => {
    console.log(`  ${index + 1}. [${mem.type}] ${mem.content.substring(0, 40)}... (重要性: ${mem.importance})`);
  });

  // 搜索记忆
  console.log('\n🔍 搜索记忆演示');
  console.log('-'.repeat(40));

  const searchQueries = [
    '编程语言',
    '咖啡',
    '宠物',
    '生日',
    '音乐',
  ];

  for (const query of searchQueries) {
    console.log(`\n搜索: "${query}"`);
    const results = await longTerm.search(agentId, query, {
      threshold: 0.3,
      topK: 3,
    });

    if (results.length > 0) {
      results.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.item.content} (相似度: ${result.similarity.toFixed(2)})`);
      });
    } else {
      console.log('  未找到相关记忆');
    }
  }

  // 按类型过滤
  console.log('\n📋 按类型过滤记忆');
  console.log('-'.repeat(40));

  const factMemories = await longTerm.list(agentId, {
    type: 'fact' as any,
  });
  console.log(`事实类记忆: ${factMemories.total} 条`);

  const prefMemories = await longTerm.list(agentId, {
    type: 'preference' as any,
  });
  console.log(`偏好类记忆: ${prefMemories.total} 条`);

  // 获取单条记忆
  console.log('\n📖 获取单条记忆详情');
  console.log('-'.repeat(40));

  const firstMemory = allMemories.items[0];
  const memoryDetail = await longTerm.get(firstMemory.id);
  if (memoryDetail) {
    console.log(`ID: ${memoryDetail.id}`);
    console.log(`内容: ${memoryDetail.content}`);
    console.log(`类型: ${memoryDetail.type}`);
    console.log(`重要性: ${memoryDetail.importance}`);
    console.log(`创建时间: ${new Date(memoryDetail.createdAt).toLocaleString()}`);
  }

  // 更新重要性
  console.log('\n⭐ 更新记忆重要性');
  console.log('-'.repeat(40));

  await longTerm.updateImportance(firstMemory.id, 1.0);
  const updatedMemory = await longTerm.get(firstMemory.id);
  console.log(`更新后重要性: ${updatedMemory?.importance}`);

  // 删除记忆
  console.log('\n🗑️ 删除记忆演示');
  console.log('-'.repeat(40));

  const secondMemory = allMemories.items[1];
  const deleted = await longTerm.delete(secondMemory.id);
  console.log(`删除成功: ${deleted}`);

  const afterDelete = await longTerm.list(agentId);
  console.log(`删除后剩余: ${afterDelete.total} 条`);

  // 3. 记忆管理器演示
  console.log('\n🎯 三、记忆管理器演示');
  console.log('-'.repeat(40));

  const memoryManager = new MemoryManager('manager-demo');

  console.log('\n添加对话到短期记忆...');
  memoryManager.shortTerm.addMessage({
    role: 'user',
    content: '你好，我想订一张去上海的机票',
  });
  memoryManager.shortTerm.addMessage({
    role: 'assistant',
    content: '好的，请问你想什么时候出发？',
  });
  memoryManager.shortTerm.addMessage({
    role: 'user',
    content: '下周一，上午的航班',
  });

  console.log('添加用户偏好到长期记忆...');
  await memoryManager.longTerm.store('manager-demo', '用户喜欢靠窗的座位', {
    type: 'preference',
    importance: 0.8,
  });
  await memoryManager.longTerm.store('manager-demo', '用户是航空公司金卡会员', {
    type: 'fact',
    importance: 0.9,
  });
  await memoryManager.longTerm.store('manager-demo', '用户经常去上海出差', {
    type: 'fact',
    importance: 0.7,
  });

  // 获取完整上下文
  console.log('\n获取完整上下文（短期 + 相关长期记忆）:');
  const fullContext = await memoryManager.getFullContext('机票预订');
  console.log(`完整上下文共 ${fullContext.length} 条消息:`);
  fullContext.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
  });

  // 巩固记忆
  console.log('\n🔄 记忆巩固（将短期记忆转移到长期记忆）');
  console.log('-'.repeat(40));

  console.log(`巩固前: 短期 ${memoryManager.shortTerm.getMessageCount()} 条, 长期 ${(await memoryManager.longTerm.list('manager-demo')).total} 条`);

  await memoryManager.consolidateToLongTerm('manager-demo', {
    minImportance: 0.5,
  });

  console.log(`巩固后: 短期 ${memoryManager.shortTerm.getMessageCount()} 条, 长期 ${(await memoryManager.longTerm.list('manager-demo')).total} 条`);

  // 清空所有记忆
  console.log('\n🧹 清空所有记忆...');
  memoryManager.shortTerm.clear();
  await memoryManager.longTerm.clear('manager-demo');
  console.log('记忆已清空');

  // 4. 实际应用场景
  console.log('\n🌟 四、实际应用场景演示');
  console.log('-'.repeat(40));

  console.log('\n场景：个性化客服助手');
  console.log('='.repeat(40));

  const customerMemory = new MemoryManager('customer-001');

  // 模拟历史对话
  console.log('\n1. 加载用户历史记忆...');
  await customerMemory.longTerm.store('customer-001', '用户是 VIP 客户', { type: 'fact', importance: 0.95 });
  await customerMemory.longTerm.store('customer-001', '用户上次投诉了物流问题', { type: 'fact', importance: 0.9 });
  await customerMemory.longTerm.store('customer-001', '用户喜欢收到小礼品', { type: 'preference', importance: 0.7 });
  await customerMemory.longTerm.store('customer-001', '用户的订单号是 ORD-2024-001', { type: 'fact', importance: 0.85 });

  // 当前对话
  console.log('2. 当前对话上下文...');
  customerMemory.shortTerm.addMessage({
    role: 'user',
    content: '你好，我想查一下我的订单',
  });

  // 获取完整上下文
  console.log('3. 生成完整上下文用于模型调用...');
  const customerContext = await customerMemory.getFullContext('订单查询');
  console.log(`   上下文包含 ${customerContext.length} 条消息`);
  console.log('   系统会自动注入相关的历史记忆，让回复更个性化');

  console.log('\n✅ 记忆系统演示完成！');
  console.log('\n💡 记忆系统的价值:');
  console.log('   1. 短期记忆: 保持对话连贯性');
  console.log('   2. 长期记忆: 记住用户偏好和历史');
  console.log('   3. 智能检索: 只返回相关的记忆，不浪费 token');
  console.log('   4. 重要性权重: 重要的记忆优先返回');
  console.log('   5. 记忆巩固: 重要的对话自动转化为长期记忆');
}

main().catch(console.error);
