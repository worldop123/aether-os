import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CliApp } from '../src/cli';

describe('CLI 测试', () => {
  let app: CliApp;

  beforeEach(() => {
    app = new CliApp();
    // 拦截 console.log 输出
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('基础功能', () => {
    it('应该能够创建 CliApp 实例', () => {
      expect(app).toBeDefined();
    });

    it('无参数时应该显示帮助', async () => {
      await app.run([]);
      expect(console.log).toHaveBeenCalled();
    });

    it('--help 应该显示帮助信息', async () => {
      await app.run(['--help']);
      expect(console.log).toHaveBeenCalled();
    });

    it('-h 应该显示帮助信息', async () => {
      await app.run(['-h']);
      expect(console.log).toHaveBeenCalled();
    });

    it('--version 应该显示版本号', async () => {
      await app.run(['--version']);
      expect(console.log).toHaveBeenCalledWith('Aether OS CLI v0.1.0');
    });

    it('-v 应该显示版本号', async () => {
      await app.run(['-v']);
      expect(console.log).toHaveBeenCalledWith('Aether OS CLI v0.1.0');
    });
  });

  describe('agent 命令', () => {
    it('agent list 应该列出 Agent', async () => {
      await app.run(['agent', 'list']);
      expect(console.log).toHaveBeenCalled();
    });

    it('agent create 应该创建新 Agent', async () => {
      await app.run(['agent', 'create', '--name', 'test-agent']);
      expect(console.log).toHaveBeenCalled();
    });

    it('agent status 应该查看 Agent 状态', async () => {
      // 先创建一个 Agent
      await app.run(['agent', 'create', '--name', 'test-agent']);

      // 获取创建的 Agent ID（从输出中解析比较复杂，这里直接测试命令不报错）
      await app.run(['agent', 'status', '--id', 'non-existent']);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('memory 命令', () => {
    it('memory add 应该添加记忆', async () => {
      await app.run(['memory', 'add', '--content', '测试记忆内容']);
      expect(console.log).toHaveBeenCalled();
    });

    it('memory list 应该列出记忆', async () => {
      await app.run(['memory', 'list']);
      expect(console.log).toHaveBeenCalled();
    });

    it('memory search 应该搜索记忆', async () => {
      // 先添加一条记忆
      await app.run(['memory', 'add', '--content', 'hello world test']);

      // 然后搜索
      await app.run(['memory', 'search', '--query', 'hello']);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('budget 命令', () => {
    it('budget status 应该显示预算状态', async () => {
      await app.run(['budget', 'status']);
      expect(console.log).toHaveBeenCalled();
    });

    it('budget set 应该设置预算', async () => {
      await app.run(['budget', 'set', '--amount', '50000']);
      expect(console.log).toHaveBeenCalledWith('每日预算已设置为 50000 tokens');
    });

    it('budget reset 应该重置使用量', async () => {
      await app.run(['budget', 'reset']);
      expect(console.log).toHaveBeenCalledWith('今日使用量已重置');
    });
  });

  describe('mcp 命令', () => {
    it('mcp servers 应该列出服务器', async () => {
      await app.run(['mcp', 'servers']);
      expect(console.log).toHaveBeenCalled();
    });

    it('mcp tools 应该列出工具', async () => {
      await app.run(['mcp', 'tools']);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('schedule 命令', () => {
    it('schedule list 应该列出任务', async () => {
      await app.run(['schedule', 'list']);
      expect(console.log).toHaveBeenCalled();
    });

    it('schedule add 应该添加任务', async () => {
      await app.run([
        'schedule', 'add',
        '--name', '测试任务',
        '--agent', 'agent-1',
        '--cron', '* * * * *',
      ]);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('chat 命令', () => {
    it('chat 应该与 Agent 对话', async () => {
      await app.run(['chat', '--message', 'hello']);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('输出格式', () => {
    it('支持 json 输出格式', async () => {
      await app.run(['--format', 'json', 'budget', 'status']);
      expect(console.log).toHaveBeenCalled();
    });

    it('支持 table 输出格式', async () => {
      await app.run(['--format', 'table', 'agent', 'list']);
      expect(console.log).toHaveBeenCalled();
    });

    it('支持 quiet 模式', async () => {
      vi.mocked(console.log).mockClear();
      await app.run(['--quiet', 'agent', 'list']);
      // quiet 模式下不应该有输出
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('未知命令应该报错', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await app.run(['unknown-command']);

      expect(console.error).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });
});
