import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SkillSandbox,
  VmSandbox,
  PermissionController,
  AuditLogger,
  PermissionDeniedError,
  createDenyAllPolicy,
  createAllowAllPolicy,
} from '../src/index.js';
import type { PermissionPolicy, SandboxConfig } from '../src/index.js';
import { globalEventBus, EVENTS, now } from '@aether/shared';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 创建测试用的权限策略
 */
function makePolicy(overrides: Partial<PermissionPolicy> = {}): PermissionPolicy {
  return {
    default: 'deny',
    rules: [],
    ...overrides,
  };
}

/**
 * 创建测试用的沙箱配置
 */
function makeConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    skillId: 'test-skill',
    agentId: 'test-agent',
    policy: makePolicy({ default: 'allow' }),
    timeout: 1000,
    ...overrides,
  };
}

describe('安全沙箱模块测试', () => {
  describe('PermissionController 权限控制', () => {
    let controller: PermissionController;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
    });

    it('应该在默认 allow 策略下允许未匹配的权限', () => {
      controller = new PermissionController('skill-1', {
        default: 'allow',
        rules: [],
      });
      const result = controller.check('fs.read', '/tmp/file');
      expect(result.allowed).toBe(true);
    });

    it('应该在默认 deny 策略下拒绝未匹配的权限', () => {
      controller = new PermissionController('skill-1', {
        default: 'deny',
        rules: [],
      });
      const result = controller.check('fs.read', '/tmp/file');
      expect(result.allowed).toBe(false);
    });

    it('应该根据规则允许权限', () => {
      controller = new PermissionController('skill-1', {
        default: 'deny',
        rules: [
          { permission: 'fs.read', allowed: true },
        ],
      });
      const result = controller.check('fs.read', '/tmp/file');
      expect(result.allowed).toBe(true);
    });

    it('应该根据规则拒绝权限', () => {
      controller = new PermissionController('skill-1', {
        default: 'allow',
        rules: [
          { permission: 'fs.write', allowed: false },
        ],
      });
      const result = controller.check('fs.write', '/tmp/file');
      expect(result.allowed).toBe(false);
    });

    it('deny 规则应优先于 allow 规则', () => {
      controller = new PermissionController('skill-1', {
        default: 'allow',
        rules: [
          { permission: 'fs.read', allowed: true },
          { permission: 'fs.read', allowed: false, resources: ['/etc'] },
        ],
      });
      // /etc 下的资源被拒绝
      const denied = controller.check('fs.read', '/etc/passwd');
      expect(denied.allowed).toBe(false);
      // 其他资源被允许
      const allowed = controller.check('fs.read', '/tmp/file');
      expect(allowed.allowed).toBe(true);
    });

    it('应该根据资源限制匹配规则', () => {
      controller = new PermissionController('skill-1', {
        default: 'deny',
        rules: [
          { permission: 'fs.read', allowed: true, resources: ['/tmp/safe', '/var/data'] },
        ],
      });
      // 在允许的资源路径内
      expect(controller.check('fs.read', '/tmp/safe/file').allowed).toBe(true);
      expect(controller.check('fs.read', '/var/data').allowed).toBe(true);
      // 不在允许的资源路径内
      expect(controller.check('fs.read', '/etc/passwd').allowed).toBe(false);
    });

    it('资源限制应支持目录前缀匹配', () => {
      controller = new PermissionController('skill-1', {
        default: 'deny',
        rules: [
          { permission: 'fs.read', allowed: true, resources: ['/tmp/safe'] },
        ],
      });
      // 子路径应匹配
      expect(controller.check('fs.read', '/tmp/safe/sub/file').allowed).toBe(true);
      // 同级但不属于子路径
      expect(controller.check('fs.read', '/tmp/safeother').allowed).toBe(false);
    });

    it('assert 方法在权限被拒绝时应抛出 PermissionDeniedError', () => {
      controller = new PermissionController('skill-1', createDenyAllPolicy());
      expect(() => controller.assert('fs.read', '/tmp/file')).toThrow(PermissionDeniedError);
    });

    it('assert 方法在权限允许时不应抛出错误', () => {
      controller = new PermissionController('skill-1', createAllowAllPolicy());
      expect(() => controller.assert('fs.read', '/tmp/file')).not.toThrow();
    });

    it('createDenyAllPolicy 应返回默认拒绝策略', () => {
      const policy = createDenyAllPolicy();
      expect(policy.default).toBe('deny');
      expect(policy.rules).toHaveLength(0);
    });

    it('createAllowAllPolicy 应返回默认允许策略', () => {
      const policy = createAllowAllPolicy();
      expect(policy.default).toBe('allow');
      expect(policy.rules).toHaveLength(0);
    });

    it('check 应触发 sandbox.permission_checked 事件', () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_PERMISSION_CHECKED, handler);

      controller = new PermissionController('skill-evt', createAllowAllPolicy(), 'agent-evt');
      controller.check('fs.read', '/tmp/file');

      expect(handler).toHaveBeenCalledTimes(1);
      const args = handler.mock.calls[0];
      expect(args[0]).toBe('skill-evt'); // skillId
      expect(args[1]).toBe('fs.read'); // permission
      expect(args[2]).toBe('/tmp/file'); // resource
      expect(args[3]).toBe(true); // allowed
      expect(typeof args[4]).toBe('number'); // timestamp
    });
  });

  describe('AuditLogger 审计日志', () => {
    let logger: AuditLogger;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      logger = new AuditLogger();
    });

    it('应该记录审计条目', async () => {
      const entry = await logger.log({
        action: 'fs.readFile',
        permission: 'fs.read',
        resource: '/tmp/file',
        result: 'allow',
        skillId: 'skill-1',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.action).toBe('fs.readFile');
      expect(entry.result).toBe('allow');
    });

    it('logSync 应同步记录审计条目', () => {
      const entry = logger.logSync({
        action: 'fs.readFile',
        permission: 'fs.read',
        resource: '/tmp/file',
        result: 'deny',
        skillId: 'skill-1',
      });

      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('fs.readFile');
      expect(entry.result).toBe('deny');
    });

    it('应该按 skillId 查询审计日志', () => {
      logger.logSync({ action: 'a1', result: 'allow', skillId: 'skill-1' });
      logger.logSync({ action: 'a2', result: 'allow', skillId: 'skill-2' });
      logger.logSync({ action: 'a3', result: 'allow', skillId: 'skill-1' });

      const results = logger.query({ skillId: 'skill-1' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.skillId === 'skill-1')).toBe(true);
    });

    it('应该按 result 查询审计日志', () => {
      logger.logSync({ action: 'a1', result: 'allow', skillId: 's1' });
      logger.logSync({ action: 'a2', result: 'deny', skillId: 's1' });
      logger.logSync({ action: 'a3', result: 'error', skillId: 's1' });

      const denied = logger.query({ result: 'deny' });
      expect(denied).toHaveLength(1);
      expect(denied[0].action).toBe('a2');
    });

    it('应该按 action 查询审计日志', () => {
      logger.logSync({ action: 'fs.readFile', result: 'allow', skillId: 's1' });
      logger.logSync({ action: 'fs.writeFile', result: 'allow', skillId: 's1' });

      const results = logger.query({ action: 'fs.readFile' });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('fs.readFile');
    });

    it('应该按时间范围查询审计日志', () => {
      const start = now();
      logger.logSync({ action: 'a1', result: 'allow', skillId: 's1', timestamp: start - 1000 });
      logger.logSync({ action: 'a2', result: 'allow', skillId: 's1', timestamp: start });
      logger.logSync({ action: 'a3', result: 'allow', skillId: 's1', timestamp: start + 1000 });

      const results = logger.query({ startTime: start - 500, endTime: start + 500 });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('a2');
    });

    it('应该支持 limit 限制返回数量（取最新）', () => {
      for (let i = 0; i < 10; i++) {
        logger.logSync({ action: `a${i}`, result: 'allow', skillId: 's1' });
      }
      const results = logger.query({ limit: 3 });
      expect(results).toHaveLength(3);
      // 取最新的 3 条
      expect(results[2].action).toBe('a9');
      expect(results[0].action).toBe('a7');
    });

    it('应该返回审计条目数量', () => {
      expect(logger.count()).toBe(0);
      logger.logSync({ action: 'a1', result: 'allow', skillId: 's1' });
      expect(logger.count()).toBe(1);
      logger.logSync({ action: 'a2', result: 'allow', skillId: 's1' });
      expect(logger.count()).toBe(2);
    });

    it('clear 应清空审计日志', () => {
      logger.logSync({ action: 'a1', result: 'allow', skillId: 's1' });
      expect(logger.count()).toBe(1);
      logger.clearSync();
      expect(logger.count()).toBe(0);
    });

    it('超过最大条数时应 FIFO 淘汰', () => {
      const smallLogger = new AuditLogger({ maxEntries: 3 });
      smallLogger.logSync({ action: 'a1', result: 'allow', skillId: 's1' });
      smallLogger.logSync({ action: 'a2', result: 'allow', skillId: 's1' });
      smallLogger.logSync({ action: 'a3', result: 'allow', skillId: 's1' });
      smallLogger.logSync({ action: 'a4', result: 'allow', skillId: 's1' });

      expect(smallLogger.count()).toBe(3);
      const all = smallLogger.getAll();
      expect(all[0].action).toBe('a2'); // a1 被淘汰
      expect(all[2].action).toBe('a4');
    });

    it('log 应触发 sandbox.audit_logged 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_AUDIT_LOGGED, handler);

      await logger.log({
        action: 'fs.readFile',
        result: 'allow',
        skillId: 'skill-1',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const args = handler.mock.calls[0];
      expect(typeof args[0]).toBe('string'); // auditId
      expect(args[1]).toBe('fs.readFile'); // action
      expect(args[2]).toBe('allow'); // result
      expect(typeof args[3]).toBe('number'); // timestamp
    });
  });

  describe('VmSandbox 代码执行', () => {
    let auditLogger: AuditLogger;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      auditLogger = new AuditLogger();
    });

    it('应该执行简单的数学计算并返回结果', async () => {
      const config = makeConfig({ policy: createAllowAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('return 1 + 2 * 3;');

      expect(result.success).toBe(true);
      expect(result.value).toBe(7);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('应该支持 async/await', async () => {
      const config = makeConfig({ policy: createAllowAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        const v = await Promise.resolve(42);
        return v;
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('应该将 args 注入到沙箱上下文', async () => {
      const config = makeConfig({ policy: createAllowAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(
        'return args.x + args.y;',
        { x: 10, y: 20 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(30);
    });

    it('应该将 context 注入到沙箱上下文（通过 ctx）', async () => {
      const config = makeConfig({
        policy: createAllowAllPolicy(),
        context: { greeting: 'hello' },
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('return ctx.greeting;');

      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('权限被拒绝时应返回失败结果', async () => {
      const config = makeConfig({ policy: createDenyAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('return time.now();');

      expect(result.success).toBe(false);
      expect(result.error).toContain('被拒绝');
      expect(result.auditEntries.length).toBeGreaterThan(0);
      // 应该有 deny 类型的审计条目
      const denyEntries = result.auditEntries.filter((e) => e.result === 'deny');
      expect(denyEntries.length).toBeGreaterThan(0);
    });

    it('应该捕获代码中的错误', async () => {
      const config = makeConfig({ policy: createAllowAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('throw new Error("test error");');

      expect(result.success).toBe(false);
      expect(result.error).toBe('test error');
    });

    it('应该捕获语法错误', async () => {
      const config = makeConfig({ policy: createAllowAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('this is invalid syntax !!!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理执行超时', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [{ permission: 'time', allowed: true }],
        }),
        timeout: 100,
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        await time.sleep(500);
        return 'done';
      `);

      expect(result.success).toBe(false);
      expect(result.error).toContain('超时');
    });

    it('应该处理同步无限循环超时', async () => {
      const config = makeConfig({
        policy: createAllowAllPolicy(),
        timeout: 100,
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('while(true) {}');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('VmSandbox 权限拦截和审计', () => {
    let auditLogger: AuditLogger;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      auditLogger = new AuditLogger();
    });

    it('未授权的 fs.readFile 应被拒绝并审计', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        return await fs.readFile('/tmp/non-existent');
      `);

      expect(result.success).toBe(false);
      expect(result.error).toContain('被拒绝');
      // 审计日志应记录拒绝
      const denyEntries = result.auditEntries.filter(
        (e) => e.action === 'fs.readFile' && e.result === 'deny'
      );
      expect(denyEntries).toHaveLength(1);
    });

    it('授权的 time.now 应执行成功并审计', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [{ permission: 'time', allowed: true }],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('return time.now();');

      expect(result.success).toBe(true);
      expect(typeof result.value).toBe('number');
      expect(result.value).toBeGreaterThan(0);
      // 审计日志应记录允许
      const allowEntries = result.auditEntries.filter(
        (e) => e.action === 'time.now' && e.result === 'allow'
      );
      expect(allowEntries).toHaveLength(1);
    });

    it('授权的 random.value 应返回随机数并审计', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [{ permission: 'random', allowed: true }],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute('return random.value();');

      expect(result.success).toBe(true);
      expect(typeof result.value).toBe('number');
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
      const allowEntries = result.auditEntries.filter(
        (e) => e.action === 'random.value' && e.result === 'allow'
      );
      expect(allowEntries).toHaveLength(1);
    });

    it('授权的 memory 读写应工作并审计', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [
            { permission: 'memory.write', allowed: true },
            { permission: 'memory.read', allowed: true },
          ],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        await memory.write('key1', 'value1');
        return await memory.read('key1');
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBe('value1');
      // 应该有 memory.write 和 memory.read 的审计条目
      const writeEntries = result.auditEntries.filter((e) => e.action === 'memory.write');
      expect(writeEntries).toHaveLength(1);
      const readEntries = result.auditEntries.filter((e) => e.action === 'memory.read');
      expect(readEntries).toHaveLength(1);
    });

    it('资源限制应阻止未授权路径的访问', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [
            { permission: 'fs.read', allowed: true, resources: ['/tmp/sandbox-test-safe'] },
          ],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      // 访问未授权路径应被拒绝
      const denied = await sandbox.execute(`
        return await fs.readFile('/etc/passwd');
      `);
      expect(denied.success).toBe(false);
      expect(denied.error).toContain('被拒绝');
    });

    it('授权路径内的 fs 操作应成功', async () => {
      const testFile = join(tmpdir(), `sandbox-test-${Date.now()}.txt`);
      writeFileSync(testFile, 'hello sandbox');

      try {
        const config = makeConfig({
          policy: makePolicy({
            default: 'deny',
            rules: [
              { permission: 'fs.read', allowed: true, resources: [tmpdir()] },
            ],
          }),
        });
        const controller = new PermissionController(config.skillId, config.policy, config.agentId);
        const sandbox = new VmSandbox(config, controller, auditLogger);

        const result = await sandbox.execute(`
          return await fs.readFile('${testFile}');
        `);

        expect(result.success).toBe(true);
        expect(result.value).toBe('hello sandbox');
        const allowEntries = result.auditEntries.filter(
          (e) => e.action === 'fs.readFile' && e.result === 'allow'
        );
        expect(allowEntries).toHaveLength(1);
      } finally {
        if (existsSync(testFile)) unlinkSync(testFile);
      }
    });

    it('注入的 API 调用应全部被审计', async () => {
      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [
            { permission: 'time', allowed: true },
            { permission: 'random', allowed: true },
          ],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        const t = time.now();
        const r = random.value();
        return { t, r };
      `);

      expect(result.success).toBe(true);
      // 应该有 2 条审计条目
      expect(result.auditEntries).toHaveLength(2);
      const actions = result.auditEntries.map((e) => e.action);
      expect(actions).toContain('time.now');
      expect(actions).toContain('random.value');
      // 所有条目都应该是 allow
      expect(result.auditEntries.every((e) => e.result === 'allow')).toBe(true);
    });

    it('未授权的 mcp.callTool 应被拒绝并审计', async () => {
      const config = makeConfig({ policy: createDenyAllPolicy() });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      const result = await sandbox.execute(`
        return await mcp.callTool('some_tool');
      `);

      expect(result.success).toBe(false);
      expect(result.error).toContain('被拒绝');
      const denyEntries = result.auditEntries.filter(
        (e) => e.action === 'mcp.callTool' && e.result === 'deny'
      );
      expect(denyEntries).toHaveLength(1);
    });
  });

  describe('VmSandbox 事件触发', () => {
    let auditLogger: AuditLogger;

    beforeEach(() => {
      globalEventBus.removeAllListeners();
      auditLogger = new AuditLogger();
    });

    afterEach(() => {
      globalEventBus.removeAllListeners();
    });

    it('执行成功时应触发 sandbox.skill_executed 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_SKILL_EXECUTED, handler);

      const config = makeConfig({
        skillId: 'skill-exec-evt',
        agentId: 'agent-exec-evt',
        policy: createAllowAllPolicy(),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      await sandbox.execute('return 42;');

      expect(handler).toHaveBeenCalledTimes(1);
      const args = handler.mock.calls[0];
      expect(args[0]).toBe('skill-exec-evt'); // skillId
      expect(args[1]).toBe('agent-exec-evt'); // agentId
      expect(typeof args[2]).toBe('number'); // duration
      expect(typeof args[3]).toBe('number'); // timestamp
    });

    it('权限被拒绝时应触发 sandbox.skill_blocked 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_SKILL_BLOCKED, handler);

      const config = makeConfig({
        skillId: 'skill-block-evt',
        agentId: 'agent-block-evt',
        policy: createDenyAllPolicy(),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      await sandbox.execute('return time.now();');

      expect(handler).toHaveBeenCalledTimes(1);
      const args = handler.mock.calls[0];
      expect(args[0]).toBe('skill-block-evt'); // skillId
      expect(args[1]).toBe('agent-block-evt'); // agentId
      expect(typeof args[2]).toBe('string'); // reason
      expect(typeof args[3]).toBe('number'); // timestamp
    });

    it('权限检查应触发 sandbox.permission_checked 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_PERMISSION_CHECKED, handler);

      const config = makeConfig({
        skillId: 'skill-perm-evt',
        policy: makePolicy({
          default: 'deny',
          rules: [{ permission: 'time', allowed: true }],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      await sandbox.execute('return time.now();');

      expect(handler).toHaveBeenCalled();
      const args = handler.mock.calls[0];
      expect(args[0]).toBe('skill-perm-evt'); // skillId
      expect(args[1]).toBe('time'); // permission
    });

    it('审计日志应触发 sandbox.audit_logged 事件', async () => {
      const handler = vi.fn();
      globalEventBus.on(EVENTS.SANDBOX_AUDIT_LOGGED, handler);

      const config = makeConfig({
        policy: makePolicy({
          default: 'deny',
          rules: [{ permission: 'time', allowed: true }],
        }),
      });
      const controller = new PermissionController(config.skillId, config.policy, config.agentId);
      const sandbox = new VmSandbox(config, controller, auditLogger);

      await sandbox.execute('return time.now();');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('SkillSandbox 高层封装', () => {
    beforeEach(() => {
      globalEventBus.removeAllListeners();
    });

    it('应该通过 SkillSandbox 执行代码', async () => {
      const skillSandbox = new SkillSandbox();
      const result = await skillSandbox.execute(
        makeConfig({ policy: createAllowAllPolicy() }),
        'return 1 + 1;'
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(2);
    });

    it('应该共享审计日志记录器', async () => {
      const auditLogger = new AuditLogger();
      const skillSandbox = new SkillSandbox({ auditLogger });

      await skillSandbox.execute(
        makeConfig({
          skillId: 'shared-skill-1',
          policy: makePolicy({
            default: 'deny',
            rules: [{ permission: 'time', allowed: true }],
          }),
        }),
        'return time.now();'
      );

      await skillSandbox.execute(
        makeConfig({
          skillId: 'shared-skill-2',
          policy: makePolicy({
            default: 'deny',
            rules: [{ permission: 'random', allowed: true }],
          }),
        }),
        'return random.value();'
      );

      // 审计日志应包含两次执行的记录
      const allEntries = auditLogger.getAll();
      expect(allEntries.length).toBeGreaterThanOrEqual(2);
      expect(allEntries.some((e) => e.skillId === 'shared-skill-1')).toBe(true);
      expect(allEntries.some((e) => e.skillId === 'shared-skill-2')).toBe(true);
    });

    it('应该支持查询审计日志', async () => {
      const skillSandbox = new SkillSandbox();

      await skillSandbox.execute(
        makeConfig({
          skillId: 'query-skill',
          policy: makePolicy({
            default: 'deny',
            rules: [{ permission: 'time', allowed: true }],
          }),
        }),
        'return time.now();'
      );

      const entries = skillSandbox.queryAuditLog({ skillId: 'query-skill' });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.skillId === 'query-skill')).toBe(true);
    });

    it('应该支持清空审计日志', async () => {
      const skillSandbox = new SkillSandbox();

      await skillSandbox.execute(
        makeConfig({ policy: createAllowAllPolicy() }),
        'return 1;'
      );

      expect(skillSandbox.queryAuditLog().length).toBeGreaterThanOrEqual(0);
      await skillSandbox.clearAuditLog();
      expect(skillSandbox.queryAuditLog().length).toBe(0);
    });
  });
});
