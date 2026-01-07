# DCF Calculation Formula Documentation

## Current Formula Being Used

### Method 1: P/E Based Valuation

**Step-by-step calculation:**

1. **Current EPS**
   ```
   currentEPS = netIncome / shares
   ```

2. **Future EPS (after growth)**
   ```
   growthFactor = (1 + growth)^years
   futureEPS = currentEPS × growthFactor
   ```

3. **Future Stock Price**
   ```
   futurePrice = futureEPS × PE_multiple
   ```

4. **Fair Value (discounted back to present)**
   ```
   discountFactor = (1 + discount)^years
   fairValue = futurePrice / discountFactor
   ```

**Complete Formula:**
```
Fair Value = (Current EPS × (1 + growth)^years × PE) / (1 + discount)^years
```

### Method 2: P/FCF Based Valuation

**Step-by-step calculation:**

1. **Current FCF Per Share**
   ```
   currentFCFPerShare = freeCashFlow / shares
   ```

2. **Future FCF Per Share (after growth)**
   ```
   growthFactor = (1 + growth)^years
   futureFCFPerShare = currentFCFPerShare × growthFactor
   ```

3. **Future Stock Price**
   ```
   futurePrice = futureFCFPerShare × P/FCF_multiple
   ```

4. **Fair Value (discounted back to present)**
   ```
   discountFactor = (1 + discount)^years
   fairValue = futurePrice / discountFactor
   ```

**Complete Formula:**
```
Fair Value = (Current FCF/share × (1 + growth)^years × P/FCF) / (1 + discount)^years
```

### Final Result
```
Fair Value = Average of Method 1 and Method 2 (if both are valid)
```

## Example Calculation (AAPL Bear Scenario)

**Inputs:**
- Current Net Income: $112,010,000,000
- Shares Outstanding: 14,776,350,000
- Growth Rate: 6% (0.06)
- PE Multiple: 26
- Discount Rate: 10% (0.10)
- Years: 10

**Calculation:**
1. currentEPS = $112,010,000,000 / 14,776,350,000 = $7.5804
2. growthFactor = (1.06)^10 = 1.7908
3. futureEPS = $7.5804 × 1.7908 = $13.5753
4. futurePrice = $13.5753 × 26 = $352.96
5. discountFactor = (1.10)^10 = 2.5937
6. fairValue = $352.96 / 2.5937 = $136.08

## Potential Issues

1. **This is NOT a traditional DCF model** - it's a simplified "target price" calculation
2. **No terminal value** - assumes company is sold at year 10
3. **No annual cash flow projections** - just grows current value
4. **Assumes EPS/FCF grows at same rate as revenue** - may not be accurate

## Traditional DCF Formula (Not Currently Used)

A proper DCF would be:
```
Fair Value = Σ(FCF_t / (1 + r)^t) + Terminal Value / (1 + r)^n
```

Where:
- FCF_t = Free cash flow in year t
- r = Discount rate
- n = Number of years
- Terminal Value = FCF_n × (1 + g) / (r - g) [Gordon Growth Model]

