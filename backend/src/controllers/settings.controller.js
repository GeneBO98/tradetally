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
  },

  async exportUserData(req, res, next) {
    try {
      const userId = req.user.id;

      // Get user profile
      const userResult = await db.query(
        `SELECT username, full_name, email, timezone FROM users WHERE id = $1`,
        [userId]
      );
      const user = userResult.rows[0];

      // Get user settings (includes trading profile)
      const settingsResult = await db.query(
        `SELECT * FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      const settings = settingsResult.rows[0];

      // Get all trades
      const tradesResult = await db.query(
        `SELECT * FROM trades WHERE user_id = $1 ORDER BY created_at`,
        [userId]
      );
      const trades = tradesResult.rows;

      // Get all tags
      const tagsResult = await db.query(
        `SELECT * FROM tags WHERE user_id = $1`,
        [userId]
      );
      const tags = tagsResult.rows;

      // Get equity history (with fallback to equity_snapshots if equity_history doesn't exist)
      let equityHistory = [];
      try {
        const equityResult = await db.query(
          `SELECT * FROM equity_history WHERE user_id = $1 ORDER BY date`,
          [userId]
        );
        equityHistory = equityResult.rows;
      } catch (error) {
        // If equity_history doesn't exist, try equity_snapshots
        try {
          const equitySnapshotsResult = await db.query(
            `SELECT 
              user_id,
              snapshot_date as date,
              equity_amount as equity,
              0.00 as pnl,
              created_at,
              updated_at
            FROM equity_snapshots WHERE user_id = $1 ORDER BY snapshot_date`,
            [userId]
          );
          equityHistory = equitySnapshotsResult.rows;
        } catch (snapshotError) {
          // If neither table exists, continue with empty equity history
          console.warn('No equity tracking tables found, continuing with empty equity history');
        }
      }

      // Create export data
      const exportData = {
        exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        user: {
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          timezone: user.timezone
        },
        settings: settings ? {
          emailNotifications: settings.email_notifications,
          publicProfile: settings.public_profile,
          defaultTags: settings.default_tags,
          accountEquity: settings.account_equity
        } : null,
        tradingProfile: settings ? {
          tradingStrategies: settings.trading_strategies || [],
          tradingStyles: settings.trading_styles || [],
          riskTolerance: settings.risk_tolerance || 'moderate',
          primaryMarkets: settings.primary_markets || [],
          experienceLevel: settings.experience_level || 'intermediate',
          averagePositionSize: settings.average_position_size || 'medium',
          tradingGoals: settings.trading_goals || [],
          preferredSectors: settings.preferred_sectors || []
        } : null,
        trades: trades.map(trade => ({
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          entryPrice: trade.entry_price,
          exitPrice: trade.exit_price,
          entryTime: trade.entry_time,
          exitTime: trade.exit_time,
          pnl: trade.pnl,
          commission: trade.commission,
          fees: trade.fees,
          notes: trade.notes,
          tags: trade.tags,
          isPublic: trade.is_public,
          strategy: trade.strategy,
          createdAt: trade.created_at
        })),
        tags: tags.map(tag => ({
          name: tag.name,
          color: tag.color
        })),
        equityHistory: equityHistory.map(equity => ({
          date: equity.date,
          equity: equity.equity,
          pnl: equity.pnl
        }))
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=tradetally-export-${new Date().toISOString().split('T')[0]}.json`);
      res.json(exportData);
    } catch (error) {
      next(error);
    }
  },

  async importUserData(req, res, next) {
    try {
      const userId = req.user.id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let importData;
      try {
        importData = JSON.parse(file.buffer.toString());
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON file' });
      }

      // Validate import data structure
      if (!importData.exportVersion || !importData.trades) {
        return res.status(400).json({ error: 'Invalid TradeTally export file' });
      }

      const client = await db.connect();
      let tradesAdded = 0;
      let tagsAdded = 0;

      try {
        await client.query('BEGIN');

        // Import tags first
        if (importData.tags && importData.tags.length > 0) {
          for (const tag of importData.tags) {
            // Check if tag already exists
            const existingTag = await client.query(
              `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
              [userId, tag.name]
            );

            if (existingTag.rows.length === 0) {
              await client.query(
                `INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3)`,
                [userId, tag.name, tag.color]
              );
              tagsAdded++;
            }
          }
        }

        // Import trades
        if (importData.trades && importData.trades.length > 0) {
          for (const trade of importData.trades) {
            // Check if trade already exists (by symbol, entry_time, and quantity)
            const existingTrade = await client.query(
              `SELECT id FROM trades WHERE user_id = $1 AND symbol = $2 AND entry_time = $3 AND quantity = $4`,
              [userId, trade.symbol, trade.entryTime, trade.quantity]
            );

            if (existingTrade.rows.length === 0) {
              await client.query(
                `INSERT INTO trades (
                  user_id, symbol, side, quantity, entry_price, exit_price, 
                  entry_time, exit_time, pnl, commission, fees, notes, tags, 
                  is_public, strategy, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                  userId, trade.symbol, trade.side, trade.quantity, trade.entryPrice,
                  trade.exitPrice, trade.entryTime, trade.exitTime, trade.pnl,
                  trade.commission, trade.fees, trade.notes, trade.tags,
                  trade.isPublic || false, trade.strategy, trade.createdAt || new Date()
                ]
              );
              tradesAdded++;
            }
          }
        }

        // Merge settings and trading profile (don't overwrite existing settings completely)
        const existingSettings = await client.query(
          `SELECT * FROM user_settings WHERE user_id = $1`,
          [userId]
        );

        if (existingSettings.rows.length === 0) {
          // Create new settings with imported data
          const settingsData = importData.settings || {};
          const tradingProfileData = importData.tradingProfile || {};
          
          await client.query(
            `INSERT INTO user_settings (
              user_id, email_notifications, public_profile, default_tags, account_equity,
              trading_strategies, trading_styles, risk_tolerance, primary_markets,
              experience_level, average_position_size, trading_goals, preferred_sectors
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              userId,
              settingsData.emailNotifications ?? true,
              settingsData.publicProfile ?? false,
              settingsData.defaultTags || [],
              settingsData.accountEquity || null,
              tradingProfileData.tradingStrategies || [],
              tradingProfileData.tradingStyles || [],
              tradingProfileData.riskTolerance || 'moderate',
              tradingProfileData.primaryMarkets || [],
              tradingProfileData.experienceLevel || 'intermediate',
              tradingProfileData.averagePositionSize || 'medium',
              tradingProfileData.tradingGoals || [],
              tradingProfileData.preferredSectors || []
            ]
          );
        } else {
          // Update existing settings (merge default tags and trading profile)
          const currentSettings = existingSettings.rows[0];
          const updates = [];
          const values = [];
          let paramCount = 1;

          // Merge settings
          if (importData.settings) {
            const mergedTags = [...new Set([
              ...(currentSettings.default_tags || []),
              ...(importData.settings.defaultTags || [])
            ])];
            updates.push(`default_tags = $${paramCount++}`);
            values.push(mergedTags);
          }

          // Merge trading profile
          if (importData.tradingProfile) {
            const tp = importData.tradingProfile;
            
            if (tp.tradingStrategies) {
              updates.push(`trading_strategies = $${paramCount++}`);
              values.push(tp.tradingStrategies);
            }
            if (tp.tradingStyles) {
              updates.push(`trading_styles = $${paramCount++}`);
              values.push(tp.tradingStyles);
            }
            if (tp.riskTolerance) {
              updates.push(`risk_tolerance = $${paramCount++}`);
              values.push(tp.riskTolerance);
            }
            if (tp.primaryMarkets) {
              updates.push(`primary_markets = $${paramCount++}`);
              values.push(tp.primaryMarkets);
            }
            if (tp.experienceLevel) {
              updates.push(`experience_level = $${paramCount++}`);
              values.push(tp.experienceLevel);
            }
            if (tp.averagePositionSize) {
              updates.push(`average_position_size = $${paramCount++}`);
              values.push(tp.averagePositionSize);
            }
            if (tp.tradingGoals) {
              updates.push(`trading_goals = $${paramCount++}`);
              values.push(tp.tradingGoals);
            }
            if (tp.preferredSectors) {
              updates.push(`preferred_sectors = $${paramCount++}`);
              values.push(tp.preferredSectors);
            }
          }

          if (updates.length > 0) {
            values.push(userId);
            await client.query(
              `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
              values
            );
          }
        }

        // Import equity history if available
        let equityAdded = 0;
        if (importData.equityHistory && importData.equityHistory.length > 0) {
          for (const equity of importData.equityHistory) {
            try {
              // Try to insert into equity_history first
              await client.query(
                `INSERT INTO equity_history (user_id, date, equity, pnl) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, date) DO NOTHING`,
                [userId, equity.date, equity.equity, equity.pnl || 0.00]
              );
              equityAdded++;
            } catch (error) {
              // If equity_history doesn't exist, try equity_snapshots
              try {
                await client.query(
                  `INSERT INTO equity_snapshots (user_id, snapshot_date, equity_amount) 
                   VALUES ($1, $2, $3)
                   ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
                  [userId, equity.date, equity.equity]
                );
                equityAdded++;
              } catch (snapshotError) {
                // If neither table exists, skip equity history
                console.warn('No equity tracking tables found, skipping equity history import');
              }
            }
          }
        }

        await client.query('COMMIT');
        
        res.json({ 
          success: true,
          tradesAdded,
          tagsAdded,
          equityAdded,
          message: `Successfully imported ${tradesAdded} trades, ${tagsAdded} tags, and ${equityAdded} equity records`
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  }
};

module.exports = settingsController;