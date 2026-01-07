# DCF Calculation Formula Documentation

## Current Implementation: Traditional DCF with Annual Projections

We use a **traditional DCF model** that projects cash flows year-by-year and includes terminal value. This is the proper DCF method, not a simplified target price calculation.

## Method 1: FCF-Based DCF (Primary Method)

### Step-by-Step Calculation:

1. **Project FCF for each year (1 to N)**
   ```
   For year t from 1 to N:
     FCF_t = FCF_{t-1} × (1 + growth_rate)
   ```

2. **Discount each year's FCF to present value**
   ```
   For year t:
     PV_t = FCF_t / (1 + discount_rate)^t
   ```

3. **Sum all present values**
   ```
   Sum of PVs = Σ(PV_t) for t = 1 to N
   ```

4. **Calculate Terminal Value**
   - **If P/FCF multiple provided:**
     ```
     Terminal Value = Final FCF × P/FCF_multiple
     ```
   - **If no multiple (uses Gordon Growth Model):**
     ```
     Terminal Value = (Final FCF × (1 + terminal_growth)) / (discount_rate - terminal_growth)
     ```
     Where `terminal_growth` = 3% (long-term GDP growth)

5. **Discount Terminal Value to Present**
   ```
   Terminal PV = Terminal Value / (1 + discount_rate)^N
   ```

6. **Calculate Total Intrinsic Value**
   ```
   Total Intrinsic Value = Sum of PVs + Terminal PV
   ```

7. **Calculate Fair Value Per Share**
   ```
   Fair Value = Total Intrinsic Value / Shares Outstanding
   ```

### Complete Formula:
```
Fair Value = [Σ(FCF_t / (1 + r)^t) + Terminal Value / (1 + r)^N] / Shares
```

Where:
- `FCF_t` = Free cash flow in year t
- `r` = Discount rate (user's desired annual return)
- `N` = Number of projection years (default: 10)
- `t` = Year (1, 2, 3, ..., N)

## Method 2: Earnings-Based DCF (Secondary Method)

Uses the same approach but with **Net Income** instead of FCF:

1. **Project Earnings for each year**
   ```
   For year t from 1 to N:
     Earnings_t = Earnings_{t-1} × (1 + growth_rate)
   ```

2. **Discount each year's earnings**
   ```
   PV_t = Earnings_t / (1 + discount_rate)^t
   ```

3. **Calculate Terminal Value using P/E multiple**
   ```
   Terminal Value = Final Earnings × P/E_multiple
   Terminal PV = Terminal Value / (1 + discount_rate)^N
   ```

4. **Calculate Fair Value**
   ```
   Fair Value = [Σ(PV_t) + Terminal PV] / Shares Outstanding
   ```

## Final Result

```
Fair Value = Average of Method 1 and Method 2 (if both are valid)
```

If only one method produces valid results, that method's value is used.

## Example Calculation (MSFT Bull Scenario)

**Inputs:**
- Current FCF: $100,000,000,000
- Shares Outstanding: 15,000,000,000
- Growth Rate: 8% (0.08)
- P/FCF Multiple: 30
- Discount Rate: 10% (0.10)
- Years: 10

**Year-by-Year Projection:**

| Year | FCF | Discount Factor | Present Value |
|------|-----|----------------|---------------|
| 1 | $108.00B | 1.10 | $98.18B |
| 2 | $116.64B | 1.21 | $96.40B |
| 3 | $125.97B | 1.33 | $94.71B |
| ... | ... | ... | ... |
| 10 | $215.89B | 2.59 | $83.36B |

**Sum of PVs (Years 1-10):** $820.31B

**Terminal Value:**
- Final FCF: $215.89B
- Terminal Value = $215.89B × 30 = $6,476.70B
- Terminal PV = $6,476.70B / 2.59 = $2,497.57B

**Total Intrinsic Value:**
- Total = $820.31B + $2,497.57B = $3,317.88B
- Fair Value = $3,317.88B / 15B shares = **$221.19 per share**

## Discount Rate Impact

**Higher discount rate = Lower fair value**

Example with $100B terminal value, 10 years:
- 10% discount: PV = $38.55
- 15% discount: PV = $24.72 (36% lower)
- 20% discount: PV = $16.15 (58% lower)
- 50% discount: PV = $1.70 (96% lower)

The discount rate has a **massive impact** on fair value, especially on the terminal value component.

## Key Features

1. ✅ **Projects cash flows year-by-year** - accounts for time value of money each year
2. ✅ **Includes terminal value** - accounts for value beyond projection period
3. ✅ **Uses exit multiples** - P/E and P/FCF for terminal value
4. ✅ **Discounts everything to present** - proper DCF methodology
5. ✅ **Averages multiple methods** - FCF and Earnings-based for robustness

## Discount Rate Calculation

The discount rate is calculated using **CAPM (Capital Asset Pricing Model)**:

```
Discount Rate = Risk-free Rate + Beta × Market Risk Premium
```

**Defaults:**
- Risk-free Rate: 4% (10-year Treasury)
- Market Risk Premium: 6%
- Beta: Retrieved from Finnhub (defaults to 1.0 if not available)

**User Override:**
- Users can enter their own "Desired Annual Return" which overrides the calculated rate
- No auto-correction - user's values are used as entered
- Higher discount rate = more conservative = lower fair value
