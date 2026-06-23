import type { ID, Timestamp, Metadata } from '@aether/shared';
import { generateId, now, globalEventBus } from '@aether/shared';

/**
 * 技能 ID
 */
export type SkillId = string;

/**
 * 技能类别
 */
export type SkillCategory =
  | 'coding' // 编程开发
  | 'writing' // 写作创作
  | 'analysis' // 数据分析
  | 'research' // 研究调查
  | 'communication' // 沟通协作
  | 'automation' // 自动化任务
  | 'custom'; // 自定义

/**
 * 技能示例对话
 */
export interface SkillExample {
  /** 用户输入 */
  user: string;
  /** 期望的助手响应 */
  assistant: string;
}

/**
 * 技能定义
 */
export interface SkillDefinition {
  /** 技能 ID（唯一标识） */
  id: SkillId;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能类别 */
  category: SkillCategory;
  /** 系统提示词 */
  systemPrompt: string;
  /** 推荐模型 */
  recommendedModel?: string;
  /** 推荐温度 */
  recommendedTemperature?: number;
  /** 推荐最大 token 数 */
  recommendedMaxTokens?: number;
  /** 需要的 MCP 工具列表 */
  requiredTools?: string[];
  /** 需要的权限 */
  requiredPermissions?: string[];
  /** 示例对话 */
  examples?: SkillExample[];
  /** 技能版本 */
  version?: string;
  /** 作者 */
  author?: string;
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Metadata;
}

/**
 * 技能实例（已加载到 Agent 上的技能）
 */
export interface SkillInstance {
  /** 实例 ID */
  instanceId: ID;
  /** 技能定义 */
  definition: SkillDefinition;
  /** 绑定的 Agent ID */
  agentId: ID;
  /** 加载时间 */
  loadedAt: Timestamp;
  /** 使用次数 */
  useCount: number;
  /** 最后使用时间 */
  lastUsedAt?: Timestamp;
}

/**
 * 技能管理器
 * 负责技能的注册、查找和加载
 */
export class SkillManager {
  private skills: Map<SkillId, SkillDefinition> = new Map();
  private instances: Map<ID, SkillInstance> = new Map();

  constructor() {
    // 注册内置技能
    this.registerBuiltinSkills();
  }

  /**
   * 注册技能
   */
  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`技能 ${skill.id} 已存在`);
    }
    this.skills.set(skill.id, skill);
    globalEventBus.emit('skill.registered', skill.id, now());
  }

  /**
   * 注销技能
   */
  unregister(skillId: SkillId): boolean {
    const removed = this.skills.delete(skillId);
    if (removed) {
      globalEventBus.emit('skill.unregistered', skillId, now());
    }
    return removed;
  }

  /**
   * 获取技能定义
   */
  getSkill(skillId: SkillId): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  /**
   * 列出所有技能
   * @param category 可选，按类别过滤
   */
  listSkills(category?: SkillCategory): SkillDefinition[] {
    const all = Array.from(this.skills.values());
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  /**
   * 搜索技能
   * @param query 搜索关键词
   */
  searchSkills(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.skills.values()).filter((skill) => {
      return (
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * 将技能加载到 Agent
   */
  loadSkill(agentId: ID, skillId: SkillId): SkillInstance {
    const definition = this.skills.get(skillId);
    if (!definition) {
      throw new Error(`技能 ${skillId} 不存在`);
    }

    // 检查是否已加载
    const existing = this.findInstance(agentId, skillId);
    if (existing) {
      return existing;
    }

    const instance: SkillInstance = {
      instanceId: generateId('skill'),
      definition,
      agentId,
      loadedAt: now(),
      useCount: 0,
    };

    this.instances.set(instance.instanceId, instance);
    globalEventBus.emit('skill.loaded', skillId, agentId, now());

    return instance;
  }

  /**
   * 从 Agent 卸载技能
   */
  unloadSkill(instanceId: ID): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    this.instances.delete(instanceId);
    globalEventBus.emit('skill.unloaded', instance.definition.id, instance.agentId, now());
    return true;
  }

  /**
   * 获取 Agent 加载的所有技能
   */
  getAgentSkills(agentId: ID): SkillInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.agentId === agentId);
  }

  /**
   * 记录技能使用
   */
  recordUsage(instanceId: ID): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.useCount++;
    instance.lastUsedAt = now();
  }

  /**
   * 构建 Agent 的组合系统提示词
   * 将所有已加载技能的系统提示词合并
   */
  buildSystemPrompt(agentId: ID): string {
    const instances = this.getAgentSkills(agentId);
    if (instances.length === 0) return '';

    const prompts = instances.map((instance) => {
      const skill = instance.definition;
      let prompt = `## 技能：${skill.name}\n${skill.systemPrompt}`;

      if (skill.examples && skill.examples.length > 0) {
        prompt += '\n\n### 示例对话\n';
        for (const ex of skill.examples) {
          prompt += `用户：${ex.user}\n助手：${ex.assistant}\n`;
        }
      }

      return prompt;
    });

    return prompts.join('\n\n---\n\n');
  }

  /**
   * 获取 Agent 需要的所有工具
   */
  getRequiredTools(agentId: ID): string[] {
    const instances = this.getAgentSkills(agentId);
    const tools = new Set<string>();
    for (const instance of instances) {
      if (instance.definition.requiredTools) {
        for (const tool of instance.definition.requiredTools) {
          tools.add(tool);
        }
      }
    }
    return Array.from(tools);
  }

  /**
   * 查找 Agent 上的技能实例
   */
  private findInstance(agentId: ID, skillId: SkillId): SkillInstance | undefined {
    return Array.from(this.instances.values()).find(
      (i) => i.agentId === agentId && i.definition.id === skillId
    );
  }

  /**
   * 注册内置技能
   */
  private registerBuiltinSkills(): void {
    // 代码助手技能
    this.register({
      id: 'code-assistant',
      name: '代码助手',
      description: '帮助编写、审查、调试代码',
      category: 'coding',
      systemPrompt: `你是一个专业的代码助手。你擅长：
- 编写高质量、可维护的代码
- 代码审查和重构建议
- 调试和问题排查
- 解释复杂的技术概念

请遵循以下原则：
1. 代码要有清晰的注释
2. 遵循语言的最佳实践和命名规范
3. 考虑边界情况和错误处理
4. 提供简洁有效的解决方案`,
      recommendedModel: 'gpt-4',
      recommendedTemperature: 0.2,
      recommendedMaxTokens: 4096,
      tags: ['编程', '代码', '开发', '调试'],
      examples: [
        {
          user: '帮我写一个快速排序',
          assistant: '我来帮你实现快速排序算法...',
        },
      ],
    });

    // 文档撰写技能
    this.register({
      id: 'tech-writer',
      name: '技术文档撰写',
      description: '撰写清晰、结构化的技术文档',
      category: 'writing',
      systemPrompt: `你是一个技术文档撰写专家。你擅长：
- 编写 API 文档和使用指南
- 创建教程和入门文档
- 撰写架构设计文档
- 生成 README 和 CHANGELOG

请遵循以下原则：
1. 结构清晰，使用标题、列表、代码块
2. 语言简洁准确
3. 提供实际可运行的示例
4. 考虑读者的技术背景`,
      recommendedModel: 'gpt-4',
      recommendedTemperature: 0.3,
      recommendedMaxTokens: 8192,
      tags: ['文档', '写作', 'README', 'API'],
    });

    // 数据分析技能
    this.register({
      id: 'data-analyst',
      name: '数据分析',
      description: '分析数据、生成洞察、创建报告',
      category: 'analysis',
      systemPrompt: `你是一个数据分析专家。你擅长：
- 数据清洗和预处理
- 统计分析和趋势识别
- 数据可视化建议
- 生成分析报告

请遵循以下原则：
1. 基于数据说话，避免主观臆断
2. 说明分析方法和假设
3. 提供可操作的建议
4. 注意数据的局限性`,
      recommendedModel: 'gpt-4',
      recommendedTemperature: 0.4,
      recommendedMaxTokens: 4096,
      requiredTools: ['calculate'],
      tags: ['数据', '分析', '统计', '报告'],
    });

    // 任务自动化技能
    this.register({
      id: 'task-automator',
      name: '任务自动化',
      description: '设计自动化工作流和定时任务',
      category: 'automation',
      systemPrompt: `你是一个任务自动化专家。你擅长：
- 设计工作流和自动化流程
- 创建定时任务和调度
- 优化重复性工作
- 集成多个系统和服务

请遵循以下原则：
1. 先理解完整需求再设计
2. 考虑异常处理和回滚机制
3. 提供可监控的方案
4. 平衡自动化程度和可控性`,
      recommendedModel: 'gpt-4',
      recommendedTemperature: 0.5,
      recommendedMaxTokens: 4096,
      tags: ['自动化', '工作流', '调度', '效率'],
    });

    // 研究助手技能
    this.register({
      id: 'research-assistant',
      name: '研究助手',
      description: '信息搜集、文献综述、知识整理',
      category: 'research',
      systemPrompt: `你是一个研究助手。你擅长：
- 搜集和整理信息
- 文献综述和对比分析
- 提炼关键发现和结论
- 引用来源和事实核查

请遵循以下原则：
1. 区分事实和观点
2. 提供信息的来源
3. 呈现多方观点
4. 指出知识空白和不确定性`,
      recommendedModel: 'gpt-4',
      recommendedTemperature: 0.3,
      recommendedMaxTokens: 8192,
      tags: ['研究', '调研', '文献', '分析'],
    });
  }
}
