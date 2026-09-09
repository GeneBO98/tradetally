# IBKR multi-leg option grouping

Include `BrokerageOrderID` in the Flex report's Trades fields, with execution-level
rows. CSV imports and Flex XML broker sync preserve it as `brokerage_order_id` on
each execution. Leg-level `order_id`, `execution_id`, and `trade_id` remain separate;
a shared brokerage order ID must never be used to deduplicate fills.

Strategy detection uses the opening fills' brokerage order ID, scoped to broker,
account, and underlying. Matching legs can fill more than five minutes apart or
have different expirations. Closing fills retain their own order IDs and match the
existing contracts; closing an assortment of positions together does not regroup
their openings.

Different known opening orders are never paired by timestamp. A trade containing
several opening orders, or a mixture of known and missing opening IDs, remains
ungrouped rather than being assigned to one of those orders. Orders with unequal
leg quantities retain a generic multi-leg label instead of an equal-ratio strategy
label. Legs without opening-order evidence retain the existing time-based rules.
Analytics and AI summaries also keep ungrouped trades with broker order evidence
separate, rather than merging them through the legacy timestamp fallback.

The whole-trade grouping setting still controls grouped display and analytics.
Existing imports that did not preserve this field continue to use time-based
detection. This change does not reconstruct missing order IDs or add them to
previously imported fills through duplicate reimports.

Regression coverage uses anonymized order, trade, and execution IDs from issue
#405's opening and closing CSV examples in
`tests/fixtures/trading-calculation-contracts.json`. Tests cover separate imports,
Flex XML, delayed fills, order boundaries, and real-Postgres grouping and analytics.
