# PostHog Telemetry Setup

This backend has been configured to optionally send logs to PostHog using their batch API.

## Setup

1. **Configure Environment Variables**:
   Ensure your `.env` file contains:
   ```
   VITE_POSTHOG_KEY=phc_45FhZD0bI110gyeQp5rf9eADyVKen6DE1bdU5LJTfML
   VITE_POSTHOG_HOST=https://us.posthog.com
   ```

2. **Start the Server**:
   ```bash
   npm run dev
   # or
   npm start
   ```

## How It Works

- The `posthog-telemetry.js` module initializes PostHog logging when the server starts
- If a PostHog key is configured in the environment, logs will be sent to PostHog
- Logs are batched and sent every 5 seconds or when 50 logs accumulate
- All existing logger calls are automatically captured and sent to PostHog as `backend_log` events
- Each server instance has a unique ID for tracking

## Files Added

- `src/posthog-telemetry.js` - PostHog telemetry module (no external dependencies needed!)
- Modified `src/server.js` - Added telemetry initialization

## What Gets Logged

All logs are sent as `backend_log` events with the following properties:
- `level` - Log level (error, warn, info, debug)
- `message` - The log message
- `category` - Log category
- `server_id` - Unique server instance identifier
- `hostname` - Server hostname
- `pid` - Process ID
- `environment` - Current environment (production/development)
- `timestamp` - When the log occurred
- Any extra properties passed to the logger

## Removing Telemetry

To disable telemetry, simply remove the PostHog key from `.env`.

The application will continue to work normally without telemetry.