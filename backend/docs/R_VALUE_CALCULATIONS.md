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

**Core Formula:** `Management R = Actual R - Planned R`

| Scenario | Planned R | Description |
|----------|-----------|-------------|
| **SL Hit First** (no partial exits) | -1R | Full position would have stopped out |
| **SL Hit First** (with partial exits) | TP1 contribution + (remaining × -1R) | TP1 captured, remaining would have stopped |
| **TP Hit First** | Weighted Target R | All targets hit perfectly |

### SL Hit First

When the stop loss was hit before the final take profit target:

```
Management R = Actual R - Planned R
```

**No Partial Exits:**
- Planned R = -1R (full stop out)
- Example: Entry 100, SL 90, Exit 102 (long)
  - Risk = 10 points
  - Actual R = (102 - 100) / 10 = +0.2R
  - Planned R = -1R
  - **Management R = 0.2 - (-1) = +1.2R** (exited 1.2R better than planned)

**With Partial Exits:**
- Planned R = (TP1_R × TP1_ratio) + (remaining_ratio × -1R)
- Example (Short Trade):
  - Entry: 6902.75, Original SL: 6909, Quantity: 8 contracts
  - TP1 hit: 7 contracts at 2.76R → contribution = 2.76 × (7/8) = 2.415R
  - Remaining: 1 contract (1/8 = 0.125)
  - Planned R = 2.415 + (0.125 × -1) = 2.29R
  - Actual R = 2.42R (weighted exit)
  - **Management R = 2.42 - 2.29 = +0.13R**

**Key Insight:** SL Move Impact (R saved from moving stops) is already captured in the Actual R vs Planned R difference. A moved stop loss changes the exit price, which changes Actual R, which is compared against the Planned R (based on original stop).

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
3. **SL Hit First** = Actual R - Planned R (where Planned R = -1R for no partials, or TP1 contribution + remaining × -1R)
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
