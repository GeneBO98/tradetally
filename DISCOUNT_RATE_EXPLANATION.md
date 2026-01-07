# Discount Rate Explanation

## How Discount Rate is Determined

### 1. Calculated Using CAPM (Default)

The discount rate is **automatically calculated** using the Capital Asset Pricing Model:

```
Cost of Equity = Risk-free Rate + Beta × Market Risk Premium
```

**Components:**
- **Risk-free Rate**: 4% (10-year Treasury rate - hardcoded)
- **Beta**: Retrieved from Finnhub metrics (defaults to 1.0 if not available)
- **Market Risk Premium**: 6% (typical long-term average - hardcoded)

**Example:**
- If Beta = 1.2, Risk-free = 4%, MRP = 6%
- Discount Rate = 4% + (1.2 × 6%) = 4% + 7.2% = **11.2%**

### 2. User Override (Optional)

Users can enter their own "Desired Annual Return" in the frontend, which **overrides** the calculated rate.

**Important:**
- User values are used **as entered** - no auto-correction
- Frontend converts percentage to decimal (e.g., 15% → 0.15)
- Higher discount rate = lower fair value (more conservative)

### 3. Scenario Defaults (If User Doesn't Enter)

If user doesn't provide discount rates, defaults are calculated:
- **Bear**: Base rate + 3% (more conservative)
- **Base**: Calculated CAPM rate
- **Bull**: Base rate - 2% (less conservative, minimum 5%)

## How It's Used in Calculation

The discount rate is used to discount **all future cash flows** to present value:

### For Each Year's Cash Flow:
```
Present Value = Cash Flow / (1 + discount_rate)^year
```

### For Terminal Value:
```
Terminal PV = Terminal Value / (1 + discount_rate)^projection_years
```

### Example Impact:

With 10-year projection and $100B terminal value:
- **10% discount**: Terminal PV = $38.55B
- **15% discount**: Terminal PV = $24.72B (36% lower)
- **20% discount**: Terminal PV = $16.15B (58% lower)
- **50% discount**: Terminal PV = $1.70B (96% lower)
- **100% discount**: Terminal PV = $0.10B (99.7% lower)

**The discount rate has a MASSIVE impact on fair value**, especially on the terminal value component.

## Why This Matters

1. **Higher discount rate = Lower fair value**
   - If you require 15% return vs 10%, you need to pay less today
   - This is the fundamental principle of DCF

2. **Terminal value is most sensitive**
   - Terminal value is typically 60-70% of total value
   - Small changes in discount rate cause large changes in terminal PV

3. **Early years are less sensitive**
   - Year 1 cash flow discounted at 10% vs 15%: 9% vs 8.7% (small difference)
   - Year 10 terminal value: 38.5% vs 24.7% (large difference)

## Current Implementation

✅ **Calculates discount rate using CAPM** (proper financial methodology)
✅ **Allows user override** (flexibility for different scenarios)
✅ **No arbitrary limits** (user can enter any discount rate)
✅ **No auto-correction** (user's values are respected)
✅ **Properly applied** (discounts all cash flows and terminal value)

## Formula Verification

The discount rate is used in:
1. **Annual cash flow discounting**: `PV = CF / (1 + r)^t`
2. **Terminal value discounting**: `Terminal PV = TV / (1 + r)^N`
3. **Gordon Growth Model** (if used): `TV = FCF × (1 + g) / (r - g)`

All formulas correctly use the discount rate to reduce future values to present value.
