const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class CusipMappingsController {
  // Get CUSIP mappings for the current user
  async getUserCusipMappings(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, search = '', source = '', verified = '' } = req.query;
      
      const offset = (page - 1) * parseInt(limit);
      
      // Build dynamic query parameters
      let queryParams = [userId];
      let paramCount = 2;
      
      let searchClause = '';
      if (search) {
        searchClause = `AND (uc.cusip ILIKE $${paramCount} OR cm.ticker ILIKE $${paramCount} OR cm.company_name ILIKE $${paramCount})`;
        queryParams.push(`%${search}%`);
        paramCount++;
      }
      
      let sourceClause = '';
      if (source) {
        sourceClause = `AND cm.resolution_source = $${paramCount}`;
        queryParams.push(source);
        paramCount++;
      }
      
      let verifiedClause = '';
      if (verified !== '') {
        verifiedClause = `AND cm.verified = $${paramCount}`;
        queryParams.push(verified === 'true');
        paramCount++;
      }
      
      // Query for ALL CUSIPs (mapped and unmapped) - include historical mappings
      const query = `
        WITH all_user_cusips AS (
          -- Get CUSIPs currently in trades (unmapped)
          SELECT DISTINCT symbol as cusip, 'current' as cusip_type
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          
          UNION
          
          -- Get historical CUSIPs from mappings that were used for this user's trades
          SELECT DISTINCT cm.cusip, 'historical' as cusip_type
          FROM cusip_mappings cm
          WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
            AND EXISTS (
              SELECT 1 FROM trades t 
              WHERE t.user_id = $1 
                AND t.symbol = cm.ticker
            )
        ),
        trade_counts AS (
          -- Count trades for current CUSIPs
          SELECT symbol as cusip, COUNT(*) as trade_count
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          GROUP BY symbol
          
          UNION ALL
          
          -- Count trades for historical CUSIPs (now converted to tickers)
          SELECT cm.cusip, COUNT(t.id) as trade_count
          FROM cusip_mappings cm
          INNER JOIN trades t ON t.symbol = cm.ticker AND t.user_id = $1
          WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
          GROUP BY cm.cusip
        ),
        prioritized_mappings AS (
          SELECT DISTINCT ON (uc.cusip)
            cm.id,
            uc.cusip,
            cm.ticker,
            cm.company_name,
            cm.resolution_source,
            cm.confidence_score,
            cm.verified,
            cm.user_id,
            cm.created_at,
            cm.updated_at,
            (cm.user_id = $1) as is_user_override,
            true as used_in_trades,
            COALESCE(tc.trade_count, 0) as trade_count
          FROM all_user_cusips uc
          LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
          LEFT JOIN trade_counts tc ON tc.cusip = uc.cusip
          WHERE 1=1
            ${searchClause}
            ${sourceClause}
            ${verifiedClause}
          ORDER BY uc.cusip, 
                   CASE WHEN cm.user_id = $1 THEN 1 ELSE 0 END DESC, 
                   cm.confidence_score DESC
        )
        SELECT *
        FROM prioritized_mappings
        ORDER BY trade_count DESC, cusip ASC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      
      queryParams.push(parseInt(limit), offset);
      
      // Get total count for pagination
      const countQuery = `
        WITH all_user_cusips AS (
          -- Get CUSIPs currently in trades (unmapped)
          SELECT DISTINCT symbol as cusip
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          
          UNION
          
          -- Get historical CUSIPs from mappings that were used for this user's trades
          SELECT DISTINCT cm.cusip
          FROM cusip_mappings cm
          WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
            AND EXISTS (
              SELECT 1 FROM trades t 
              WHERE t.user_id = $1 
                AND t.symbol = cm.ticker
            )
        ),
        prioritized_mappings AS (
          SELECT DISTINCT ON (uc.cusip) uc.cusip
          FROM all_user_cusips uc
          LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
          WHERE 1=1
            ${searchClause}
            ${sourceClause}
            ${verifiedClause}
          ORDER BY uc.cusip, 
                   CASE WHEN cm.user_id = $1 THEN 1 ELSE 0 END DESC, 
                   cm.confidence_score DESC
        )
        SELECT COUNT(*) as total
        FROM prioritized_mappings
      `;
      
      const [mappingsResult, countResult] = await Promise.all([
        db.query(query, queryParams),
        db.query(countQuery, queryParams.slice(0, -2)) // Remove limit and offset for count
      ]);
      
      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / parseInt(limit));
      
      res.json({
        data: mappingsResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      });
    } catch (error) {
      console.error('Error fetching CUSIP mappings:', error);
      next(error);
    }
  }
  
  // Create or update a user-specific CUSIP mapping
  async createOrUpdateCusipMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const { cusip, ticker, company_name, verified = false } = req.body;
      
      // Validate input
      if (!cusip || !ticker) {
        return res.status(400).json({ error: 'CUSIP and ticker are required' });
      }
      
      // Validate CUSIP format
      if (!/^[A-Z0-9]{8}[0-9]$/.test(cusip)) {
        return res.status(400).json({ error: 'Invalid CUSIP format. Must be 9 characters (8 alphanumeric + 1 digit)' });
      }
      
      // Validate ticker format
      if (!/^[A-Z]{1,10}(\.[A-Z]{1,3})?$/.test(ticker.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid ticker format' });
      }
      
      const query = `
        INSERT INTO cusip_mappings (
          cusip, ticker, company_name, resolution_source, user_id, 
          confidence_score, verified, created_by
        )
        VALUES ($1, $2, $3, 'manual', $4, 100, $5, $4)
        ON CONFLICT (cusip, user_id) 
        DO UPDATE SET
          ticker = EXCLUDED.ticker,
          company_name = EXCLUDED.company_name,
          verified = EXCLUDED.verified,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const values = [
        cusip.toUpperCase(),
        ticker.toUpperCase(),
        company_name || null,
        userId,
        verified
      ];
      
      const result = await db.query(query, values);
      
      // Update any existing trades with this CUSIP to use the new ticker
      const updateTradesQuery = `
        UPDATE trades 
        SET symbol = $1 
        WHERE user_id = $2 AND symbol = $3
      `;
      
      const updateResult = await db.query(updateTradesQuery, [
        ticker.toUpperCase(),
        userId,
        cusip.toUpperCase()
      ]);
      
      res.json({
        mapping: result.rows[0],
        tradesUpdated: updateResult.rowCount
      });
    } catch (error) {
      console.error('Error creating/updating CUSIP mapping:', error);
      next(error);
    }
  }
  
  // Delete a user-specific CUSIP mapping (revert to global if exists)
  async deleteCusipMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const { cusip } = req.params;
      
      // Only allow deletion of user-specific mappings
      const query = `
        DELETE FROM cusip_mappings 
        WHERE cusip = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await db.query(query, [cusip.toUpperCase(), userId]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User-specific mapping not found' });
      }
      
      res.json({ 
        message: 'User-specific mapping deleted',
        mapping: result.rows[0]
      });
    } catch (error) {
      console.error('Error deleting CUSIP mapping:', error);
      next(error);
    }
  }
  
  // Verify a CUSIP mapping (mark as confirmed by user)
  async verifyCusipMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const { cusip } = req.params;
      const { verified = true } = req.body;
      
      // First try to update user-specific mapping
      let query = `
        UPDATE cusip_mappings 
        SET verified = $1, updated_at = CURRENT_TIMESTAMP
        WHERE cusip = $2 AND user_id = $3
        RETURNING *
      `;
      
      let result = await db.query(query, [verified, cusip.toUpperCase(), userId]);
      
      // If no user-specific mapping exists, create one based on global mapping
      if (result.rowCount === 0) {
        const globalQuery = `
          SELECT * FROM cusip_mappings 
          WHERE cusip = $1 AND user_id IS NULL
          ORDER BY confidence_score DESC
          LIMIT 1
        `;
        
        const globalResult = await db.query(globalQuery, [cusip.toUpperCase()]);
        
        if (globalResult.rows.length > 0) {
          const globalMapping = globalResult.rows[0];
          
          const createQuery = `
            INSERT INTO cusip_mappings (
              cusip, ticker, company_name, resolution_source, user_id,
              confidence_score, verified, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $5)
            RETURNING *
          `;
          
          result = await db.query(createQuery, [
            globalMapping.cusip,
            globalMapping.ticker,
            globalMapping.company_name,
            'manual', // User verification creates manual override
            userId,
            100, // Full confidence for verified mapping
            verified,
          ]);
        } else {
          return res.status(404).json({ error: 'No mapping found for this CUSIP' });
        }
      }
      
      res.json({ mapping: result.rows[0] });
    } catch (error) {
      console.error('Error verifying CUSIP mapping:', error);
      next(error);
    }
  }
  
  // Get CUSIP mappings that need user review (unverified, low confidence)
  async getCusipMappingsForReview(req, res, next) {
    try {
      const userId = req.user.id;
      
      const query = `
        WITH user_cusips AS (
          -- Get CUSIPs from user's trades that need review
          SELECT DISTINCT symbol as cusip
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        ),
        mappings_for_review AS (
          SELECT DISTINCT ON (cm.cusip)
            cm.*,
            (cm.user_id = $1) as is_user_override,
            trade_counts.trade_count
          FROM cusip_mappings cm
          INNER JOIN user_cusips uc ON uc.cusip = cm.cusip
          LEFT JOIN (
            SELECT symbol, COUNT(*) as trade_count
            FROM trades 
            WHERE user_id = $1 
              AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
            GROUP BY symbol
          ) trade_counts ON trade_counts.symbol = cm.cusip
          WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
            AND (cm.verified = FALSE OR cm.confidence_score < 90)
          ORDER BY cm.cusip, 
                   CASE WHEN cm.user_id = $1 THEN 1 ELSE 0 END DESC, 
                   cm.confidence_score DESC
        )
        SELECT *
        FROM mappings_for_review
        ORDER BY trade_count DESC, confidence_score ASC
      `;
      
      const result = await db.query(query, [userId]);
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching CUSIP mappings for review:', error);
      next(error);
    }
  }
  
  // Get unmapped CUSIPs (CUSIPs in trades but no mapping exists)
  async getUnmappedCusips(req, res, next) {
    try {
      const userId = req.user.id;
      
      const query = `
        SELECT 
          t.symbol as cusip,
          COUNT(*) as trade_count,
          MIN(t.trade_date) as first_trade_date,
          MAX(t.trade_date) as last_trade_date,
          array_agg(DISTINCT t.side) as trade_sides
        FROM trades t
        WHERE t.user_id = $1
          AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
          AND NOT EXISTS (
            SELECT 1 FROM cusip_mappings cm 
            WHERE cm.cusip = t.symbol 
              AND (cm.user_id = $1 OR cm.user_id IS NULL)
          )
        GROUP BY t.symbol
        ORDER BY trade_count DESC, last_trade_date DESC
      `;
      
      const result = await db.query(query, [userId]);
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching unmapped CUSIPs:', error);
      next(error);
    }
  }
}

module.exports = new CusipMappingsController();