# Pricing Experiments

TradeTally supports a GrowthBook-driven monthly pricing experiment on the web pricing page.

## Current experiment

- GrowthBook feature key: `pricing_monthly_offer`
- Control value: `control`
- Variant value: `higher_price`
- Control Stripe price setting: `stripe_price_id_monthly`
- Variant Stripe price setting: `stripe_price_id_monthly_experiment`

## Recommended setup for an $8 vs $12 test

1. Create a second Stripe monthly price at `$12/month` for the same product.
2. Save that Stripe price ID in `admin_settings.setting_key = 'stripe_price_id_monthly_experiment'`.
3. In GrowthBook, create a feature experiment on `pricing_monthly_offer`.
4. Use string values:
   - `control`
   - `higher_price`
5. Start with a 50/50 split unless you want to limit revenue risk during the first few hundred visitors.

## What the app does

- `/pricing` reads the GrowthBook assignment and swaps the visible monthly price.
- Checkout uses the assigned Stripe price ID, not just the displayed copy.
- Checkout is restricted to configured Stripe price IDs only.
- Stripe checkout metadata includes:
  - `pricing_experiment_key`
  - `pricing_experiment_variant`
  - `pricing_displayed_amount`
  - `pricing_displayed_currency`
- PostHog checkout-start tracking emits `pricing_checkout_started`.

## Notes

- If `stripe_price_id_monthly_experiment` is missing, the app falls back to the control monthly price.
- The pricing page still uses the normal yearly Stripe price from `stripe_price_id_yearly`.
- Keep the page layout and feature list stable while testing price so the experiment isolates willingness to pay rather than design changes.
