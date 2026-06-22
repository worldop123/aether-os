/**
 * 向量工具函数
 *
 * 提供向量相似度计算、归一化、点积等基础数学运算，
 * 以及无 embedding 模型时的降级方案（基于哈希的词袋向量）。
 */

/**
 * 计算两个向量的点积
 * A·B = Σ(A[i] * B[i])
 *
 * @param a 向量 A
 * @param b 向量 B
 * @returns 点积结果；维度不一致或为空时返回 0
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * 计算向量的 L2 范数
 * |v| = √(Σ v[i]²)
 *
 * @param vec 输入向量
 * @returns L2 范数；空向量返回 0
 */
export function vectorNorm(vec: number[]): number {
  if (vec.length === 0) return 0;

  let sumOfSquares = 0;
  for (let i = 0; i < vec.length; i++) {
    sumOfSquares += vec[i] * vec[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * 计算两个向量的余弦相似度
 * cos(A, B) = (A·B) / (|A| * |B|)
 *
 * 取值范围 [-1, 1]：
 * - 1 表示方向完全相同
 * - 0 表示正交（无关）
 * - -1 表示方向完全相反
 *
 * @param a 向量 A
 * @param b 向量 B
 * @returns 余弦相似度；维度不一致或任一为零向量时返回 0
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  const normA = vectorNorm(a);
  const normB = vectorNorm(b);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct(a, b) / (normA * normB);
}

/**
 * 归一化向量（使其 L2 范数为 1）
 *
 * @param vec 输入向量
 * @returns 归一化后的向量；零向量或空向量原样返回
 */
export function normalizeVector(vec: number[]): number[] {
  if (vec.length === 0) return [];

  const norm = vectorNorm(vec);
  if (norm === 0) return [...vec];

  return vec.map((v) => v / norm);
}

/**
 * 生成简单的哈希向量（用于无 embedding 模型时的降级方案）
 *
 * 基于文本的词袋模型 + 哈希，生成固定维度的稀疏向量：
 * 1. 将文本拆分为词（按非字母数字字符分割，转小写）
 * 2. 对每个词计算哈希值，映射到 [0, dimensions) 区间
 * 3. 对应维度累加权重（词频）
 * 4. 最终归一化为 L2 范数为 1 的向量
 *
 * 同一文本始终生成相同向量；相似文本因共享词而具有较高余弦相似度。
 *
 * @param text 输入文本
 * @param dimensions 输出向量维度，默认 256
 * @returns 归一化的稀疏向量
 */
export function hashEmbedding(text: string, dimensions: number = 256): number[] {
  const vector = new Array<number>(dimensions).fill(0);

  if (!text || text.trim().length === 0) {
    return vector;
  }

  // 拆分为词：兼容中英文
  // 英文按非字母数字分割；中文按单字符分割
  const tokens = tokenize(text);

  for (const token of tokens) {
    if (!token) continue;
    const hash = hashString(token);
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

/**
 * 文本分词
 * 英文按非字母数字字符分割；中文按单字符分割
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 匹配连续的 ASCII 字母数字串，或单个非 ASCII 字符（如中文）
  const regex = /[A-Za-z0-9]+|[\u4e00-\u9fa5]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }
  return tokens;
}

/**
 * 字符串哈希函数（djb2 变体）
 * 确定性：同一字符串始终返回同一哈希值
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
