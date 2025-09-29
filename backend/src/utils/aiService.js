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
      lmstudio: this.useLMStudio.bind(this),
      perplexity: this.usePerplexity.bind(this),
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
      case 'lmstudio':
        // LM Studio requires URL (defaults to http://localhost:1234), API key is optional
        return !!settings.apiUrl && settings.apiUrl.trim() !== '';
      case 'perplexity':
        // Perplexity requires API key
        return !!settings.apiKey && settings.apiKey.trim() !== '';
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

    const prompt = `What is the stock ticker symbol for CUSIP ${cusip}?

RESPOND WITH ONLY THE TICKER SYMBOL. No explanations, no company names, no additional text.

Examples:
CUSIP 037833100 → AAPL
CUSIP 594918104 → MSFT
Unknown CUSIP → NOT_FOUND

Your response:`;
    
    try {
      const response = await provider(prompt, settings, { maxTokens: 50 });
      
      // Extract ticker from response - simple extraction for direct responses
      const ticker = this.extractSimpleTickerResponse(response.trim());
      
      if (!ticker) {
        console.log(`[AI] AI returned no valid ticker for CUSIP ${cusip}: "${response.trim()}"`);
        return null;
      }
      
      // Return null for NOT_FOUND responses
      if (ticker.toUpperCase() === 'NOT_FOUND') {
        console.log(`[AI] AI returned NOT_FOUND for CUSIP ${cusip}`);
        return null;
      }
      
      const tickerUpper = ticker.toUpperCase();
      
      // Validate ticker format (1-10 characters, letters, numbers, dash, dot)
      if (!/^[A-Z0-9\-\.]{1,10}$/.test(tickerUpper)) {
        console.warn(`AI returned invalid ticker format for CUSIP ${cusip}: ${tickerUpper} (from: "${response.trim()}")`);
        return null;
      }
      
      // Additional validation: warn if AI returns common "guess" symbols
      const commonGuesses = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'BAC', 'WMT'];
      if (commonGuesses.includes(tickerUpper)) {
        console.warn(`[WARNING] AI returned common stock symbol ${tickerUpper} for CUSIP ${cusip} - verify accuracy`);
      }
      
      return tickerUpper;
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
      // Build request parameters
      const requestParams = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: options.maxTokens || 1000,
      };
      
      // Only add temperature for models that support it
      // Some models like o1-preview, o1-mini, and custom/nano models don't support temperature
      const noTempModels = ['o1-preview', 'o1-mini', 'o1', 'gpt-5-nano', 'nano'];
      if (!noTempModels.some(m => model.toLowerCase().includes(m.toLowerCase()))) {
        requestParams.temperature = 0.1;
      }
      
      const response = await openai.chat.completions.create(requestParams);

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

  async useLMStudio(prompt, settings, options = {}) {
    const { default: fetch } = await import('node-fetch');
    
    // LM Studio defaults to localhost:1234
    const apiUrl = settings.apiUrl || 'http://localhost:1234';
    
    console.log('[LMSTUDIO] Using LM Studio at:', apiUrl);
    console.log('[LMSTUDIO] Model:', settings.model || 'auto-detect');

    try {
      // LM Studio uses OpenAI-compatible API at /v1/chat/completions
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey && { 'Authorization': `Bearer ${settings.apiKey}` })
        },
        body: JSON.stringify({
          model: settings.model || 'local-model', // LM Studio will use loaded model
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: options.maxTokens || 1000,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LMSTUDIO] LM Studio API error:', errorText);
        throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[LMSTUDIO] Unexpected response format:', data);
        throw new Error('Invalid response format from LM Studio');
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error('[LMSTUDIO] LM Studio request failed:', error.message);
      throw new Error(`LM Studio connection failed: ${error.message}. Make sure LM Studio is running with a loaded model.`);
    }
  }

  async usePerplexity(prompt, settings, options = {}) {
    const { default: fetch } = await import('node-fetch');
    
    if (!settings.apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    console.log('[PERPLEXITY] Using Perplexity AI for CUSIP resolution');
    console.log('[PERPLEXITY] Model:', settings.model || 'sonar');

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model || 'sonar',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: options.maxTokens || 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PERPLEXITY] API error:', errorText);
        throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[PERPLEXITY] Unexpected response format:', data);
        throw new Error('Invalid response format from Perplexity API');
      }
      
      const result = data.choices[0].message.content;
      console.log('[PERPLEXITY] Response received:', result ? 'SUCCESS' : 'EMPTY');
      return result;
    } catch (error) {
      console.error('[PERPLEXITY] Request failed:', error.message);
      throw new Error(`Perplexity API failed: ${error.message}`);
    }
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

  /**
   * Extract ticker symbol from simple AI response
   */
  extractSimpleTickerResponse(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    const text = response.trim().toUpperCase();
    
    // Pattern 1: Direct response (just the ticker symbol)
    if (/^[A-Z]{1,10}$/.test(text)) {
      console.log(`[AI] Direct ticker response: ${text}`);
      return text;
    }
    
    // Pattern 2: Look for standalone ticker symbols (2-10 uppercase letters)
    const standaloneMatch = text.match(/\b([A-Z]{2,10})\b/);
    if (standaloneMatch) {
      const ticker = standaloneMatch[1];
      // Avoid common words that aren't tickers
      const commonWords = ['THE', 'FOR', 'AND', 'WITH', 'NYSE', 'NASDAQ', 'STOCK', 'SYMBOL', 'TICKER', 'CUSIP', 'INC', 'CORP', 'LLC', 'LTD', 'NOT', 'FOUND'];
      if (!commonWords.includes(ticker)) {
        console.log(`[AI] Found standalone ticker: ${ticker}`);
        return ticker;
      }
    }
    
    // Pattern 3: Look for markdown bold text like **AKYA**
    const markdownMatch = text.match(/\*\*([A-Z]{1,10})\*\*/);
    if (markdownMatch) {
      console.log(`[AI] Found ticker in markdown: ${markdownMatch[1]}`);
      return markdownMatch[1];
    }
    
    console.log(`[AI] Could not extract ticker from: ${text}`);
    return null;
  }
}

module.exports = new AIService();