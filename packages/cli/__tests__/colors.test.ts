import { describe, it, expect } from 'vitest';
import {
  getColorTheme,
  colorize,
  success,
  error,
  warn,
  info,
  title,
  dim,
  type ColorTheme,
} from '../src/colors';

describe('colors 模块', () => {
  describe('getColorTheme', () => {
    it('enabled=true 时返回 ANSI 颜色码', () => {
      const theme = getColorTheme(true);
      expect(theme.reset).toBe('\x1b[0m');
      expect(theme.bold).toBe('\x1b[1m');
      expect(theme.red).toBe('\x1b[31m');
      expect(theme.green).toBe('\x1b[32m');
      expect(theme.yellow).toBe('\x1b[33m');
      expect(theme.blue).toBe('\x1b[34m');
      expect(theme.magenta).toBe('\x1b[35m');
      expect(theme.cyan).toBe('\x1b[36m');
      expect(theme.white).toBe('\x1b[37m');
      expect(theme.gray).toBe('\x1b[90m');
    });

    it('enabled=false 时返回空字符串', () => {
      const theme = getColorTheme(false);
      expect(theme.reset).toBe('');
      expect(theme.bold).toBe('');
      expect(theme.red).toBe('');
      expect(theme.green).toBe('');
      expect(theme.cyan).toBe('');
    });

    it('返回的主题包含所有必需字段', () => {
      const theme = getColorTheme(true);
      const keys: (keyof ColorTheme)[] = [
        'reset', 'bold', 'dim', 'red', 'green', 'yellow',
        'blue', 'magenta', 'cyan', 'white', 'gray',
      ];
      for (const key of keys) {
        expect(theme[key]).toBeDefined();
      }
    });
  });

  describe('colorize', () => {
    it('enabled=true 时包裹 ANSI 码', () => {
      const result = colorize('hello', 'red', true);
      expect(result).toBe('\x1b[31mhello\x1b[0m');
    });

    it('enabled=false 时返回原文本', () => {
      const result = colorize('hello', 'red', false);
      expect(result).toBe('hello');
    });

    it('支持所有颜色', () => {
      const colors: (keyof ColorTheme)[] = [
        'bold', 'dim', 'red', 'green', 'yellow',
        'blue', 'magenta', 'cyan', 'white', 'gray',
      ];
      for (const c of colors) {
        const result = colorize('x', c, true);
        expect(result).toContain('x');
        expect(result).not.toBe('x');
      }
    });
  });

  describe('便捷函数', () => {
    it('success 返回绿色文本', () => {
      expect(success('ok', true)).toBe('\x1b[32mok\x1b[0m');
      expect(success('ok', false)).toBe('ok');
    });

    it('error 返回红色文本', () => {
      expect(error('fail', true)).toBe('\x1b[31mfail\x1b[0m');
      expect(error('fail', false)).toBe('fail');
    });

    it('warn 返回黄色文本', () => {
      expect(warn('careful', true)).toBe('\x1b[33mcareful\x1b[0m');
      expect(warn('careful', false)).toBe('careful');
    });

    it('info 返回蓝色文本', () => {
      expect(info('note', true)).toBe('\x1b[34mnote\x1b[0m');
      expect(info('note', false)).toBe('note');
    });

    it('title 返回青色加粗文本', () => {
      const result = title('Header', true);
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('\x1b[36m');
      expect(result).toContain('Header');
      expect(result).toContain('\x1b[0m');
      expect(title('Header', false)).toBe('Header');
    });

    it('dim 返回暗淡文本', () => {
      expect(dim('quiet', true)).toBe('\x1b[2mquiet\x1b[0m');
      expect(dim('quiet', false)).toBe('quiet');
    });
  });

  describe('TTY 自动检测', () => {
    it('未传入 enabled 时根据 TTY 自动检测（测试环境通常非 TTY）', () => {
      // 测试环境通常不是 TTY，所以应返回空主题
      const theme = getColorTheme();
      // 在非 TTY 环境下应该是空字符串
      if (process.stdout.isTTY !== true) {
        expect(theme.red).toBe('');
      }
    });

    it('colorize 未传入 enabled 时在非 TTY 返回原文本', () => {
      if (process.stdout.isTTY !== true) {
        expect(colorize('test', 'red')).toBe('test');
      }
    });
  });
});
