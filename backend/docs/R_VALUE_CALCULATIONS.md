# R-Value and Management R Calculations

**IMPORTANT:** These calculations are critical to the trade management feature. Do not modify without careful consideration and testing.

**Last Updated:** 2026-01-30

---

## Core Concepts

### R (Risk Unit)
- **R = 1** represents the initial risk of the trade
- For **Long**: `R = entry_price - original_stop_loss`
- For **Short**: `R = original_stop_loss - entry_price`

### R-Multiple (Actual R)
The actual performance of the trade measured in risk units.

- For **Long**: `Actual R = (exit_price - entry_price) / R`
- For **Short**: `Actual R = (entry_price - exit_price) / R`

### Original Stop Loss
When calculating R values, always use the **original** stop loss (before any moves), not the current stop loss. The original stop loss is found by looking at the first entry in `risk_level_history` with `type: 'stop_loss'`.

---

## Weighted Target R (Potential R)

For trades with multiple take profit targets, calculate the weighted average of all target R values.

### Data Structures

Two possible data structures exist for take profit targets:

**Structure 1:** `take_profit_targets` contains ALL targets with explicit shares
```json
{
  "take_profit": 6885.5,
  "take_profit_targets": [
    {"price": 6885.5, "shares": 7},
    {"price": 6822.25, "shares": 1}
  ],
  "quantity": 8
}
```
Detection: `firstTargetPrice === take_profit` OR `sum(target.shares) >= quantity`

**Structure 2:** `take_profit` is TP1, `take_profit_targets` are additional targets
```json
{
  "take_profit": 105.00,
  "take_profit_targets": [
    {"price": 110.00, "shares": 1}
  ],
  "quantity": 8
}
```
TP1 shares = `quantity - sum(target.shares)`

### Formula

```
For each target:
  target_R = (target_price - entry) / R  [long]
  target_R = (entry - target_price) / R  [short]
  contribution = target_R * (shares / total_shares)

Weighted Target R = sum of all contributions
```

### Example (Short Trade)

- Entry: 6902.75, Original SL: 6909, Quantity: 8 contracts
- R = 6909 - 6902.75 = 6.25 points
- TP1: 6885.5 (7 contracts) → R = (6902.75 - 6885.5) / 6.25 = 2.76R
- TP2: 6822.25 (1 contract) → R = (6902.75 - 6822.25) / 6.25 = 12.88R

**Weighted Target R** = (2.76 × 7/8) + (12.88 × 1/8) = 2.415 + 1.61 = **4.025R**

---

## Management R

Management R measures how well the trade was managed relative to what was planned.

### SL Hit First

When the stop loss was hit before the final take profit target:

```
Management R = Saved R from SL moves
```

**Saved R Calculation:**
```
For each SL move in risk_level_history:
  distance_saved = old_SL - new_SL  [short: SL moved down = risk reduced]
  distance_saved = new_SL - old_SL  [long: SL moved up = risk reduced]

  r_saved_per_contract = distance_saved / original_R

  remaining_ratio = remaining_shares / total_shares
  (remaining_shares = contracts still open after partial exits)

  total_r_saved = r_saved_per_contract × remaining_ratio
```

**Example (Short Trade):**
- Original SL: 6909, New SL: 6902.5
- Distance saved = 6909 - 6902.5 = 6.5 points
- R saved per contract = 6.5 / 6.25 = 1.04R
- After TP1 (7/8 closed), remaining = 1/8 = 0.125
- **Management R = 1.04 × 0.125 = 0.13R**

### TP Hit First

When the take profit was hit before the stop loss:

```
Management R = Actual R - Weighted Target R
```

This measures how much better or worse you did compared to your potential.

**Example:**
- Actual R (weighted exit): 2.42R
- Weighted Target R: 4.025R
- **Management R = 2.42 - 4.025 = -1.61R** (missed potential)

---

## Implementation Files

| File | Function | Purpose |
|------|----------|---------|
| `backend/src/services/targetHitAnalysisService.js` | `calculateManagementR()` | Primary Management R calculation |
| `backend/src/services/targetHitAnalysisService.js` | `calculateWeightedTargetR()` | Weighted average target R |
| `backend/src/services/targetHitAnalysisService.js` | `calculateSLMoveImpact()` | Saved R from SL moves |
| `backend/src/controllers/tradeManagement.controller.js` | `calculateRMultiples()` | R-Multiple analysis (calls service) |
| `backend/recalculate_r_values.js` | `calculateRValue()` | Batch recalculation script |

---

## Key Rules

1. **Always use original stop loss** for R calculations, not current (moved) stop loss
2. **Detect data structure** before calculating weighted target R
3. **SL Hit First** = Saved R only (not Actual R - Planned R)
4. **TP Hit First** = Actual R - Weighted Target R
5. **Infer remaining ratio** from partial exits when not stored in history

---

## Test Case

Use this data to verify calculations:

```javascript
const trade = {
  entry_price: 6902.75,
  exit_price: 6887.63,
  stop_loss: 6902.5,  // Moved from 6909
  take_profit: 6885.5,
  take_profit_targets: [
    {price: 6885.5, shares: 7},
    {price: 6822.25, shares: 1}
  ],
  quantity: 8,
  side: 'short',
  risk_level_history: [
    {type: 'stop_loss', old_value: 6909, new_value: 6902.5}
  ]
};

// Expected Results:
// R (risk unit) = 6.25 points
// Weighted Target R = 4.025R
// SL Hit First → Management R = 0.13R
// TP Hit First → Management R = -1.61R
```
