import type { ID } from '@aether/shared';
import type { AgentStatus, AgentConfig } from '@aether/core';
import type { TaskType } from '@aether/scheduler';
import { ProcessManager } from '@aether/core';
import { MemoryManager } from '@aether/memory';
import { BudgetController, ModelRouter, MockModelProvider } from '@aether/model-router';
import { McpManager } from '@aether/mcp';
import { TaskScheduler } from '@aether/scheduler';
import {
  colorize,
  success as successText,
  error as errorText,
  warn as warnText,
  title as titleText,
  dim as dimText,
} from './colors.js';
import { Spinner } from './progress.js';
import {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  getConfigPath,
  type UserConfig,
} from './config.js';
import { InteractiveSession } from './interactive.js';

/**
 * CLI 命令参数
 */
export interface CliCommandArgs {
  /** 位置参数 */
  _: string[];
  /** 命名参数 */
  [key: string]: unknown;
}

/**
 * CLI 命令选项
 */
export interface CliCommandOption {
  /** 选项名称（长选项） */
  name: string;
  /** 短选项 */
  alias?: string;
  /** 选项描述 */
  description: string;
  /** 选项类型 */
  type: 'string' | 'number' | 'boolean';
  /** 默认值 */
  default?: unknown;
  /** 是否必填 */
  required?: boolean;
}

/**
 * CLI 命令定义
 */
export interface CliCommand {
  /** 命令名称 */
  name: string;
  /** 命令描述 */
  description: string;
  /** 子命令 */
  subcommands?: CliCommand[];
  /** 选项 */
  options?: CliCommandOption[];
  /** 使用示例 */
  examples?: string[];
  /** 执行函数 */
  execute?: (args: CliCommandArgs) => Promise<void>;
}

/**
 * CLI 输出格式
 */
export type OutputFormat = 'text' | 'json' | 'table';

/**
 * CLI 全局配置
 */
export interface CliConfig {
  /** 输出格式 */
  outputFormat: OutputFormat;
  /** 是否彩色输出 */
  color: boolean;
  /** 是否静默模式 */
  quiet: boolean;
  /** 是否详细模式 */
  verbose: boolean;
  /** 配置文件路径 */
  configPath?: string;
  /** 数据目录 */
  dataDir: string;
}

// ===== Agent 命令 =====
/**
 * Agent 列表项（用于 CLI 输出）
 */
export interface AgentListItem {
  id: ID;
  name: string;
  status: AgentStatus;
  createdAt: string;
}

/**
 * Agent 详情（用于 CLI 输出）
 */
export interface AgentDetail {
  id: ID;
  name: string;
  description?: string;
  status: AgentStatus;
  config: AgentConfig;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

// ===== Memory 命令 =====
/**
 * 记忆搜索结果（用于 CLI 输出）
 */
export interface MemorySearchResult {
  id: ID;
  content: string;
  type: string;
  similarity?: number;
  createdAt: string;
}

// ===== Budget 命令 =====
/**
 * 预算状态（用于 CLI 输出）
 */
export interface BudgetStatus {
  dailyBudget: number;
  dailyUsed: number;
  percentage: number;
  remaining: number;
  resetTime: string;
}

// ===== MCP 命令 =====
/**
 * MCP 工具列表项（用于 CLI 输出）
 */
export interface McpToolListItem {
  name: string;
  description: string;
  serverName: string;
}

/**
 * MCP 服务器列表项（用于 CLI 输出）
 */
export interface McpServerListItem {
  name: string;
  status: string;
  toolCount: number;
  type: string;
}

// ===== Schedule 命令 =====
/**
 * 定时任务列表项（用于 CLI 输出）
 */
export interface ScheduleListItem {
  id: ID;
  name: string;
  taskType: TaskType;
  cron: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

/**
 * 简单的参数解析器
 */
function parseArgs(argv: string[]): CliCommandArgs {
  const args: CliCommandArgs = { _: [] };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      // 长选项
      const key = arg.slice(2);
      const eqIndex = key.indexOf('=');

      if (eqIndex !== -1) {
        // --key=value 形式
        const name = key.slice(0, eqIndex);
        const value = key.slice(eqIndex + 1);
        args[name] = parseValue(value);
      } else {
        // --key value 形式
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          args[key] = parseValue(nextArg);
          i++;
        } else {
          // 布尔标志
          args[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // 短选项
      const key = arg.slice(1);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        args[key] = parseValue(nextArg);
        i++;
      } else {
        args[key] = true;
      }
    } else {
      // 位置参数
      args._.push(arg);
    }

    i++;
  }

  return args;
}

/**
 * 解析值的类型
 */
function parseValue(value: string): string | number | boolean {
  // 尝试解析为数字
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // 尝试解析为布尔值
  if (value === 'true') return true;
  if (value === 'false') return false;

  return value;
}

/**
 * CLI 应用主类
 */
export class CliApp {
  private config: CliConfig;
  private userConfig: UserConfig;
  private processManager: ProcessManager;
  private memoryManager: MemoryManager;
  private budgetController: BudgetController;
  private modelRouter: ModelRouter;
  private mcpManager: McpManager;
  private taskScheduler: TaskScheduler;
  private commands: CliCommand[] = [];
  private initialized = false;

  constructor() {
    this.config = {
      outputFormat: 'text',
      color: true,
      quiet: false,
      verbose: false,
      dataDir: './data',
    };
    this.userConfig = createDefaultConfig();

    // 初始化核心组件
    this.processManager = new ProcessManager();
    this.memoryManager = new MemoryManager('default');
    this.budgetController = new BudgetController();
    this.modelRouter = new ModelRouter();
    this.mcpManager = new McpManager();
    this.taskScheduler = new TaskScheduler();

    // 注册默认模型提供商
    this.modelRouter.registerProvider(new MockModelProvider());

    // 注册命令
    this.registerCommands();
  }

  /**
   * 异步初始化：加载用户配置
   *
   * 在 run() 开始时调用，避免破坏同步构造函数。
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    try {
      this.userConfig = await loadConfig(this.config.configPath);
    } catch {
      // 加载失败时使用默认配置，不阻断 CLI
      this.userConfig = createDefaultConfig();
    }
    // 用用户配置覆盖默认值（CLI 标志稍后会覆盖用户配置）
    this.config.outputFormat = this.userConfig.outputFormat;
    this.config.color = this.userConfig.color;
    this.config.quiet = this.userConfig.quiet;
    this.config.verbose = this.userConfig.verbose;
    if (this.userConfig.dataDir) {
      this.config.dataDir = this.userConfig.dataDir;
    }
    this.initialized = true;
  }

  /**
   * 是否启用彩色输出（根据 config.color 和 TTY 检测）
   */
  private get colorsEnabled(): boolean {
    return this.config.color && process.stdout.isTTY === true;
  }

  /**
   * 注册所有命令
   */
  private registerCommands(): void {
    this.commands = [
      this.createAgentCommand(),
      this.createMemoryCommand(),
      this.createBudgetCommand(),
      this.createMcpCommand(),
      this.createScheduleCommand(),
      this.createChatCommand(),
      this.createConfigCommand(),
      this.createWebCommand(),
    ];
  }

  /**
   * 创建 agent 命令
   */
  private createAgentCommand(): CliCommand {
    return {
      name: 'agent',
      description: '管理 Agent 实例',
      subcommands: [
        {
          name: 'list',
          description: '列出所有 Agent',
          options: [
            { name: 'status', alias: 's', description: '按状态过滤', type: 'string' },
            { name: 'format', alias: 'f', description: '输出格式 (text/json/table)', type: 'string', default: 'text' },
          ],
          execute: async (args) => {
            const status = args.status as string | undefined;
            const agents = this.processManager.listAgents(status as AgentStatus);

            const items: AgentListItem[] = agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              status: agent.getStatus(),
              createdAt: new Date(agent.createdAt).toLocaleString(),
            }));

            this.output(items, args.format as OutputFormat);
          },
        },
        {
          name: 'create',
          description: '创建新的 Agent',
          options: [
            { name: 'name', alias: 'n', description: 'Agent 名称', type: 'string', required: true },
            { name: 'description', alias: 'd', description: 'Agent 描述', type: 'string' },
            { name: 'model', alias: 'm', description: '默认模型', type: 'string' },
          ],
          execute: async (args) => {
            const name = args.name as string;
            const description = args.description as string | undefined;
            const model = args.model as string | undefined;

            const agent = await this.processManager.createAgent(name, {
              defaultModel: model,
            });

            this.output({
              id: agent.id,
              name: agent.name,
              status: agent.getStatus(),
              createdAt: new Date(agent.createdAt).toLocaleString(),
            }, 'json');
          },
        },
        {
          name: 'start',
          description: '启动 Agent',
          options: [
            { name: 'id', description: 'Agent ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            if (this.config.quiet) {
              await this.processManager.startAgent(id);
              return;
            }
            const spinner = new Spinner(`启动 Agent ${id}...`, this.colorsEnabled);
            spinner.start();
            try {
              await this.processManager.startAgent(id);
              spinner.stop(successText(`Agent ${id} 已启动`, this.colorsEnabled));
            } catch (err) {
              spinner.fail(err instanceof Error ? err.message : String(err));
            }
          },
        },
        {
          name: 'stop',
          description: '停止 Agent',
          options: [
            { name: 'id', description: 'Agent ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            await this.processManager.stopAgent(id);
            this.output(`Agent ${id} 已停止`);
          },
        },
        {
          name: 'pause',
          description: '暂停 Agent',
          options: [
            { name: 'id', description: 'Agent ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            await this.processManager.pauseAgent(id);
            this.output(`Agent ${id} 已暂停`);
          },
        },
        {
          name: 'resume',
          description: '恢复 Agent',
          options: [
            { name: 'id', description: 'Agent ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            await this.processManager.resumeAgent(id);
            this.output(`Agent ${id} 已恢复`);
          },
        },
        {
          name: 'status',
          description: '查看 Agent 状态',
          options: [
            { name: 'id', description: 'Agent ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            const agent = this.processManager.getAgent(id);
            if (!agent) {
              this.output(`Agent ${id} 不存在`);
              return;
            }

            this.output({
              id: agent.id,
              name: agent.name,
              status: agent.getStatus(),
              createdAt: new Date(agent.createdAt).toLocaleString(),
            }, 'json');
          },
        },
      ],
    };
  }

  /**
   * 创建 memory 命令
   */
  private createMemoryCommand(): CliCommand {
    return {
      name: 'memory',
      description: '管理记忆系统',
      subcommands: [
        {
          name: 'search',
          description: '搜索长期记忆',
          options: [
            { name: 'query', alias: 'q', description: '搜索查询', type: 'string', required: true },
            { name: 'limit', alias: 'l', description: '结果数量限制', type: 'number', default: 5 },
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'text' },
          ],
          execute: async (args) => {
            const query = args.query as string;
            const limit = args.limit as number;

            const results = await this.memoryManager.longTerm.search('default', query, {
              topK: limit,
            });

            const items: MemorySearchResult[] = results.map((r) => ({
              id: r.item.id,
              content: r.item.content,
              type: r.item.type,
              similarity: r.similarity,
              createdAt: new Date(r.item.createdAt).toLocaleString(),
            }));

            this.output(items, args.format as OutputFormat);
          },
        },
        {
          name: 'add',
          description: '添加记忆',
          options: [
            { name: 'content', alias: 'c', description: '记忆内容', type: 'string', required: true },
            { name: 'type', alias: 't', description: '记忆类型 (fact/experience/preference)', type: 'string', default: 'fact' },
            { name: 'importance', alias: 'i', description: '重要性 (0-1)', type: 'number', default: 0.5 },
          ],
          execute: async (args) => {
            const content = args.content as string;
            const type = args.type as 'fact' | 'experience' | 'preference';
            const importance = args.importance as number;

            const memory = await this.memoryManager.longTerm.store('default', content, {
              type,
              importance,
            });

            this.output({
              id: memory.id,
              content: memory.content,
              type: memory.type,
              importance: memory.importance,
              createdAt: new Date(memory.createdAt).toLocaleString(),
            }, 'json');
          },
        },
        {
          name: 'list',
          description: '列出所有记忆',
          options: [
            { name: 'type', alias: 't', description: '按类型过滤', type: 'string' },
            { name: 'limit', alias: 'l', description: '数量限制', type: 'number', default: 20 },
          ],
          execute: async (args) => {
            const type = args.type as string | undefined;
            const limit = args.limit as number;

            const { items } = await this.memoryManager.longTerm.list('default', {
              type: type as any,
              pageSize: limit,
            });

            this.output(items.map((m) => ({
              id: m.id,
              content: m.content.substring(0, 50) + (m.content.length > 50 ? '...' : ''),
              type: m.type,
              importance: m.importance,
              createdAt: new Date(m.createdAt).toLocaleString(),
            })), 'table');
          },
        },
      ],
    };
  }

  /**
   * 创建 budget 命令
   */
  private createBudgetCommand(): CliCommand {
    return {
      name: 'budget',
      description: '管理 Token 预算',
      subcommands: [
        {
          name: 'status',
          description: '查看预算状态',
          options: [
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'text' },
          ],
          execute: async (args) => {
            const usage = await this.budgetController.getDailyUsage();
            const budget = this.budgetController.getDailyBudget();
            const percentage = await this.budgetController.getBudgetPercentage();

            const status: BudgetStatus = {
              dailyBudget: budget,
              dailyUsed: usage.totalTokens,
              percentage,
              remaining: budget - usage.totalTokens,
              resetTime: '明天 00:00',
            };

            this.output(status, args.format as OutputFormat);
          },
        },
        {
          name: 'set',
          description: '设置每日预算',
          options: [
            { name: 'amount', alias: 'a', description: '预算金额', type: 'number', required: true },
          ],
          execute: async (args) => {
            const amount = args.amount as number;
            this.budgetController.setDailyBudget(amount);
            this.output(`每日预算已设置为 ${amount} tokens`);
          },
        },
        {
          name: 'reset',
          description: '重置今日使用量',
          execute: async () => {
            await this.budgetController.resetDaily();
            this.output('今日使用量已重置');
          },
        },
      ],
    };
  }

  /**
   * 创建 mcp 命令
   */
  private createMcpCommand(): CliCommand {
    return {
      name: 'mcp',
      description: '管理 MCP 工具和服务器',
      subcommands: [
        {
          name: 'servers',
          description: '列出所有 MCP 服务器',
          options: [
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'table' },
          ],
          execute: async (args) => {
            const servers = this.mcpManager.listServers();
            const items: McpServerListItem[] = await Promise.all(
              servers.map(async (s) => ({
                name: s.name,
                status: s.isConnected() ? 'connected' : 'disconnected',
                toolCount: s.isConnected() ? (await s.listTools()).length : 0,
                type: s.config.type,
              }))
            );

            this.output(items, args.format as OutputFormat);
          },
        },
        {
          name: 'tools',
          description: '列出所有可用工具',
          options: [
            { name: 'server', alias: 's', description: '服务器名称', type: 'string' },
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'table' },
          ],
          execute: async (args) => {
            const serverName = args.server as string | undefined;
            let tools;

            if (serverName) {
              const server = this.mcpManager.getServer(serverName);
              if (!server) {
                this.output(`服务器 ${serverName} 不存在`);
                return;
              }
              tools = await server.listTools();
            } else {
              tools = await this.mcpManager.listAllTools();
            }

            const items: McpToolListItem[] = tools.map((t) => ({
              name: t.name,
              description: t.description,
              serverName: t.serverName,
            }));

            this.output(items, args.format as OutputFormat);
          },
        },
        {
          name: 'run',
          description: '执行工具',
          options: [
            { name: 'tool', alias: 't', description: '工具名称', type: 'string', required: true },
            { name: 'args', alias: 'a', description: '工具参数 (JSON 格式)', type: 'string', default: '{}' },
            { name: 'server', alias: 's', description: '服务器名称', type: 'string' },
          ],
          execute: async (args) => {
            const toolName = args.tool as string;
            const toolArgs = JSON.parse(args.args as string);
            const serverName = args.server as string | undefined;

            const result = await this.mcpManager.executeTool(toolName, toolArgs, serverName);
            this.output(result, 'json');
          },
        },
      ],
    };
  }

  /**
   * 创建 schedule 命令
   */
  private createScheduleCommand(): CliCommand {
    return {
      name: 'schedule',
      description: '管理定时任务',
      subcommands: [
        {
          name: 'list',
          description: '列出所有定时任务',
          options: [
            { name: 'agent', alias: 'a', description: '按 Agent 过滤', type: 'string' },
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'table' },
          ],
          execute: async (args) => {
            const agentId = args.agent as string | undefined;
            const { items } = await this.taskScheduler.listTasks({
              agentId,
            });

            const listItems: ScheduleListItem[] = items.map((t) => ({
              id: t.id,
              name: t.name,
              taskType: t.taskType,
              cron: t.cron,
              enabled: t.enabled,
              lastRunAt: t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : undefined,
              nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toLocaleString() : undefined,
            }));

            this.output(listItems, args.format as OutputFormat);
          },
        },
        {
          name: 'add',
          description: '添加定时任务',
          options: [
            { name: 'name', alias: 'n', description: '任务名称', type: 'string', required: true },
            { name: 'agent', alias: 'a', description: 'Agent ID', type: 'string', required: true },
            { name: 'cron', description: 'Cron 表达式', type: 'string', required: true },
            { name: 'type', alias: 't', description: '任务类型', type: 'string', default: 'custom' },
            { name: 'payload', alias: 'p', description: '任务载荷 (JSON)', type: 'string', default: '{}' },
          ],
          execute: async (args) => {
            const name = args.name as string;
            const agentId = args.agent as string;
            const cron = args.cron as string;
            const taskType = args.type as TaskType;
            const payload = JSON.parse(args.payload as string);

            const task = await this.taskScheduler.schedule({
              name,
              agentId,
              cron,
              taskType,
              payload,
            });

            this.output({
              id: task.id,
              name: task.name,
              cron: task.cron,
              enabled: task.enabled,
              createdAt: new Date(task.createdAt).toLocaleString(),
            }, 'json');
          },
        },
        {
          name: 'cancel',
          description: '取消定时任务',
          options: [
            { name: 'id', description: '任务 ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            const result = await this.taskScheduler.cancel(id);
            this.output(result ? `任务 ${id} 已取消` : `任务 ${id} 不存在`);
          },
        },
        {
          name: 'run',
          description: '立即执行任务',
          options: [
            { name: 'id', description: '任务 ID', type: 'string', required: true },
          ],
          execute: async (args) => {
            const id = args.id as string;
            const result = await this.taskScheduler.executeNow(id);
            this.output(result, 'json');
          },
        },
      ],
    };
  }

  /**
   * 创建 chat 命令
   */
  private createChatCommand(): CliCommand {
    return {
      name: 'chat',
      description: '与 Agent 对话',
      options: [
        { name: 'agent', alias: 'a', description: 'Agent ID', type: 'string', default: 'default' },
        { name: 'message', alias: 'm', description: '消息内容', type: 'string' },
        { name: 'interactive', alias: 'i', description: '进入交互模式 (REPL)', type: 'boolean' },
      ],
      execute: async (args) => {
        const agentId = args.agent as string;
        const interactive = args.interactive === true || args.i === true;

        // 确保 Agent 存在
        let agent = this.processManager.getAgent(agentId);
        if (!agent) {
          agent = await this.processManager.createAgent(agentId);
        }

        if (interactive) {
          const session = new InteractiveSession({
            onMessage: async (input: string) => agent.sendMessage(input),
            welcome: `与 Agent ${agentId} 对话（输入 /exit 退出）`,
            prompt: `${agentId}> `,
          });
          await session.start();
          return;
        }

        const message = args.message as string | undefined;
        if (!message) {
          this.output(errorText('错误: 缺少 --message 参数，或使用 --interactive 进入交互模式', this.colorsEnabled));
          return;
        }

        const response = await agent.sendMessage(message);
        this.output(response);
      },
    };
  }

  /**
   * 创建 config 命令
   */
  private createConfigCommand(): CliCommand {
    return {
      name: 'config',
      description: '管理用户配置',
      subcommands: [
        {
          name: 'list',
          description: '列出所有配置',
          options: [
            { name: 'format', alias: 'f', description: '输出格式', type: 'string', default: 'json' },
          ],
          execute: async (args) => {
            this.output(this.userConfig, args.format as OutputFormat);
          },
        },
        {
          name: 'get',
          description: '获取配置项',
          options: [
            { name: 'key', alias: 'k', description: '配置键 (支持点号分隔)', type: 'string', required: true },
          ],
          execute: async (args) => {
            const key = args.key as string;
            const value = this.getConfigValue(key);
            if (value === undefined) {
              this.output(warnText(`配置项 ${key} 不存在`, this.colorsEnabled));
              return;
            }
            this.output(value);
          },
        },
        {
          name: 'set',
          description: '设置配置项',
          options: [
            { name: 'key', alias: 'k', description: '配置键 (支持点号分隔)', type: 'string', required: true },
            { name: 'value', alias: 'v', description: '配置值', type: 'string', required: true },
          ],
          execute: async (args) => {
            const key = args.key as string;
            const rawValue = args.value as string;
            const parsedValue = parseValue(rawValue);
            this.setConfigValue(key, parsedValue);
            try {
              await saveConfig(this.userConfig, this.config.configPath);
              this.output(successText(`配置 ${key} 已设置为 ${rawValue}`, this.colorsEnabled));
            } catch (err) {
              this.output(errorText(`保存配置失败: ${err instanceof Error ? err.message : String(err)}`, this.colorsEnabled));
            }
          },
        },
        {
          name: 'path',
          description: '显示配置文件路径',
          execute: async () => {
            this.output(getConfigPath(this.config.configPath));
          },
        },
      ],
    };
  }

  /**
   * 创建 web 命令
   */
  private createWebCommand(): CliCommand {
    return {
      name: 'web',
      description: '启动 Web 管理界面',
      options: [
        { name: 'port', alias: 'p', description: '端口号', type: 'number', default: 3000 },
        { name: 'host', description: '主机地址', type: 'string', default: 'localhost' },
      ],
      execute: async (args) => {
        const port = args.port as number;
        const host = args.host as string;

        const { WebServer } = await import('@aether/web');
        const server = new WebServer({
          port,
          host,
          processManager: this.processManager,
          memoryManager: this.memoryManager,
          modelRouter: this.modelRouter,
          budgetController: this.budgetController,
          mcpManager: this.mcpManager,
          taskScheduler: this.taskScheduler,
        });

        await server.start();
        this.output(successText(`Web 管理界面已启动: ${server.url}`, this.colorsEnabled));
        this.output(dimText('按 Ctrl+C 停止服务器', this.colorsEnabled));

        // 优雅关闭
        const shutdown = async (): Promise<void> => {
          this.output('\n正在关闭服务器...');
          await server.stop();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      },
    };
  }

  /**
   * 获取配置值（支持点号分隔的嵌套键）
   */
  private getConfigValue(key: string): unknown {
    const parts = key.split('.');
    let current: unknown = this.userConfig;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * 设置配置值（支持点号分隔的嵌套键）
   */
  private setConfigValue(key: string, value: unknown): void {
    const parts = key.split('.');
    let current: Record<string, unknown> = this.userConfig as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  /**
   * 运行 CLI
   */
  async run(argv: string[]): Promise<void> {
    // 异步初始化（加载用户配置）
    await this.init();

    const args = parseArgs(argv);

    // 修复全局布尔选项（防止它们错误地消耗后面的位置参数）
    const booleanOptions = ['help', 'h', 'version', 'v', 'quiet', 'q', 'verbose', 'V'];
    for (const opt of booleanOptions) {
      if (typeof args[opt] === 'string') {
        // 这个布尔选项错误地消耗了一个位置参数
        const value = args[opt] as string;
        args[opt] = true;
        // 把值放回位置参数的开头
        args._.unshift(value);
      }
    }

    // 检查帮助选项
    if (args.help || args.h) {
      this.printHelp();
      return;
    }

    // 检查版本选项
    if (args.version || args.v) {
      console.log('Aether OS CLI v0.1.0');
      return;
    }

    // 解析全局选项
    if (args.format) {
      this.config.outputFormat = args.format as OutputFormat;
    }
    if (args.quiet || args.q) {
      this.config.quiet = true;
    }
    if (args.verbose || args.V) {
      this.config.verbose = true;
    }

    // 获取命令
    const commandName = args._[0];

    if (!commandName) {
      this.printHelp();
      return;
    }

    // 查找命令
    const command = this.commands.find((c) => c.name === commandName);
    if (!command) {
      console.error(`未知命令: ${commandName}`);
      console.log('使用 --help 查看可用命令');
      process.exit(1);
      return;
    }

    // 检查子命令
    const subcommandName = args._[1];

    if (command.subcommands && subcommandName) {
      const subcommand = command.subcommands.find((s) => s.name === subcommandName);
      if (!subcommand) {
        console.error(`未知子命令: ${subcommandName}`);
        console.log(`可用子命令: ${command.subcommands.map((s) => s.name).join(', ')}`);
        process.exit(1);
        return;
      }

      if (subcommand.execute) {
        // 移除命令名和子命令名，传递剩余参数
        const subArgs: CliCommandArgs = { ...args, _: args._.slice(2) };
        // 应用子命令选项的默认值
        if (subcommand.options) {
          for (const option of subcommand.options) {
            if (option.default !== undefined && subArgs[option.name] === undefined) {
              subArgs[option.name] = option.default;
            }
          }
        }
        await subcommand.execute(subArgs);
      }
    } else if (command.execute) {
      const cmdArgs: CliCommandArgs = { ...args, _: args._.slice(1) };
      // 应用命令选项的默认值
      if (command.options) {
        for (const option of command.options) {
          if (option.default !== undefined && cmdArgs[option.name] === undefined) {
            cmdArgs[option.name] = option.default;
          }
        }
      }
      await command.execute(cmdArgs);
    } else {
      // 打印命令帮助
      this.printCommandHelp(command);
    }
  }

  /**
   * 输出内容
   */
  private output(data: unknown, format?: OutputFormat): void {
    if (this.config.quiet) return;

    const outputFormat = format || this.config.outputFormat;

    if (outputFormat === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else if (outputFormat === 'table' && Array.isArray(data)) {
      this.printTable(data);
    } else {
      if (typeof data === 'string') {
        console.log(data);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * 打印表格
   */
  private printTable(data: Record<string, unknown>[]): void {
    if (data.length === 0) {
      console.log(dimText('(空)', this.colorsEnabled));
      return;
    }

    const keys = Object.keys(data[0]);
    const colWidths = keys.map((key) => {
      const maxValueLen = Math.max(
        ...data.map((row) => String(row[key] ?? '').length)
      );
      return Math.max(key.length, maxValueLen);
    });

    // 打印表头（青色加粗）
    const header = keys.map((k, i) => colorize(k.padEnd(colWidths[i]), 'cyan', this.colorsEnabled)).join('  ');
    console.log(header);
    console.log(dimText('-'.repeat(keys.reduce((sum, w, i) => sum + colWidths[i] + (i > 0 ? 2 : 0), 0)), this.colorsEnabled));

    // 打印数据
    for (const row of data) {
      const line = keys.map((k, i) => String(row[k] ?? '').padEnd(colWidths[i])).join('  ');
      console.log(line);
    }
  }

  /**
   * 打印帮助信息
   */
  private printHelp(): void {
    console.log(titleText('Aether OS CLI - 下一代 AI Agent 操作系统', this.colorsEnabled));
    console.log('');
    console.log(`用法: ${colorize('aether <command> [options]', 'bold', this.colorsEnabled)}`);
    console.log('');
    console.log(colorize('命令:', 'cyan', this.colorsEnabled));
    for (const cmd of this.commands) {
      console.log(`  ${colorize(cmd.name.padEnd(12), 'green', this.colorsEnabled)} ${dimText(cmd.description, this.colorsEnabled)}`);
    }
    console.log('');
    console.log(colorize('选项:', 'cyan', this.colorsEnabled));
    console.log(`  ${colorize('--help, -h'.padEnd(15), 'yellow', this.colorsEnabled)} 显示帮助信息`);
    console.log(`  ${colorize('--version, -v'.padEnd(15), 'yellow', this.colorsEnabled)} 显示版本号`);
    console.log(`  ${colorize('--format, -f'.padEnd(15), 'yellow', this.colorsEnabled)} 输出格式 (text/json/table)`);
    console.log(`  ${colorize('--quiet, -q'.padEnd(15), 'yellow', this.colorsEnabled)} 静默模式`);
    console.log(`  ${colorize('--verbose, -V'.padEnd(15), 'yellow', this.colorsEnabled)} 详细模式`);
    console.log('');
    console.log(dimText('使用 "aether <command> --help" 查看命令详情', this.colorsEnabled));
  }

  /**
   * 打印命令帮助
   */
  private printCommandHelp(command: CliCommand): void {
    console.log(`${titleText(command.name, this.colorsEnabled)} - ${dimText(command.description, this.colorsEnabled)}`);
    console.log('');

    if (command.subcommands) {
      console.log(colorize('子命令:', 'cyan', this.colorsEnabled));
      for (const sub of command.subcommands) {
        console.log(`  ${colorize(sub.name.padEnd(12), 'green', this.colorsEnabled)} ${dimText(sub.description, this.colorsEnabled)}`);
      }
      console.log('');
    }

    if (command.options) {
      console.log(colorize('选项:', 'cyan', this.colorsEnabled));
      for (const opt of command.options) {
        const alias = opt.alias ? `, -${opt.alias}` : '';
        console.log(`  ${colorize(`--${opt.name}${alias}`.padEnd(18), 'yellow', this.colorsEnabled)} ${dimText(opt.description, this.colorsEnabled)}`);
      }
    }
  }
}

/**
 * CLI 入口函数
 * 当直接运行此文件时执行
 */
async function main() {
  const app = new CliApp();
  // 跳过前两个参数（node 和脚本路径）
  await app.run(process.argv.slice(2));
}

// 检查是否直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('错误:', error.message);
    process.exit(1);
  });
}
