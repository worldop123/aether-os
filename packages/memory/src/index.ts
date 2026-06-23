/**
 * @aether/memory - Aether OS 记忆系统模块
 *
 * 包含短期记忆和长期记忆（向量记忆）的接口定义
 * 以及记忆巩固与遗忘机制
 */

export { MessageRole, ShortTermMemory, LongTermMemory, MemoryManager } from './memory.js';
export { SqliteLongTermMemory } from './sqlite-long-term.js';
export { VectorMemoryManager } from './vector-memory-manager.js';
export { cosineSimilarity, vectorNorm, dotProduct, normalizeVector, hashEmbedding } from './vector.js';
export {
  MemoryConsolidator,
  MemoryForgetter,
  MemoryMaintenance,
  DEFAULT_CONSOLIDATION_CONFIG,
  DEFAULT_FORGETTING_CONFIG,
} from './consolidation.js';
export type {
  MemoryMessage,
  IShortTermMemory,
  LongTermMemoryItem,
  VectorSearchResult,
  ILongTermMemory,
  IMemoryManager,
  EmbeddingFn,
} from './memory.js';
export type {
  ConsolidationStrategy,
  ConsolidationConfig,
  ForgettingStrategy,
  ForgettingConfig,
  ConsolidationResult,
  ForgettingResult,
} from './consolidation.js';
