-- Merge duplicate Stripe subscription rows so each user has a single canonical record.
WITH ranked AS (
    SELECT
        s.*,
        ROW_NUMBER() OVER (
            PARTITION BY s.user_id
            ORDER BY
                CASE
                    WHEN s.status = 'active' THEN 1
                    WHEN s.status = 'trialing' THEN 2
                    WHEN s.status = 'canceled' THEN 3
                    ELSE 4
                END,
                (s.stripe_subscription_id IS NOT NULL) DESC,
                s.updated_at DESC NULLS LAST,
                s.created_at DESC NULLS LAST,
                s.id DESC
        ) AS row_rank
    FROM subscriptions s
),
merged AS (
    SELECT
        r.user_id,
        (ARRAY_AGG(r.id ORDER BY r.row_rank, r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC))[1] AS keep_id,
        (ARRAY_AGG(r.stripe_customer_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_customer_id IS NOT NULL))[1] AS stripe_customer_id,
        (ARRAY_AGG(r.stripe_subscription_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_subscription_id IS NOT NULL))[1] AS stripe_subscription_id,
        (ARRAY_AGG(r.stripe_price_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_price_id IS NOT NULL))[1] AS stripe_price_id,
        (ARRAY_AGG(r.status ORDER BY r.row_rank, r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC))[1] AS status,
        (ARRAY_AGG(r.current_period_start ORDER BY r.current_period_start DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.current_period_start IS NOT NULL))[1] AS current_period_start,
        (ARRAY_AGG(r.current_period_end ORDER BY r.current_period_end DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.current_period_end IS NOT NULL))[1] AS current_period_end,
        BOOL_OR(COALESCE(r.cancel_at_period_end, FALSE)) AS cancel_at_period_end,
        MAX(r.canceled_at) AS canceled_at,
        MAX(r.updated_at) AS latest_updated_at
    FROM ranked r
    GROUP BY r.user_id
)
UPDATE subscriptions s
SET
    stripe_customer_id = NULL,
    stripe_subscription_id = NULL
FROM (
    SELECT id
    FROM ranked
    WHERE row_rank > 1
) duplicates
WHERE s.id = duplicates.id;

WITH ranked AS (
    SELECT
        s.*,
        ROW_NUMBER() OVER (
            PARTITION BY s.user_id
            ORDER BY
                CASE
                    WHEN s.status = 'active' THEN 1
                    WHEN s.status = 'trialing' THEN 2
                    WHEN s.status = 'canceled' THEN 3
                    ELSE 4
                END,
                (s.stripe_subscription_id IS NOT NULL) DESC,
                s.updated_at DESC NULLS LAST,
                s.created_at DESC NULLS LAST,
                s.id DESC
        ) AS row_rank
    FROM subscriptions s
),
merged AS (
    SELECT
        r.user_id,
        (ARRAY_AGG(r.id ORDER BY r.row_rank, r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC))[1] AS keep_id,
        (ARRAY_AGG(r.stripe_customer_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_customer_id IS NOT NULL))[1] AS stripe_customer_id,
        (ARRAY_AGG(r.stripe_subscription_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_subscription_id IS NOT NULL))[1] AS stripe_subscription_id,
        (ARRAY_AGG(r.stripe_price_id ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.stripe_price_id IS NOT NULL))[1] AS stripe_price_id,
        (ARRAY_AGG(r.status ORDER BY r.row_rank, r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC))[1] AS status,
        (ARRAY_AGG(r.current_period_start ORDER BY r.current_period_start DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.current_period_start IS NOT NULL))[1] AS current_period_start,
        (ARRAY_AGG(r.current_period_end ORDER BY r.current_period_end DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.id DESC)
            FILTER (WHERE r.current_period_end IS NOT NULL))[1] AS current_period_end,
        BOOL_OR(COALESCE(r.cancel_at_period_end, FALSE)) AS cancel_at_period_end,
        MAX(r.canceled_at) AS canceled_at,
        MAX(r.updated_at) AS latest_updated_at
    FROM ranked r
    GROUP BY r.user_id
)
UPDATE subscriptions s
SET
    stripe_customer_id = CASE
        WHEN m.stripe_customer_id IS NULL THEN s.stripe_customer_id
        WHEN EXISTS (
            SELECT 1
            FROM subscriptions other
            WHERE other.stripe_customer_id = m.stripe_customer_id
              AND other.user_id <> s.user_id
        ) THEN s.stripe_customer_id
        ELSE m.stripe_customer_id
    END,
    stripe_subscription_id = CASE
        WHEN m.stripe_subscription_id IS NULL THEN s.stripe_subscription_id
        WHEN EXISTS (
            SELECT 1
            FROM subscriptions other
            WHERE other.stripe_subscription_id = m.stripe_subscription_id
              AND other.user_id <> s.user_id
        ) THEN s.stripe_subscription_id
        ELSE m.stripe_subscription_id
    END,
    stripe_price_id = COALESCE(m.stripe_price_id, s.stripe_price_id),
    status = COALESCE(m.status, s.status),
    current_period_start = COALESCE(m.current_period_start, s.current_period_start),
    current_period_end = COALESCE(m.current_period_end, s.current_period_end),
    cancel_at_period_end = COALESCE(m.cancel_at_period_end, s.cancel_at_period_end),
    canceled_at = COALESCE(m.canceled_at, s.canceled_at),
    updated_at = COALESCE(m.latest_updated_at, CURRENT_TIMESTAMP)
FROM merged m
WHERE s.id = m.keep_id;

DELETE FROM subscriptions s
USING (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY user_id
                ORDER BY
                    CASE
                        WHEN status = 'active' THEN 1
                        WHEN status = 'trialing' THEN 2
                        WHEN status = 'canceled' THEN 3
                        ELSE 4
                    END,
                    (stripe_subscription_id IS NOT NULL) DESC,
                    updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
            ) AS row_rank
        FROM subscriptions
    ) ranked
    WHERE ranked.row_rank > 1
) duplicates
WHERE s.id = duplicates.id;

DROP INDEX IF EXISTS idx_subscriptions_user_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique ON subscriptions(user_id);
