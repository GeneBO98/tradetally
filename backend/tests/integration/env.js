// Environment for the opt-in real-Postgres integration suite.
//
// Runs as a Jest setupFile (before any module loads) so config/database picks
// up the scratch database. The suite only runs via `npm run test:integration`
// with TEST_DATABASE_URL set, e.g.:
//   TEST_DATABASE_URL=postgres://tradetally:testpass@localhost:5440/tradetally_test
//
// NEVER point TEST_DATABASE_URL at a real database — the suite truncates
// tables between tests.

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required for the integration suite. ' +
    'Run a scratch Postgres (e.g. docker run -d -p 5440:5432 -e POSTGRES_USER=tradetally ' +
    '-e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=tradetally_test postgres:16-alpine) and set ' +
    'TEST_DATABASE_URL=postgres://tradetally:testpass@localhost:5440/tradetally_test'
  );
}

const url = new URL(process.env.TEST_DATABASE_URL);

process.env.DB_HOST = url.hostname;
process.env.DB_PORT = url.port || '5432';
process.env.DB_NAME = url.pathname.replace(/^\//, '');
process.env.DB_USER = decodeURIComponent(url.username);
process.env.DB_PASSWORD = decodeURIComponent(url.password);

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1h';
process.env.DB_POOL_SIZE = process.env.DB_POOL_SIZE || '10';

// dotenv loads backend/.env without overriding pre-set vars, so everything a
// developer's local .env could leak into the suite must be pinned here BEFORE
// any app module loads. Keep the suite hermetic: no schedulers, no external
// API calls, and always apply the base schema to the scratch database.
process.env.SKIP_BASE_SCHEMA = 'false';
process.env.RUN_MIGRATIONS = 'true';
process.env.DISABLE_BACKGROUND_JOBS = 'true';
process.env.ENABLE_STOCK_SPLIT_MONITORING = 'false';
process.env.ENABLE_PLAID_SYNC_SCHEDULER = 'false';
process.env.BROKER_ENCRYPTION_KEY = 'integration-test-encryption-key-0001';
process.env.FINNHUB_API_KEY = '';
process.env.ALPHA_VANTAGE_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.EMAIL_PROVIDER = '';
process.env.PLAID_CLIENT_ID = '';
process.env.PLAID_SECRET = '';
process.env.SCHWAB_CLIENT_ID = '';
process.env.SCHWAB_CLIENT_SECRET = '';
process.env.POSTHOG_API_KEY = '';
process.env.DEV_SCOPED_USER_EMAIL = '';
