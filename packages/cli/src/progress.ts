/**
 * 进度条和加载动画
 */

import { colorize } from './colors.js';

/**
 * 旋转字符序列
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 旋转器刷新间隔（毫秒）
 */
const SPINNER_INTERVAL_MS = 80;

/**
 * 进度条总长度
 */
const PROGRESS_BAR_WIDTH = 10;

/**
 * 检测当前是否为 TTY 环境
 */
function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * 旋转器动画
 *
 * 在 TTY 环境下显示旋转字符动画，非 TTY 环境下降级为静默模式。
 */
export class Spinner {
  private message: string;
  private enabled: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private stream: NodeJS.WriteStream;

  constructor(message: string, enabled?: boolean) {
    this.message = message;
    this.enabled = enabled === undefined ? isTTY() : enabled;
    this.stream = process.stdout;
  }

  /**
   * 启动旋转器
   */
  start(): void {
    if (!this.enabled || this.timer) {
      return;
    }
    this.frameIndex = 0;
    this.renderFrame();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.renderFrame();
    }, SPINNER_INTERVAL_MS);
  }

  /**
   * 渲染当前帧
   */
  private renderFrame(): void {
    const frame = SPINNER_FRAMES[this.frameIndex];
    const text = `${colorize(frame, 'cyan', this.enabled)} ${this.message}`;
    this.stream.write(`\r${text}`);
  }

  /**
   * 清除当前行
   */
  private clearLine(): void {
    this.stream.write('\r\x1b[K');
  }

  /**
   * 停止旋转器并显示最终消息
   */
  stop(finalMessage?: string): void {
    if (!this.enabled) {
      if (finalMessage) {
        this.stream.write(`${finalMessage}\n`);
      }
      return;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
    if (finalMessage) {
      this.stream.write(`${finalMessage}\n`);
    }
  }

  /**
   * 停止旋转器并显示错误消息
   */
  fail(errorMessage?: string): void {
    if (!this.enabled) {
      if (errorMessage) {
        this.stream.write(`${colorize(errorMessage, 'red', false)}\n`);
      }
      return;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
    if (errorMessage) {
      this.stream.write(`${colorize(errorMessage, 'red', this.enabled)}\n`);
    }
  }

  /**
   * 更新旋转器消息
   */
  update(message: string): void {
    this.message = message;
  }
}

/**
 * 进度条
 *
 * 在 TTY 环境下显示进度条，非 TTY 环境下降级为简单日志。
 */
export class ProgressBar {
  private total: number;
  private label: string;
  private enabled: boolean;
  private current = 0;
  private stream: NodeJS.WriteStream;

  constructor(total: number, label?: string, enabled?: boolean) {
    this.total = total;
    this.label = label ?? '';
    this.enabled = enabled === undefined ? isTTY() : enabled;
    this.stream = process.stdout;
  }

  /**
   * 渲染进度条
   */
  private render(): void {
    const percent = this.total > 0 ? Math.min(100, Math.floor((this.current / this.total) * 100)) : 0;
    const filledCount = Math.floor((percent / 100) * PROGRESS_BAR_WIDTH);
    const emptyCount = PROGRESS_BAR_WIDTH - filledCount;
    const bar = `${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}`;
    const labelPart = this.label ? `${this.label} ` : '';
    const line = `${labelPart}[${colorize(bar, 'cyan', this.enabled)}] ${percent}%`;
    this.stream.write(`\r${line}`);
  }

  /**
   * 更新进度
   */
  update(current: number): void {
    this.current = Math.max(0, Math.min(current, this.total));
    if (this.enabled) {
      this.render();
    }
  }

  /**
   * 增加进度
   */
  increment(): void {
    this.update(this.current + 1);
  }

  /**
   * 完成进度条
   */
  complete(finalMessage?: string): void {
    this.current = this.total;
    if (this.enabled) {
      this.render();
      this.stream.write('\n');
    }
    if (finalMessage) {
      this.stream.write(`${finalMessage}\n`);
    }
  }
}
