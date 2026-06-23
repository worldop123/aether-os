import type { ID, Timestamp, Metadata } from '@aether/shared';
import { now, globalEventBus } from '@aether/shared';
import { AgentError } from '@aether/shared';
import { Agent, AgentStatus, type IAgent, type AgentConfig } from './agent.js';
import type { IMemoryManager, MemoryMessage, MessageRole } from '@aether/memory';
import type {
  IModelRouter,
  IBudgetController,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolDefinition,
  ToolCall,
} from '@aether/model-router';
import type { IMcpManager, IMcpTool, McpToolResult } from '@aether/mcp';

/**
 * Agent 运行时配置
 */
export interface AgentRuntimeConfig {
  /** Agent 实例 */
  agent: IAgent;
  /** 记忆管理器（可选，不传则不使用记忆） */
  memoryManager?: IMemoryManager;
  /** 模型路由器（可选，不传则使用 echo 模式） */
  modelRouter?: IModelRouter;
  /** 预算控制器（可选） */
  budgetController?: IBudgetController;
  /** MCP 管理器（可选，不传则不使用工具） */
  mcpManager?: IMcpManager;
  /** 最大工具调用循环次数（默认 10） */
  maxToolRounds?: number;
  /** 系统提示词（覆盖 Agent 配置中的） */
  systemPrompt?: string;
}

/**
 * 工具调用结果事件
 */
export interface ToolExecutionEvent {
  /** Agent ID */
  agentId: ID;
  /** 工具调用 */
  toolCall: ToolCall;
  /** 执行结果 */
  result: McpToolResult;
  /** 耗时 */
  duration: number;
  /** 时间戳 */
  timestamp: Timestamp;
}

/**
 * Agent 运行时
 * 将 Agent 与 Memory、ModelRouter、MCP 集成，实现真正的对话和工具调用循环
 *
 * 工作流程：
 * 1. 用户消息加入短期记忆
 * 2. 构建上下文（系统提示 + 历史消息 + 用户消息）
 * 3. 调用模型路由器获取响应
 * 4. 如果响应包含工具调用：
 *    a. 执行每个工具调用
 *    b. 将工具结果加入记忆
 *    c. 再次调用模型（循环）
 * 5. 返回最终响应
 */
export class AgentRuntime {
  readonly agent: IAgent;
  private memoryManager?: IMemoryManager;
  private modelRouter?: IModelRouter;
  private budgetController?: IBudgetController;
  private mcpManager?: IMcpManager;
  private maxToolRounds: number;
  private systemPrompt?: string;

  constructor(config: AgentRuntimeConfig) {
    this.agent = config.agent;
    this.memoryManager = config.memoryManager;
    this.modelRouter = config.modelRouter;
    this.budgetController = config.budgetController;
    this.mcpManager = config.mcpManager;
    this.maxToolRounds = config.maxToolRounds ?? 10;
    this.systemPrompt = config.systemPrompt ?? config.agent.config.systemPrompt;

    // 初始化系统提示词到记忆
    if (this.memoryManager && this.systemPrompt) {
      this.memoryManager.shortTerm.addMessage({
        role: 'system' as MessageRole,
        content: this.systemPrompt,
      });
    }
  }

  /**
   * 发送消息并获取响应
   * 实现完整的工具调用循环
   */
  async sendMessage(message: string): Promise<string> {
    if (this.agent.status !== AgentStatus.RUNNING) {
      throw new AgentError(
        `只能向运行中的 Agent 发送消息，当前状态: ${this.agent.status}`,
        'AGENT_NOT_RUNNING'
      );
    }

    // 如果没有模型路由器，回退到 echo 模式
    if (!this.modelRouter) {
      const response = `Echo: ${message}`;
      if (this.memoryManager) {
        this.memoryManager.shortTerm.addMessage({ role: 'user' as MessageRole, content: message });
        this.memoryManager.shortTerm.addMessage({ role: 'assistant' as MessageRole, content: response });
      }
      return response;
    }

    try {
      // 1. 用户消息加入记忆
      if (this.memoryManager) {
        this.memoryManager.shortTerm.addMessage({ role: 'user' as MessageRole, content: message });
      }

      // 2. 工具调用循环
      let rounds = 0;
      let lastResponse: ChatCompletionResponse | undefined;

      while (rounds < this.maxToolRounds) {
        // 3. 构建上下文
        const messages = this.buildContext();

        // 4. 构建请求
        const request: ChatCompletionRequest = {
          messages,
          model: this.agent.config.defaultModel,
          temperature: this.agent.config.temperature,
          maxTokens: this.agent.config.maxTokens,
        };

        // 5. 添加工具定义（如果启用）
        if (this.agent.config.toolsEnabled && this.mcpManager) {
          const tools = await this.getToolDefinitions();
          if (tools.length > 0) {
            request.tools = tools;
            request.toolChoice = 'auto';
          }
        }

        // 6. 预算检查
        if (this.budgetController) {
          const estimatedTokens = this.estimateTokens(messages) + 200;
          const canSpend = await this.budgetController.checkBudget(
            estimatedTokens,
            this.agent.id
          );
          if (!canSpend) {
            const response = '预算已耗尽，无法处理请求。';
            if (this.memoryManager) {
              this.memoryManager.shortTerm.addMessage({
                role: 'assistant' as MessageRole,
                content: response,
              });
            }
            return response;
          }
        }

        // 7. 调用模型
        lastResponse = await this.modelRouter.route(request, {
          agentId: this.agent.id,
        });

        // 8. 记录 token 使用
        if (this.budgetController) {
          await this.budgetController.trackUsage({
            ...lastResponse.usage,
            agentId: this.agent.id,
          });
        }

        // 9. 检查是否有工具调用
        const toolCalls = lastResponse.message.toolCalls;
        if (!toolCalls || toolCalls.length === 0) {
          // 没有工具调用，返回最终响应
          const finalContent = lastResponse.message.content;

          // 助手回复加入记忆
          if (this.memoryManager) {
            this.memoryManager.shortTerm.addMessage({
              role: 'assistant' as MessageRole,
              content: finalContent,
            });
          }

          return finalContent;
        }

        // 10. 有工具调用，执行工具
        // 先把助手的工具调用消息加入记忆
        if (this.memoryManager) {
          this.memoryManager.shortTerm.addMessage({
            role: 'assistant' as MessageRole,
            content: lastResponse.message.content || '',
            toolCalls: toolCalls,
          });
        }

        // 执行每个工具调用
        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall);

          // 工具结果加入记忆
          if (this.memoryManager) {
            this.memoryManager.shortTerm.addMessage({
              role: 'tool' as MessageRole,
              content: result.content,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            });
          }
        }

        rounds++;
      }

      // 达到最大循环次数，返回最后的响应
      const fallbackContent =
        lastResponse?.message.content || '达到最大工具调用次数限制。';

      if (this.memoryManager) {
        this.memoryManager.shortTerm.addMessage({
          role: 'assistant' as MessageRole,
          content: fallbackContent,
        });
      }

      return fallbackContent;
    } catch (error) {
      globalEventBus.emit('agent.error', this.agent.id, error as Error, now());
      throw error;
    }
  }

  /**
   * 构建对话上下文
   */
  private buildContext(): ChatMessage[] {
    if (!this.memoryManager) {
      return [{ role: 'user', content: '' }];
    }

    const context = this.memoryManager.shortTerm.getContext();
    return context.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCallId: msg.toolCallId,
      toolCalls: msg.toolCalls as ToolCall[] | undefined,
    }));
  }

  /**
   * 获取可用工具定义列表
   */
  private async getToolDefinitions(): Promise<ToolDefinition[]> {
    if (!this.mcpManager) return [];

    try {
      const tools = await this.mcpManager.listAllTools();
      return tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: this.convertParametersToSchema(tool.parameters),
        },
      }));
    } catch {
      return [];
    }
  }

  /**
   * 将 MCP 工具参数定义转换为 JSON Schema
   */
  private convertParametersToSchema(
    params: IMcpTool['parameters']
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of params) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description || '',
      };
      if (param.enum) prop['enum'] = param.enum;
      if (param.default !== undefined) prop['default'] = param.default;
      properties[param.name] = prop;
      if (param.required) required.push(param.name);
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: ToolCall): Promise<McpToolResult> {
    if (!this.mcpManager) {
      return {
        success: false,
        content: '',
        error: 'MCP 管理器未配置',
        duration: 0,
      };
    }

    const startTime = now();
    try {
      const result = await this.mcpManager.executeTool(
        toolCall.name,
        toolCall.arguments
      );

      const duration = now() - startTime;

      // 触发工具执行事件
      globalEventBus.emit(
        'mcp.tool_called',
        toolCall.name,
        this.agent.id,
        now()
      );

      return { ...result, duration };
    } catch (error) {
      const duration = now() - startTime;
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  /**
   * 估算消息 token 数（简化版）
   */
  private estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += Math.ceil(msg.content.length / 4);
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += Math.ceil(JSON.stringify(tc.arguments).length / 4);
        }
      }
    }
    return total;
  }

  /**
   * 获取当前对话历史
   */
  getHistory(): MemoryMessage[] {
    if (!this.memoryManager) return [];
    return this.memoryManager.shortTerm.getContext();
  }

  /**
   * 清除对话历史（保留系统提示词）
   */
  clearHistory(): void {
    if (!this.memoryManager) return;
    this.memoryManager.shortTerm.clear();
    if (this.systemPrompt) {
      this.memoryManager.shortTerm.addMessage({
        role: 'system' as MessageRole,
        content: this.systemPrompt,
      });
    }
  }
}

/**
 * Agent 运行时管理器
 * 管理多个 AgentRuntime 实例
 */
export class AgentRuntimeManager {
  private runtimes: Map<ID, AgentRuntime> = new Map();
  private processManager: import('./agent.js').ProcessManager;
  private memoryManager?: IMemoryManager;
  private modelRouter?: IModelRouter;
  private budgetController?: IBudgetController;
  private mcpManager?: IMcpManager;

  constructor(options: {
    processManager: import('./agent.js').ProcessManager;
    memoryManager?: IMemoryManager;
    modelRouter?: IModelRouter;
    budgetController?: IBudgetController;
    mcpManager?: IMcpManager;
  }) {
    this.processManager = options.processManager;
    this.memoryManager = options.memoryManager;
    this.modelRouter = options.modelRouter;
    this.budgetController = options.budgetController;
    this.mcpManager = options.mcpManager;
  }

  /**
   * 为 Agent 创建运行时
   */
  createRuntime(
    agentId: ID,
    config?: Partial<AgentRuntimeConfig>
  ): AgentRuntime {
    const agent = this.processManager.getAgent(agentId);
    if (!agent) {
      throw new AgentError(`Agent ${agentId} 不存在`, 'AGENT_NOT_FOUND');
    }

    const runtime = new AgentRuntime({
      agent,
      memoryManager: this.memoryManager,
      modelRouter: this.modelRouter,
      budgetController: this.budgetController,
      mcpManager: this.mcpManager,
      ...config,
    });

    this.runtimes.set(agentId, runtime);
    return runtime;
  }

  /**
   * 获取 Agent 的运行时
   */
  getRuntime(agentId: ID): AgentRuntime | undefined {
    return this.runtimes.get(agentId);
  }

  /**
   * 发送消息给指定 Agent
   */
  async sendMessage(agentId: ID, message: string): Promise<string> {
    let runtime = this.runtimes.get(agentId);
    if (!runtime) {
      runtime = this.createRuntime(agentId);
    }
    return runtime.sendMessage(message);
  }

  /**
   * 列出所有运行时
   */
  listRuntimes(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }

  /**
   * 移除运行时
   */
  removeRuntime(agentId: ID): boolean {
    return this.runtimes.delete(agentId);
  }
}
