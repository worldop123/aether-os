/**
 * @aether/model-router - Aether OS 模型路由模块
 *
 * 包含模型路由、预算控制和模型提供商接口定义
 */

export { MockModelProvider, ModelRouter, BudgetController } from './model-router.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OllamaProvider } from './providers/ollama.js';
export type {
  TokenUsage,
  ChatMessage,
  ToolCall,
  ChatCompletionRequest,
  ToolDefinition,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  IModelProvider,
  IModelRouter,
  IBudgetController,
  RoutingStrategy,
} from './model-router.js';
