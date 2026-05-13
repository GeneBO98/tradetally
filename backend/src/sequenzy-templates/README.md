# Sequenzy Templates

These files are paste-ready HTML templates for Sequenzy.

Conventions:
- Template variables use `{{snake_case}}`.
- Subjects, `from`, and `reply-to` should be configured in Sequenzy where possible.
- Dynamic URLs, counts, names, money, and unsubscribe links should be sent from TradeTally as variables.

Suggested slugs and variables:

`email-verification.html`
- Slug: `email-verification`
- Vars: `verification_url`

`password-reset.html`
- Slug: `password-reset`
- Vars: `reset_url`

`email-change-verification.html`
- Slug: `email-change-verification`
- Vars: `verification_url`

`trial-expiration.html`
- Slug: `trial-expiration`
- Vars: `headline`, `username`, `body_text`, `cta_url`, `cta_text`, `footnote`, `marketing_unsubscribe_url`

`weekly-digest.html`
- Slug: `weekly-digest`
- Vars: `username`, `trade_count`, `total_pnl`, `pnl_color`, `dashboard_url`, `marketing_unsubscribe_url`

`reengagement.html`
- Slug: `reengagement`
- Vars: `username`, `days_inactive`, `login_url`, `marketing_unsubscribe_url`

`at-risk-followup.html`
- Slug: `at-risk-followup`
- Vars: `headline`, `greeting`, `body_text`, `feature_1`, `feature_2`, `feature_3`, `dashboard_url`, `cta_text`, `marketing_unsubscribe_url`

`churned-no-imports-followup.html`
- Slug: `churned-no-imports-followup`
- Vars: `headline`, `greeting`, `body_text`, `status_note`, `import_url`, `cta_text`, `marketing_unsubscribe_url`

`trial-conversion.html`
- Slug: `trial-conversion`
- Vars: `headline`, `greeting`, `trade_count`, `win_rate`, `total_pnl`, `pnl_color`, `body_text`, `upgrade_url`, `cta_text`, `feedback_url_1`, `feedback_label_1`, `feedback_url_2`, `feedback_label_2`, `feedback_url_3`, `feedback_label_3`, `feedback_url_4`, `feedback_label_4`, `feedback_url_5`, `feedback_label_5`, `feedback_url_6`, `feedback_label_6`, `feedback_url_7`, `feedback_label_7`, `feedback_url_8`, `feedback_label_8`, `marketing_unsubscribe_url`

`review-request.html`
- Slug: `review-request`
- Vars: `username`, `review_url`, `marketing_unsubscribe_url`

`subscription-welcome.html`
- Slug: `subscription-welcome`
- Vars: `username`, `plan_name`, `support_email`, `dashboard_url`

`support-request.html`
- Slug: `support-request`
- Vars: `username`, `user_email`, `tier`, `support_subject`, `message_html`
