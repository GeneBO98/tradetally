const User = require('../models/User');
const db = require('../config/database');

const settingsController = {
  async getSettings(req, res, next) {
    try {
      const settings = await User.getSettings(req.user.id);
      
      if (!settings) {
        const newSettings = await User.createSettings(req.user.id);
        return res.json({ settings: newSettings });
      }

      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const settings = await User.updateSettings(req.user.id, req.body);
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async getTags(req, res, next) {
    try {
      const query = `
        SELECT * FROM tags
        WHERE user_id = $1
        ORDER BY name
      `;

      const result = await db.query(query, [req.user.id]);
      
      res.json({ tags: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async createTag(req, res, next) {
    try {
      const { name, color = '#3B82F6' } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Tag name is required' });
      }

      const query = `
        INSERT INTO tags (user_id, name, color)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, name) DO NOTHING
        RETURNING *
      `;

      const result = await db.query(query, [req.user.id, name.trim(), color]);
      
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Tag already exists' });
      }

      res.status(201).json({ tag: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async updateTag(req, res, next) {
    try {
      const { name, color } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount}`);
        values.push(name.trim());
        paramCount++;
      }

      if (color) {
        updates.push(`color = $${paramCount}`);
        values.push(color);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id, req.user.id);

      const query = `
        UPDATE tags
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ tag: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async deleteTag(req, res, next) {
    try {
      const query = `
        DELETE FROM tags
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [req.params.id, req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ message: 'Tag deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  async resetSettings(req, res, next) {
    try {
      res.json({
        message: 'Settings reset not yet implemented',
        reset: false
      });
    } catch (error) {
      next(error);
    }
  },

  async getTradingProfile(req, res, next) {
    try {
      const settings = await User.getSettings(req.user.id);
      
      if (!settings) {
        const newSettings = await User.createSettings(req.user.id);
        return res.json({ 
          tradingProfile: {
            tradingStrategies: [],
            tradingStyles: [],
            riskTolerance: 'moderate',
            primaryMarkets: [],
            experienceLevel: 'intermediate',
            averagePositionSize: 'medium',
            tradingGoals: [],
            preferredSectors: []
          }
        });
      }

      const tradingProfile = {
        tradingStrategies: settings.trading_strategies || [],
        tradingStyles: settings.trading_styles || [],
        riskTolerance: settings.risk_tolerance || 'moderate',
        primaryMarkets: settings.primary_markets || [],
        experienceLevel: settings.experience_level || 'intermediate',
        averagePositionSize: settings.average_position_size || 'medium',
        tradingGoals: settings.trading_goals || [],
        preferredSectors: settings.preferred_sectors || []
      };

      res.json({ tradingProfile });
    } catch (error) {
      next(error);
    }
  },

  async updateTradingProfile(req, res, next) {
    try {
      const {
        tradingStrategies,
        tradingStyles,
        riskTolerance,
        primaryMarkets,
        experienceLevel,
        averagePositionSize,
        tradingGoals,
        preferredSectors
      } = req.body;

      // Validate the data
      const validRiskLevels = ['conservative', 'moderate', 'aggressive'];
      const validExperienceLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const validPositionSizes = ['small', 'medium', 'large'];

      if (riskTolerance && !validRiskLevels.includes(riskTolerance)) {
        return res.status(400).json({ error: 'Invalid risk tolerance level' });
      }

      if (experienceLevel && !validExperienceLevels.includes(experienceLevel)) {
        return res.status(400).json({ error: 'Invalid experience level' });
      }

      if (averagePositionSize && !validPositionSizes.includes(averagePositionSize)) {
        return res.status(400).json({ error: 'Invalid position size' });
      }

      const profileData = {
        tradingStrategies: tradingStrategies || [],
        tradingStyles: tradingStyles || [],
        riskTolerance: riskTolerance || 'moderate',
        primaryMarkets: primaryMarkets || [],
        experienceLevel: experienceLevel || 'intermediate',
        averagePositionSize: averagePositionSize || 'medium',
        tradingGoals: tradingGoals || [],
        preferredSectors: preferredSectors || []
      };

      const updatedSettings = await User.updateSettings(req.user.id, profileData);
      
      res.json({ 
        message: 'Trading profile updated successfully',
        tradingProfile: profileData
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = settingsController;