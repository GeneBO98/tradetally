# Sample Gemini Prompt

This is an example of the prompt that gets sent to Gemini AI for generating trading recommendations:

---

As a professional trading performance analyst, analyze the following trading data and provide specific, actionable recommendations to improve trading performance. Focus on practical advice that can be implemented immediately.

TRADER PROFILE:
- Trading Strategies: Breakouts, Momentum Trading, Technical Analysis, Options Trading
- Trading Styles: Day Trading, Swing Trading
- Risk Tolerance: moderate
- Experience Level: intermediate
- Average Position Size: medium
- Primary Markets: US Stocks, ETFs, Options
- Trading Goals: Capital Appreciation, Quick Profits, Beat Market
- Preferred Sectors: Technology, Healthcare, Financials

TRADING PERFORMANCE METRICS:
- Total P&L: $4,250.75
- Win Rate: 62.5%
- Total Trades: 48
- Average Trade P&L: $88.56
- Profit Factor: 1.85
- Best Trade: $850.00
- Worst Trade: -$425.00

TRADING PATTERNS ANALYSIS:
- Symbols Traded: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMD, NFLX, AMZN, CRM (and more)
- Average Hold Time: 2 hours
- Profitable Trades: 30 (Avg: $212.50)
- Losing Trades: 18 (Avg: -$115.25)

BROKER PERFORMANCE:
- TD Ameritrade: 25 trades, $2,850.00 P&L, 68.0% win rate
- E*TRADE: 15 trades, $980.75 P&L, 60.0% win rate
- Robinhood: 8 trades, $420.00 P&L, 50.0% win rate

TIME-BASED PATTERNS:
- Best Hours: 10:00 ($1,250.50), 14:00 ($890.25), 9:00 ($675.00)
- Worst Hours: 11:00 (-$320.75), 15:00 (-$180.50), 16:00 (-$95.25)

RECENT TRADE SAMPLE (Last 10):
- AAPL: BUY 100 shares @ $180.50 → $185.25 = $475.00 (TD Ameritrade)
- TSLA: BUY 50 shares @ $245.00 → $242.50 = -$125.00 (E*TRADE)
- NVDA: BUY 25 shares @ $450.00 → $465.00 = $375.00 (TD Ameritrade)
- MSFT: BUY 75 shares @ $410.00 → $415.50 = $412.50 (Robinhood)
- GOOGL: BUY 10 shares @ $2,850.00 → $2,825.00 = -$250.00 (TD Ameritrade)
- META: BUY 40 shares @ $485.00 → $492.50 = $300.00 (E*TRADE)
- AMD: BUY 80 shares @ $125.00 → $128.75 = $300.00 (TD Ameritrade)
- NFLX: BUY 20 shares @ $675.00 → $670.00 = -$100.00 (Robinhood)
- AMZN: BUY 15 shares @ $3,200.00 → $3,240.00 = $600.00 (TD Ameritrade)
- CRM: BUY 30 shares @ $285.00 → $290.50 = $165.00 (E*TRADE)

Please provide a comprehensive analysis with the following sections:

1. **STRENGTHS**: What the trader is doing well
2. **WEAKNESSES**: Areas that need improvement with specific examples
3. **RISK MANAGEMENT**: Assessment of risk management practices (consider their moderate risk tolerance)
4. **ENTRY/EXIT STRATEGY**: Analysis of timing and execution (align with their Day Trading/Swing Trading style)
5. **DIVERSIFICATION**: Comment on symbol selection and concentration (consider their focus on Technology, Healthcare, Financials)
6. **BROKER EFFICIENCY**: Analysis of broker performance and costs
7. **STRATEGY ALIGNMENT**: Assess how well their actual trading aligns with their stated strategies (Breakouts, Momentum Trading, Technical Analysis, Options Trading) and goals (Capital Appreciation, Quick Profits, Beat Market)
8. **ACTIONABLE RECOMMENDATIONS**: 5-7 specific, immediate actions to improve performance tailored to their intermediate experience level and medium position sizing

**PERSONALIZATION NOTES**: 
- Tailor advice to their intermediate experience level
- Consider their medium position sizes and moderate risk tolerance
- Focus on US Stocks, ETFs, Options
- Align recommendations with their goals: Capital Appreciation, Quick Profits, Beat Market

Keep recommendations practical and specific. Use bullet points for clarity. Focus on data-driven insights based on the actual performance metrics provided.

---

## How the prompt is built:

1. **Static introduction**: Professional analyst role and context
2. **Dynamic trader profile**: From user's settings (if available)
3. **Performance metrics**: Calculated from actual trade data
4. **Pattern analysis**: Derived from recent trading activity
5. **Broker analysis**: Performance breakdown by broker
6. **Time patterns**: When the user trades most/least profitably
7. **Recent trades**: Sample of last 10 trades for context
8. **Analysis sections**: Structured request with personalization
9. **Personalization notes**: Specific guidance based on user profile