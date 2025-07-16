const gemini = require('./gemini');
const User = require('../models/User');

class AIService {
  constructor() {
    this.providers = {
      gemini: this.useGemini.bind(this),
      claude: this.useClaude.bind(this),
      openai: this.useOpenAI.bind(this),
      ollama: this.useOllama.bind(this),
      local: this.useLocal.bind(this)
    };
  }

  async getUserSettings(userId) {
    try {
      const settings = await User.getSettings(userId);
      return {
        provider: settings?.ai_provider || 'gemini',
        apiKey: settings?.ai_api_key || '',
        apiUrl: settings?.ai_api_url || '',
        model: settings?.ai_model || ''
      };
    } catch (error) {
      console.error('Failed to get user AI settings:', error);
      // Fallback to default
      return {
        provider: 'gemini',
        apiKey: '',
        apiUrl: '',
        model: ''
      };
    }
  }

  async generateResponse(userId, prompt, options = {}) {
    const settings = await this.getUserSettings(userId);
    const provider = this.providers[settings.provider];
    
    if (!provider) {
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }

    return provider(prompt, settings, options);
  }

  async lookupCusip(userId, cusip) {
    const settings = await this.getUserSettings(userId);
    const provider = this.providers[settings.provider];
    
    if (!provider) {
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }

    const prompt = `Given the CUSIP "${cusip}", what is the corresponding stock ticker symbol? Please respond with ONLY the ticker symbol, no additional text.`;
    
    try {
      const response = await provider(prompt, settings, { maxTokens: 10 });
      return response.trim().toUpperCase();
    } catch (error) {
      console.error(`AI CUSIP lookup failed for ${cusip}:`, error);
      return null;
    }
  }

  async useGemini(prompt, settings, options = {}) {
    // Use existing gemini utility with API key from settings
    return gemini.generateResponse(prompt, settings.apiKey, options);
  }

  async useClaude(prompt, settings, options = {}) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    
    if (!settings.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
    });

    const response = await anthropic.messages.create({
      model: settings.model || 'claude-3-5-sonnet-20241022',
      max_completion_tokens: options.maxTokens || 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return response.content[0].text;
  }

  async useOpenAI(prompt, settings, options = {}) {
    const { default: OpenAI } = await import('openai');
    
    if (!settings.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({
      apiKey: settings.apiKey,
    });

    const response = await openai.chat.completions.create({
      model: settings.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: options.maxTokens || 1000,
    });

    return response.choices[0].message.content;
  }

  async useOllama(prompt, settings, options = {}) {
    const { default: fetch } = await import('node-fetch');
    
    if (!settings.apiUrl) {
      throw new Error('Ollama API URL not configured');
    }

    const model = settings.model || 'llama3.1';
    const url = `${settings.apiUrl}/api/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey && { 'Authorization': `Bearer ${settings.apiKey}` })
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          num_predict: options.maxTokens || 1000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async useLocal(prompt, settings, options = {}) {
    const { default: fetch } = await import('node-fetch');
    
    if (!settings.apiUrl) {
      throw new Error('Local API URL not configured');
    }

    const response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey && { 'Authorization': `Bearer ${settings.apiKey}` })
      },
      body: JSON.stringify({
        prompt,
        model: settings.model,
        max_tokens: options.maxTokens || 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Local API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Try to extract response from common response formats
    if (data.response) return data.response;
    if (data.text) return data.text;
    if (data.content) return data.content;
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    
    return JSON.stringify(data);
  }
}

module.exports = new AIService();