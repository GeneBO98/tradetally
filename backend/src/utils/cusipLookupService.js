const axios = require('axios');
const cache = require('./cache');

/**
 * Comprehensive CUSIP lookup service with multiple reliable data sources
 * Prioritizes accuracy over speed and avoids unreliable AI hallucinations
 */
class CusipLookupService {
  constructor() {
    this.sources = [
      { name: 'OpenFIGI', method: this.lookupOpenFIGI.bind(this) },
      // SEC EDGAR and ISIN.org are not implemented, so skip them
      // { name: 'SEC EDGAR', method: this.lookupSECEdgar.bind(this) },
      // { name: 'ISIN.org', method: this.lookupISINOrg.bind(this) },
    ];
  }

  /**
   * Main lookup method that tries multiple sources
   */
  async lookupCusip(cusip) {
    if (!cusip || cusip.length !== 9) {
      throw new Error('Invalid CUSIP format - must be 9 characters');
    }

    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
    
    // Check cache first (7 day TTL)
    const cached = await cache.get('cusip_resolution', cleanCusip);
    if (cached) {
      return cached;
    }

    console.log(`[CHECK] Starting comprehensive CUSIP lookup for ${cleanCusip}`);

    // Try each source in order
    for (const source of this.sources) {
      try {
        console.log(`Trying ${source.name} for CUSIP ${cleanCusip}...`);
        const result = await source.method(cleanCusip);
        
        if (result) {
          console.log(`[SUCCESS] ${source.name} resolved CUSIP ${cleanCusip} to ${result}`);
          
          // Cache the successful result
          await cache.set('cusip_resolution', cleanCusip, result);
          return result;
        }
        
        // No delay needed - move to next source immediately
        
      } catch (error) {
        console.warn(`[ERROR] ${source.name} failed for CUSIP ${cleanCusip}: ${error.message}`);
        
        // Continue to next source immediately - no delay needed
      }
    }

    // All sources failed - cache null result to avoid repeated lookups
    console.log(`[ERROR] All sources failed for CUSIP ${cleanCusip}`);
    await cache.set('cusip_resolution', cleanCusip, null);
    return null;
  }

  /**
   * OpenFIGI API lookup (Bloomberg's free API)
   * Most reliable source for CUSIP-to-ticker mapping
   */
  async lookupOpenFIGI(cusip) {
    const url = 'https://api.openfigi.com/v3/mapping';
    
    try {
      const response = await axios.post(url, [
        {
          idType: 'ID_CUSIP',
          idValue: cusip,
          exchCode: 'US' // Focus on US exchanges
        }
      ], {
        headers: {
          'Content-Type': 'application/json',
          // Add API key header if available (increases rate limits)
          ...(process.env.OPENFIGI_API_KEY && { 'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY })
        },
        timeout: 3000
      });

      if (response.data && response.data[0] && response.data[0].data) {
        const results = response.data[0].data;
        
        // Look for common stock first (most likely what we want)
        let commonStock = results.find(item => 
          item.securityType === 'Common Stock' || 
          item.securityType === 'STOCK' ||
          item.marketSector === 'Equity'
        );
        
        if (commonStock && commonStock.ticker) {
          return commonStock.ticker.toUpperCase();
        }
        
        // If no common stock, take the first result with a ticker
        const firstWithTicker = results.find(item => item.ticker);
        if (firstWithTicker && firstWithTicker.ticker) {
          return firstWithTicker.ticker.toUpperCase();
        }
      }
      
      return null;
    } catch (error) {
      throw new Error(`OpenFIGI API error: ${error.message}`);
    }
  }

  /**
   * SEC EDGAR lookup using their search API
   * Slower but very reliable for US securities
   */
  async lookupSECEdgar(cusip) {
    // Note: This is a placeholder for SEC EDGAR implementation
    // The actual SEC search is complex and would require parsing HTML
    // Consider implementing if other sources fail frequently
    
    console.log(`SEC EDGAR lookup not implemented yet for ${cusip}`);
    return null;
  }

  /**
   * ISIN.org lookup (backup source)
   */
  async lookupISINOrg(cusip) {
    // Note: This would require finding a reliable ISIN-to-CUSIP service
    // Most services are paid, but this is a placeholder for future implementation
    
    console.log(`ISIN.org lookup not implemented yet for ${cusip}`);
    return null;
  }

  /**
   * Utility method for delays between API calls
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch lookup for multiple CUSIPs
   */
  async batchLookupCusips(cusips) {
    const results = {};
    const maxConcurrent = 3; // Limit concurrent requests
    
    // Process in batches to avoid overwhelming APIs
    for (let i = 0; i < cusips.length; i += maxConcurrent) {
      const batch = cusips.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (cusip) => {
        try {
          const ticker = await this.lookupCusip(cusip);
          if (ticker) {
            results[cusip] = ticker;
          }
        } catch (error) {
          console.warn(`Batch lookup failed for CUSIP ${cusip}: ${error.message}`);
        }
      });
      
      await Promise.allSettled(batchPromises);
      
      // Rate limiting between batches
      if (i + maxConcurrent < cusips.length) {
        await this.delay(2000);
      }
    }
    
    return results;
  }

  /**
   * Get statistics about CUSIP resolution success rates
   */
  async getResolutionStats() {
    // This could track success rates per source for monitoring
    return {
      totalLookups: 0,
      successfulLookups: 0,
      sourceStats: {}
    };
  }
}

module.exports = new CusipLookupService();