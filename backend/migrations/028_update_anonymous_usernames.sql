-- Update anonymous username generation to use Xbox/Epic Games style names
-- Two words that make sense together, like ShadowHunter, IronWolf, etc.

CREATE OR REPLACE FUNCTION generate_anonymous_name(user_id UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
  prefixes TEXT[] := ARRAY[
    'Shadow', 'Iron', 'Storm', 'Fire', 'Ice', 'Thunder', 'Lightning', 'Dark', 'Bright', 'Silent',
    'Swift', 'Mighty', 'Golden', 'Silver', 'Crimson', 'Azure', 'Emerald', 'Mystic', 'Phantom', 'Stealth',
    'Cyber', 'Neon', 'Quantum', 'Alpha', 'Beta', 'Omega', 'Prime', 'Ultra', 'Mega', 'Hyper',
    'Rogue', 'Elite', 'Savage', 'Wild', 'Fierce', 'Brutal', 'Rapid', 'Turbo', 'Blazing', 'Frozen',
    'Venom', 'Toxic', 'Nuclear', 'Laser', 'Plasma', 'Cosmic', 'Stellar', 'Solar', 'Lunar', 'Nova'
  ];
  
  suffixes TEXT[] := ARRAY[
    'Hunter', 'Wolf', 'Eagle', 'Hawk', 'Tiger', 'Lion', 'Bear', 'Fox', 'Viper', 'Falcon',
    'Warrior', 'Knight', 'Ranger', 'Scout', 'Sniper', 'Assassin', 'Guardian', 'Sentinel', 'Defender', 'Striker',
    'Blade', 'Arrow', 'Bullet', 'Bolt', 'Spike', 'Claw', 'Fang', 'Talon', 'Wing', 'Shield',
    'Storm', 'Blaze', 'Frost', 'Flame', 'Spark', 'Flash', 'Dash', 'Rush', 'Crush', 'Smash',
    'Force', 'Power', 'Might', 'Fury', 'Rage', 'Wrath', 'Steel', 'Stone', 'Rock', 'Crystal'
  ];
  
  hash_value INTEGER;
  prefix_index INTEGER;
  suffix_index INTEGER;
BEGIN
  -- Generate a consistent hash from user_id
  hash_value := abs(hashtext(user_id::text));
  
  -- Use hash to select prefix and suffix with different modulo operations for variety
  prefix_index := (hash_value % array_length(prefixes, 1)) + 1;
  suffix_index := ((hash_value / 13) % array_length(suffixes, 1)) + 1;
  
  -- Return combined username without spaces (like ShadowHunter, IronWolf, etc.)
  RETURN prefixes[prefix_index] || suffixes[suffix_index];
END;
$$ LANGUAGE plpgsql IMMUTABLE;