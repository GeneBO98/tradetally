-- Normalize health_data.data_type values to snake_case.
-- The iOS app historically submitted heartRate; backend analytics and external
-- wearable APIs use heart_rate.

DELETE FROM health_data legacy
USING health_data canonical
WHERE legacy.data_type = 'heartRate'
  AND canonical.data_type = 'heart_rate'
  AND legacy.user_id = canonical.user_id
  AND legacy.timestamp IS NOT NULL
  AND canonical.timestamp IS NOT NULL
  AND legacy.timestamp = canonical.timestamp;

DELETE FROM health_data legacy
USING health_data canonical
WHERE legacy.data_type = 'heartRate'
  AND canonical.data_type = 'heart_rate'
  AND legacy.user_id = canonical.user_id
  AND legacy.timestamp IS NULL
  AND canonical.timestamp IS NULL
  AND legacy.date = canonical.date;

UPDATE health_data
SET data_type = 'heart_rate'
WHERE data_type = 'heartRate';
