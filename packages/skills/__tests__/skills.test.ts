import { describe, it, expect, beforeEach } from 'vitest';
import { SkillManager } from '../src/index.js';
import type { SkillDefinition } from '../src/index.js';

describe('SkillManager 测试', () => {
  let manager: SkillManager;

  beforeEach(() => {
    manager = new SkillManager();
  });

  describe('内置技能', () => {
    it('应该注册 5 个内置技能', () => {
      const skills = manager.listSkills();
      expect(skills.length).toBe(5);
    });

    it('应该包含代码助手技能', () => {
      const skill = manager.getSkill('code-assistant');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('代码助手');
      expect(skill!.category).toBe('coding');
      expect(skill!.systemPrompt).toContain('代码助手');
    });

    it('应该包含文档撰写技能', () => {
      const skill = manager.getSkill('tech-writer');
      expect(skill).toBeDefined();
      expect(skill!.category).toBe('writing');
    });

    it('应该包含数据分析技能', () => {
      const skill = manager.getSkill('data-analyst');
      expect(skill).toBeDefined();
      expect(skill!.category).toBe('analysis');
      expect(skill!.requiredTools).toContain('calculate');
    });

    it('应该包含任务自动化技能', () => {
      const skill = manager.getSkill('task-automator');
      expect(skill).toBeDefined();
      expect(skill!.category).toBe('automation');
    });

    it('应该包含研究助手技能', () => {
      const skill = manager.getSkill('research-assistant');
      expect(skill).toBeDefined();
      expect(skill!.category).toBe('research');
    });
  });

  describe('技能注册和管理', () => {
    it('应该能注册自定义技能', () => {
      const customSkill: SkillDefinition = {
        id: 'custom-test',
        name: '测试技能',
        description: '用于测试的自定义技能',
        category: 'custom',
        systemPrompt: '你是一个测试助手',
      };

      manager.register(customSkill);
      const skill = manager.getSkill('custom-test');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('测试技能');
    });

    it('注册重复技能应该抛出错误', () => {
      const skill: SkillDefinition = {
        id: 'code-assistant',
        name: '重复',
        description: '重复注册',
        category: 'coding',
        systemPrompt: '测试',
      };

      expect(() => manager.register(skill)).toThrow('已存在');
    });

    it('应该能注销技能', () => {
      expect(manager.unregister('code-assistant')).toBe(true);
      expect(manager.getSkill('code-assistant')).toBeUndefined();
    });

    it('注销不存在的技能应该返回 false', () => {
      expect(manager.unregister('nonexistent')).toBe(false);
    });
  });

  describe('技能查询', () => {
    it('应该能按类别过滤技能', () => {
      const codingSkills = manager.listSkills('coding');
      expect(codingSkills.length).toBe(1);
      expect(codingSkills[0].id).toBe('code-assistant');

      const writingSkills = manager.listSkills('writing');
      expect(writingSkills.length).toBe(1);
    });

    it('应该能搜索技能', () => {
      const results = manager.searchSkills('代码');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((s) => s.id === 'code-assistant')).toBe(true);
    });

    it('搜索应该匹配标签', () => {
      const results = manager.searchSkills('统计');
      expect(results.some((s) => s.id === 'data-analyst')).toBe(true);
    });

    it('搜索无结果应该返回空数组', () => {
      const results = manager.searchSkills('不存在的关键词xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('技能加载到 Agent', () => {
    it('应该能将技能加载到 Agent', () => {
      const instance = manager.loadSkill('agent-1', 'code-assistant');
      expect(instance).toBeDefined();
      expect(instance.agentId).toBe('agent-1');
      expect(instance.definition.id).toBe('code-assistant');
      expect(instance.useCount).toBe(0);
    });

    it('重复加载同一技能应该返回已有实例', () => {
      const instance1 = manager.loadSkill('agent-1', 'code-assistant');
      const instance2 = manager.loadSkill('agent-1', 'code-assistant');
      expect(instance1.instanceId).toBe(instance2.instanceId);
    });

    it('加载不存在的技能应该抛出错误', () => {
      expect(() => manager.loadSkill('agent-1', 'nonexistent')).toThrow('不存在');
    });

    it('应该能获取 Agent 的所有技能', () => {
      manager.loadSkill('agent-1', 'code-assistant');
      manager.loadSkill('agent-1', 'data-analyst');

      const skills = manager.getAgentSkills('agent-1');
      expect(skills.length).toBe(2);
    });

    it('应该能卸载技能', () => {
      const instance = manager.loadSkill('agent-1', 'code-assistant');
      expect(manager.unloadSkill(instance.instanceId)).toBe(true);
      expect(manager.getAgentSkills('agent-1').length).toBe(0);
    });

    it('卸载不存在的实例应该返回 false', () => {
      expect(manager.unloadSkill('nonexistent')).toBe(false);
    });
  });

  describe('技能使用记录', () => {
    it('应该能记录技能使用', () => {
      const instance = manager.loadSkill('agent-1', 'code-assistant');
      expect(instance.useCount).toBe(0);

      manager.recordUsage(instance.instanceId);
      const skills = manager.getAgentSkills('agent-1');
      expect(skills[0].useCount).toBe(1);
      expect(skills[0].lastUsedAt).toBeDefined();
    });

    it('记录不存在的实例应该无效果', () => {
      expect(() => manager.recordUsage('nonexistent')).not.toThrow();
    });
  });

  describe('系统提示词构建', () => {
    it('没有技能时应该返回空字符串', () => {
      expect(manager.buildSystemPrompt('agent-1')).toBe('');
    });

    it('应该构建包含技能名称的提示词', () => {
      manager.loadSkill('agent-1', 'code-assistant');
      const prompt = manager.buildSystemPrompt('agent-1');
      expect(prompt).toContain('代码助手');
      expect(prompt).toContain('代码助手');
    });

    it('多个技能应该用分隔符连接', () => {
      manager.loadSkill('agent-1', 'code-assistant');
      manager.loadSkill('agent-1', 'tech-writer');
      const prompt = manager.buildSystemPrompt('agent-1');
      expect(prompt).toContain('代码助手');
      expect(prompt).toContain('技术文档撰写');
      expect(prompt).toContain('---');
    });

    it('应该包含示例对话', () => {
      manager.loadSkill('agent-1', 'code-assistant');
      const prompt = manager.buildSystemPrompt('agent-1');
      expect(prompt).toContain('示例对话');
      expect(prompt).toContain('快速排序');
    });
  });

  describe('工具需求', () => {
    it('应该返回技能需要的工具列表', () => {
      manager.loadSkill('agent-1', 'data-analyst');
      const tools = manager.getRequiredTools('agent-1');
      expect(tools).toContain('calculate');
    });

    it('多个技能的工具应该去重', () => {
      manager.loadSkill('agent-1', 'data-analyst');
      manager.loadSkill('agent-1', 'code-assistant');
      const tools = manager.getRequiredTools('agent-1');
      const calculateCount = tools.filter((t) => t === 'calculate').length;
      expect(calculateCount).toBe(1);
    });

    it('没有工具需求的技能应该返回空数组', () => {
      manager.loadSkill('agent-1', 'code-assistant');
      const tools = manager.getRequiredTools('agent-1');
      expect(tools.length).toBe(0);
    });
  });
});
