import { describe, it, expect } from 'vitest';
import { EVENTS, AGENT_STATUS, MESSAGE_ROLES, DEFAULTS, DB_TABLES } from '../src/constants';

describe('常量测试', () => {
  describe('EVENTS 事件常量', () => {
    it('应该包含 Agent 生命周期事件', () => {
      expect(EVENTS.AGENT_STARTED).toBe('agent.started');
      expect(EVENTS.AGENT_PAUSED).toBe('agent.paused');
      expect(EVENTS.AGENT_RESUMED).toBe('agent.resumed');
      expect(EVENTS.AGENT_STOPPED).toBe('agent.stopped');
      expect(EVENTS.AGENT_ERROR).toBe('agent.error');
      expect(EVENTS.AGENT_STATUS_CHANGED).toBe('agent.status_changed');
    });

    it('应该包含记忆系统事件', () => {
      expect(EVENTS.MEMORY_ADDED).toBe('memory.added');
      expect(EVENTS.MEMORY_DELETED).toBe('memory.deleted');
      expect(EVENTS.MEMORY_CLEARED).toBe('memory.cleared');
    });

    it('应该包含模型路由事件', () => {
      expect(EVENTS.MODEL_REQUEST).toBe('model.request');
      expect(EVENTS.MODEL_RESPONSE).toBe('model.response');
      expect(EVENTS.MODEL_ERROR).toBe('model.error');
      expect(EVENTS.BUDGET_WARNING).toBe('budget.warning');
      expect(EVENTS.BUDGET_EXCEEDED).toBe('budget.exceeded');
    });

    it('应该包含 MCP 工具事件', () => {
      expect(EVENTS.MCP_TOOL_CALLED).toBe('mcp.tool_called');
      expect(EVENTS.MCP_TOOL_RESULT).toBe('mcp.tool_result');
      expect(EVENTS.MCP_TOOL_ERROR).toBe('mcp.tool_error');
      expect(EVENTS.MCP_SERVER_CONNECTED).toBe('mcp.server_connected');
      expect(EVENTS.MCP_SERVER_DISCONNECTED).toBe('mcp.server_disconnected');
    });

    it('应该包含调度器事件', () => {
      expect(EVENTS.SCHEDULER_TASK_CREATED).toBe('scheduler.task_created');
      expect(EVENTS.SCHEDULER_TASK_CANCELLED).toBe('scheduler.task_cancelled');
      expect(EVENTS.SCHEDULER_TASK_EXECUTED).toBe('scheduler.task_executed');
      expect(EVENTS.SCHEDULER_TASK_ERROR).toBe('scheduler.task_error');
    });
  });

  describe('AGENT_STATUS 状态常量', () => {
    it('应该包含所有 Agent 状态', () => {
      expect(AGENT_STATUS.IDLE).toBe('idle');
      expect(AGENT_STATUS.RUNNING).toBe('running');
      expect(AGENT_STATUS.PAUSED).toBe('paused');
      expect(AGENT_STATUS.STOPPED).toBe('stopped');
      expect(AGENT_STATUS.ERROR).toBe('error');
    });
  });

  describe('MESSAGE_ROLES 消息角色常量', () => {
    it('应该包含所有消息角色', () => {
      expect(MESSAGE_ROLES.SYSTEM).toBe('system');
      expect(MESSAGE_ROLES.USER).toBe('user');
      expect(MESSAGE_ROLES.ASSISTANT).toBe('assistant');
      expect(MESSAGE_ROLES.TOOL).toBe('tool');
    });
  });

  describe('DEFAULTS 默认配置常量', () => {
    it('应该包含短期记忆限制', () => {
      expect(DEFAULTS.SHORT_TERM_MEMORY_LIMIT).toBe(50);
      expect(typeof DEFAULTS.SHORT_TERM_MEMORY_LIMIT).toBe('number');
    });

    it('应该包含 token 预算配置', () => {
      expect(DEFAULTS.DAILY_TOKEN_BUDGET).toBe(100000);
      expect(DEFAULTS.BUDGET_WARNING_THRESHOLD).toBe(0.8);
    });

    it('应该包含向量检索配置', () => {
      expect(DEFAULTS.VECTOR_SEARCH_TOP_K).toBe(5);
      expect(DEFAULTS.VECTOR_SIMILARITY_THRESHOLD).toBe(0.7);
    });
  });

  describe('DB_TABLES 数据库表名常量', () => {
    it('应该包含所有数据库表名', () => {
      expect(DB_TABLES.AGENTS).toBe('agents');
      expect(DB_TABLES.MEMORIES).toBe('memories');
      expect(DB_TABLES.TASKS).toBe('tasks');
      expect(DB_TABLES.TOKEN_USAGE).toBe('token_usage');
      expect(DB_TABLES.MCP_SERVERS).toBe('mcp_servers');
    });
  });

  it('所有常量都应该是只读的（as const）', () => {
    // 验证常量对象是冻结的或不可修改的
    expect(() => {
      // @ts-expect-error 测试只读
      EVENTS.AGENT_STARTED = 'modified';
    }).toThrow();
  });
});
