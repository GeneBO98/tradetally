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
    console.log('[AI] AI Service - Provider:', settings.provider);
    console.log('[AI] AI Service - Has API Key:', !!settings.apiKey);
    console.log('[AI] AI Service - API URL:', settings.apiUrl || 'Not set');
    console.log('[AI] AI Service - Model:', settings.model || 'Default');
    
    // Validate configuration before attempting to call provider
    if (!this.isProviderConfigured(settings)) {
      throw new Error(`AI provider ${settings.provider} is not properly configured. Missing required configuration.`);
    }
    
    const provider = this.providers[settings.provider];
    
    if (!provider) {
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }

    const result = await provider(prompt, settings, options);
    console.log('[AI] AI Service - Response type:', typeof result);
    console.log('[AI] AI Service - Response preview:', result ? (result.substring ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100)) : 'undefined/null');
    
    if (!result) {
      throw new Error(`AI provider ${settings.provider} returned no response`);
    }
    
    return result;
  }

  /**
   * Check if a provider is properly configured
   */
  isProviderConfigured(settings) {
    switch (settings.provider) {
      case 'gemini':
        return !!settings.apiKey && settings.apiKey.trim() !== '';
      case 'claude':
        return !!settings.apiKey && settings.apiKey.trim() !== '';
      case 'openai':
        return !!settings.apiKey && settings.apiKey.trim() !== '';
      case 'ollama':
        // Ollama requires URL, API key is optional
        return !!settings.apiUrl && settings.apiUrl.trim() !== '';
      case 'local':
        // Local requires URL, API key is optional
        return !!settings.apiUrl && settings.apiUrl.trim() !== '';
      default:
        return false;
    }
  }

  async lookupCusip(userId, cusip) {
    const settings = await this.getUserSettings(userId);
    
    // Check if provider is configured before attempting lookup
    if (!this.isProviderConfigured(settings)) {
      console.log(`[AI] AI CUSIP lookup skipped for ${cusip}: ${settings.provider} provider not properly configured`);
      return null;
    }
    
    const provider = this.providers[settings.provider];
    
    if (!provider) {
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }

    const prompt = `You are a financial data assistant. I need the exact stock ticker symbol for this specific CUSIP number.

CUSIP: ${cusip}

CRITICAL REQUIREMENTS:
- Each CUSIP is a unique 9-character identifier for exactly ONE security
- You must provide the EXACT ticker symbol that corresponds to this specific CUSIP
- DO NOT guess or provide approximate matches
- DO NOT provide popular stock symbols unless you are absolutely certain they match this exact CUSIP
- If you are not 100% certain of the exact match, respond with "NOT_FOUND"

Only provide the exact ticker symbol if you have definitive knowledge of this CUSIP-to-ticker mapping.

Response format: ONLY the ticker symbol or "NOT_FOUND" - no additional text.`;
    
    try {
      const response = await provider(prompt, settings, { maxTokens: 20 });
      const cleanResponse = response.trim().toUpperCase();
      
      // Return null for NOT_FOUND responses or empty responses
      if (!cleanResponse || cleanResponse === 'NOT_FOUND' || cleanResponse.length === 0) {
        console.log(`[AI] AI returned NOT_FOUND for CUSIP ${cusip}`);
        return null;
      }
      
      // Validate ticker format (1-10 characters, letters, numbers, dash, dot)
      if (!/^[A-Z0-9\-\.]{1,10}$/.test(cleanResponse)) {
        console.warn(`AI returned invalid ticker format for CUSIP ${cusip}: ${cleanResponse}`);
        return null;
      }
      
      // Additional validation: warn if AI returns common "guess" symbols
      const commonGuesses = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'BAC', 'WMT'];
      if (commonGuesses.includes(cleanResponse)) {
        console.warn(`[WARNING] AI returned common stock symbol ${cleanResponse} for CUSIP ${cusip} - verify accuracy`);
      }
      
      return cleanResponse;
    } catch (error) {
      console.error(`AI CUSIP lookup failed for ${cusip}:`, error.message);
      return null;
    }
  }

  async useGemini(prompt, settings, options = {}) {
    try {
      console.log('[GEMINI] Using Gemini provider with API key:', settings.apiKey ? 'PROVIDED' : 'MISSING');
      // Use existing gemini utility with API key from settings
      const response = await gemini.generateResponse(prompt, settings.apiKey, options);
      console.log('[GEMINI] Gemini response received:', response ? 'SUCCESS' : 'EMPTY');
      return response;
    } catch (error) {
      console.error('[GEMINI] Gemini provider error:', error.message);
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
    console.log(`[OPENAI] OpenAI: Using model ${model}`);

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

      console.log('[OPENAI] OpenAI raw response:', JSON.stringify(response, null, 2).substring(0, 500));
      
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
      console.log('[OPENAI] OpenAI extracted content:', content ? `${content.substring(0, 100)}...` : 'undefined/null');
      
      return content;
    } catch (error) {
      console.error('[ERROR] OpenAI API error:', error.message);
      console.error('[ERROR] OpenAI error details:', error.response?.data || error);
      throw error;
    }
  }

  async useOllama(prompt, settings, options = {}) {
    const { default: fetch } = await import('node-fetch');
    
    if (!settings.apiUrl) {
      throw new Error('Ollama API URL not configured');
    }

    // Log the settings for debugging
    console.log('[OLLAMA] Ollama settings:', {
      apiUrl: settings.apiUrl,
      hasApiKey: !!settings.apiKey,
      model: settings.model || 'llama3.1'
    });

    const model = settings.model || 'llama3.1';
    const url = `${settings.apiUrl}/api/generate`;

    const headers = {
      'Content-Type': 'application/json'
    };

    // Only add Authorization header if API key is provided and not empty
    if (settings.apiKey && settings.apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
      const errorText = await response.text();
      console.error('[OLLAMA] Ollama API error response:', errorText);
      throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
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