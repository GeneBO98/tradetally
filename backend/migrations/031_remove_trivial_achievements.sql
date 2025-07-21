-- Remove trivial achievements that aren't meaningful

-- Remove "Getting Started" and "Committed Trader" as they're not real achievements
DELETE FROM user_achievements WHERE achievement_id IN (
  SELECT id FROM achievements WHERE key IN ('second_trade', 'fifth_trade')
);

DELETE FROM achievements WHERE key IN ('second_trade', 'fifth_trade');

-- Keep only meaningful trade milestones
-- Update the descriptions for remaining trade achievements to be more meaningful
UPDATE achievements 
SET 
  name = 'First Steps',
  description = 'Log your very first trade - welcome to your trading journey!'
WHERE key = 'first_trade_logged';

UPDATE achievements 
SET 
  name = 'Getting Serious', 
  description = 'Log your 10th trade - you are building consistency!'
WHERE key = 'tenth_trade';

UPDATE achievements 
SET 
  name = 'Dedicated Trader',
  description = 'Log 100 trades - you are committed to improving your craft!'
WHERE key = 'century_trader';

UPDATE achievements 
SET 
  name = 'Master Trader',
  description = 'Log 1000 trades - you have reached mastery level!'
WHERE key = 'veteran_trader';