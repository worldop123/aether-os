import type { ID, Timestamp, Metadata } from '@aether/shared';
import { generateId, now, DEFAULTS, globalEventBus } from '@aether/shared';
import { ModelRouterError, BudgetExceededError } from '@aether/shared';

/**
 * Token 使用统计
 */
export interface TokenUsage {
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
  /** 总 token 数 */
  totalTokens: number;
  /** 时间戳 */
  timestamp: Timestamp;
  /** 模型名称 */
  model: string;
  /** Agent ID */
  agentId?: ID;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 内容 */
  content: string;
  /** 工具调用 ID */
  toolCallId?: string;
  /** 工具调用（仅 assistant 角色） */
  toolCalls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 模型名称 */
  model?: string;
  /** 温度 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 工具列表 */
  tools?: ToolDefinition[];
  /** 工具选择模式 */
  toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具类型 */
  type: 'function';
  /** 函数定义 */
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
  /** 响应 ID */
  id: string;
  /** 模型名称 */
  model: string;
  /** 生成的消息 */
  message: ChatMessage;
  /** Token 使用统计 */
  usage: TokenUsage;
  /** 完成原因 */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * 嵌入请求
 */
export interface EmbeddingRequest {
  /** 文本内容 */
  input: string | string[];
  /** 模型名称 */
  model?: string;
}

/**
 * 嵌入响应
 */
export interface EmbeddingResponse {
  /** 嵌入向量 */
  embeddings: number[][];
  /** 模型名称 */
  model: string;
  /** Token 使用统计 */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * 模型信息
 */
export interface ModelInfo {
  /** 模型 ID */
  id: string;
  /** 模型名称 */
  name: string;
  /** 模型描述 */
  description?: string;
  /** 最大上下文长度 */
  contextWindow: number;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持嵌入 */
  supportsEmbedding: boolean;
  /** 输入价格（每 1k tokens） */
  inputPricePer1k?: number;
  /** 输出价格（每 1k tokens） */
  outputPricePer1k?: number;
  /** 提供商名称 */
  provider: string;
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * Mock 模型提供商
 * MVP 阶段使用，返回模拟响应
 */
export class MockModelProvider implements IModelProvider {
  readonly id: string;
  readonly name: string;
  private models: Map<string, ModelInfo> = new Map();

  constructor(id: string = 'mock', name: string = 'Mock Provider') {
    this.id = id;
    this.name = name;
    this.initMockModels();
  }

  /**
   * 初始化模拟模型
   */
  private initMockModels(): void {
    const mockModels: ModelInfo[] = [
      {
        id: 'mock-small',
        name: 'Mock Small',
        description: '小型模拟模型，快速响应',
        contextWindow: 4096,
        maxOutputTokens: 1024,
        supportsTools: false,
        supportsEmbedding: true,
        inputPricePer1k: 0.001,
        outputPricePer1k: 0.002,
        provider: this.id,
      },
      {
        id: 'mock-large',
        name: 'Mock Large',
        description: '大型模拟模型，支持工具调用',
        contextWindow: 8192,
        maxOutputTokens: 2048,
        supportsTools: true,
        supportsEmbedding: true,
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
        provider: this.id,
      },
    ];

    for (const model of mockModels) {
      this.models.set(model.id, model);
    }
  }

  /**
   * 聊天补全（模拟实现）
   */
  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const modelId = request.model || 'mock-small';
    const model = this.models.get(modelId);

    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    // 模拟 token 计算
    const inputTokens = this.estimateTokens(request.messages);
    const outputTokens = Math.min(
      request.maxTokens || 100,
      model.maxOutputTokens || 1024
    );

    // 生成模拟响应
    const lastMessage = request.messages[request.messages.length - 1];
    const responseContent = `Mock response to: ${lastMessage?.content?.slice(0, 50) || ''}`;

    const response: ChatCompletionResponse = {
      id: generateId('chatcmpl'),
      model: modelId,
      message: {
        role: 'assistant',
        content: responseContent,
      },
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        timestamp: now(),
        model: modelId,
      },
      finishReason: 'stop',
    };

    return response;
  }

  /**
   * 生成嵌入向量（模拟实现）
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const modelId = request.model || 'mock-small';
    const model = this.models.get(modelId);

    if (!model) {
      throw new ModelRouterError(`模型 ${modelId} 不存在`, 'MODEL_NOT_FOUND');
    }

    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const embeddings: number[][] = [];

    for (const input of inputs) {
      // 生成模拟嵌入向量（1536 维，随机值）
      const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
      // 归一化
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const normalized = embedding.map((val) => val / norm);
      embeddings.push(normalized);
    }

    const promptTokens = inputs.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

    return {
      embeddings,
      model: modelId,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
      },
    };
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelId: string): ModelInfo | undefined {
    return this.models.get(modelId);
  }

  /**
   * 列出所有可用模型
   */
  listModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean {
    return true; // Mock 提供商始终可用
  }

  /**
   * 估算 token 数量（简化版）
   */
  private estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
      total += message.content.length / 4; // 简单估算
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          total += JSON.stringify(toolCall.arguments).length / 4;
        }
      }
    }
    return Math.ceil(total);
  }
}

/**
 * 模型提供商接口
 * 所有模型提供商都需要实现此接口
 */
export interface IModelProvider {
  /** 提供商 ID */
  readonly id: string;
  /** 提供商名称 */
  readonly name: string;

  /**
   * 聊天补全
   * @param request 请求参数
   */
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * 生成嵌入向量
   * @param request 请求参数
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * 获取模型信息
   * @param modelId 模型 ID
   */
  getModelInfo(modelId: string): ModelInfo | undefined;

  /**
   * 列出所有可用模型
   */
  listModels(): ModelInfo[];

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean;
}

/**
 * 模型路由策略
 */
export type RoutingStrategy =
  | 'cheapest' // 最便宜优先
  | 'fastest' // 最快优先
  | 'best-quality' // 质量最优
  | 'balanced' // 平衡
  | 'manual'; // 手动指定

/**
 * 模型路由器实现类
 * 负责根据需求选择最合适的模型提供商
 */
export class ModelRouter implements IModelRouter {
  private providers: Map<string, IModelProvider> = new Map();
  private defaultStrategy: RoutingStrategy = 'balanced';

  constructor(defaultStrategy?: RoutingStrategy) {
    if (defaultStrategy) {
      this.defaultStrategy = defaultStrategy;
    }
  }

  /**
   * 路由聊天请求到合适的模型
   */
  async route(
    request: ChatCompletionRequest,
    options?: {
      strategy?: RoutingStrategy;
      preferredModel?: string;
      preferredProvider?: string;
      agentId?: ID;
    }
  ): Promise<ChatCompletionResponse> {
    const strategy = options?.strategy || this.defaultStrategy;

    let provider: IModelProvider | undefined;
    let modelId: string | undefined;

    // 手动指定模型
    if (options?.preferredModel) {
      modelId = options.preferredModel;
      provider = this.getProviderForModel(modelId);
      if (!provider) {
        throw new ModelRouterError(`找不到模型 ${modelId} 的提供商`, 'PROVIDER_NOT_FOUND');
      }
    }
    // 手动指定提供商
    else if (options?.preferredProvider) {
      provider = this.providers.get(options.preferredProvider);
      if (!provider) {
        throw new ModelRouterError(
          `提供商 ${options.preferredProvider} 不存在`,
          'PROVIDER_NOT_FOUND'
        );
      }
      const models = provider.listModels();
      if (models.length > 0) {
        modelId = models[0].id;
      }
    }
    // 根据策略选择
    else {
      const bestModel = this.getBestModel({
        task: 'chat',
        strategy,
        requiresTools: !!request.tools,
      });

      if (!bestModel) {
        throw new ModelRouterError('没有可用的模型', 'NO_AVAILABLE_MODEL');
      }

      modelId = bestModel.id;
      provider = this.getProviderForModel(modelId);
    }

    if (!provider || !modelId) {
      throw new ModelRouterError('无法确定模型提供商', 'ROUTING_FAILED');
    }

    // 触发请求事件
    globalEventBus.emit('model.request', modelId, 0, now());

    const startTime = now();
    try {
      const response = await provider.chat({
        ...request,
        model: modelId,
      });

      // 触发响应事件
      const duration = now() - startTime;
      globalEventBus.emit(
        'model.response',
        modelId,
        response.usage.outputTokens,
        duration,
        now()
      );

      return response;
    } catch (error) {
      // 触发错误事件
      globalEventBus.emit('model.error', modelId, error as Error, now());
      throw error;
    }
  }

  /**
   * 路由嵌入请求到合适的模型
   */
  async routeEmbedding(
    request: EmbeddingRequest,
    options?: {
      preferredModel?: string;
      preferredProvider?: string;
    }
  ): Promise<EmbeddingResponse> {
    let provider: IModelProvider | undefined;
    let modelId: string | undefined;

    if (options?.preferredModel) {
      modelId = options.preferredModel;
      provider = this.getProviderForModel(modelId);
    } else if (options?.preferredProvider) {
      provider = this.providers.get(options.preferredProvider);
      if (provider) {
        const embeddingModels = provider.listModels().filter((m) => m.supportsEmbedding);
        if (embeddingModels.length > 0) {
          modelId = embeddingModels[0].id;
        }
      }
    } else {
      const bestModel = this.getBestModel({
        task: 'embedding',
        strategy: 'cheapest',
      });
      if (bestModel) {
        modelId = bestModel.id;
        provider = this.getProviderForModel(modelId);
      }
    }

    if (!provider || !modelId) {
      throw new ModelRouterError('无法确定嵌入模型提供商', 'ROUTING_FAILED');
    }

    return await provider.embed({
      ...request,
      model: modelId,
    });
  }

  /**
   * 注册模型提供商
   */
  registerProvider(provider: IModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * 注销模型提供商
   */
  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  /**
   * 列出所有已注册的提供商
   */
  listProviders(): IModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取所有可用模型
   */
  listAllModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.listModels());
    }
    return models;
  }

  /**
   * 根据条件获取最佳模型
   */
  getBestModel(criteria: {
    task?: 'chat' | 'embedding';
    strategy?: RoutingStrategy;
    minContextWindow?: number;
    requiresTools?: boolean;
  }): ModelInfo | undefined {
    const strategy = criteria.strategy || this.defaultStrategy;
    let models = this.listAllModels();

    // 过滤条件
    if (criteria.minContextWindow) {
      models = models.filter((m) => m.contextWindow >= criteria.minContextWindow!);
    }

    if (criteria.requiresTools) {
      models = models.filter((m) => m.supportsTools);
    }

    if (criteria.task === 'embedding') {
      models = models.filter((m) => m.supportsEmbedding);
    }

    if (models.length === 0) {
      return undefined;
    }

    // 根据策略排序
    switch (strategy) {
      case 'cheapest':
        models.sort(
          (a, b) => (a.inputPricePer1k || 0) - (b.inputPricePer1k || 0)
        );
        break;
      case 'fastest':
        // MVP: 假设上下文窗口小的更快
        models.sort((a, b) => a.contextWindow - b.contextWindow);
        break;
      case 'best-quality':
        // MVP: 假设上下文窗口大的质量更好
        models.sort((a, b) => b.contextWindow - a.contextWindow);
        break;
      case 'balanced':
      default:
        // 平衡策略：综合考虑价格和质量
        models.sort((a, b) => {
          const scoreA =
            (a.contextWindow / 8000) * 0.5 +
            (1 - (a.inputPricePer1k || 0) / 0.1) * 0.5;
          const scoreB =
            (b.contextWindow / 8000) * 0.5 +
            (1 - (b.inputPricePer1k || 0) / 0.1) * 0.5;
          return scoreB - scoreA;
        });
        break;
    }

    return models[0];
  }

  /**
   * 获取指定模型的提供商
   */
  getProviderForModel(modelId: string): IModelProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.getModelInfo(modelId)) {
        return provider;
      }
    }
    return undefined;
  }
}

/**
 * 模型路由器接口
 * 负责根据需求选择最合适的模型提供商
 */
export interface IModelRouter {
  /**
   * 路由聊天请求到合适的模型
   * @param request 聊天请求
   * @param options 路由选项
   */
  route(
    request: ChatCompletionRequest,
    options?: {
      strategy?: RoutingStrategy;
      preferredModel?: string;
      preferredProvider?: string;
      agentId?: ID;
    }
  ): Promise<ChatCompletionResponse>;

  /**
   * 路由嵌入请求到合适的模型
   * @param request 嵌入请求
   * @param options 路由选项
   */
  routeEmbedding(
    request: EmbeddingRequest,
    options?: {
      preferredModel?: string;
      preferredProvider?: string;
    }
  ): Promise<EmbeddingResponse>;

  /**
   * 注册模型提供商
   * @param provider 模型提供商
   */
  registerProvider(provider: IModelProvider): void;

  /**
   * 注销模型提供商
   * @param providerId 提供商 ID
   */
  unregisterProvider(providerId: string): boolean;

  /**
   * 列出所有已注册的提供商
   */
  listProviders(): IModelProvider[];

  /**
   * 获取所有可用模型
   */
  listAllModels(): ModelInfo[];

  /**
   * 根据条件获取最佳模型
   * @param criteria 选择条件
   */
  getBestModel(criteria: {
    task?: 'chat' | 'embedding';
    strategy?: RoutingStrategy;
    minContextWindow?: number;
    requiresTools?: boolean;
  }): ModelInfo | undefined;

  /**
   * 获取指定模型的提供商
   * @param modelId 模型 ID
   */
  getProviderForModel(modelId: string): IModelProvider | undefined;
}

/**
 * 预算控制器实现类（内存版本）
 * 负责跟踪和控制 token 使用预算
 */
export class BudgetController implements IBudgetController {
  private globalBudget: number;
  private agentBudgets: Map<ID, number> = new Map();
  private globalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    timestamp: now(),
    model: '',
  };
  private agentUsage: Map<ID, TokenUsage> = new Map();
  private usageHistory: TokenUsage[] = [];
  private warningThreshold: number;

  constructor(dailyBudget: number = DEFAULTS.DAILY_TOKEN_BUDGET) {
    this.globalBudget = dailyBudget;
    this.warningThreshold = DEFAULTS.BUDGET_WARNING_THRESHOLD;
  }

  /**
   * 记录 token 使用
   */
  async trackUsage(usage: TokenUsage): Promise<void> {
    // 更新全局使用量
    this.globalUsage.inputTokens += usage.inputTokens;
    this.globalUsage.outputTokens += usage.outputTokens;
    this.globalUsage.totalTokens += usage.totalTokens;

    // 更新 Agent 使用量
    if (usage.agentId) {
      let agentUsage = this.agentUsage.get(usage.agentId);
      if (!agentUsage) {
        agentUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          timestamp: now(),
          model: '',
          agentId: usage.agentId,
        };
        this.agentUsage.set(usage.agentId, agentUsage);
      }
      agentUsage.inputTokens += usage.inputTokens;
      agentUsage.outputTokens += usage.outputTokens;
      agentUsage.totalTokens += usage.totalTokens;
    }

    // 记录历史
    this.usageHistory.push(usage);

    // 检查预算警告
    const percentage = await this.getBudgetPercentage(usage.agentId);
    if (percentage >= this.warningThreshold && percentage < 1) {
      globalEventBus.emit(
        'budget.warning',
        usage.agentId ? this.agentUsage.get(usage.agentId)?.totalTokens || 0 : this.globalUsage.totalTokens,
        usage.agentId ? this.getDailyBudget(usage.agentId) : this.globalBudget,
        now()
      );
    }

    // 检查预算超限
    if (percentage >= 1) {
      globalEventBus.emit(
        'budget.exceeded',
        usage.agentId ? this.agentUsage.get(usage.agentId)?.totalTokens || 0 : this.globalUsage.totalTokens,
        usage.agentId ? this.getDailyBudget(usage.agentId) : this.globalBudget,
        now()
      );
    }
  }

  /**
   * 检查预算是否足够
   */
  async checkBudget(estimatedTokens: number, agentId?: ID): Promise<boolean> {
    const currentUsage = agentId
      ? this.agentUsage.get(agentId)?.totalTokens || 0
      : this.globalUsage.totalTokens;

    const budget = agentId
      ? this.getDailyBudget(agentId)
      : this.globalBudget;

    return currentUsage + estimatedTokens <= budget;
  }

  /**
   * 获取今日使用量
   */
  async getDailyUsage(agentId?: ID): Promise<TokenUsage> {
    if (agentId) {
      return (
        this.agentUsage.get(agentId) || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          timestamp: now(),
          model: '',
          agentId,
        }
      );
    }
    return { ...this.globalUsage };
  }

  /**
   * 获取每日预算
   */
  getDailyBudget(agentId?: ID): number {
    if (agentId) {
      return this.agentBudgets.get(agentId) || this.globalBudget;
    }
    return this.globalBudget;
  }

  /**
   * 设置每日预算
   */
  setDailyBudget(budget: number, agentId?: ID): void {
    if (budget < 0) {
      throw new ModelRouterError('预算不能为负数', 'INVALID_BUDGET');
    }

    if (agentId) {
      this.agentBudgets.set(agentId, budget);
    } else {
      this.globalBudget = budget;
    }
  }

  /**
   * 重置每日使用量
   */
  async resetDaily(agentId?: ID): Promise<void> {
    if (agentId) {
      this.agentUsage.set(agentId, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        timestamp: now(),
        model: '',
        agentId,
      });
    } else {
      this.globalUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        timestamp: now(),
        model: '',
      };
      this.agentUsage.clear();
    }
  }

  /**
   * 获取使用历史
   */
  async getUsageHistory(options?: {
    agentId?: ID;
    startDate?: Timestamp;
    endDate?: Timestamp;
    limit?: number;
  }): Promise<TokenUsage[]> {
    let history = [...this.usageHistory];

    if (options?.agentId) {
      history = history.filter((u) => u.agentId === options.agentId);
    }

    if (options?.startDate) {
      history = history.filter((u) => u.timestamp >= options.startDate!);
    }

    if (options?.endDate) {
      history = history.filter((u) => u.timestamp <= options.endDate!);
    }

    // 按时间倒序
    history.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      history = history.slice(0, options.limit);
    }

    return history;
  }

  /**
   * 获取预算使用百分比
   */
  async getBudgetPercentage(agentId?: ID): Promise<number> {
    const usage = await this.getDailyUsage(agentId);
    const budget = this.getDailyBudget(agentId);

    if (budget === 0) {
      return 0;
    }

    return usage.totalTokens / budget;
  }
}

/**
 * 预算控制器接口
 * 负责跟踪和控制 token 使用预算
 */
export interface IBudgetController {
  /**
   * 记录 token 使用
   * @param usage 使用统计
   */
  trackUsage(usage: TokenUsage): Promise<void>;

  /**
   * 检查预算是否足够
   * @param estimatedTokens 预估 token 数
   * @param agentId Agent ID（可选）
   */
  checkBudget(estimatedTokens: number, agentId?: ID): Promise<boolean>;

  /**
   * 获取今日使用量
   * @param agentId Agent ID（可选，不传则返回全局）
   */
  getDailyUsage(agentId?: ID): Promise<TokenUsage>;

  /**
   * 获取每日预算
   * @param agentId Agent ID（可选）
   */
  getDailyBudget(agentId?: ID): number;

  /**
   * 设置每日预算
   * @param budget 预算（token 数）
   * @param agentId Agent ID（可选，不传则设置全局）
   */
  setDailyBudget(budget: number, agentId?: ID): void;

  /**
   * 重置每日使用量
   * @param agentId Agent ID（可选）
   */
  resetDaily(agentId?: ID): Promise<void>;

  /**
   * 获取使用历史
   * @param options 查询选项
   */
  getUsageHistory(options?: {
    agentId?: ID;
    startDate?: Timestamp;
    endDate?: Timestamp;
    limit?: number;
  }): Promise<TokenUsage[]>;

  /**
   * 获取预算使用百分比
   * @param agentId Agent ID（可选）
   */
  getBudgetPercentage(agentId?: ID): Promise<number>;
}
