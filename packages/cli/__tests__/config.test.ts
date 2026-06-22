import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  getConfigPath,
  DEFAULT_CONFIG_PATH,
  type UserConfig,
} from '../src/config';

describe('config 模块', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getConfigPath', () => {
    it('展开 ~ 为 home 目录', () => {
      const p = getConfigPath(DEFAULT_CONFIG_PATH);
      expect(p).toBe(path.join(os.homedir(), '.aether', 'config.json'));
    });

    it('展开自定义 ~ 路径', () => {
      const p = getConfigPath('~/custom/path.json');
      expect(p).toBe(path.join(os.homedir(), 'custom', 'path.json'));
    });

    it('不修改非 ~ 开头的路径', () => {
      const p = getConfigPath('/etc/aether/config.json');
      expect(p).toBe('/etc/aether/config.json');
    });

    it('未传入时使用默认路径', () => {
      const p = getConfigPath();
      expect(p).toBe(path.join(os.homedir(), '.aether', 'config.json'));
    });
  });

  describe('createDefaultConfig', () => {
    it('返回包含所有必需字段的配置', () => {
      const config = createDefaultConfig();
      expect(config.outputFormat).toBe('text');
      expect(config.color).toBe(true);
      expect(config.quiet).toBe(false);
      expect(config.verbose).toBe(false);
      expect(config.dataDir).toBe('./data');
    });

    it('包含扩展字段', () => {
      const config = createDefaultConfig();
      expect(config.defaultModel).toBe('mock');
      expect(config.defaultAgentId).toBe('default');
      expect(config.providers).toBeDefined();
      expect(config.mcpServers).toBeDefined();
    });

    it('每次调用返回新对象', () => {
      const c1 = createDefaultConfig();
      const c2 = createDefaultConfig();
      expect(c1).not.toBe(c2);
      expect(c1).toEqual(c2);
    });
  });

  describe('loadConfig', () => {
    it('文件不存在时返回默认配置', async () => {
      const configPath = path.join(tmpDir, 'nonexistent.json');
      const config = await loadConfig(configPath);
      const defaults = createDefaultConfig();
      expect(config.outputFormat).toBe(defaults.outputFormat);
      expect(config.color).toBe(defaults.color);
      expect(config.dataDir).toBe(defaults.dataDir);
    });

    it('加载存在的配置文件', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const userConfig: UserConfig = {
        ...createDefaultConfig(),
        defaultModel: 'gpt-4',
        color: false,
        dataDir: '/custom/data',
      };
      await fs.writeFile(configPath, JSON.stringify(userConfig), 'utf-8');

      const loaded = await loadConfig(configPath);
      expect(loaded.defaultModel).toBe('gpt-4');
      expect(loaded.color).toBe(false);
      expect(loaded.dataDir).toBe('/custom/data');
    });

    it('加载部分配置时合并默认值', async () => {
      const configPath = path.join(tmpDir, 'partial.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ defaultModel: 'claude' }),
        'utf-8'
      );

      const loaded = await loadConfig(configPath);
      expect(loaded.defaultModel).toBe('claude');
      // 缺失字段使用默认值
      expect(loaded.color).toBe(true);
      expect(loaded.dataDir).toBe('./data');
    });

    it('加载包含 providers 的配置', async () => {
      const configPath = path.join(tmpDir, 'providers.json');
      const userConfig: UserConfig = {
        ...createDefaultConfig(),
        providers: {
          openai: { apiKey: 'sk-test', baseURL: 'https://api.openai.com' },
          anthropic: { apiKey: 'sk-ant-test' },
        },
      };
      await fs.writeFile(configPath, JSON.stringify(userConfig), 'utf-8');

      const loaded = await loadConfig(configPath);
      expect(loaded.providers?.openai?.apiKey).toBe('sk-test');
      expect(loaded.providers?.openai?.baseURL).toBe('https://api.openai.com');
      expect(loaded.providers?.anthropic?.apiKey).toBe('sk-ant-test');
    });

    it('加载包含 mcpServers 的配置', async () => {
      const configPath = path.join(tmpDir, 'mcp.json');
      const userConfig: UserConfig = {
        ...createDefaultConfig(),
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            enabled: true,
          },
        },
      };
      await fs.writeFile(configPath, JSON.stringify(userConfig), 'utf-8');

      const loaded = await loadConfig(configPath);
      expect(loaded.mcpServers?.filesystem?.type).toBe('stdio');
      expect(loaded.mcpServers?.filesystem?.command).toBe('npx');
      expect(loaded.mcpServers?.filesystem?.enabled).toBe(true);
    });

    it('目录路径作为配置路径时返回默认配置', async () => {
      const config = await loadConfig(tmpDir);
      expect(config.outputFormat).toBe('text');
    });
  });

  describe('saveConfig', () => {
    it('保存配置到文件', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const userConfig: UserConfig = {
        ...createDefaultConfig(),
        defaultModel: 'gpt-4',
      };
      await saveConfig(userConfig, configPath);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.defaultModel).toBe('gpt-4');
    });

    it('保存时自动创建父目录', async () => {
      const configPath = path.join(tmpDir, 'nested', 'deep', 'config.json');
      const userConfig = createDefaultConfig();
      await saveConfig(userConfig, configPath);

      const stat = await fs.stat(configPath);
      expect(stat.isFile()).toBe(true);
    });

    it('保存后可以重新加载', async () => {
      const configPath = path.join(tmpDir, 'roundtrip.json');
      const original: UserConfig = {
        ...createDefaultConfig(),
        defaultModel: 'gpt-4',
        color: false,
        providers: {
          openai: { apiKey: 'sk-roundtrip' },
        },
      };
      await saveConfig(original, configPath);
      const loaded = await loadConfig(configPath);

      expect(loaded.defaultModel).toBe('gpt-4');
      expect(loaded.color).toBe(false);
      expect(loaded.providers?.openai?.apiKey).toBe('sk-roundtrip');
    });

    it('保存为格式化的 JSON', async () => {
      const configPath = path.join(tmpDir, 'formatted.json');
      await saveConfig(createDefaultConfig(), configPath);

      const content = await fs.readFile(configPath, 'utf-8');
      // 应该包含缩进
      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });
  });
});
