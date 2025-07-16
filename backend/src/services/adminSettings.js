const db = require('../config/database');

class AdminSettingsService {
  
  /**
   * Get admin setting by key
   * @param {string} key - The setting key
   * @returns {Promise<string|null>} The setting value or null if not found
   */
  async getSetting(key) {
    try {
      const result = await db.query(
        'SELECT setting_value FROM admin_settings WHERE setting_key = $1',
        [key]
      );
      
      return result.rows.length > 0 ? result.rows[0].setting_value : null;
    } catch (error) {
      console.error(`Error getting admin setting ${key}:`, error);
      return null;
    }
  }

  /**
   * Get all admin settings
   * @returns {Promise<Object>} Object with all settings
   */
  async getAllSettings() {
    try {
      const result = await db.query('SELECT setting_key, setting_value FROM admin_settings');
      
      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
      
      return settings;
    } catch (error) {
      console.error('Error getting all admin settings:', error);
      return {};
    }
  }

  /**
   * Update admin setting
   * @param {string} key - The setting key
   * @param {string} value - The setting value
   * @returns {Promise<boolean>} Success status
   */
  async updateSetting(key, value) {
    try {
      await db.query(
        `INSERT INTO admin_settings (setting_key, setting_value) 
         VALUES ($1, $2) 
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
      
      return true;
    } catch (error) {
      console.error(`Error updating admin setting ${key}:`, error);
      return false;
    }
  }

  /**
   * Update multiple admin settings
   * @param {Object} settings - Object with key-value pairs
   * @returns {Promise<boolean>} Success status
   */
  async updateSettings(settings) {
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          `INSERT INTO admin_settings (setting_key, setting_value) 
           VALUES ($1, $2) 
           ON CONFLICT (setting_key) 
           DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
          [key, value]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating admin settings:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get default AI provider settings for new users
   * @returns {Promise<Object>} Default AI settings
   */
  async getDefaultAISettings() {
    try {
      const settings = await this.getAllSettings();
      
      return {
        provider: settings.default_ai_provider || 'gemini',
        apiKey: settings.default_ai_api_key || '',
        apiUrl: settings.default_ai_api_url || '',
        model: settings.default_ai_model || ''
      };
    } catch (error) {
      console.error('Error getting default AI settings:', error);
      return {
        provider: 'gemini',
        apiKey: '',
        apiUrl: '',
        model: ''
      };
    }
  }

  /**
   * Update default AI provider settings
   * @param {Object} aiSettings - AI provider settings
   * @returns {Promise<boolean>} Success status
   */
  async updateDefaultAISettings(aiSettings) {
    const settings = {};
    
    if (aiSettings.provider !== undefined) {
      settings.default_ai_provider = aiSettings.provider;
    }
    if (aiSettings.apiKey !== undefined) {
      settings.default_ai_api_key = aiSettings.apiKey;
    }
    if (aiSettings.apiUrl !== undefined) {
      settings.default_ai_api_url = aiSettings.apiUrl;
    }
    if (aiSettings.model !== undefined) {
      settings.default_ai_model = aiSettings.model;
    }
    
    return await this.updateSettings(settings);
  }
}

module.exports = new AdminSettingsService();