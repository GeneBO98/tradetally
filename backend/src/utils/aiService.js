const gemini = require('./gemini');
const User = require('../models/User');
const adminSettingsService = require('../services/adminSettings');

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
      const db = require('../config/database');
      
      // Query user_settings table directly
      const userSettingsQuery = `
        SELECT ai_provider, ai_api_key, ai_api_url, ai_model
        FROM user_settings 
        WHERE user_id = $1
      `;
      const userSettingsResult = await db.query(userSettingsQuery, [userId]);
      
      let userSettings = null;
      if (userSettingsResult.rows.length > 0) {
        userSettings = userSettingsResult.rows[0];
      }
      
      // Get admin default settings as fallback
      const adminDefaults = await adminSettingsService.getDefaultAISettings();
      
      return {
        provider: userSettings?.ai_provider || adminDefaults.provider,
        apiKey: userSettings?.ai_api_key || adminDefaults.apiKey,
        apiUrl: userSettings?.ai_api_url || adminDefaults.apiUrl,
        model: userSettings?.ai_model || adminDefaults.model
      };
    } catch (error) {
      console.error('Failed to get user AI settings:', error);
      // Fallback to admin defaults, then hardcoded defaults
      try {
        const adminDefaults = await adminSettingsService.getDefaultAISettings();
        return adminDefaults;
      } catch (adminError) {
        console.error('Failed to get admin default AI settings:', adminError);
        return {
          provider: 'gemini',
          apiKey: '',
          apiUrl: '',
          model: ''
        };
      }
    }
  }

  async generateResponse(userId, prompt, options = {}) {
    const settings = await this.getUserSettings(userId);
    console.log('🤖 AI Service - Provider:', settings.provider);
    console.log('🤖 AI Service - Has API Key:', !!settings.apiKey);
    console.log('🤖 AI Service - API URL:', settings.apiUrl || 'Not set');
    console.log('🤖 AI Service - Model:', settings.model || 'Default');
    
    const provider = this.providers[settings.provider];
    
    if (!provider) {
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }

    const result = await provider(prompt, settings, options);
    console.log('🤖 AI Service - Response type:', typeof result);
    console.log('🤖 AI Service - Response preview:', result ? (result.substring ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100)) : 'undefined/null');
    
    if (!result) {
      throw new Error(`AI provider ${settings.provider} returned no response`);
    }
    
    return result;
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
    try {
      console.log('🔷 Using Gemini provider with API key:', settings.apiKey ? 'PROVIDED' : 'MISSING');
      // Use existing gemini utility with API key from settings
      const response = await gemini.generateResponse(prompt, settings.apiKey, options);
      console.log('🔷 Gemini response received:', response ? 'SUCCESS' : 'EMPTY');
      return response;
    } catch (error) {
      console.error('🔷 Gemini provider error:', error.message);
      throw error;
    }
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

    const model = settings.model || 'gpt-4o';
    console.log(`🤖 OpenAI: Using model ${model}`);

    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: options.maxTokens || 1000,
      });

      console.log('🤖 OpenAI raw response:', JSON.stringify(response, null, 2).substring(0, 500));
      
      if (!response) {
        throw new Error('No response received from OpenAI API');
      }
      
      if (!response.choices || response.choices.length === 0) {
        throw new Error('No choices in OpenAI response');
      }
      
      if (!response.choices[0].message) {
        throw new Error('No message in OpenAI response choice');
      }
      
      const content = response.choices[0].message.content;
      console.log('🤖 OpenAI extracted content:', content ? `${content.substring(0, 100)}...` : 'undefined/null');
      
      return content;
    } catch (error) {
      console.error('❌ OpenAI API error:', error.message);
      console.error('❌ OpenAI error details:', error.response?.data || error);
      throw error;
    }
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
    
    // Ollama returns the response in the 'response' field
    if (!data.response) {
      console.error('Ollama response missing expected "response" field:', data);
      throw new Error('Invalid response format from Ollama API');
    }
    
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