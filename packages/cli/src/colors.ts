/**
 * ANSI 颜色码工具
 * 支持检测 TTY 自动禁用颜色
 */

/**
 * 颜色主题接口
 */
export interface ColorTheme {
  reset: string;
  bold: string;
  dim: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  gray: string;
}

/**
 * ANSI 转义码常量
 */
const ANSI_CODES: ColorTheme = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * 空主题（非 TTY 时使用）
 */
const EMPTY_THEME: ColorTheme = {
  reset: '',
  bold: '',
  dim: '',
  red: '',
  green: '',
  yellow: '',
  blue: '',
  magenta: '',
  cyan: '',
  white: '',
  gray: '',
};

/**
 * 检测当前是否为 TTY 环境
 */
function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * 解析颜色启用状态
 * - 显式传入 boolean 时以传入值为准
 * - 未传入时根据 TTY 自动检测
 */
function resolveEnabled(enabled?: boolean): boolean {
  if (enabled === undefined) {
    return isTTY();
  }
  return enabled;
}

/**
 * 获取颜色主题（非 TTY 时返回空字符串）
 */
export function getColorTheme(enabled?: boolean): ColorTheme {
  return resolveEnabled(enabled) ? ANSI_CODES : EMPTY_THEME;
}

/**
 * 着色函数
 */
export function colorize(text: string, color: keyof ColorTheme, enabled?: boolean): string {
  const theme = getColorTheme(enabled);
  const code = theme[color];
  if (!code) {
    return text;
  }
  return `${code}${text}${theme.reset}`;
}

/**
 * 成功消息（绿色）
 */
export function success(text: string, enabled?: boolean): string {
  return colorize(text, 'green', enabled);
}

/**
 * 错误消息（红色）
 */
export function error(text: string, enabled?: boolean): string {
  return colorize(text, 'red', enabled);
}

/**
 * 警告消息（黄色）
 */
export function warn(text: string, enabled?: boolean): string {
  return colorize(text, 'yellow', enabled);
}

/**
 * 信息消息（蓝色）
 */
export function info(text: string, enabled?: boolean): string {
  return colorize(text, 'blue', enabled);
}

/**
 * 标题（青色加粗）
 */
export function title(text: string, enabled?: boolean): string {
  const theme = getColorTheme(enabled);
  if (!theme.cyan) {
    return text;
  }
  return `${theme.bold}${theme.cyan}${text}${theme.reset}`;
}

/**
 * 暗淡文本
 */
export function dim(text: string, enabled?: boolean): string {
  return colorize(text, 'dim', enabled);
}
