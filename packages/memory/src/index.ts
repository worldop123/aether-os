/**
 * @aether/memory - Aether OS 记忆系统模块
 *
 * 包含短期记忆和长期记忆（向量记忆）的接口定义
 */

export { MessageRole, ShortTermMemory, LongTermMemory, MemoryManager } from './memory';
export type {
  MemoryMessage,
  IShortTermMemory,
  LongTermMemoryItem,
  VectorSearchResult,
  ILongTermMemory,
  IMemoryManager,
} from './memory';
