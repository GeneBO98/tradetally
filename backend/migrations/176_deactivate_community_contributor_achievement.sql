-- The "Community Contributor" achievement is unearnable: it requires participation
-- in 3 community challenges, but no community challenges (is_community = true) have
-- ever been seeded. Hide it until the community challenges feature is actually built.
UPDATE achievements
SET is_active = false
WHERE key = 'community_contributor';
