import type {
  IModelProvider,
  ModelInfo,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ChatMessage,
  ToolCall,
} from '../model-router.js';
import { ModelRouterError, now } from '@aether/shared';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CHAT_MODEL = 'claude-3-haiku';

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessageResponse {
  id: string;
  model: string;
  content: AnthropicContentBlock[];
  role: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic 模型提供商
 * 支持 chat completion，不支持 embedding
 */
export class AnthropicProvider implements IModelProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly models: Map<string, ModelInfo> = new Map();

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.initModels();
  }

  private initModels(): void {
    const models: ModelInfo[] = [
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Anthropic Claude 3 Opus 模型，最强能力',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.015,
        outputPricePer1k: 0.075,
        provider: this.id,
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        description: 'Anthropic Claude 3 Sonnet 模型，平衡性能与速度',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.003,
        outputPricePer1k: 0.015,
        provider: this.id,
      },
      {
        id: 'claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Anthropic Claude 3 Haiku 模型，快速响应',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.00025,
        outputPricePer1k: 0.00125,
        provider: this.id,
      },
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Anthropic Claude 3.5 Sonnet 模型，增强能力',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.003,
        outputPricePer1k: 0.015,
        provider: this.id,
      },
    ];

    for (const model of models) {
      this.models.set(model.id, model);
    }
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new ModelRouterError(
        'Anthropic API key 未配置，请设置 ANTHROPIC_API_KEY 环境变量',
        'PROVIDER_NOT_AVAILABLE'
      );
    }

    const modelId = request.model ?? DEFAULT_CHAT_MODEL;
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    // Anthropic separates system messages from the messages array
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');
    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== 'system'
    );

    const body: Record<string, unknown> = {
      model: modelId,
      messages: nonSystemMessages.map((m) => this.convertMessage(m)),
      max_tokens: request.maxTokens ?? 4096,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    if (request.toolChoice !== undefined) {
      if (request.toolChoice === 'auto' || request.toolChoice === 'none') {
        body.tool_choice = { type: request.toolChoice };
      } else if (typeof request.toolChoice === 'object') {
        body.tool_choice = {
          type: 'tool',
          name: request.toolChoice.function.name,
        };
      }
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ModelRouterError(
        `Anthropic API 请求失败: ${(error as Error).message}`,
        'API_REQUEST_FAILED'
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ModelRouterError(
        `Anthropic API 返回错误 ${response.status}: ${errorText}`,
        'API_ERROR',
        { status: response.status }
      );
    }

    const data = (await response.json()) as AnthropicMessageResponse;

    // Extract text content and tool calls
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text !== undefined) {
        textContent += block.text;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    const message: ChatMessage = {
      role: 'assistant',
      content: textContent,
    };

    if (toolCalls.length > 0) {
      message.toolCalls = toolCalls;
    }

    return {
      id: data.id,
      model: data.model,
      message,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        timestamp: now(),
        model: data.model,
      },
      finishReason: this.convertFinishReason(data.stop_reason),
    };
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new ModelRouterError(
      'Anthropic 不支持嵌入向量生成',
      'EMBEDDING_NOT_SUPPORTED'
    );
  }

  getModelInfo(modelId: string): ModelInfo | undefined {
    return this.models.get(modelId);
  }

  listModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private convertMessage(message: ChatMessage): Record<string, unknown> {
    // Tool result messages: Anthropic uses user role with tool_result content blocks
    if (message.role === 'tool' && message.toolCallId) {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      };
    }

    // Assistant messages with tool calls: Anthropic uses content blocks
    if (
      message.role === 'assistant' &&
      message.toolCalls &&
      message.toolCalls.length > 0
    ) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }
      for (const tc of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      return {
        role: 'assistant',
        content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  }

  private convertFinishReason(
    reason: string | null
  ): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
