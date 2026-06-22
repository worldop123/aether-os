import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { InteractiveSession } from '../src/interactive';

// 创建模拟的 readline 接口工厂
function createMockInterface(): EventEmitter & {
  prompt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const ee = new EventEmitter() as EventEmitter & {
    prompt: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  ee.prompt = vi.fn();
  ee.close = vi.fn(() => ee.emit('close'));
  return ee;
}

// 模拟 readline 模块
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => createMockInterface()),
}));

describe('interactive 模块', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let mockReadline: typeof import('node:readline');

  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'clear').mockImplementation(() => {});
    mockReadline = await import('node:readline');
    vi.mocked(mockReadline.createInterface).mockClear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /**
   * 获取最近创建的模拟 readline 接口
   */
  function getMockRl(): ReturnType<typeof createMockInterface> {
    const results = vi.mocked(mockReadline.createInterface).mock.results;
    return results[results.length - 1].value as ReturnType<typeof createMockInterface>;
  }

  describe('构造函数', () => {
    it('接受 onMessage 回调', () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
      });
      expect(session).toBeDefined();
    });

    it('接受可选的 welcome 和 prompt', () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
        welcome: '欢迎使用',
        prompt: '>>> ',
      });
      expect(session).toBeDefined();
    });
  });

  describe('start', () => {
    it('创建 readline 接口', async () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
      });
      const promise = session.start();
      expect(mockReadline.createInterface).toHaveBeenCalled();
      getMockRl().emit('close');
      await promise;
    });

    it('打印欢迎消息', async () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
        welcome: '测试欢迎',
      });
      const promise = session.start();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('测试欢迎'));
      getMockRl().emit('close');
      await promise;
    });

    it('使用默认欢迎消息', async () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
      });
      const promise = session.start();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Aether OS 交互式会话'));
      getMockRl().emit('close');
      await promise;
    });

    it('调用 prompt 显示提示符', async () => {
      const session = new InteractiveSession({
        onMessage: async () => 'reply',
      });
      const promise = session.start();
      const rl = getMockRl();
      expect(rl.prompt).toHaveBeenCalled();
      rl.emit('close');
      await promise;
    });
  });

  describe('消息处理', () => {
    it('输入消息时调用 onMessage 并打印回复', async () => {
      const onMessage = vi.fn().mockResolvedValue('echo: hello');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', 'hello');
      // 等待异步 onMessage 完成
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith('hello');
      });
      await vi.waitFor(() => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('echo: hello'));
      });

      rl.emit('close');
      await promise;
    });

    it('空输入不调用 onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '   ');
      await new Promise((r) => setTimeout(r, 20));
      expect(onMessage).not.toHaveBeenCalled();

      rl.emit('close');
      await promise;
    });

    it('onMessage 抛错时打印错误消息', async () => {
      const onMessage = vi.fn().mockRejectedValue(new Error('处理失败'));
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', 'test');
      await vi.waitFor(() => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('处理失败'));
      });

      rl.emit('close');
      await promise;
    });

    it('onMessage 返回空字符串时不打印回复内容', async () => {
      const onMessage = vi.fn().mockResolvedValue('');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', 'test');
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalled();
      });
      // 记录当前调用次数
      const callsBefore = logSpy.mock.calls.length;
      await new Promise((r) => setTimeout(r, 20));
      // onMessage 返回空字符串时不应有额外的回复打印（调用次数不应增加）
      expect(logSpy.mock.calls.length).toBe(callsBefore);

      rl.emit('close');
      await promise;
    });
  });

  describe('内置命令', () => {
    it('/exit 退出会话', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '/exit');
      await promise;
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('/quit 退出会话', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '/quit');
      await promise;
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('/help 显示帮助信息', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '/help');
      await vi.waitFor(() => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('可用命令'));
      });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/exit'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/clear'));

      rl.emit('close');
      await promise;
    });

    it('/clear 清屏', async () => {
      const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '/clear');
      await new Promise((r) => setTimeout(r, 20));
      expect(clearSpy).toHaveBeenCalled();

      rl.emit('close');
      await promise;
    });

    it('命令不调用 onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('line', '/help');
      await new Promise((r) => setTimeout(r, 20));
      expect(onMessage).not.toHaveBeenCalled();

      rl.emit('close');
      await promise;
    });
  });

  describe('stop', () => {
    it('stop 方法停止会话', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();

      session.stop();
      await promise;
    });
  });

  describe('close 事件', () => {
    it('close 事件结束会话', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('close');
      await promise;
    });

    it('close 时打印再见消息', async () => {
      const onMessage = vi.fn().mockResolvedValue('reply');
      const session = new InteractiveSession({ onMessage });
      const promise = session.start();
      const rl = getMockRl();

      rl.emit('close');
      await promise;
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('再见'));
    });
  });
});
