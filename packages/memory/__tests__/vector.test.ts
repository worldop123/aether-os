import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  vectorNorm,
  dotProduct,
  normalizeVector,
  hashEmbedding,
} from '../src/vector';

describe('向量工具函数测试', () => {
  describe('dotProduct 点积', () => {
    it('应该正确计算点积', () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32); // 1*4 + 2*5 + 3*6 = 32
    });

    it('应该正确处理单位向量', () => {
      expect(dotProduct([1, 0], [1, 0])).toBe(1);
      expect(dotProduct([1, 0], [0, 1])).toBe(0);
    });

    it('应该正确处理负数', () => {
      expect(dotProduct([-1, 2, 3], [4, -5, 6])).toBe(4); // -4 + -10 + 18 = 4
    });

    it('维度不一致时应该返回 0', () => {
      expect(dotProduct([1, 2, 3], [1, 2])).toBe(0);
    });

    it('空向量应该返回 0', () => {
      expect(dotProduct([], [])).toBe(0);
    });
  });

  describe('vectorNorm L2 范数', () => {
    it('应该正确计算 L2 范数', () => {
      expect(vectorNorm([3, 4])).toBeCloseTo(5, 10); // √(9+16) = 5
    });

    it('单位向量的范数应该为 1', () => {
      expect(vectorNorm([1, 0, 0])).toBeCloseTo(1, 10);
      expect(vectorNorm([0, 1, 0])).toBeCloseTo(1, 10);
    });

    it('零向量的范数应该为 0', () => {
      expect(vectorNorm([0, 0, 0])).toBe(0);
    });

    it('空向量的范数应该为 0', () => {
      expect(vectorNorm([])).toBe(0);
    });

    it('应该正确处理负数', () => {
      expect(vectorNorm([-3, -4])).toBeCloseTo(5, 10);
    });
  });

  describe('cosineSimilarity 余弦相似度', () => {
    it('相同向量的相似度应该为 1', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    });

    it('正交向量的相似度应该为 0', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 10);
    });

    it('反向向量的相似度应该为 -1', () => {
      expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 10);
    });

    it('应该返回 [-1, 1] 范围内的值', () => {
      const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('缩放后的向量相似度应该不变（余弦相似度对幅度不变）', () => {
      const sim1 = cosineSimilarity([1, 2, 3], [2, 4, 6]);
      expect(sim1).toBeCloseTo(1, 10); // 同向，相似度为 1
    });

    it('部分相似向量的相似度应该在 (0, 1) 之间', () => {
      const sim = cosineSimilarity([1, 1], [1, 0]);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
      expect(sim).toBeCloseTo(Math.SQRT1_2, 10); // cos(45°) = √2/2
    });

    it('维度不一致时应该返回 0', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    });

    it('零向量的相似度应该为 0', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    });

    it('空向量的相似度应该为 0', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });
  });

  describe('normalizeVector 归一化', () => {
    it('归一化后范数应该为 1', () => {
      const normalized = normalizeVector([3, 4]);
      expect(vectorNorm(normalized)).toBeCloseTo(1, 10);
    });

    it('应该保持方向不变', () => {
      const original = [1, 2, 3];
      const normalized = normalizeVector(original);
      // 归一化前后向量方向相同，余弦相似度为 1
      expect(cosineSimilarity(original, normalized)).toBeCloseTo(1, 10);
    });

    it('应该正确缩放向量', () => {
      const normalized = normalizeVector([3, 4]);
      // [3,4] 归一化为 [0.6, 0.8]
      expect(normalized[0]).toBeCloseTo(0.6, 10);
      expect(normalized[1]).toBeCloseTo(0.8, 10);
    });

    it('零向量应该原样返回（不抛错）', () => {
      const normalized = normalizeVector([0, 0, 0]);
      expect(normalized).toEqual([0, 0, 0]);
    });

    it('空向量应该返回空数组', () => {
      const normalized = normalizeVector([]);
      expect(normalized).toEqual([]);
    });

    it('不应该修改原向量', () => {
      const original = [3, 4];
      const originalCopy = [...original];
      normalizeVector(original);
      expect(original).toEqual(originalCopy);
    });
  });

  describe('hashEmbedding 哈希向量', () => {
    it('相同文本应该生成相同向量', () => {
      const v1 = hashEmbedding('hello world');
      const v2 = hashEmbedding('hello world');
      expect(v1).toEqual(v2);
    });

    it('不同文本应该生成不同向量', () => {
      const v1 = hashEmbedding('hello world');
      const v2 = hashEmbedding('goodbye universe');
      expect(v1).not.toEqual(v2);
    });

    it('应该返回指定维度的向量', () => {
      const v1 = hashEmbedding('test', 128);
      expect(v1.length).toBe(128);

      const v2 = hashEmbedding('test', 256);
      expect(v2.length).toBe(256);

      const v3 = hashEmbedding('test', 64);
      expect(v3.length).toBe(64);
    });

    it('默认维度应该为 256', () => {
      const v = hashEmbedding('test');
      expect(v.length).toBe(256);
    });

    it('生成的向量应该是归一化的（L2 范数为 1）', () => {
      const v = hashEmbedding('hello world this is a test');
      expect(vectorNorm(v)).toBeCloseTo(1, 10);
    });

    it('相似文本应该有较高的余弦相似度', () => {
      const v1 = hashEmbedding('the cat sat on the mat');
      const v2 = hashEmbedding('the cat sat on the mat too');
      const v3 = hashEmbedding('completely different words here xyz');

      const simSame = cosineSimilarity(v1, v2);
      const simDiff = cosineSimilarity(v1, v3);

      // 相似文本的相似度应该高于完全不同的文本
      expect(simSame).toBeGreaterThan(simDiff);
    });

    it('相同文本的余弦相似度应该为 1', () => {
      const v1 = hashEmbedding('hello world');
      const v2 = hashEmbedding('hello world');
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 10);
    });

    it('空文本应该返回零向量', () => {
      const v = hashEmbedding('');
      expect(v.length).toBe(256);
      expect(vectorNorm(v)).toBe(0);
    });

    it('纯空格文本应该返回零向量', () => {
      const v = hashEmbedding('   ');
      expect(v.length).toBe(256);
      expect(vectorNorm(v)).toBe(0);
    });

    it('应该支持中文文本', () => {
      const v1 = hashEmbedding('我喜欢吃苹果');
      const v2 = hashEmbedding('我喜欢吃苹果');
      const v3 = hashEmbedding('今天天气不错');

      expect(v1).toEqual(v2);
      expect(v1).not.toEqual(v3);
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 10);
    });

    it('应该不区分大小写（英文）', () => {
      const v1 = hashEmbedding('Hello World');
      const v2 = hashEmbedding('hello world');
      expect(v1).toEqual(v2);
    });
  });
});
