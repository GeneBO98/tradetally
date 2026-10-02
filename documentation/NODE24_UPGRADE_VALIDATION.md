# Node.js 24 Upgrade Validation

Validated on October 2, 2026, against `develop` at `20ca2874` plus this runtime upgrade.

## Changes

- Node.js **24.21.0** replaces **20.19.5** in all three Docker stages. The base image uses Alpine **3.23**, an available Node 24 variant for both supported architectures.
- `.nvmrc` pins 24.21.0; both GitHub Actions workflows read that file.
- Root, backend, and frontend manifests require Node.js 24.21.0 or newer.
- The native migration script installs Node 24 and detects existing runtimes below the new minimum. Installation instructions include upgrading PM2's runtime and startup service.
- CI now enables the optional PostgreSQL fee-profile tests alongside the backend unit suite.
- pnpm remains at 10.34.5. Dependency declarations, the lockfile, application release versions, and trading calculations are unchanged.

The macOS runtime download was checked against the [official SHA-256 manifest](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt). The Docker image manifest was checked for amd64 and arm64 support before building.

## Automated test results

| Environment | Timezone | Backend tests | PostgreSQL integration tests | Frontend tests |
| --- | --- | --- | --- | --- |
| macOS arm64 | America/Chicago | 1,883 passed in 248 suites | 28 passed in 10 suites | 295 passed in 50 files |
| Linux arm64, Alpine 3.23 | America/Chicago | 1,883 passed in 248 suites | 28 passed in 10 suites | Production build passed |
| Linux amd64, Alpine 3.23, QEMU emulation | UTC | 1,883 passed in 248 suites | 28 passed in 10 suites | Production build passed |

All runs used Node.js 24.21.0. There were no failed or skipped tests in the final runs. This covers 2,206 unique automated tests, with the backend and integration suites repeated on both Linux architectures. Each backend run included the two optional fee-profile PostgreSQL tests.

Dependencies were installed with the frozen lockfile in an isolated source copy. Database tests used disposable PostgreSQL 16 databases. Shared repository fixtures and Nginx configuration were included when running tests inside the backend builder images.

The integration suites cover real SQL and application behavior for CSV imports, duplicate detection, analytics, option grouping, R-values, REST retries, trade allocations, backup restoration, public trade filtering, and news notification deduplication.

## Additional runtime and deployment checks

Both complete production Docker images built and started successfully. Each applied all 275 migration files to a fresh database. The backend ran as `appuser`, and the frontend was served through Nginx.

The following checks passed on both Linux architectures:

- Frontend HTML, hashed JavaScript assets, gzip compression, CSP headers, SPA route fallback, and generated runtime configuration.
- Database health, registration, incorrect-password rejection, password login, JWT authentication, cookie authentication, trade list, and analytics endpoints.
- Actual WebAuthn registration and login option endpoints, random challenges, passkey listing, and CSRF rejection.
- Forty concurrent health requests and twenty concurrent authenticated requests per architecture. These are correctness checks, not capacity benchmarks.
- Native bcrypt password hashing and verification.
- Native Sharp/libvips SVG text rendering, resizing, PNG, JPEG, and WebP encoding.
- WebAuthn and JOSE ESM loading, cryptographic challenge generation, and ES256 JWT signing/verification.
- APNs notification payload construction and HTTP/2 over TLS against a local server.
- The application's SMTP transporter authenticating and delivering to a local test server.
- Cron execution and cleanup with the America/Chicago timezone; child process spawning and SIGTERM handling.
- Direct SIGTERM shutdown of the actual backend process, including scheduler cleanup.

The same dependency smoke checks passed on macOS arm64. Vite development and preview servers started under Node 24 and served their entrypoints and SPA routes. Shell syntax, workflow YAML, version consistency, installer version boundaries, and `git diff --check` also passed.

## Nonfatal warnings and limits

- The integration harness uses its existing `forceExit: true` setting. Some runs logged a job-queue poll after the database pool closed. All assertions passed and the runs exited successfully; asynchronous test teardown remains a cleanup opportunity.
- Frontend component tests emitted Vue warnings from component stubs and DOM properties.
- pnpm reported the existing blocked `unrs-resolver` build script. The legacy production deploy step also warned about a missing `browserslist` executable link and deprecated transitive packages. The builds and runtime checks succeeded.
- Live broker OAuth/sync, authenticated APNs delivery, physical passkey authenticators, and external SMTP delivery were not exercised. Broker logic and push behavior were covered by existing tests; SMTP and TLS transport checks used local servers.
- Linux amd64 was tested under emulation on an arm64 host. Timing results should not be used as native amd64 performance measurements.
- The Ubuntu/Debian installer was checked for syntax and version-selection behavior; its system package installation and PM2 service changes were not executed on the macOS host.

## Reproducing the primary checks

Select the pinned Node version and use a scratch database only:

```bash
nvm install
nvm use
pnpm install --frozen-lockfile

docker run -d --name tradetally-node24-pg -p 127.0.0.1:5447:5432 \
  -e POSTGRES_USER=tradetally -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=tradetally_test postgres:16-alpine

# Wait for pg_isready before running database tests.
docker exec tradetally-node24-pg pg_isready -U tradetally -d tradetally_test

FEE_PROFILE_TEST_DATABASE_URL=postgres://tradetally:testpass@127.0.0.1:5447/tradetally_test \
  pnpm --dir backend test --runInBand

TEST_DATABASE_URL=postgres://tradetally:testpass@127.0.0.1:5447/tradetally_test \
  pnpm --dir backend test:integration

pnpm --dir frontend test:run
pnpm --dir frontend run build

docker buildx build --platform linux/arm64 --load -t tradetally:node24-check-arm64 .
docker buildx build --platform linux/amd64 --load -t tradetally:node24-check-amd64 .

docker rm -fv tradetally-node24-pg
```

Local JSON results, build logs, server logs, and the temporary smoke-test scripts are retained in the ignored `.tmp/node24-validation/` directory. Disposable containers, databases, and test networks were removed after verification.
