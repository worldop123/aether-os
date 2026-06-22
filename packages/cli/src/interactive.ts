/**
 * 交互式聊天会话
 */

import * as readline from 'node:readline';
import { colorize, success, info, dim, title } from './colors.js';

/**
 * 交互式会话选项
 */
export interface InteractiveSessionOptions {
  /** 消息处理回调，返回回复内容 */
  onMessage: (input: string) => Promise<string>;
  /** 欢迎消息 */
  welcome?: string;
  /** 提示符 */
  prompt?: string;
}

/**
 * 交互式聊天会话
 *
 * 基于 readline 实现 REPL，支持：
 * - 输入消息，调用 onMessage 获取回复并打印
 * - /exit /quit 退出
 * - /help 显示帮助
 * - /clear 清屏
 * - Ctrl+C 优雅退出
 * - 彩色提示符
 */
export class InteractiveSession {
  private options: InteractiveSessionOptions;
  private rl: readline.Interface | null = null;
  private running = false;

  constructor(options: InteractiveSessionOptions) {
    this.options = {
      prompt: '> ',
      ...options,
    };
  }

  /**
   * 启动会话
   *
   * 返回的 Promise 在会话结束（/exit、/quit 或 Ctrl+C）时 resolve。
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.formatPrompt(),
    });

    // 打印欢迎消息
    const welcome = this.options.welcome ?? 'Aether OS 交互式会话';
    console.log(title(welcome));
    console.log(dim('输入 /help 查看可用命令，/exit 或 Ctrl+C 退出'));
    console.log('');

    this.rl.prompt();

    return new Promise<void>((resolve) => {
      const finish = (): void => {
        this.running = false;
        resolve();
      };

      this.rl!.on('line', async (line: string) => {
        const input = line.trim();
        if (!input) {
          this.promptAgain();
          return;
        }

        const handled = this.handleCommand(input);
        if (handled) {
          return;
        }

        try {
          const response = await this.options.onMessage(input);
          if (response) {
            console.log(success(response));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(colorize(`错误: ${message}`, 'red'));
        }
        this.promptAgain();
      });

      this.rl!.on('close', () => {
        if (this.running) {
          console.log(dim('再见!'));
        }
        this.rl = null;
        finish();
      });
    });
  }

  /**
   * 处理内置命令
   *
   * @returns 是否已处理
   */
  private handleCommand(input: string): boolean {
    if (input === '/exit' || input === '/quit') {
      this.handleExit();
      return true;
    }
    if (input === '/help') {
      this.printHelp();
      this.promptAgain();
      return true;
    }
    if (input === '/clear') {
      console.clear();
      this.promptAgain();
      return true;
    }
    return false;
  }

  /**
   * 打印帮助信息
   */
  private printHelp(): void {
    console.log(info('可用命令:'));
    console.log(dim('  /help    显示帮助信息'));
    console.log(dim('  /clear   清屏'));
    console.log(dim('  /exit    退出会话'));
    console.log(dim('  /quit    退出会话'));
    console.log(dim('  Ctrl+C   退出会话'));
  }

  /**
   * 处理退出
   */
  private handleExit(): void {
    if (!this.running) {
      return;
    }
    if (this.rl) {
      this.rl.close();
    }
  }

  /**
   * 格式化提示符（带颜色）
   */
  private formatPrompt(): string {
    const prompt = this.options.prompt ?? '> ';
    return colorize(prompt, 'cyan');
  }

  /**
   * 重新显示提示符
   */
  private promptAgain(): void {
    if (this.rl) {
      this.rl.prompt();
    }
  }

  /**
   * 停止会话
   */
  stop(): void {
    this.handleExit();
  }
}
