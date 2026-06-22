import type {
  IModelProvider,
  ModelInfo,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ChatMessage,
} from '../model-router.js';
import { ModelRouterError, generateId, now } from '@aether/shared';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_CHAT_MODEL = 'llama3';
const DEFAULT_EMBEDDING_MODEL = 'llama3';

export interface OllamaProviderOptions {
  baseURL?: string;
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Ollama 本地模型提供商
 * 支持 chat completion 和 embedding，无需 API key
 */
export class OllamaProvider implements IModelProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  private readonly baseURL: string;
  private readonly models: Map<string, ModelInfo> = new Map();

  constructor(options: OllamaProviderOptions = {}) {
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.initModels();
  }

  private initModels(): void {
    const models: ModelInfo[] = [
      {
        id: 'llama2',
        name: 'Llama 2',
        description: 'Meta Llama 2 本地模型',
        contextWindow: 4096,
        maxOutputTokens: 2048,
        supportsTools: false,
        supportsEmbedding: true,
        inputPricePer1k: 0,
        outputPricePer1k: 0,
        provider: this.id,
      },
      {
        id: 'llama3',
        name: 'Llama 3',
        description: 'Meta Llama 3 本地模型',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: true,
        inputPricePer1k: 0,
        outputPricePer1k: 0,
        provider: this.id,
      },
      {
        id: 'mistral',
        name: 'Mistral',
        description: 'Mistral 本地模型',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsEmbedding: true,
        inputPricePer1k: 0,
        outputPricePer1k: 0,
        provider: this.id,
      },
    ];

    for (const model of models) {
      this.models.set(model.id, model);
    }
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const modelId = request.model ?? DEFAULT_CHAT_MODEL;
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map((m) => this.convertMessage(m)),
      stream: false,
    };

    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      options.num_predict = request.maxTokens;
    }
    if (Object.keys(options).length > 0) {
      body.options = options;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ModelRouterError(
        `Ollama API 请求失败: ${(error as Error).message}`,
        'API_REQUEST_FAILED'
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ModelRouterError(
        `Ollama API 返回错误 ${response.status}: ${errorText}`,
        'API_ERROR',
        { status: response.status }
      );
    }

    const data = (await response.json()) as OllamaChatResponse;

    const inputTokens =
      data.prompt_eval_count ?? this.estimateTokens(request.messages);
    const outputTokens =
      data.eval_count ?? Math.ceil(data.message.content.length / 4);

    return {
      id: generateId('chatcmpl'),
      model: data.model,
      message: {
        role: 'assistant',
        content: data.message.content,
      },
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        timestamp: now(),
        model: data.model,
      },
      finishReason: data.done ? 'stop' : 'length',
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const modelId = request.model ?? DEFAULT_EMBEDDING_MODEL;
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    const inputs = Array.isArray(request.input)
      ? request.input
      : [request.input];
    const embeddings: number[][] = [];

    for (const input of inputs) {
      const body = {
        model: modelId,
        prompt: input,
      };

      let response: Response;
      try {
        response = await fetch(`${this.baseURL}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw new ModelRouterError(
          `Ollama API 请求失败: ${(error as Error).message}`,
          'API_REQUEST_FAILED'
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new ModelRouterError(
          `Ollama API 返回错误 ${response.status}: ${errorText}`,
          'API_ERROR',
          { status: response.status }
        );
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      embeddings.push(data.embedding);
    }

    const promptTokens = inputs.reduce(
      (sum, text) => sum + Math.ceil(text.length / 4),
      0
    );

    return {
      embeddings,
      model: modelId,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
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
    return true;
  }

  private convertMessage(message: ChatMessage): Record<string, unknown> {
    const result: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

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

  private estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
      total += message.content.length / 4;
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          total += JSON.stringify(toolCall.arguments).length / 4;
        }
      }
    }
    return Math.ceil(total);
  }
}
