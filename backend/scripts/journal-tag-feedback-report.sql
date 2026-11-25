-- Read-only: ttq -f backend/scripts/journal-tag-feedback-report.sql
WITH offered AS (
  SELECT r.id,r.provider,r.model,r.classifier_version,d->>'tag' AS tag
  FROM journal_tag_suggestion_runs r, jsonb_array_elements(r.decisions) d
  WHERE r.expires_at>NOW() AND r.shown_at IS NOT NULL AND (d->>'suggested')::boolean
), latest_save AS (
  SELECT DISTINCT ON (f.run_id,f.tag) f.run_id,f.tag,f.action
  FROM journal_tag_suggestion_feedback f
  WHERE f.action IN ('saved_accepted','saved_not_selected')
  ORDER BY f.run_id,f.tag,f.created_at DESC,f.id DESC
)
SELECT o.provider,o.model,o.classifier_version,o.tag,
  COUNT(*) AS shown,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM journal_tag_suggestion_feedback f
    WHERE f.run_id=o.id AND f.tag=o.tag AND f.action='dismissed')) AS dismissed,
  COUNT(*) FILTER (WHERE s.action='saved_accepted') AS saved_with_tag,
  COUNT(*) FILTER (WHERE s.action='saved_not_selected') AS saved_without_tag,
  COUNT(*) FILTER (WHERE s.action IS NULL) AS no_saved_outcome
FROM offered o LEFT JOIN latest_save s ON s.run_id=o.id AND s.tag=o.tag
GROUP BY o.provider,o.model,o.classifier_version,o.tag
ORDER BY shown DESC;
