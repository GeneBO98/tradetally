DELETE FROM web_mention_rules
WHERE source_ids && ARRAY(
  SELECT id
  FROM web_mention_sources
  WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases')
)::uuid[]
AND cardinality(source_ids) = (
  SELECT COUNT(*)
  FROM unnest(source_ids) AS source_id
  WHERE source_id = ANY(
    ARRAY(
      SELECT id
      FROM web_mention_sources
      WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases')
    )::uuid[]
  )
);

UPDATE web_mention_rules
SET source_ids = ARRAY(
  SELECT source_id
  FROM unnest(source_ids) AS source_id
  WHERE source_id <> ALL(
    ARRAY(
      SELECT id
      FROM web_mention_sources
      WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases')
    )::uuid[]
  )
)
WHERE source_ids && ARRAY(
  SELECT id
  FROM web_mention_sources
  WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases')
)::uuid[];

DELETE FROM web_mention_items
WHERE source_id IN (
  SELECT id
  FROM web_mention_sources
  WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases')
);

DELETE FROM web_mention_sources
WHERE name IN ('Nasdaq Market Headlines', 'Nasdaq Stocks News', 'U.S. Treasury Press Releases');
