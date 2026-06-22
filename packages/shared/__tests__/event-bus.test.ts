import { describe, it, expect, vi } from 'vitest';
import { EventBus, globalEventBus } from '../src/event-bus';

interface TestEvents {
  'test.event': [data: string];
  'test.number': [num: number];
  'test.multiple': [a: string, b: number, c: boolean];
}

describe('事件总线测试', () => {
  describe('EventBus 基础功能', () => {
    it('应该正确实例化', () => {
      const bus = new EventBus<TestEvents>();
      expect(bus).toBeDefined();
    });

    it('应该能够监听和触发事件', () => {
      const bus = new EventBus<TestEvents>();
      const handler = vi.fn();

      bus.on('test.event', handler);
      bus.emit('test.event', 'hello');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('hello');
    });

    it('应该能够监听多个参数的事件', () => {
      const bus = new EventBus<TestEvents>();
      const handler = vi.fn();

      bus.on('test.multiple', handler);
      bus.emit('test.multiple', 'hello', 42, true);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('hello', 42, true);
    });

    it('应该能够移除事件监听器', () => {
      const bus = new EventBus<TestEvents>();
      const handler = vi.fn();

      bus.on('test.event', handler);
      bus.off('test.event', handler);
      bus.emit('test.event', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });

    it('应该支持 once 监听器（只触发一次）', () => {
      const bus = new EventBus<TestEvents>();
      const handler = vi.fn();

      bus.once('test.event', handler);
      bus.emit('test.event', 'first');
      bus.emit('test.event', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('应该能够移除所有监听器', () => {
      const bus = new EventBus<TestEvents>();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      bus.removeAllListeners('test.event');
      bus.emit('test.event', 'hello');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('应该能够获取监听器数量', () => {
      const bus = new EventBus<TestEvents>();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      expect(bus.listenerCount('test.event')).toBe(0);

      bus.on('test.event', handler1);
      expect(bus.listenerCount('test.event')).toBe(1);

      bus.on('test.event', handler2);
      expect(bus.listenerCount('test.event')).toBe(2);
    });

    it('应该能够获取所有事件名称', () => {
      const bus = new EventBus<TestEvents>();

      bus.on('test.event', () => {});
      bus.on('test.number', () => {});

      const eventNames = bus.eventNames();
      expect(eventNames).toContain('test.event');
      expect(eventNames).toContain('test.number');
      expect(eventNames.length).toBe(2);
    });

    it('应该能够销毁事件总线', () => {
      const bus = new EventBus<TestEvents>();
      const handler = vi.fn();

      bus.on('test.event', handler);
      bus.destroy();
      bus.emit('test.event', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('全局事件总线', () => {
    it('应该是 EventBus 的实例', () => {
      expect(globalEventBus).toBeInstanceOf(EventBus);
    });

    it('应该支持全局事件类型', () => {
      const handler = vi.fn();
      globalEventBus.on('agent.started', handler);
      globalEventBus.emit('agent.started', 'agent-1', Date.now());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('agent-1', expect.any(Number));

      // 清理
      globalEventBus.off('agent.started', handler);
    });
  });

  describe('链式调用', () => {
    it('on 方法应该支持链式调用', () => {
      const bus = new EventBus<TestEvents>();
      const result = bus.on('test.event', () => {});
      expect(result).toBe(bus);
    });

    it('off 方法应该支持链式调用', () => {
      const bus = new EventBus<TestEvents>();
      const handler = () => {};
      bus.on('test.event', handler);
      const result = bus.off('test.event', handler);
      expect(result).toBe(bus);
    });

    it('once 方法应该支持链式调用', () => {
      const bus = new EventBus<TestEvents>();
      const result = bus.once('test.event', () => {});
      expect(result).toBe(bus);
    });

    it('removeAllListeners 方法应该支持链式调用', () => {
      const bus = new EventBus<TestEvents>();
      const result = bus.removeAllListeners();
      expect(result).toBe(bus);
    });
  });
});
