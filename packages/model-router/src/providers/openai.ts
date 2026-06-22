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

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-3.5-turbo';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 模型提供商
 * 支持 chat completion 和 embedding
 */
export class OpenAIProvider implements IModelProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly models: Map<string, ModelInfo> = new Map();

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.initModels();
  }

  private initModels(): void {
    const models: ModelInfo[] = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'OpenAI GPT-4 模型，强大的推理能力',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.03,
        outputPricePer1k: 0.06,
        provider: this.id,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'OpenAI GPT-4 Turbo 模型，支持 128K 上下文',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
        provider: this.id,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'OpenAI GPT-3.5 Turbo 模型，性价比高',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.0005,
        outputPricePer1k: 0.0015,
        provider: this.id,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'OpenAI GPT-4o 多模态模型',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: false,
        inputPricePer1k: 0.005,
        outputPricePer1k: 0.015,
        provider: this.id,
      },
      {
        id: 'text-embedding-3-small',
        name: 'Text Embedding 3 Small',
        description: 'OpenAI 小型嵌入模型，1536 维',
        contextWindow: 8191,
        supportsTools: false,
        supportsEmbedding: true,
        inputPricePer1k: 0.00002,
        provider: this.id,
      },
      {
        id: 'text-embedding-3-large',
        name: 'Text Embedding 3 Large',
        description: 'OpenAI 大型嵌入模型，3072 维',
        contextWindow: 8191,
        supportsTools: false,
        supportsEmbedding: true,
        inputPricePer1k: 0.00013,
        provider: this.id,
      },
      {
        id: 'text-embedding-ada-002',
        name: 'Text Embedding Ada 002',
        description: 'OpenAI Ada 嵌入模型，1536 维',
        contextWindow: 8191,
        supportsTools: false,
        supportsEmbedding: true,
        inputPricePer1k: 0.0001,
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
        'OpenAI API key 未配置，请设置 OPENAI_API_KEY 环境变量',
        'PROVIDER_NOT_AVAILABLE'
      );
    }

    const modelId = request.model ?? DEFAULT_CHAT_MODEL;
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map((m) => this.convertMessage(m)),
      temperature: request.temperature ?? 0.7,
    };

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    if (request.toolChoice !== undefined) {
      body.tool_choice = request.toolChoice;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ModelRouterError(
        `OpenAI API 请求失败: ${(error as Error).message}`,
        'API_REQUEST_FAILED'
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ModelRouterError(
        `OpenAI API 返回错误 ${response.status}: ${errorText}`,
        'API_ERROR',
        { status: response.status }
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new ModelRouterError('OpenAI API 返回空响应', 'API_ERROR');
    }

    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map(
      (tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: this.parseArguments(tc.function.arguments),
      })
    );

    const message: ChatMessage = {
      role: 'assistant',
      content: choice.message.content ?? '',
    };

    if (toolCalls && toolCalls.length > 0) {
      message.toolCalls = toolCalls;
    }

    return {
      id: data.id,
      model: data.model,
      message,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        timestamp: now(),
        model: data.model,
      },
      finishReason: this.convertFinishReason(choice.finish_reason),
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new ModelRouterError(
        'OpenAI API key 未配置，请设置 OPENAI_API_KEY 环境变量',
        'PROVIDER_NOT_AVAILABLE'
      );
    }

    const modelId = request.model ?? DEFAULT_EMBEDDING_MODEL;
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    const inputs = Array.isArray(request.input)
      ? request.input
      : [request.input];

    const body = {
      model: modelId,
      input: inputs,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ModelRouterError(
        `OpenAI API 请求失败: ${(error as Error).message}`,
        'API_REQUEST_FAILED'
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ModelRouterError(
        `OpenAI API 返回错误 ${response.status}: ${errorText}`,
        'API_ERROR',
        { status: response.status }
      );
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    return {
      embeddings: data.data.map((d) => d.embedding),
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
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
    const result: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

    if (message.toolCallId) {
      result.tool_call_id = message.toolCallId;
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      result.tool_calls = message.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    return result;
  }

  private parseArguments(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private convertFinishReason(
    reason: string
  ): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
