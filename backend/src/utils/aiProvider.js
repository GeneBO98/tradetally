/**
 * Multi-provider AI utility
 * Supports Gemini, OpenAI, Claude, DeepSeek, Kimi, LM Studio, Ollama, and other OpenAI-compatible APIs
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetchAiProviderUrl } = require('./urlSecurity');
const { summarizeUrlForLogging } = require('./logSanitizer');

class AIProvider {
  /**
   * Generate a response from the configured AI provider
   * @param {string} prompt - The prompt to send
   * @param {Object} settings - Provider settings { provider, apiKey, apiUrl, modelName }
   * @param {Object} options - Generation options { maxTokens, temperature }
   * @returns {Promise<string>} Generated text response
   */
  static async generateResponse(prompt, settings, options = {}) {
    const { provider, apiKey, apiUrl, modelName } = settings;

    console.log(`[AI_PROVIDER] Using provider: ${provider}, model: ${modelName}`);

    switch (provider) {
      case 'gemini':
        return this.generateGemini(prompt, apiKey, modelName, options);

      case 'openai':
        return this.generateOpenAI(prompt, apiKey, modelName, 'https://api.openai.com/v1', options);

      case 'deepseek':
        if (!apiKey) {
          throw new Error('DeepSeek API key not configured');
        }
        return this.generateOpenAICompatible(prompt, apiKey, modelName || 'deepseek-chat', apiUrl || 'https://api.deepseek.com/v1', { ...options, provider: 'deepseek' });

      case 'kimi':
        if (!apiKey) {
          throw new Error('Kimi API key not configured');
        }
        return this.generateOpenAICompatible(prompt, apiKey, modelName || 'moonshot-v1-8k', apiUrl || 'https://api.moonshot.ai/v1', { ...options, provider: 'kimi' });

      case 'claude':
        return this.generateClaude(prompt, apiKey, modelName, options);

      case 'lmstudio':
      case 'ollama':
      case 'local':
      case 'custom':
        return this.generateOpenAICompatible(prompt, apiKey, modelName, apiUrl, { ...options, provider });

      case 'perplexity':
        return this.generateOpenAI(prompt, apiKey, modelName, 'https://api.perplexity.ai', options);

      default:
        // Default to OpenAI-compatible API
        return this.generateOpenAICompatible(prompt, apiKey, modelName, apiUrl, options);
    }
  }

  /**
   * Generate using Gemini API
   */
  static async generateGemini(prompt, apiKey, modelName = 'gemini-1.5-flash', options = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          ...(options.maxTokens && { maxOutputTokens: options.maxTokens }),
          ...(options.temperature !== undefined && { temperature: options.temperature })
        }
      });
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('[AI_PROVIDER] Gemini error:', error.message);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Generate using OpenAI API
   */
  static async generateOpenAI(prompt, apiKey, modelName = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', options = {}) {
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const provider = baseUrl.includes('perplexity') ? 'perplexity' : 'openai';
    return this.generateOpenAICompatible(prompt, apiKey, modelName, baseUrl, { ...options, provider });
  }

  /**
   * Generate using Claude/Anthropic API
   */
  static async generateClaude(prompt, apiKey, modelName = 'claude-3-haiku-20240307', options = {}) {
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: options.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('[AI_PROVIDER] Claude error:', error.message);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Generate using OpenAI-compatible API (LM Studio, Ollama, etc.)
   */
  static buildOpenAIChatCompletionsUrl(apiUrl, provider = '') {
    if (!apiUrl) {
      throw new Error('OpenAI-compatible API URL not configured');
    }

    const url = new URL(apiUrl);
    url.pathname = url.pathname.replace(/\/+$/, '');

    const normalizedProvider = String(provider).toLowerCase();
    if (normalizedProvider === 'ollama' || normalizedProvider === 'lmstudio') {
      const normalizedPath = url.pathname.toLowerCase();
      if (!normalizedPath || normalizedPath === '/' || (normalizedProvider === 'ollama' && normalizedPath === '/api/generate')) {
        url.pathname = '/v1';
      }
    }

    if (!url.pathname.toLowerCase().endsWith('/chat/completions')) {
      url.pathname = `${url.pathname}/chat/completions`;
    }
    return url.toString();
  }

  static async generateOpenAICompatible(prompt, apiKey, modelName, apiUrl, options = {}) {
    if (options.provider === 'custom' && !String(modelName || '').trim()) {
      throw new Error('Custom AI model not configured');
    }

    const url = this.buildOpenAIChatCompletionsUrl(apiUrl, options.provider);

    console.log(`[AI_PROVIDER] Calling OpenAI-compatible API at: ${summarizeUrlForLogging(url)}`);

    const headers = {
      'Content-Type': 'application/json'
    };

    // Only add Authorization header if API key is provided
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      // Determine token parameter based on API target
      // OpenAI API uses max_completion_tokens; local/other APIs may still use max_tokens
      const isOpenAIAPI = apiUrl && apiUrl.includes('api.openai.com');

      // Reasoning models (o-series, all gpt-5 variants, deepseek-reasoner) need
      // higher token limits because reasoning tokens count toward the limit but
      // don't produce visible output. These models also reject custom
      // `temperature` — only the default is supported. Keep this regex in sync
      // with aiService.js.
      const isReasoningModel = /^(o\d|gpt-5|deepseek-reasoner)/i.test(modelName);
      const tokenLimit = options.maxTokens || (isReasoningModel ? 16384 : 4096);

      const tokenParam = isOpenAIAPI
        ? { max_completion_tokens: tokenLimit }
        : { max_tokens: options.maxTokens || 4096 };

      // Reasoning models don't support custom temperature
      const supportsTemperature = !isReasoningModel;

      const body = {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'You are a professional trading performance analyst helping traders improve their performance.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        ...tokenParam,
        ...(supportsTemperature && { temperature: options.temperature ?? 0.7 })
      };

      const response = await fetchAiProviderUrl(options.provider || 'openai', url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const error = await response.json();
          errorMessage = error.error?.message || error.message || errorMessage;
        } catch (e) {
          // Response might not be JSON
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      console.log('[AI_PROVIDER] Response structure:', JSON.stringify(data, null, 2).substring(0, 1000));

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response generated');
      }

      // Try standard content field first, then check alternative response formats
      const choice = data.choices[0];
      const content = choice.message?.content
        || choice.text
        || choice.message?.refusal;

      // Some models return content in the top-level output field
      const finalContent = content || data.output_text || data.output;

      if (!finalContent) {
        console.error('[AI_PROVIDER] Empty content. Full response:', JSON.stringify(data).substring(0, 2000));
        throw new Error('AI returned empty response');
      }

      return finalContent;
    } catch (error) {
      console.error('[AI_PROVIDER] OpenAI-compatible API error:', error.message);

      // Provide helpful error for connection issues
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to AI provider at ${apiUrl}. Make sure LM Studio/Ollama is running.`);
      }

      throw new Error(`AI Provider error: ${error.message}`);
    }
  }

  /**
   * Check if provider is configured correctly
   */
  static isConfigured(settings) {
    const { provider, apiKey, apiUrl, modelName } = settings;

    // Local providers don't require API key
    const localProviders = ['lmstudio', 'ollama', 'local'];
    if (localProviders.includes(provider)) {
      return !!apiUrl;
    }

    if (provider === 'custom') {
      return !!apiUrl && !!String(modelName || '').trim();
    }

    return !!apiKey;
  }
}

module.exports = AIProvider;
