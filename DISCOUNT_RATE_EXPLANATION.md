# Discount Rate Explanation

## How Discount Rate is Currently Determined

**The discount rate is NOT calculated - it's a USER INPUT.**

### Current Implementation

1. **User enters "Desired Annual Return"** in the frontend (as a percentage)
2. **This value is passed directly** to the DCF calculation as `desired_return_low`, `desired_return_medium`, `desired_return_high`
3. **Default values** if user doesn't enter:
   - Bear (low): 15% (0.15)
   - Base (medium): 12% (0.12)
   - Bull (high): 10% (0.10)

### How It's Used in Calculation

The discount rate is used in the discount factor:

```
discountFactor = (1 + discount)^years
```

For example, with 10% discount rate over 10 years:
```
discountFactor = (1.10)^10 = 2.5937
```

Then future cash flows are divided by this factor:
```
Present Value = Future Value / discountFactor
```

## The Problem

**In proper DCF models, the discount rate should be calculated using:**

### 1. WACC (Weighted Average Cost of Capital)
```
WACC = (E/V × Re) + (D/V × Rd × (1 - Tc))
```
Where:
- E = Market value of equity
- D = Market value of debt
- V = E + D (total value)
- Re = Cost of equity
- Rd = Cost of debt
- Tc = Tax rate

### 2. Cost of Equity (CAPM)
```
Re = Rf + β × (Rm - Rf)
```
Where:
- Rf = Risk-free rate (10-year Treasury)
- β = Beta (stock's volatility vs market)
- Rm = Expected market return
- (Rm - Rf) = Market risk premium

### 3. Or at minimum:
- Risk-free rate + risk premium
- Or use company's historical returns
- Or use industry average WACC

## Current Issue

**We're using user's "desired return" as the discount rate**, which is:
- ✅ Simple and user-friendly
- ❌ Not based on actual cost of capital
- ❌ May not reflect the true risk of the investment
- ❌ Can lead to inaccurate valuations

## Recommendation

We should either:
1. **Calculate WACC automatically** from financial data
2. **Use risk-free rate + risk premium** as a default
3. **Allow user to override** but provide calculated defaults
4. **Explain to user** that "desired return" is their personal hurdle rate, not the company's cost of capital

