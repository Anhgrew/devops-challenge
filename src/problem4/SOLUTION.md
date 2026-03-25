## What Problems I Found

* nginx was routing `/api` to the wrong port (`3001` instead of `3000`), causing all API requests to fail.
* The API started before PostgreSQL and Redis were ready, leading to connection errors at startup.
* PostgreSQL initialization script (`init.sql`) was not mounted, so it never executed.
* The API had no retry mechanism for database and Redis connections, making it fragile on startup failures.

---

## How I Diagnosed Them

* Reviewed nginx configuration and API service settings to identify the port mismatch.
* Checked API container logs and observed connection failures during startup.
* Inspected `docker-compose.yml` and confirmed missing volume mapping for the PostgreSQL init script.
* Reproduced the issue by restarting the stack and observing inconsistent API startup behavior.

---

## The Fixes I Applied

* Updated nginx `proxy_pass` to use the correct API port (`3000`).
* Mounted `./postgres/init.sql` into `/docker-entrypoint-initdb.d/` so it runs on initialization.
* Added health checks for PostgreSQL and Redis in `docker-compose.yml`.
* Configured the API service to wait for dependencies using `condition: service_healthy`.
* Implemented retry logic with backoff for PostgreSQL and Redis connections in the API.

---

## What Monitoring / Alerts I Would Add

* Add `/health` or `/ready` endpoint to verify database and Redis connectivity.
* Alert when API returns high 5xx error rates or becomes unreachable.
* Monitor database connection pool usage and alert on saturation.
* Track API latency (p95/p99) and alert on degradation.

---

## How I Would Prevent This in Production

* Use proper readiness and liveness checks (e.g., Kubernetes probes or Docker health checks).
* Ensure all external dependencies have retry and backoff logic.
* Add integration tests in CI to validate the full system startup and API functionality.
* Enforce configuration validation (ports, environment variables) during code review.
