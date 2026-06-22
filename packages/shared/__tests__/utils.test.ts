import { describe, it, expect } from 'vitest';
import { generateId, now, sleep, withTimeout, retry } from '../src/utils';

describe('工具函数测试', () => {
  describe('generateId', () => {
    it('应该生成唯一的 ID', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('应该支持前缀', () => {
      const id = generateId('test');
      expect(id.startsWith('test_')).toBe(true);
    });

    it('生成的 ID 应该包含时间戳部分', () => {
      const id = generateId();
      // ID 格式应该是时间戳(36进制) + 随机数
      expect(id.length).toBeGreaterThan(10);
    });
  });

  describe('now', () => {
    it('应该返回当前时间戳', () => {
      const before = Date.now();
      const result = now();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
      expect(typeof result).toBe('number');
    });
  });

  describe('sleep', () => {
    it('应该延迟指定的毫秒数', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // 允许 10ms 误差
      expect(elapsed).toBeLessThan(200);
    });

    it('应该返回 Promise', () => {
      const result = sleep(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('withTimeout', () => {
    it('应该在 Promise 完成时返回结果', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('应该在超时时抛出错误', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 500));
      await expect(withTimeout(promise, 100)).rejects.toThrow('Operation timed out');
    });

    it('应该支持自定义超时消息', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 500));
      await expect(withTimeout(promise, 100, '自定义超时消息')).rejects.toThrow('自定义超时消息');
    });

    it('应该在 Promise 拒绝时传递错误', async () => {
      const promise = Promise.reject(new Error('test error'));
      await expect(withTimeout(promise, 1000)).rejects.toThrow('test error');
    });
  });

  describe('retry', () => {
    it('应该在成功时直接返回结果', async () => {
      const fn = () => Promise.resolve('success');
      const result = await retry(fn);
      expect(result).toBe('success');
    });

    it('应该在失败时重试指定次数', async () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      };

      const result = await retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });

    it('应该在重试次数用尽后抛出错误', async () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        return Promise.reject(new Error('always fail'));
      };

      await expect(retry(fn, { retries: 2, delay: 10 })).rejects.toThrow('always fail');
      expect(callCount).toBe(3); // 1 次初始 + 2 次重试
    });

    it('应该支持 onRetry 回调', async () => {
      let callCount = 0;
      let retryCount = 0;
      const fn = () => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      };

      const result = await retry(fn, {
        retries: 3,
        delay: 10,
        onRetry: (error, attempt) => {
          retryCount++;
          expect(error.message).toBe('fail');
          expect(attempt).toBe(retryCount);
        },
      });

      expect(result).toBe('success');
      expect(retryCount).toBe(2);
    });

    it('应该使用指数退避', async () => {
      const delays: number[] = [];
      let callCount = 0;
      const fn = () => {
        callCount++;
        if (callCount < 4) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      };

      const start = Date.now();
      await retry(fn, { retries: 3, delay: 10 });
      const totalTime = Date.now() - start;

      // 指数退避：10ms, 20ms, 40ms = 总共约 70ms
      expect(totalTime).toBeGreaterThan(60);
      expect(totalTime).toBeLessThan(200);
    });

    it('默认应该重试 3 次', async () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        return Promise.reject(new Error('fail'));
      };

      await expect(retry(fn, { delay: 10 })).rejects.toThrow('fail');
      expect(callCount).toBe(4); // 1 次初始 + 3 次重试
    });
  });
});
