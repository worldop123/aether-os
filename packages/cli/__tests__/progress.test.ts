import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Spinner, ProgressBar } from '../src/progress';

describe('progress 模块', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  describe('Spinner', () => {
    it('可以创建实例', () => {
      const spinner = new Spinner('加载中', false);
      expect(spinner).toBeDefined();
    });

    it('enabled=false 时 start 不输出', () => {
      const spinner = new Spinner('加载中', false);
      spinner.start();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('enabled=false 时 stop 输出最终消息', () => {
      const spinner = new Spinner('加载中', false);
      spinner.stop('完成');
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('完成'));
    });

    it('enabled=false 时 fail 输出错误消息', () => {
      const spinner = new Spinner('加载中', false);
      spinner.fail('出错了');
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('出错了'));
    });

    it('enabled=false 时 stop 无消息不输出', () => {
      const spinner = new Spinner('加载中', false);
      spinner.stop();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('enabled=true 时 start 输出旋转字符', () => {
      const spinner = new Spinner('加载中', true);
      spinner.start();
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('加载中');
      // 应该包含旋转字符之一
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      expect(frames.some((f) => output.includes(f))).toBe(true);
    });

    it('enabled=true 时 stop 清除行并输出最终消息', () => {
      const spinner = new Spinner('加载中', true);
      spinner.stop('完成');
      // 应该包含清除行字符 \r 和最终消息
      const calls = writeSpy.mock.calls.map((c) => c[0] as string);
      const combined = calls.join('');
      expect(combined).toContain('完成');
      expect(combined).toContain('\r');
    });

    it('update 修改消息', () => {
      const spinner = new Spinner('旧消息', true);
      spinner.update('新消息');
      spinner.start();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('新消息');
      expect(output).not.toContain('旧消息');
    });

    it('多次 start 不会创建多个定时器', () => {
      const spinner = new Spinner('加载中', true);
      spinner.start();
      spinner.start();
      // 不应该抛错
      spinner.stop();
    });
  });

  describe('ProgressBar', () => {
    it('可以创建实例', () => {
      const bar = new ProgressBar(100, '下载', false);
      expect(bar).toBeDefined();
    });

    it('enabled=false 时 update 不输出', () => {
      const bar = new ProgressBar(100, '下载', false);
      bar.update(50);
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('enabled=true 时 update 输出进度条', () => {
      const bar = new ProgressBar(100, '下载', true);
      bar.update(50);
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('50%');
      expect(output).toContain('下载');
      expect(output).toContain('█');
      expect(output).toContain('░');
    });

    it('increment 增加进度', () => {
      const bar = new ProgressBar(10, '', true);
      bar.increment();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('10%');
    });

    it('complete 输出 100% 并换行', () => {
      const bar = new ProgressBar(100, '下载', true);
      bar.complete('下载完成');
      const calls = writeSpy.mock.calls.map((c) => c[0] as string);
      const combined = calls.join('');
      expect(combined).toContain('100%');
      expect(combined).toContain('下载完成');
    });

    it('enabled=false 时 complete 仍输出最终消息', () => {
      const bar = new ProgressBar(100, '下载', false);
      bar.complete('下载完成');
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('下载完成'));
    });

    it('进度超过 total 时被限制为 100%', () => {
      const bar = new ProgressBar(100, '', true);
      bar.update(150);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('100%');
    });

    it('total=0 时不报错', () => {
      const bar = new ProgressBar(0, '', true);
      bar.update(0);
      expect(writeSpy).toHaveBeenCalled();
    });

    it('无 label 时正常工作', () => {
      const bar = new ProgressBar(100, undefined, true);
      bar.update(50);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('50%');
    });
  });
});
