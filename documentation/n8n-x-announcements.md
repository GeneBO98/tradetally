# n8n X.com Announcement Workflow

This workflow is the handoff point for TradeTally release and feature announcements.

## What It Does

TradeTally posts a structured payload to n8n with:
- version or feature metadata
- release highlights
- the intended campaign voice
- a CTA URL

n8n then turns that into social copy and either:
- sends it to a human review step, or
- posts to X.com if the workflow is set to auto-publish

## Recommended Workflow Shape

1. `Webhook` node receives the payload from `backend/scripts/send_release_announcement.js`
2. `Set` or `Code` node formats a marketing brief
3. `LLM` or `OpenAI` node writes the post in TradeTally voice
4. `Review` step for approval, if you want a human gate
5. `HTTP Request` or X/Twitter node publishes the post

## Payload Fields

The sender script provides:
- `announcementType`
- `version`
- `title`
- `releasedAt`
- `highlights`
- `upgradeNotes`
- `featureName`
- `featureBenefit`
- `ctaUrl`
- `campaignBrief`

## Setup Notes

Set these env vars in `backend/.env`:
- `N8N_ANNOUNCEMENT_WEBHOOK_URL`
- `N8N_ANNOUNCEMENT_SECRET`
- `TRADETALLY_PUBLIC_URL`

Then test a dry run:

```bash
cd backend
npm run announce:release -- --release-file ../documentation/releases/v2.5.2.md --dry-run
```

When the payload looks right, send it to n8n:

```bash
cd backend
npm run announce:release -- --release-file ../documentation/releases/v2.5.2.md --type version
```
