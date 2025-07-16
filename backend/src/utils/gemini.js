const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiRecommendations {
  constructor() {
    // API key is now passed per request rather than stored in constructor
    this.genAI = null;
    this.model = null;
  }

  isConfigured(apiKey = null) {
    // Check if API key is provided either in parameter or environment (for backward compatibility)
    return !!(apiKey || process.env.GEMINI_API_KEY);
  }

  async generateTradeRecommendations(tradeMetrics, tradeData, tradingProfile = null, sectorData = null, apiKey = null) {
    // Use provided API key or fallback to environment variable
    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!effectiveApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Initialize client with the provided API key
    this.genAI = new GoogleGenerativeAI(effectiveApiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    console.log('🔧 Building analysis prompt...');
    const prompt = this.buildAnalysisPrompt(tradeMetrics, tradeData, tradingProfile, sectorData);
    console.log('📝 Prompt length:', prompt.length, 'characters');
    
    try {
      console.log('🌐 Sending request to Gemini API...');
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log('📨 Received response from Gemini, length:', text.length, 'characters');
      return text;
    } catch (error) {
      console.error('❌ Gemini API error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw new Error(`Failed to generate recommendations: ${error.message}`);
    }
  }

  buildAnalysisPrompt(metrics, trades, tradingProfile = null, sectorData = null) {
    // Analyze recent trades to identify patterns
    const recentTrades = trades.slice(0, 50); // Last 50 trades
    const symbols = [...new Set(recentTrades.map(t => t.symbol))];
    const avgHoldTime = this.calculateAverageHoldTime(recentTrades);
    const profitableTrades = recentTrades.filter(t => t.pnl > 0);
    const losingTrades = recentTrades.filter(t => t.pnl < 0);
    
    // Calculate broker performance
    const brokerPerformance = this.analyzeBrokerPerformance(recentTrades);
    
    // Time-based analysis
    const timeAnalysis = this.analyzeTimePatterns(recentTrades);
    
    // Sector analysis section
    let sectorSection = '';
    if (sectorData && sectorData.length > 0) {
      sectorSection = `
SECTOR PERFORMANCE ANALYSIS:
${sectorData.map(sector => 
  `- ${sector.industry}: ${sector.total_trades} trades, $${parseFloat(sector.total_pnl).toFixed(2)} P&L, ${sector.win_rate}% win rate (symbols: ${sector.symbols.join(', ')})`
).join('\n')}

SECTOR INSIGHTS:
- Best performing sector: ${sectorData[0].industry} ($${parseFloat(sectorData[0].total_pnl).toFixed(2)})
- Worst performing sector: ${sectorData[sectorData.length - 1].industry} ($${parseFloat(sectorData[sectorData.length - 1].total_pnl).toFixed(2)})
- Total sectors traded: ${sectorData.length}
- Sector diversification: ${sectorData.length >= 5 ? 'Well diversified' : sectorData.length >= 3 ? 'Moderately diversified' : 'Concentrated'}

`;
    }
    
    let profileSection = '';
    if (tradingProfile) {
      profileSection = `
TRADER PROFILE:
- Trading Strategies: ${tradingProfile.tradingStrategies.length > 0 ? tradingProfile.tradingStrategies.join(', ') : 'Not specified'}
- Trading Styles: ${tradingProfile.tradingStyles.length > 0 ? tradingProfile.tradingStyles.join(', ') : 'Not specified'}
- Risk Tolerance: ${tradingProfile.riskTolerance}
- Experience Level: ${tradingProfile.experienceLevel}
- Average Position Size: ${tradingProfile.averagePositionSize}
- Primary Markets: ${tradingProfile.primaryMarkets.length > 0 ? tradingProfile.primaryMarkets.join(', ') : 'Not specified'}
- Trading Goals: ${tradingProfile.tradingGoals.length > 0 ? tradingProfile.tradingGoals.join(', ') : 'Not specified'}
- Preferred Sectors: ${tradingProfile.preferredSectors.length > 0 ? tradingProfile.preferredSectors.join(', ') : 'Not specified'}

`;
    }
    
    const prompt = `As a professional trading performance analyst, analyze the following trading data and provide highly personalized, actionable recommendations. ${tradingProfile ? `This trader has specifically chosen ${tradingProfile.tradingStrategies.join(', ')} as their strategies and ${tradingProfile.tradingStyles.join(', ')} as their trading styles. All analysis must be tailored to these preferences and their ${tradingProfile.riskTolerance} risk tolerance.` : 'Provide general trading advice.'}

${profileSection}

${tradingProfile ? `
🎯 **CRITICAL**: All recommendations must be specifically relevant to:
- Their chosen strategies: ${tradingProfile.tradingStrategies.join(', ')}
- Their trading style: ${tradingProfile.tradingStyles.join(', ')}
- Their ${tradingProfile.riskTolerance} risk tolerance level
- Their ${tradingProfile.experienceLevel} experience level
- Their focus on ${tradingProfile.primaryMarkets.join(', ') || 'general markets'}
- Their ${tradingProfile.averagePositionSize} position sizing approach

Do NOT provide generic advice. Every recommendation should directly relate to their stated preferences above.
` : ''}

TRADING PERFORMANCE METRICS:
- Total P&L: $${(parseFloat(metrics.total_pnl) || 0).toFixed(2)}
- Win Rate: ${parseFloat(metrics.win_rate) || 0}%
- Total Trades: ${parseInt(metrics.total_trades) || 0}
- Average Trade P&L: $${(parseFloat(metrics.avg_pnl) || 0).toFixed(2)}
- Profit Factor: ${(parseFloat(metrics.profit_factor) || 0).toFixed(2)}
- Best Trade: $${(parseFloat(metrics.best_trade) || 0).toFixed(2)}
- Worst Trade: $${(parseFloat(metrics.worst_trade) || 0).toFixed(2)}

TRADING PATTERNS ANALYSIS:
- Symbols Traded: ${symbols.slice(0, 10).join(', ')}${symbols.length > 10 ? ' (and more)' : ''}
- Average Hold Time: ${avgHoldTime}
- Profitable Trades: ${profitableTrades.length} (Avg: $${this.calculateAverage(profitableTrades.map(t => t.pnl)).toFixed(2)})
- Losing Trades: ${losingTrades.length} (Avg: $${this.calculateAverage(losingTrades.map(t => t.pnl)).toFixed(2)})

BROKER PERFORMANCE:
${Object.entries(brokerPerformance).map(([broker, stats]) => 
  `- ${broker}: ${stats.trades} trades, $${stats.pnl.toFixed(2)} P&L, ${stats.winRate.toFixed(1)}% win rate`
).join('\n')}

TIME-BASED PATTERNS:
${timeAnalysis}

${sectorSection}RECENT TRADE SAMPLE (Last 10):
${recentTrades.slice(0, 10).map(trade => 
  `- ${trade.symbol}: ${trade.side} ${trade.quantity} shares @ $${parseFloat(trade.entry_price).toFixed(2)} → ${trade.exit_price ? `$${parseFloat(trade.exit_price).toFixed(2)}` : 'OPEN'} = $${(parseFloat(trade.pnl) || 0).toFixed(2)} (${trade.broker})`
).join('\n')}

Please provide a comprehensive analysis with the following sections:

1. **STRENGTHS**: What the trader is doing well${tradingProfile ? ` specifically related to their ${tradingProfile.tradingStrategies.join('/')} strategies and ${tradingProfile.tradingStyles.join('/')} style` : ''}

2. **WEAKNESSES**: Areas that need improvement${tradingProfile ? ` that conflict with or undermine their chosen ${tradingProfile.tradingStrategies.join('/')} strategies` : ''} with specific examples

3. **RISK MANAGEMENT**: ${tradingProfile ? `Detailed assessment of how their risk management aligns with their stated ${tradingProfile.riskTolerance} risk tolerance. Are they taking too much or too little risk for their profile?` : 'Assessment of risk management practices'}

4. **ENTRY/EXIT STRATEGY**: ${tradingProfile ? `Analyze timing and execution specifically for ${tradingProfile.tradingStyles.join('/')} trading. How well do their entry/exit patterns match their chosen style? Are they holding too long/short for their style?` : 'Analysis of timing and execution'}

5. **DIVERSIFICATION & SECTOR ANALYSIS**: ${tradingProfile ? `Analyze their sector performance vs their preferred sectors (${tradingProfile.preferredSectors.join(', ') || 'various'}). ${sectorData ? 'Use the sector performance data above to identify which industries they excel in vs struggle with. Are they properly diversified or too concentrated?' : 'Comment on symbol selection and concentration.'}` : `${sectorData ? 'Analyze their sector performance data above - which industries are they strongest/weakest in? Should they focus more on their profitable sectors or diversify into new ones?' : 'Comment on symbol selection and concentration.'}`}

6. **BROKER EFFICIENCY**: Analysis of broker performance and costs${tradingProfile ? ` - are they using the right brokers for their ${tradingProfile.tradingStyles.join('/')} style and ${tradingProfile.averagePositionSize} position sizes?` : ''}

7. **STRATEGY ALIGNMENT**: ${tradingProfile ? `CRITICAL ANALYSIS: How well does their actual trading behavior align with their stated strategies (${tradingProfile.tradingStrategies.join(', ')})? Point out specific misalignments and why this matters for their goals (${tradingProfile.tradingGoals.join(', ')})` : 'Analysis of trading strategy consistency'}

8. **PERSONALIZED ACTION PLAN**: ${tradingProfile ? `5-7 specific actions tailored to improve their ${tradingProfile.tradingStrategies.join('/')} strategy execution, considering their ${tradingProfile.experienceLevel} level and ${tradingProfile.averagePositionSize} position sizing. Each recommendation should explicitly reference their profile.` : '5-7 specific, immediate actions to improve performance'}

${tradingProfile ? `
**MANDATORY PERSONALIZATION REQUIREMENTS**: 
- Every recommendation MUST explicitly reference how it applies to their ${tradingProfile.tradingStrategies.join('/')} strategies
- Address their ${tradingProfile.experienceLevel} experience level - don't suggest overly complex or overly simple strategies
- Consider their ${tradingProfile.averagePositionSize} position sizing in all suggestions
- Risk suggestions must align with their ${tradingProfile.riskTolerance} tolerance
- Focus specifically on ${tradingProfile.primaryMarkets.join(' and ') || 'their stated market preferences'}
- Every action item should help them achieve: ${tradingProfile.tradingGoals.join(', ')}
- Analyze how their current trading contradicts or supports their chosen profile
- Call out where they're trading against their stated preferences
${sectorData ? `- Use the SECTOR PERFORMANCE data to compare their actual profitable sectors vs their preferred sectors (${tradingProfile.preferredSectors.join(', ') || 'none specified'})
- Recommend whether they should double down on profitable sectors or diversify into new ones
- Identify if they're missing opportunities in sectors they claim to prefer` : ''}

REMEMBER: This trader chose their profile for a reason. Help them trade consistently with their stated approach or explain why they should consider adjusting their profile.${sectorData ? ' Pay special attention to the sector analysis data - this is real performance data that should drive concrete recommendations.' : ''}
` : ''}

Keep recommendations highly specific and personalized. Use bullet points for clarity. Focus on alignment between their stated trading approach and actual performance data.`;

    return prompt;
  }

  async generateResponse(prompt, apiKey = null, options = {}) {
    // Use provided API key or fallback to environment variable
    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!effectiveApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Initialize client with the provided API key
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }

  calculateAverageHoldTime(trades) {
    const completedTrades = trades.filter(t => t.entry_time && t.exit_time);
    if (completedTrades.length === 0) return 'N/A';
    
    const totalMinutes = completedTrades.reduce((sum, trade) => {
      const entryTime = new Date(trade.entry_time);
      const exitTime = new Date(trade.exit_time);
      return sum + (exitTime - entryTime) / (1000 * 60); // Convert to minutes
    }, 0);
    
    const avgMinutes = totalMinutes / completedTrades.length;
    
    if (avgMinutes < 60) return `${Math.round(avgMinutes)} minutes`;
    if (avgMinutes < 1440) return `${Math.round(avgMinutes / 60)} hours`;
    return `${Math.round(avgMinutes / 1440)} days`;
  }

  calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    const validNumbers = numbers.map(num => parseFloat(num) || 0);
    return validNumbers.reduce((sum, num) => sum + num, 0) / validNumbers.length;
  }

  analyzeBrokerPerformance(trades) {
    const brokerStats = {};
    
    trades.forEach(trade => {
      const broker = trade.broker || 'unknown';
      if (!brokerStats[broker]) {
        brokerStats[broker] = {
          trades: 0,
          pnl: 0,
          wins: 0
        };
      }
      
      brokerStats[broker].trades++;
      const pnl = parseFloat(trade.pnl) || 0;
      brokerStats[broker].pnl += pnl;
      if (pnl > 0) brokerStats[broker].wins++;
    });
    
    // Calculate win rates
    Object.keys(brokerStats).forEach(broker => {
      const stats = brokerStats[broker];
      stats.winRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
    });
    
    return brokerStats;
  }

  analyzeTimePatterns(trades) {
    const hourlyPnL = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);
    
    trades.forEach(trade => {
      if (trade.entry_time) {
        const hour = new Date(trade.entry_time).getHours();
        const pnl = parseFloat(trade.pnl) || 0;
        hourlyPnL[hour] += pnl;
        hourlyCounts[hour]++;
      }
    });
    
    const bestHours = hourlyPnL
      .map((pnl, hour) => ({ hour, pnl: parseFloat(pnl) || 0, count: hourlyCounts[hour] }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 3);
    
    const worstHours = hourlyPnL
      .map((pnl, hour) => ({ hour, pnl: parseFloat(pnl) || 0, count: hourlyCounts[hour] }))
      .filter(h => h.count > 0)
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 3);
    
    return `- Best Hours: ${bestHours.map(h => `${h.hour}:00 ($${h.pnl.toFixed(2)})`).join(', ')}
- Worst Hours: ${worstHours.map(h => `${h.hour}:00 ($${h.pnl.toFixed(2)})`).join(', ')}`;
  }
}

module.exports = new GeminiRecommendations();