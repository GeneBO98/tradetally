-- 1. Challenges are now generated per week/month from templates in
--    challengeService. Remove expired challenges nobody ever joined: the
--    old seed rows and the duplicated "Weekly Revenge Trading Challenge" rows
--    the scheduler created on every run (its "< 2 active" check could never
--    be satisfied by the single challenge it created).
DELETE FROM challenges c
WHERE c.end_date < CURRENT_TIMESTAMP
  AND NOT EXISTS (SELECT 1 FROM user_challenges uc WHERE uc.challenge_id = c.id);

-- 2. The gamification maintenance task used to overwrite levels with
--    FLOOR(xp / 1000) + 1, disagreeing with the curve used everywhere else
--    (level 2 at 100 XP, 3 at 200, 4 at 350, 5 at 550, ...). For L >= 2,
--    level L starts at 25L^2 - 25L + 50 XP, so for xp >= 100
--    L = floor((1 + sqrt(4 * xp / 25 - 7)) / 2); below 100 XP it is level 1.
UPDATE user_gamification_stats
SET level = (CASE WHEN COALESCE(experience_points, 0) < 100 THEN 1 ELSE FLOOR((1 + SQRT(4 * experience_points / 25.0 - 7)) / 2) END)::int,
    updated_at = CURRENT_TIMESTAMP
WHERE level IS DISTINCT FROM (CASE WHEN COALESCE(experience_points, 0) < 100 THEN 1 ELSE FLOOR((1 + SQRT(4 * experience_points / 25.0 - 7)) / 2) END)::int;
