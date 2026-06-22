/**
 * 用户配置文件支持
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CliConfig } from './cli.js';

/**
 * 用户配置（扩展 CliConfig）
 */
export interface UserConfig extends Omit<CliConfig, 'dataDir'> {
  /** 默认模型 */
  defaultModel?: string;
  /** 默认 Agent ID */
  defaultAgentId?: string;
  /** 模型提供商配置 */
  providers?: {
    openai?: { apiKey?: string; baseURL?: string };
    anthropic?: { apiKey?: string };
    ollama?: { baseURL?: string };
  };
  /** MCP 服务器配置 */
  mcpServers?: Record<
    string,
    {
      type: 'stdio' | 'http' | 'sse' | 'local';
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
      enabled?: boolean;
    }
  >;
  /** 数据目录 */
  dataDir?: string;
}

/**
 * 默认配置文件路径
 */
export const DEFAULT_CONFIG_PATH = '~/.aether/config.json';

/**
 * 获取配置文件实际路径（展开 ~）
 */
export function getConfigPath(configPath?: string): string {
  const raw = configPath ?? DEFAULT_CONFIG_PATH;
  if (raw.startsWith('~/')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

/**
 * 创建默认配置
 */
export function createDefaultConfig(): UserConfig {
  return {
    outputFormat: 'text',
    color: true,
    quiet: false,
    verbose: false,
    dataDir: './data',
    defaultModel: 'mock',
    defaultAgentId: 'default',
    providers: {},
    mcpServers: {},
  };
}

/**
 * 加载用户配置
 *
 * 配置文件不存在时返回默认值，不抛错。
 */
export async function loadConfig(configPath?: string): Promise<UserConfig> {
  const filePath = getConfigPath(configPath);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<UserConfig>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      return createDefaultConfig();
    }
    throw error;
  }
}

/**
 * 保存用户配置
 */
export async function saveConfig(config: UserConfig, configPath?: string): Promise<void> {
  const filePath = getConfigPath(configPath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * 将部分配置与默认配置合并，确保必填字段存在
 */
function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig {
  const defaults = createDefaultConfig();
  return {
    ...defaults,
    ...partial,
    outputFormat: partial.outputFormat ?? defaults.outputFormat,
    color: partial.color ?? defaults.color,
    quiet: partial.quiet ?? defaults.quiet,
    verbose: partial.verbose ?? defaults.verbose,
    dataDir: partial.dataDir ?? defaults.dataDir,
  };
}
