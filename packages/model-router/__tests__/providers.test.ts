import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';
import { AnthropicProvider } from '../src/providers/anthropic';
import { OllamaProvider } from '../src/providers/ollama';
import { ModelRouterError } from '@aether/shared';

describe('OpenAIProvider 测试', () => {
  let originalOpenAIKey: string | undefined;

  beforeEach(() => {
    originalOpenAIKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAIKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('构造和模型列表', () => {
    it('应该正确创建 OpenAI 提供商', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.id).toBe('openai');
      expect(provider.name).toBe('OpenAI');
    });

    it('应该有模型列表', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该包含 chat 模型', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.getModelInfo('gpt-4')).toBeDefined();
      expect(provider.getModelInfo('gpt-4-turbo')).toBeDefined();
      expect(provider.getModelInfo('gpt-3.5-turbo')).toBeDefined();
      expect(provider.getModelInfo('gpt-4o')).toBeDefined();
    });

    it('应该包含 embedding 模型', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.getModelInfo('text-embedding-3-small')).toBeDefined();
      expect(provider.getModelInfo('text-embedding-3-large')).toBeDefined();
      expect(provider.getModelInfo('text-embedding-ada-002')).toBeDefined();
    });

    it('所有模型 provider 字段应为 openai', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const models = provider.listModels();
      for (const model of models) {
        expect(model.provider).toBe('openai');
      }
    });
  });

  describe('isAvailable', () => {
    it('无 API key 时应该返回 false', () => {
      const provider = new OpenAIProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('有 API key 时应该返回 true', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.isAvailable()).toBe(true);
    });

    it('应该从环境变量读取 API key', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      const provider = new OpenAIProvider();
      expect(provider.isAvailable()).toBe(true);
    });

    it('构造函数参数应优先于环境变量', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      const provider = new OpenAIProvider({ apiKey: 'param-key' });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('应该返回正确的模型信息', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const model = provider.getModelInfo('gpt-4');
      expect(model).toBeDefined();
      expect(model?.id).toBe('gpt-4');
      expect(model?.provider).toBe('openai');
      expect(model?.supportsTools).toBe(true);
      expect(model?.supportsEmbedding).toBe(false);
      expect(model?.contextWindow).toBeGreaterThan(0);
    });

    it('embedding 模型应标记 supportsEmbedding 为 true', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const model = provider.getModelInfo('text-embedding-3-small');
      expect(model).toBeDefined();
      expect(model?.supportsEmbedding).toBe(true);
      expect(model?.supportsTools).toBe(false);
    });

    it('获取不存在的模型应该返回 undefined', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.getModelInfo('non-existent')).toBeUndefined();
    });
  });

  describe('chat', () => {
    it('无 API key 时应该抛 ModelRouterError', async () => {
      const provider = new OpenAIProvider();
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toBeInstanceOf(ModelRouterError);
    });

    it('无 API key 时应该抛 PROVIDER_NOT_AVAILABLE 错误', async () => {
      const provider = new OpenAIProvider();
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toHaveProperty('code', 'PROVIDER_NOT_AVAILABLE');
    });

    it('使用不存在的模型应该抛 MODEL_NOT_FOUND 错误', async () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });

  describe('embed', () => {
    it('无 API key 时应该抛 ModelRouterError', async () => {
      const provider = new OpenAIProvider();
      await expect(
        provider.embed({
          input: 'Hello',
        })
      ).rejects.toBeInstanceOf(ModelRouterError);
    });

    it('使用不存在的模型应该抛 MODEL_NOT_FOUND 错误', async () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      await expect(
        provider.embed({
          input: 'Hello',
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });

  describe('baseURL 自定义', () => {
    it('应该支持自定义 baseURL', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        baseURL: 'https://custom.proxy.com/v1/',
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });
});

describe('AnthropicProvider 测试', () => {
  let originalAnthropicKey: string | undefined;

  beforeEach(() => {
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  describe('构造和模型列表', () => {
    it('应该正确创建 Anthropic 提供商', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.id).toBe('anthropic');
      expect(provider.name).toBe('Anthropic');
    });

    it('应该有模型列表', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该包含所有 Claude 模型', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.getModelInfo('claude-3-opus')).toBeDefined();
      expect(provider.getModelInfo('claude-3-sonnet')).toBeDefined();
      expect(provider.getModelInfo('claude-3-haiku')).toBeDefined();
      expect(provider.getModelInfo('claude-3-5-sonnet')).toBeDefined();
    });

    it('所有模型 provider 字段应为 anthropic', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const models = provider.listModels();
      for (const model of models) {
        expect(model.provider).toBe('anthropic');
      }
    });
  });

  describe('isAvailable', () => {
    it('无 API key 时应该返回 false', () => {
      const provider = new AnthropicProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('有 API key 时应该返回 true', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.isAvailable()).toBe(true);
    });

    it('应该从环境变量读取 API key', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      const provider = new AnthropicProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('应该返回正确的模型信息', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const model = provider.getModelInfo('claude-3-opus');
      expect(model).toBeDefined();
      expect(model?.id).toBe('claude-3-opus');
      expect(model?.provider).toBe('anthropic');
      expect(model?.supportsTools).toBe(true);
      expect(model?.supportsEmbedding).toBe(false);
      expect(model?.contextWindow).toBe(200000);
    });

    it('获取不存在的模型应该返回 undefined', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.getModelInfo('non-existent')).toBeUndefined();
    });
  });

  describe('chat', () => {
    it('无 API key 时应该抛 ModelRouterError', async () => {
      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toBeInstanceOf(ModelRouterError);
    });

    it('无 API key 时应该抛 PROVIDER_NOT_AVAILABLE 错误', async () => {
      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toHaveProperty('code', 'PROVIDER_NOT_AVAILABLE');
    });

    it('使用不存在的模型应该抛 MODEL_NOT_FOUND 错误', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });

  describe('embed', () => {
    it('应该抛 ModelRouterError（不支持 embedding）', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      await expect(
        provider.embed({
          input: 'Hello',
        })
      ).rejects.toBeInstanceOf(ModelRouterError);
    });

    it('应该抛 EMBEDDING_NOT_SUPPORTED 错误', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      await expect(
        provider.embed({
          input: 'Hello',
        })
      ).rejects.toHaveProperty('code', 'EMBEDDING_NOT_SUPPORTED');
    });
  });
});

describe('OllamaProvider 测试', () => {
  describe('构造和模型列表', () => {
    it('应该正确创建 Ollama 提供商', () => {
      const provider = new OllamaProvider();
      expect(provider.id).toBe('ollama');
      expect(provider.name).toBe('Ollama');
    });

    it('应该有模型列表', () => {
      const provider = new OllamaProvider();
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该包含本地模型', () => {
      const provider = new OllamaProvider();
      expect(provider.getModelInfo('llama2')).toBeDefined();
      expect(provider.getModelInfo('llama3')).toBeDefined();
      expect(provider.getModelInfo('mistral')).toBeDefined();
    });

    it('所有模型 provider 字段应为 ollama', () => {
      const provider = new OllamaProvider();
      const models = provider.listModels();
      for (const model of models) {
        expect(model.provider).toBe('ollama');
      }
    });

    it('本地模型价格应为 0', () => {
      const provider = new OllamaProvider();
      const models = provider.listModels();
      for (const model of models) {
        expect(model.inputPricePer1k).toBe(0);
        expect(model.outputPricePer1k).toBe(0);
      }
    });
  });

  describe('isAvailable', () => {
    it('应该始终返回 true', () => {
      const provider = new OllamaProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('应该返回正确的模型信息', () => {
      const provider = new OllamaProvider();
      const model = provider.getModelInfo('llama3');
      expect(model).toBeDefined();
      expect(model?.id).toBe('llama3');
      expect(model?.provider).toBe('ollama');
      expect(model?.supportsTools).toBe(true);
      expect(model?.supportsEmbedding).toBe(true);
      expect(model?.contextWindow).toBeGreaterThan(0);
    });

    it('获取不存在的模型应该返回 undefined', () => {
      const provider = new OllamaProvider();
      expect(provider.getModelInfo('non-existent')).toBeUndefined();
    });
  });

  describe('chat', () => {
    it('使用不存在的模型应该抛 MODEL_NOT_FOUND 错误', async () => {
      const provider = new OllamaProvider();
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });

  describe('embed', () => {
    it('使用不存在的模型应该抛 MODEL_NOT_FOUND 错误', async () => {
      const provider = new OllamaProvider();
      await expect(
        provider.embed({
          input: 'Hello',
          model: 'non-existent',
        })
      ).rejects.toHaveProperty('code', 'MODEL_NOT_FOUND');
    });
  });

  describe('baseURL 自定义', () => {
    it('应该支持自定义 baseURL', () => {
      const provider = new OllamaProvider({
        baseURL: 'http://custom-host:11434/',
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });
});
