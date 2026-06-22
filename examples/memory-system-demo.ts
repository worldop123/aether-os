/**
 * @file memory-system-demo.ts
 * @description Aether OS - 记忆系统完整示例
 *
 * 本示例演示记忆系统的完整功能：
 * - 创建 MemoryManager，注入确定性 embedding 函数（不依赖外部 API）
 * - 添加短期记忆消息（模拟对话）
 * - 巩固短期记忆到长期记忆
 * - 添加多条长期记忆（不同类型：fact / experience / preference）
 * - 用向量检索搜索语义相关记忆
 * - 演示记忆的更新、删除、重要性调整
 * - 演示访问计数（通过 get / search 自动更新）
 * - 打印完整的记忆上下文（getFullContext）
 *
 * 运行方式：
 *   npx tsx examples/memory-system-demo.ts
 *   或编译后：node dist/examples/memory-system-demo.js
 *
 * embedding 函数说明：
 *   使用自定义的确定性 embedding 函数，结合「语义概念维度」+「哈希词袋维度」，
 *   不依赖外部 API。同一文本始终生成相同向量，语义相近的文本具有较高的余弦相似度。
 */

import {
  MemoryManager,
  LongTermMemory,
  ShortTermMemory,
  MessageRole,
  hashEmbedding,
  normalizeVector,
  cosineSimilarity,
} from '@aether/memory';
import type { EmbeddingFn, LongTermMemoryItem } from '@aether/memory';
import { globalEventBus, EVENTS } from '@aether/shared';

// ============================================================
// 自定义确定性 Embedding 函数
// ============================================================

/**
 * 语义概念定义
 * 每个概念是一组关键词，文本中包含任一关键词即激活该概念维度。
 * 这样语义相关的文本（即使没有完全相同的词）也能产生非零相似度。
 */
const SEMANTIC_CONCEPTS: string[][] = [
  // 维度 0: 编程 / 开发
  ['python', 'java', 'javascript', 'typescript', 'rust', 'golang', '编程', '程序', '代码', '开发', '编码', '程序员'],
  // 维度 1: 喜好 / 偏好
  ['喜欢', '爱', '偏好', '偏爱', '爱好', '钟爱', '喜爱', '热衷'],
  // 维度 2: 语言（自然语言 / 编程语言）
  ['语言', 'language', '中文', '英文', '汉语', '语法'],
  // 维度 3: 食物 / 饮食
  ['咖啡', '茶', '食物', '吃', '喝', '美食', '饮料', '午餐', '晚餐'],
  // 维度 4: 运动
  ['篮球', '足球', '跑步', '游泳', '运动', '健身', '锻炼'],
  // 维度 5: 音乐
  ['音乐', '摇滚', '流行', '古典', '爵士', '歌曲', '听歌'],
  // 维度 6: 地点 / 城市
  ['北京', '上海', '广州', '深圳', '城市', '住在', '居住'],
  // 维度 7: 职业 / 工作
  ['工程师', '设计师', '老师', '医生', '职业', '工作', '公司', '上班'],
  // 维度 8: 学习 / 教育
  ['学习', '学', '研究', '阅读', '读书', '课程', '教育'],
  // 维度 9: 宠物 / 动物
  ['宠物', '狗', '猫', '金毛', '动物', '养'],
];

const CONCEPT_DIM = SEMANTIC_CONCEPTS.length; // 10
const HASH_DIM = 246; // 哈希词袋维度
const TOTAL_DIM = CONCEPT_DIM + HASH_DIM; // 256

/**
 * 自定义确定性 embedding 函数
 *
 * 结合两种特征：
 * 1. 语义概念特征（前 CONCEPT_DIM 维）：检测文本中是否包含预定义概念的关键词
 * 2. 哈希词袋特征（后 HASH_DIM 维）：基于 hashEmbedding 的 unigram 哈希
 *
 * 最终归一化为 L2 范数为 1 的向量，支持余弦相似度计算。
 *
 * @param text 输入文本
 * @returns 归一化的向量（TOTAL_DIM 维）
 */
function customEmbedding(text: string): number[] {
  const vec = new Array<number>(TOTAL_DIM).fill(0);

  if (!text || text.trim().length === 0) {
    return vec;
  }

  const lower = text.toLowerCase();

  // 1. 语义概念特征
  for (let i = 0; i < SEMANTIC_CONCEPTS.length; i++) {
    for (const kw of SEMANTIC_CONCEPTS[i]) {
      if (lower.includes(kw.toLowerCase())) {
        vec[i] += 1;
      }
    }
  }

  // 2. 哈希词袋特征（使用内置 hashEmbedding 生成 unigram 哈希向量）
  const hashVec = hashEmbedding(text, HASH_DIM);
  for (let i = 0; i < HASH_DIM; i++) {
    vec[CONCEPT_DIM + i] = hashVec[i];
  }

  // 3. 归一化（L2 范数为 1）
  return normalizeVector(vec);
}

// ============================================================
// 主函数
// ============================================================

async function main(): Promise<void> {
  console.log('🧠 Aether OS - 记忆系统完整示例');
  console.log('='.repeat(60));

  const agentId = 'memory-demo-agent';

  // ---- 1. 创建 MemoryManager（注入 embeddingFn）----
  console.log('\n📦 1. 创建 MemoryManager（注入确定性 embedding 函数）');
  console.log('-'.repeat(40));

  // 创建带 embeddingFn 的 LongTermMemory
  const embeddingFn: EmbeddingFn = async (text: string) => customEmbedding(text);
  const longTerm = new LongTermMemory({ embeddingFn });
  const shortTerm = new ShortTermMemory(20); // 容量 20 条
  const memoryManager = new MemoryManager(agentId, shortTerm, longTerm);

  console.log('✅ MemoryManager 已创建');
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   短期记忆容量: ${shortTerm.getMaxMessages()} 条`);
  console.log(`   Embedding 维度: ${TOTAL_DIM}（概念 ${CONCEPT_DIM} + 哈希 ${HASH_DIM}）`);

  // 监听记忆添加事件
  globalEventBus.on(EVENTS.MEMORY_ADDED, (memoryId, aid) => {
    if (aid === agentId) {
      console.log(`   [事件] 记忆已添加: ${memoryId}`);
    }
  });

  // ---- 2. 添加短期记忆（模拟对话）----
  console.log('\n📝 2. 添加短期记忆（模拟对话）');
  console.log('-'.repeat(40));

  const conversation = [
    { role: MessageRole.SYSTEM, content: '你是一个友好的助手，记住用户的偏好。' },
    { role: MessageRole.USER, content: '你好，我叫小明，是一名软件工程师。' },
    { role: MessageRole.ASSISTANT, content: '你好小明！很高兴认识你。有什么可以帮你的吗？' },
    { role: MessageRole.USER, content: '我喜欢 Python 编程，平时也爱喝咖啡。' },
    { role: MessageRole.ASSISTANT, content: '好的，我记住了。Python 是一门优雅的语言，咖啡也是程序员的好伙伴！' },
    { role: MessageRole.USER, content: '我最近在学习 Rust 语言。' },
    { role: MessageRole.ASSISTANT, content: 'Rust 是一门注重安全和性能的系统编程语言，非常适合你的工程师背景。' },
  ];

  for (const msg of conversation) {
    memoryManager.shortTerm.addMessage(msg);
    console.log(`  + [${msg.role}] ${msg.content.substring(0, 40)}...`);
  }

  console.log(`\n当前短期记忆: ${memoryManager.shortTerm.getMessageCount()} 条`);
  console.log(`估算 Token 数: ${memoryManager.shortTerm.getTokenCount()}`);

  // ---- 3. 巩固短期记忆到长期记忆 ----
  console.log('\n🔄 3. 巩固短期记忆到长期记忆');
  console.log('-'.repeat(40));

  const beforeConsolidate = (await memoryManager.longTerm.list(agentId)).total;
  console.log(`巩固前: 短期 ${memoryManager.shortTerm.getMessageCount()} 条, 长期 ${beforeConsolidate} 条`);

  await memoryManager.consolidateToLongTerm(agentId);
  const afterConsolidate = (await memoryManager.longTerm.list(agentId)).total;

  console.log(`巩固后: 短期 ${memoryManager.shortTerm.getMessageCount()} 条, 长期 ${afterConsolidate} 条`);
  console.log(`✅ 已将 ${afterConsolidate - beforeConsolidate} 条短期记忆巩固为长期记忆`);

  // ---- 4. 添加多条长期记忆（不同类型）----
  console.log('\n💾 4. 添加多条长期记忆（fact / experience / preference）');
  console.log('-'.repeat(40));

  const longTermMemories: Array<{
    content: string;
    type: LongTermMemoryItem['type'];
    importance: number;
    tags: string[];
  }> = [
    // 重点：这两条用于演示语义相似度
    { content: '我喜欢 Python', type: 'preference', importance: 0.85, tags: ['编程', '偏好'] },
    { content: '我爱用 Python 编程', type: 'preference', importance: 0.9, tags: ['编程', '偏好'] },
    // 其他记忆
    { content: '用户叫小明，是软件工程师', type: 'fact', importance: 0.9, tags: ['个人信息'] },
    { content: '用户住在北京朝阳区', type: 'fact', importance: 0.6, tags: ['地址'] },
    { content: '用户喜欢喝咖啡，尤其是美式', type: 'preference', importance: 0.7, tags: ['饮食'] },
    { content: '用户喜欢打篮球，每周两次', type: 'preference', importance: 0.5, tags: ['运动'] },
    { content: '上次对话中帮用户解决了 Python 异步编程问题', type: 'experience', importance: 0.75, tags: ['技术', '对话'] },
    { content: '用户正在学习 Rust 编程语言', type: 'fact', importance: 0.7, tags: ['学习', '编程'] },
  ];

  for (const mem of longTermMemories) {
    await memoryManager.longTerm.store(agentId, mem.content, {
      type: mem.type,
      importance: mem.importance,
      tags: mem.tags,
    });
    console.log(`  + [${mem.type}] ${mem.content} (重要性: ${mem.importance})`);
  }

  const totalMemories = (await memoryManager.longTerm.list(agentId)).total;
  console.log(`\n✅ 当前共有 ${totalMemories} 条长期记忆`);

  // ---- 5. 向量检索搜索语义相关记忆 ----
  console.log('\n🔍 5. 向量检索：搜索语义相关记忆');
  console.log('-'.repeat(40));

  // 重点测试：搜索 "编程语言偏好" 应能检索到 "我喜欢 Python" 和 "我爱用 Python 编程"
  const query = '编程语言偏好';
  console.log(`搜索查询: "${query}"`);
  console.log(`（预期：两条 Python 相关记忆都应被检索到，且 "我爱用 Python 编程" 相似度更高）\n`);

  // 5.1 手动计算并展示每条记忆的 cosineSimilarity
  console.log('   📐 各记忆与查询的余弦相似度:');
  const queryEmbedding = await embeddingFn(query);
  const allMemories = await memoryManager.longTerm.list(agentId, { sortBy: 'createdAt', sortOrder: 'asc' });

  const similarityList: Array<{ item: LongTermMemoryItem; similarity: number }> = [];
  for (const item of allMemories.items) {
    if (item.embedding && item.embedding.length > 0) {
      const sim = cosineSimilarity(queryEmbedding, item.embedding);
      similarityList.push({ item, similarity: sim });
    }
  }
  similarityList.sort((a, b) => b.similarity - a.similarity);

  for (const { item, similarity } of similarityList) {
    const bar = '█'.repeat(Math.round(similarity * 30));
    console.log(`      ${bar.padEnd(30)} ${similarity.toFixed(4)} | ${item.content}`);
  }

  // 5.2 使用 search API 检索（低阈值以展示排序效果）
  console.log('\n   🔎 search API 结果（threshold=0.01, topK=5）:');
  const searchResults = await memoryManager.longTerm.search(agentId, query, {
    topK: 5,
    threshold: 0.01,
  });

  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    console.log(`      ${i + 1}. [相似度: ${r.similarity.toFixed(4)}] ${r.item.content}`);
    console.log(`         类型: ${r.item.type}, 重要性: ${r.item.importance}`);
  }

  // 5.3 多个查询演示
  console.log('\n   🔎 多查询对比:');
  const queries = ['咖啡饮食', '运动爱好', '编程开发', '居住地址'];
  for (const q of queries) {
    const results = await memoryManager.longTerm.search(agentId, q, { topK: 2, threshold: 0.05 });
    console.log(`      "${q}" → ${results.length} 条结果`);
    for (const r of results) {
      console.log(`         · [${r.similarity.toFixed(3)}] ${r.item.content}`);
    }
  }

  // ---- 6. 演示记忆更新（重要性调整）----
  console.log('\n⭐ 6. 演示记忆更新（重要性调整）');
  console.log('-'.repeat(40));

  // 取第一条记忆，调整其重要性
  const firstMemory = allMemories.items[0];
  console.log(`调整前: "${firstMemory.content}" 重要性 = ${firstMemory.importance}`);

  await memoryManager.longTerm.updateImportance(firstMemory.id, 1.0);
  const updated = await memoryManager.longTerm.get(firstMemory.id);
  console.log(`调整后: "${updated?.content}" 重要性 = ${updated?.importance}`);
  console.log('✅ 重要性已更新为 1.0');

  // ---- 7. 演示记忆删除 ----
  console.log('\n🗑️  7. 演示记忆删除');
  console.log('-'.repeat(40));

  // 取最后一条记忆进行删除
  const lastMemory = allMemories.items[allMemories.items.length - 1];
  console.log(`删除记忆: "${lastMemory.content}"`);

  const deleted = await memoryManager.longTerm.delete(lastMemory.id);
  console.log(`删除结果: ${deleted ? '成功' : '失败'}`);

  const afterDelete = await memoryManager.longTerm.list(agentId);
  console.log(`删除后剩余: ${afterDelete.total} 条记忆`);

  // ---- 8. 演示访问计数 ----
  console.log('\n👁️  8. 演示访问计数（通过 get / search 自动更新）');
  console.log('-'.repeat(40));

  // 取一条记忆，多次访问后查看 accessCount 变化
  const targetMemory = allMemories.items[1]; // 第二条记忆
  console.log(`目标记忆: "${targetMemory.content}"`);

  // get() 会自动增加 accessCount
  const g1 = await memoryManager.longTerm.get(targetMemory.id);
  console.log(`   第 1 次 get → accessCount: ${g1?.accessCount}`);
  const g2 = await memoryManager.longTerm.get(targetMemory.id);
  console.log(`   第 2 次 get → accessCount: ${g2?.accessCount}`);
  const g3 = await memoryManager.longTerm.get(targetMemory.id);
  console.log(`   第 3 次 get → accessCount: ${g3?.accessCount}`);

  // search() 也会自动增加 accessCount（仅对返回的 topK 结果）
  await memoryManager.longTerm.search(agentId, targetMemory.content, { topK: 3, threshold: 0.01 });
  const g4 = await memoryManager.longTerm.get(targetMemory.id);
  console.log(`   search 后 get → accessCount: ${g4?.accessCount}`);
  console.log(`   ✅ 访问计数已自动更新（get 和 search 都会触发）`);

  // 按访问次数排序展示
  console.log('\n   📊 按访问次数排序的记忆:');
  const byAccess = await memoryManager.longTerm.list(agentId, {
    sortBy: 'accessCount',
    sortOrder: 'desc',
  });
  for (const item of byAccess.items.slice(0, 5)) {
    console.log(`      · [访问 ${item.accessCount} 次] ${item.content.substring(0, 40)}`);
  }

  // ---- 9. 打印完整记忆上下文（getFullContext）----
  console.log('\n📋 9. 打印完整记忆上下文（getFullContext）');
  console.log('-'.repeat(40));

  // 先添加一些新的短期记忆
  memoryManager.shortTerm.addMessage({ role: MessageRole.USER, content: '帮我推荐一本 Python 进阶书籍' });
  memoryManager.shortTerm.addMessage({ role: MessageRole.ASSISTANT, content: '推荐《流畅的 Python》，非常适合进阶学习。' });

  console.log('查询: "Python 编程书籍推荐"');
  console.log('（getFullContext 会合并相关长期记忆 + 短期记忆）\n');

  const fullContext = await memoryManager.getFullContext('Python 编程书籍推荐', {
    maxShortTerm: 5,
    maxLongTerm: 3,
  });

  console.log(`完整上下文共 ${fullContext.length} 条消息:`);
  for (let i = 0; i < fullContext.length; i++) {
    const msg = fullContext[i];
    const isLongTerm = msg.metadata?.type === 'long_term_memory';
    const tag = isLongTerm ? '长期记忆' : '短期记忆';
    const sim = isLongTerm ? ` (相似度: ${(msg.metadata?.similarity as number)?.toFixed(3)})` : '';
    console.log(`   ${i + 1}. [${tag}${sim}] [${msg.role}] ${msg.content.substring(0, 60)}`);
  }

  // ---- 10. 按类型过滤记忆 ----
  console.log('\n📂 10. 按类型过滤记忆');
  console.log('-'.repeat(40));

  const types: LongTermMemoryItem['type'][] = ['fact', 'experience', 'preference'];
  for (const t of types) {
    const result = await memoryManager.longTerm.list(agentId, { type: t });
    console.log(`   ${t}: ${result.total} 条`);
    for (const item of result.items.slice(0, 3)) {
      console.log(`      · ${item.content}`);
    }
  }

  // ---- 11. 清理资源 ----
  console.log('\n🧹 11. 清理资源');
  console.log('-'.repeat(40));

  memoryManager.shortTerm.clear();
  await memoryManager.longTerm.clear(agentId);
  console.log('✅ 短期记忆和长期记忆已清空');

  const finalCount = (await memoryManager.longTerm.list(agentId)).total;
  console.log(`清空后长期记忆: ${finalCount} 条`);

  // ---- 总结 ----
  console.log('\n' + '='.repeat(60));
  console.log('✅ 记忆系统示例运行完成！');
  console.log('\n💡 本示例展示的功能:');
  console.log('   1. 自定义确定性 embedding 函数（语义概念 + 哈希词袋）');
  console.log('   2. 短期记忆管理（添加、容量限制、Token 估算）');
  console.log('   3. 记忆巩固（短期 → 长期）');
  console.log('   4. 长期记忆存储（fact / experience / preference 三种类型）');
  console.log('   5. 向量检索（cosineSimilarity 排序，语义相似度匹配）');
  console.log('   6. 记忆管理（更新重要性、删除、按类型过滤）');
  console.log('   7. 访问计数（get / search 自动更新 accessCount）');
  console.log('   8. 完整上下文生成（getFullContext 合并短期 + 长期）');
  console.log('\n🔑 语义相似度演示:');
  console.log('   "我喜欢 Python" 和 "我爱用 Python 编程" 都能被 "编程语言偏好" 检索到');
  console.log('   得益于语义概念维度，即使没有完全相同的词也能产生非零相似度');
}

// ============================================================
// 入口
// ============================================================

main().catch((error) => {
  console.error('❌ 示例运行出错:', error);
  process.exit(1);
});
