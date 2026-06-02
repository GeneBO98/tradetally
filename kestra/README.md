# Kestra CRM Flows

This directory contains the first-phase Kestra flows for TradeTally CRM orchestration.

## What moved

- Manual full CRM reconciliation across Twenty and Invoice Ninja
- Scheduled Twenty-only reconciliation every 6 hours
- Scheduled Invoice Ninja-only reconciliation every 6 hours on a 15-minute offset
- Optional single-user sync API entrypoints in the backend for later event-driven expansion

## Cutover

1. Set `KESTRA_INTERNAL_API_SECRET` in the TradeTally app and in Kestra.
2. Bring up the `kestra` profile from `docker-compose.yaml`.
3. Import the flows from `kestra/flows/`.
4. Verify the flows can call `GET /api/internal/kestra/crm-sync/status`.
5. Keep `ENABLE_CRM_SYNC=false` in the backend runtime after cutover.

## Notes

- `n8n` is intentionally out of scope.
- GrowthBook remains in-app and is not orchestrated by Kestra.
- The backend remains the source of truth for CRM field mapping and sync logic in phase 1.
- `crm-sync.yml` is the manual all-target flow.
- `crm-sync-twenty.yml` is the scheduled Twenty-only flow.
- `crm-sync-invoice-ninja.yml` is the scheduled Invoice Ninja-only flow.
