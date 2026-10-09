-- Dollar-based defaults could produce a nonpositive long stop when configured
-- risk exceeded the position value. Such a price cannot define R and must not
-- remain on a trade. Setup quality and MAE/MFE do not use stop_loss.
UPDATE trades
SET stop_loss = NULL,
    r_value = NULL,
    updated_at = NOW()
WHERE stop_loss <= 0;

DELETE FROM analytics_cache;
