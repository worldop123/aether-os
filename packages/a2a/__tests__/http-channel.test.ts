import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpA2AChannel, createHttpChannel } from '../src/http-channel.js';
import type { A2AMessage } from '../src/types.js';
import { generateId, now } from '@aether/shared';

describe('HttpA2AChannel 测试', () => {
  let channel1: HttpA2AChannel;
  let channel2: HttpA2AChannel;

  afterEach(async () => {
    if (channel1 && !channel1.isClosed()) await channel1.close();
    if (channel2 && !channel2.isClosed()) await channel2.close();
  });

  describe('基础功能', () => {
    it('应该启动 HTTP 服务器并获取端口', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();

      expect(channel1.getPort()).toBeGreaterThan(0);
      expect(channel1.getLocalUrl()).toContain('http://127.0.0.1:');
    });

    it('应该支持自定义端口和主机', async () => {
      channel1 = new HttpA2AChannel({
        agentId: 'agent-1',
        host: '127.0.0.1',
        port: 0, // 随机端口
      });
      await channel1.start();
      expect(channel1.getPort()).toBeGreaterThan(0);
    });
  });

  describe('消息通信', () => {
    it('应该能跨通道发送和接收消息', async () => {
      // 创建两个通道
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      channel2 = new HttpA2AChannel({ agentId: 'agent-2' });
      await channel1.start();
      await channel2.start();

      // 互相注册端点
      channel1.registerEndpoint('agent-2', channel2.getLocalUrl());
      channel2.registerEndpoint('agent-1', channel1.getLocalUrl());

      // 在 channel2 上注册消息处理器
      const receivedMessages: A2AMessage[] = [];
      channel2.onMessage((msg) => {
        receivedMessages.push(msg);
      });

      // 从 channel1 发送消息到 channel2
      const message: A2AMessage = {
        id: generateId('msg'),
        from: 'agent-1',
        to: 'agent-2',
        type: 'notification',
        payload: { text: '你好' },
        timestamp: now(),
      };

      await channel1.send(message);

      // 等待消息接收
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].from).toBe('agent-1');
      expect(receivedMessages[0].to).toBe('agent-2');
      expect((receivedMessages[0].payload as any).text).toBe('你好');
    });

    it('应该支持广播消息', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      channel2 = new HttpA2AChannel({ agentId: 'agent-2' });
      const channel3 = new HttpA2AChannel({ agentId: 'agent-3' });

      await channel1.start();
      await channel2.start();
      await channel3.start();

      // channel1 注册其他两个端点
      channel1.registerEndpoint('agent-2', channel2.getLocalUrl());
      channel1.registerEndpoint('agent-3', channel3.getLocalUrl());

      const received2: A2AMessage[] = [];
      const received3: A2AMessage[] = [];

      channel2.onMessage((msg) => received2.push(msg));
      channel3.onMessage((msg) => received3.push(msg));

      const broadcast: A2AMessage = {
        id: generateId('msg'),
        from: 'agent-1',
        to: '*',
        type: 'broadcast',
        payload: { announcement: '系统更新' },
        timestamp: now(),
      };

      await channel1.send(broadcast);
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(received2.length).toBe(1);
      expect(received3.length).toBe(1);
      expect((received2[0].payload as any).announcement).toBe('系统更新');
      expect((received3[0].payload as any).announcement).toBe('系统更新');

      await channel3.close();
    });

    it('发送到未知 Agent 应该抛出错误', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();

      const message: A2AMessage = {
        id: generateId('msg'),
        from: 'agent-1',
        to: 'unknown-agent',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await expect(channel1.send(message)).rejects.toThrow('未找到');
    });
  });

  describe('端点管理', () => {
    it('应该能注册和注销端点', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();

      channel1.registerEndpoint('agent-2', 'http://127.0.0.1:9999');
      expect(channel1.getRemoteEndpoints().size).toBe(1);

      expect(channel1.unregisterEndpoint('agent-2')).toBe(true);
      expect(channel1.getRemoteEndpoints().size).toBe(0);
    });

    it('注销不存在的端点应该返回 false', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();

      expect(channel1.unregisterEndpoint('nonexistent')).toBe(false);
    });
  });

  describe('生命周期', () => {
    it('close 后应该标记为已关闭', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();

      expect(channel1.isClosed()).toBe(false);
      await channel1.close();
      expect(channel1.isClosed()).toBe(true);
    });

    it('关闭后发送消息应该抛出错误', async () => {
      channel1 = new HttpA2AChannel({ agentId: 'agent-1' });
      await channel1.start();
      await channel1.close();

      const message: A2AMessage = {
        id: generateId('msg'),
        from: 'agent-1',
        to: 'agent-2',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await expect(channel1.send(message)).rejects.toThrow('已关闭');
    });
  });

  describe('createHttpChannel 工厂函数', () => {
    it('应该创建并启动通道', async () => {
      channel1 = await createHttpChannel({ agentId: 'agent-1' });
      expect(channel1.getPort()).toBeGreaterThan(0);
      expect(channel1.isClosed()).toBe(false);
    });
  });
});
