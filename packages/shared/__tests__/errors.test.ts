import { describe, it, expect } from 'vitest';
import {
  AetherError,
  AgentError,
  MemoryError,
  ModelRouterError,
  BudgetExceededError,
  McpError,
  SchedulerError,
  ConfigurationError,
  NotFoundError,
} from '../src/errors';

describe('错误类测试', () => {
  describe('AetherError 基础错误类', () => {
    it('应该正确实例化', () => {
      const error = new AetherError('测试错误', 'TEST_ERROR', { foo: 'bar' });
      expect(error.message).toBe('测试错误');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.metadata).toEqual({ foo: 'bar' });
      expect(error.name).toBe('AetherError');
    });

    it('应该正确生成 JSON', () => {
      const error = new AetherError('测试错误', 'TEST_ERROR', { foo: 'bar' });
      const json = error.toJSON();
      expect(json.name).toBe('AetherError');
      expect(json.message).toBe('测试错误');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.metadata).toEqual({ foo: 'bar' });
      expect(json.stack).toBeDefined();
    });

    it('应该是 Error 的实例', () => {
      const error = new AetherError('测试', 'TEST');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('AgentError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new AgentError('Agent 错误');
      expect(error.message).toBe('Agent 错误');
      expect(error.code).toBe('AGENT_ERROR');
      expect(error.name).toBe('AgentError');
      expect(error).toBeInstanceOf(AetherError);
    });

    it('应该支持自定义错误码', () => {
      const error = new AgentError('自定义错误', 'CUSTOM_AGENT_ERROR');
      expect(error.code).toBe('CUSTOM_AGENT_ERROR');
    });
  });

  describe('MemoryError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new MemoryError('记忆错误');
      expect(error.message).toBe('记忆错误');
      expect(error.code).toBe('MEMORY_ERROR');
      expect(error.name).toBe('MemoryError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('ModelRouterError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new ModelRouterError('模型路由错误');
      expect(error.message).toBe('模型路由错误');
      expect(error.code).toBe('MODEL_ROUTER_ERROR');
      expect(error.name).toBe('ModelRouterError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('BudgetExceededError', () => {
    it('应该正确实例化并继承 ModelRouterError', () => {
      const error = new BudgetExceededError('预算超限');
      expect(error.message).toBe('预算超限');
      expect(error.code).toBe('BUDGET_EXCEEDED');
      expect(error.name).toBe('BudgetExceededError');
      expect(error).toBeInstanceOf(ModelRouterError);
      expect(error).toBeInstanceOf(AetherError);
    });

    it('应该有默认消息', () => {
      const error = new BudgetExceededError();
      expect(error.message).toBe('Budget exceeded');
    });
  });

  describe('McpError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new McpError('MCP 错误');
      expect(error.message).toBe('MCP 错误');
      expect(error.code).toBe('MCP_ERROR');
      expect(error.name).toBe('McpError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('SchedulerError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new SchedulerError('调度器错误');
      expect(error.message).toBe('调度器错误');
      expect(error.code).toBe('SCHEDULER_ERROR');
      expect(error.name).toBe('SchedulerError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('ConfigurationError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new ConfigurationError('配置错误');
      expect(error.message).toBe('配置错误');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.name).toBe('ConfigurationError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('NotFoundError', () => {
    it('应该正确实例化并继承 AetherError', () => {
      const error = new NotFoundError('未找到');
      expect(error.message).toBe('未找到');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
      expect(error).toBeInstanceOf(AetherError);
    });
  });

  describe('错误类继承关系', () => {
    it('所有错误类都应该继承自 AetherError', () => {
      const errors = [
        new AgentError(''),
        new MemoryError(''),
        new ModelRouterError(''),
        new BudgetExceededError(),
        new McpError(''),
        new SchedulerError(''),
        new ConfigurationError(''),
        new NotFoundError(''),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(AetherError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('BudgetExceededError 应该继承自 ModelRouterError', () => {
      const error = new BudgetExceededError();
      expect(error).toBeInstanceOf(ModelRouterError);
      expect(error).toBeInstanceOf(AetherError);
    });
  });
});
