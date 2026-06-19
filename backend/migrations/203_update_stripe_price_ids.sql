-- Update Pro plan Stripe price IDs.
INSERT INTO admin_settings (setting_key, setting_value) VALUES
  ('stripe_price_id_monthly', 'price_1TViHpLaCqNEHzDFBIXiDCgM'),
  ('stripe_price_id_yearly', 'price_1TdxfoLaCqNEHzDFVBcfpIxb')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;
