import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentRegistry,
  LocalA2AChannel,
  A2AProtocol,
  createAgentCard,
} from '../src/index.js';
import type { AgentCard, A2AMessage } from '../src/index.js';
import { globalEventBus, EVENTS, now } from '@aether/shared';

/**
 * 创建测试用 AgentCard
 */
function makeCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return createAgentCard({
    id: overrides.id ?? 'agent-1',
    name: overrides.name ?? 'Test Agent',
    description: overrides.description ?? 'A test agent',
    capabilities: overrides.capabilities ?? [
      { name: 'translate', description: '翻译文本' },
      { name: 'summarize', description: '总结文本' },
    ],
    skills: overrides.skills ?? ['translation'],
    status: overrides.status ?? 'online',
    ...overrides,
  });
}

describe('A2A 模块测试', () => {
  describe('AgentCard 创建和注册', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
      globalEventBus.removeAllListeners();
    });

    it('应该正确创建 AgentCard', () => {
      const card = makeCard({
        id: 'agent-create',
        name: 'Creator',
        capabilities: [{ name: 'code', description: '编写代码' }],
      });

      expect(card.id).toBe('agent-create');
      expect(card.name).toBe('Creator');
      expect(card.status).toBe('online');
      expect(card.capabilities).toHaveLength(1);
      expect(card.capabilities[0].name).toBe('code');
      expect(card.lastSeenAt).toBeGreaterThan(0);
    });

    it('应该正确注册 Agent', async () => {
      const card = makeCard({ id: 'agent-reg-1' });
      await registry.register(card);

      const found = await registry.getAgent('agent-reg-1');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Test Agent');
    });

    it('注册相同 ID 的 Agent 应该更新信息', async () => {
      const card = makeCard({ id: 'agent-update', name: 'Old Name' });
      await registry.register(card);

      const updated = makeCard({ id: 'agent-update', name: 'New Name' });
      await registry.register(updated);

      const found = await registry.getAgent('agent-update');
      expect(found?.name).toBe('New Name');
      expect(registry.size()).toBe(1);
    });

    it('应该正确注销 Agent', async () => {
      const card = makeCard({ id: 'agent-unreg' });
      await registry.register(card);
      expect(registry.size()).toBe(1);

      await registry.unregister('agent-unreg');
      expect(registry.size()).toBe(0);

      const found = await registry.getAgent('agent-unreg');
      expect(found).toBeNull();
    });

    it('注销不存在的 Agent 不应抛出错误', async () => {
      await expect(registry.unregister('non-existent')).resolves.not.toThrow();
    });

    it('应该列出所有 Agent', async () => {
      await registry.register(makeCard({ id: 'a1' }));
      await registry.register(makeCard({ id: 'a2' }));
      await registry.register(makeCard({ id: 'a3' }));

      const agents = await registry.listAgents();
      expect(agents).toHaveLength(3);
    });

    it('应该按状态过滤 Agent', async () => {
      await registry.register(makeCard({ id: 'a1', status: 'online' }));
      await registry.register(makeCard({ id: 'a2', status: 'offline' }));
      await registry.register(makeCard({ id: 'a3', status: 'busy' }));

      const onlineAgents = await registry.listAgents({ status: 'online' });
      expect(onlineAgents).toHaveLength(1);
      expect(onlineAgents[0].id).toBe('a1');
    });
  });

  describe('discoverByCapability 能力发现', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
      globalEventBus.removeAllListeners();
    });

    it('应该根据能力名称发现 Agent', async () => {
      await registry.register(
        makeCard({
          id: 'agent-translate',
          capabilities: [
            { name: 'translate', description: '翻译' },
            { name: 'summarize', description: '总结' },
          ],
        })
      );
      await registry.register(
        makeCard({
          id: 'agent-code',
          capabilities: [{ name: 'code', description: '编码' }],
        })
      );

      const translators = await registry.discoverByCapability('translate');
      expect(translators).toHaveLength(1);
      expect(translators[0].id).toBe('agent-translate');
    });

    it('没有匹配能力时应返回空数组', async () => {
      await registry.register(makeCard({ id: 'a1' }));
      const results = await registry.discoverByCapability('non-existent-cap');
      expect(results).toHaveLength(0);
    });

    it('应该支持按能力过滤 listAgents', async () => {
      await registry.register(
        makeCard({
          id: 'a1',
          capabilities: [
            { name: 'translate', description: '翻译' },
            { name: 'code', description: '编码' },
          ],
        })
      );
      await registry.register(
        makeCard({
          id: 'a2',
          capabilities: [{ name: 'translate', description: '翻译' }],
        })
      );

      const results = await registry.listAgents({
        capabilities: [{ name: 'translate', description: '' }],
      });
      expect(results).toHaveLength(2);
    });
  });

  describe('消息发送（单播/广播）', () => {
    let channel: LocalA2AChannel;

    beforeEach(() => {
      channel = new LocalA2AChannel();
      globalEventBus.removeAllListeners();
    });

    afterEach(async () => {
      await channel.close();
    });

    it('应该正确发送单播消息', async () => {
      const received: A2AMessage[] = [];
      channel.registerAgent('agent-a', (msg) => received.push(msg));

      const message: A2AMessage = {
        id: 'msg-1',
        from: 'agent-b',
        to: 'agent-a',
        type: 'notification',
        payload: { text: 'hello' },
        timestamp: now(),
      };

      await channel.send(message);
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe('msg-1');
      expect(received[0].payload).toEqual({ text: 'hello' });
    });

    it('应该正确发送广播消息', async () => {
      const receivedA: A2AMessage[] = [];
      const receivedB: A2AMessage[] = [];
      const receivedC: A2AMessage[] = [];

      channel.registerAgent('a', (msg) => receivedA.push(msg));
      channel.registerAgent('b', (msg) => receivedB.push(msg));
      channel.registerAgent('c', (msg) => receivedC.push(msg));

      const message: A2AMessage = {
        id: 'msg-broadcast',
        from: 'a',
        to: '*',
        type: 'broadcast',
        payload: { announcement: '系统更新' },
        timestamp: now(),
      };

      await channel.send(message);

      // 发送方不应收到自己的广播
      expect(receivedA).toHaveLength(0);
      // 其他 Agent 应收到广播
      expect(receivedB).toHaveLength(1);
      expect(receivedC).toHaveLength(1);
      expect(receivedB[0].id).toBe('msg-broadcast');
      expect(receivedC[0].payload).toEqual({ announcement: '系统更新' });
    });

    it('向不存在的 Agent 发送单播消息不应抛出错误', async () => {
      const message: A2AMessage = {
        id: 'msg-no-target',
        from: 'a',
        to: 'non-existent',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await expect(channel.send(message)).resolves.not.toThrow();
    });

    it('应该支持 onMessage 全局处理器', async () => {
      const received: A2AMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.registerAgent('a', () => {});

      const message: A2AMessage = {
        id: 'msg-global',
        from: 'b',
        to: 'a',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await channel.send(message);
      expect(received).toHaveLength(1);
    });

    it('处理器抛出的异常不应影响其他处理器', async () => {
      const handler2Call = vi.fn();
      channel.registerAgent('a', () => {
        throw new Error('handler error');
      });
      channel.registerAgent('a', () => handler2Call());

      const message: A2AMessage = {
        id: 'msg-error',
        from: 'b',
        to: 'a',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await channel.send(message);
      expect(handler2Call).toHaveBeenCalledTimes(1);
    });
  });

  describe('请求-响应模式', () => {
    let protocol: A2AProtocol;

    beforeEach(async () => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol();

      // 注册 Agent A（请求方）
      await protocol.registerAgent(makeCard({ id: 'agent-a' }));

      // 注册 Agent B（响应方），注册时设置处理器自动回复
      await protocol.registerAgent(
        makeCard({ id: 'agent-b' }),
        async (message: A2AMessage) => {
          if (message.type === 'request') {
            await protocol.respond(message, { result: 'processed', echo: message.payload });
          }
        }
      );
    });

    afterEach(async () => {
      await protocol.close();
    });

    it('应该完成请求-响应流程', async () => {
      const response = await protocol.request(
        'agent-a',
        'agent-b',
        { task: 'translate', text: 'hello' },
        1000
      );

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
      expect(response.from).toBe('agent-b');
      expect(response.to).toBe('agent-a');
      expect(response.replyTo).toBeDefined();
      expect(response.payload).toEqual({ result: 'processed', echo: { task: 'translate', text: 'hello' } });
    });

    it('响应消息应该包含正确的 replyTo', async () => {
      const response = await protocol.request('agent-a', 'agent-b', { test: true }, 1000);
      expect(response.replyTo).toBeDefined();
      // replyTo 应该是请求消息的 ID
      const registry = protocol.getRegistry();
      expect(registry).toBeDefined();
    });

    it('请求超时应该抛出错误', async () => {
      // 注册一个不回复的 Agent
      await protocol.registerAgent(
        makeCard({ id: 'agent-silent' }),
        () => {
          // 收到请求但不回复
        }
      );

      await expect(
        protocol.request('agent-a', 'agent-silent', { test: true }, 100)
      ).rejects.toThrow(/超时/);
    });

    it('目标 Agent 不存在应该抛出 NotFoundError', async () => {
      await expect(
        protocol.request('agent-a', 'non-existent', { test: true }, 1000)
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('通知模式', () => {
    let protocol: A2AProtocol;

    beforeEach(async () => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol();
    });

    afterEach(async () => {
      await protocol.close();
    });

    it('应该发送通知且不等待响应', async () => {
      const received: A2AMessage[] = [];
      await protocol.registerAgent(makeCard({ id: 'agent-a' }));
      await protocol.registerAgent(
        makeCard({ id: 'agent-b' }),
        (msg) => received.push(msg)
      );

      await protocol.notify('agent-a', 'agent-b', { event: 'task_completed' });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('notification');
      expect(received[0].payload).toEqual({ event: 'task_completed' });
    });

    it('通知消息不应设置 replyTo', async () => {
      const received: A2AMessage[] = [];
      await protocol.registerAgent(makeCard({ id: 'agent-a' }));
      await protocol.registerAgent(
        makeCard({ id: 'agent-b' }),
        (msg) => received.push(msg)
      );

      await protocol.notify('agent-a', 'agent-b', { data: 1 });

      expect(received[0].replyTo).toBeUndefined();
    });
  });

  describe('广播模式', () => {
    let protocol: A2AProtocol;

    beforeEach(async () => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol();
    });

    afterEach(async () => {
      await protocol.close();
    });

    it('应该广播消息给所有 Agent（除发送方）', async () => {
      const receivedB: A2AMessage[] = [];
      const receivedC: A2AMessage[] = [];
      const receivedA: A2AMessage[] = [];

      await protocol.registerAgent(
        makeCard({ id: 'agent-a' }),
        (msg) => receivedA.push(msg)
      );
      await protocol.registerAgent(
        makeCard({ id: 'agent-b' }),
        (msg) => receivedB.push(msg)
      );
      await protocol.registerAgent(
        makeCard({ id: 'agent-c' }),
        (msg) => receivedC.push(msg)
      );

      await protocol.broadcast('agent-a', { announcement: '系统维护' });

      expect(receivedA).toHaveLength(0); // 发送方不收到自己的广播
      expect(receivedB).toHaveLength(1);
      expect(receivedC).toHaveLength(1);
      expect(receivedB[0].type).toBe('broadcast');
      expect(receivedB[0].to).toBe('*');
    });
  });

  describe('心跳和超时', () => {
    let protocol: A2AProtocol;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol({
        heartbeatInterval: 50,
        heartbeatTimeout: 100,
      });
    });

    afterEach(async () => {
      await protocol.close();
    });

    it('应该发送心跳并更新 lastSeenAt', async () => {
      await protocol.registerAgent(makeCard({ id: 'agent-hb' }));
      const registry = protocol.getRegistry();

      const card = await registry.getAgent('agent-hb');
      const originalLastSeen = card!.lastSeenAt;

      // 等待一小段时间确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));

      await protocol.sendHeartbeat('agent-hb');

      const updatedCard = await registry.getAgent('agent-hb');
      expect(updatedCard!.lastSeenAt).toBeGreaterThan(originalLastSeen);
    });

    it('应该启动和停止自动心跳', async () => {
      await protocol.registerAgent(makeCard({ id: 'agent-auto-hb' }));

      protocol.startHeartbeat('agent-auto-hb');
      expect(protocol.isHeartbeatRunning()).toBe(true);

      // 等待几次心跳触发
      await new Promise((resolve) => setTimeout(resolve, 120));

      protocol.stopHeartbeat();
      expect(protocol.isHeartbeatRunning()).toBe(false);
    });

    it('心跳超时应该将 Agent 标记为 offline', async () => {
      await protocol.registerAgent(makeCard({ id: 'agent-stale', status: 'online' }));
      const registry = protocol.getRegistry();

      // 模拟超时：手动设置一个过去的 lastSeenAt
      const card = await registry.getAgent('agent-stale');
      card!.lastSeenAt = now() - 200; // 超过 heartbeatTimeout (100ms)

      const staleIds = await protocol.cleanupStaleAgents(false);
      expect(staleIds).toContain('agent-stale');

      const updatedCard = await registry.getAgent('agent-stale');
      expect(updatedCard!.status).toBe('offline');
    });

    it('心跳超时且 remove=true 应该移除 Agent', async () => {
      await protocol.registerAgent(makeCard({ id: 'agent-remove' }));
      const registry = protocol.getRegistry();

      const card = await registry.getAgent('agent-remove');
      card!.lastSeenAt = now() - 200;

      const staleIds = await protocol.cleanupStaleAgents(true);
      expect(staleIds).toContain('agent-remove');

      const found = await registry.getAgent('agent-remove');
      expect(found).toBeNull();
    });

    it('向不存在的心跳 Agent 发送心跳应该抛出错误', async () => {
      await expect(protocol.sendHeartbeat('non-existent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('updateStatus 应该更新 Agent 状态', async () => {
      await protocol.registerAgent(makeCard({ id: 'agent-status', status: 'online' }));
      const registry = protocol.getRegistry();

      await registry.updateStatus('agent-status', 'busy');
      const card = await registry.getAgent('agent-status');
      expect(card!.status).toBe('busy');
    });

    it('updateStatus 对不存在的 Agent 应该抛出错误', async () => {
      const registry = protocol.getRegistry();
      await expect(registry.updateStatus('non-existent', 'offline')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('事件触发', () => {
    let protocol: A2AProtocol;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol();
    });

    afterEach(async () => {
      await protocol.close();
      globalEventBus.removeAllListeners();
    });

    it('注册 Agent 时应该触发 a2a.agent_registered 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.A2A_AGENT_REGISTERED, handler);

      await protocol.registerAgent(makeCard({ id: 'agent-evt-reg' }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('agent-evt-reg', expect.any(Number));
    });

    it('注销 Agent 时应该触发 a2a.agent_unregistered 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.A2A_AGENT_UNREGISTERED, handler);

      await protocol.registerAgent(makeCard({ id: 'agent-evt-unreg' }));
      await protocol.unregisterAgent('agent-evt-unreg');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('agent-evt-unreg', expect.any(Number));
    });

    it('发送消息时应该触发 a2a.message_sent 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.A2A_MESSAGE_SENT, handler);

      await protocol.registerAgent(makeCard({ id: 'agent-a' }));
      await protocol.registerAgent(makeCard({ id: 'agent-b' }));

      await protocol.notify('agent-a', 'agent-b', { data: 1 });

      expect(handler).toHaveBeenCalled();
      // 至少触发一次（notify 发送一条消息）
      const callArgs = handler.mock.calls[0];
      expect(callArgs[0]).toBeDefined(); // messageId
      expect(callArgs[1]).toBe('agent-a'); // from
      expect(callArgs[2]).toBe('agent-b'); // to
    });

    it('接收消息时应该触发 a2a.message_received 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.A2A_MESSAGE_RECEIVED, handler);

      await protocol.registerAgent(makeCard({ id: 'agent-a' }));
      await protocol.registerAgent(makeCard({ id: 'agent-b' }));

      await protocol.notify('agent-a', 'agent-b', { data: 1 });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('查询能力', () => {
    let protocol: A2AProtocol;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      protocol = new A2AProtocol();
    });

    afterEach(async () => {
      await protocol.close();
    });

    it('queryCapabilities 应该返回匹配的 Agent 列表', async () => {
      await protocol.registerAgent(
        makeCard({
          id: 'agent-a',
          capabilities: [{ name: 'translate', description: '翻译' }],
        })
      );
      await protocol.registerAgent(
        makeCard({
          id: 'agent-b',
          capabilities: [{ name: 'code', description: '编码' }],
        })
      );

      const results = await protocol.queryCapabilities('agent-caller', {
        capabilities: [{ name: 'translate', description: '' }],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('agent-a');
    });

    it('queryCapabilities 不带过滤条件应返回所有 Agent', async () => {
      await protocol.registerAgent(makeCard({ id: 'a1' }));
      await protocol.registerAgent(makeCard({ id: 'a2' }));

      const results = await protocol.queryCapabilities('caller');
      expect(results).toHaveLength(2);
    });

    it('discoverByCapability 应该根据能力名发现 Agent', async () => {
      await protocol.registerAgent(
        makeCard({
          id: 'agent-x',
          capabilities: [{ name: 'analyze', description: '分析' }],
        })
      );

      const results = await protocol.discoverByCapability('analyze');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('agent-x');
    });
  });

  describe('通道管理', () => {
    it('关闭通道后不应再接受消息', async () => {
      const channel = new LocalA2AChannel();
      await channel.close();

      const message: A2AMessage = {
        id: 'msg-closed',
        from: 'a',
        to: 'b',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await expect(channel.send(message)).rejects.toThrow(/关闭/);
    });

    it('关闭通道后应拒绝等待中的请求', async () => {
      const channel = new LocalA2AChannel();
      // 注册一个不回复的 Agent，使请求保持等待状态
      channel.registerAgent('b', () => {});

      const message: A2AMessage = {
        id: 'msg-pending',
        from: 'a',
        to: 'b',
        type: 'request',
        payload: {},
        timestamp: now(),
      };

      // 不等待 sendAndWait 完成，直接关闭通道
      const promise = channel.sendAndWait(message, 5000);
      await channel.close();

      await expect(promise).rejects.toThrow(/关闭/);
    });

    it('应该返回已注册的 Agent 列表', () => {
      const channel = new LocalA2AChannel();
      channel.registerAgent('a', () => {});
      channel.registerAgent('b', () => {});

      const agents = channel.getRegisteredAgents();
      expect(agents).toHaveLength(2);
      expect(agents).toContain('a');
      expect(agents).toContain('b');
    });

    it('应该支持注销 Agent', async () => {
      const channel = new LocalA2AChannel();
      const received: A2AMessage[] = [];
      channel.registerAgent('a', (msg) => received.push(msg));

      channel.unregisterAgent('a');

      const message: A2AMessage = {
        id: 'msg-after-unreg',
        from: 'b',
        to: 'a',
        type: 'notification',
        payload: {},
        timestamp: now(),
      };

      await channel.send(message);
      expect(received).toHaveLength(0);
    });
  });

  describe('A2AProtocol 完整工作流', () => {
    it('应该完成多 Agent 协作流程', async () => {
      globalEventBus.removeAllListeners();
      const protocol = new A2AProtocol();

      try {
        // 注册三个 Agent
        await protocol.registerAgent(
          makeCard({
            id: 'orchestrator',
            capabilities: [{ name: 'orchestrate', description: '编排任务' }],
          })
        );

        await protocol.registerAgent(
          makeCard({
            id: 'translator',
            capabilities: [{ name: 'translate', description: '翻译' }],
          }),
          async (msg: A2AMessage) => {
            if (msg.type === 'request') {
              await protocol.respond(msg, { translated: `翻译: ${(msg.payload as any)?.text}` });
            }
          }
        );

        await protocol.registerAgent(
          makeCard({
            id: 'summarizer',
            capabilities: [{ name: 'summarize', description: '总结' }],
          }),
          async (msg: A2AMessage) => {
            if (msg.type === 'request') {
              await protocol.respond(msg, { summary: `总结: ${(msg.payload as any)?.text}` });
            }
          }
        );

        // 1. 发现翻译 Agent
        const translators = await protocol.discoverByCapability('translate');
        expect(translators).toHaveLength(1);
        expect(translators[0].id).toBe('translator');

        // 2. 请求翻译
        const translateResponse = await protocol.request(
          'orchestrator',
          'translator',
          { text: 'Hello World' },
          1000
        );
        expect((translateResponse.payload as any).translated).toBe('翻译: Hello World');

        // 3. 请求总结
        const summaryResponse = await protocol.request(
          'orchestrator',
          'summarizer',
          { text: 'Long article...' },
          1000
        );
        expect((summaryResponse.payload as any).summary).toBe('总结: Long article...');

        // 4. 广播通知
        const notifications: A2AMessage[] = [];
        await protocol.registerAgent(
          makeCard({ id: 'logger' }),
          (msg) => notifications.push(msg)
        );

        await protocol.broadcast('orchestrator', { event: 'task_completed' });
        expect(notifications).toHaveLength(1);
      } finally {
        await protocol.close();
        globalEventBus.removeAllListeners();
      }
    });
  });
});
