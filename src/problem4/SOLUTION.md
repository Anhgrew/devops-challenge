## What Problems I Found

* nginx was routing `/api` to the wrong port (`3001` instead of `3000`), causing all API requests to fail.
* No health checks were defined, making service readiness unreliable.
* The API started before PostgreSQL and Redis were ready, leading to connection errors at startup.
* PostgreSQL initialization script (`init.sql`) was not mounted, so it never executed.
* The API had no retry mechanism for database and Redis connections, making it fragile on startup failures.
* Sensitive configuration (DB credentials) was hardcoded in the compose file.
* No network isolation between frontend and backend services (addition for production best practice)
* No network isolation between frontend and backend services, increasing the risk of unauthorized access and violating least-privilege principles (should be isolated in production).
---

## How I Diagnosed Them

* Traced request flow from nginx → API and identified failed upstream connections, which revealed the incorrect port configuration.
* Inspected container logs (`docker logs`) for the API and observed repeated connection failures to PostgreSQL and Redis during startup.
* Verified service startup order using `docker-compose ps` and confirmed that the API was starting before its dependencies were ready.
* Reviewed `docker-compose.yml` and identified missing volume mounts for the PostgreSQL initialization script.
* Simulated restarts (`docker-compose down && up`) to reproduce race conditions and confirm lack of resiliency.
* Audited configuration and found hardcoded credentials and absence of environment-based configuration.
* Checked network configuration and confirmed all services were on the default network without proper isolation.

---

## The Fixes I Applied
* Fixed nginx routing by updating `proxy_pass` to point to the correct API port (`http://api:3000`).

* Added health check endpoints:

  * `/status` now verifies both PostgreSQL (`SELECT 1`) and Redis (`PING`)
  * Ensures real dependency readiness instead of a simple static response

* Added `curl` to the API container to support health checks in Docker:

  ```dockerfile
  RUN apk add --no-cache curl
  ```

* Mounted the PostgreSQL initialization script:

  ```text
  ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
  ```

* Added health checks for PostgreSQL and Redis to ensure proper readiness detection.

* Updated API service dependencies to use:

  ```yaml
  depends_on:
    condition: service_healthy
  ```

* Updated the API to use environment variables for database configuration instead of hardcoded values:

  * `DB_USER`
  * `DB_PASSWORD`
  * `DB_NAME`

* Improved database connection handling:
  * Moved `pool.connect()` outside the `try` block
  * Ensured `db.release()` is always executed using `finally` to prevent connection leaks

* Moved sensitive configuration (DB credentials, connection strings) to environment variables and a `.env` file.

* Introduced Docker network segmentation:

  * `frontend` network for nginx
  * `backend` network for API, PostgreSQL, Redis
  * Restricted database and Redis access to backend only

---

## What Monitoring / Alerts I Would Add

* **Container health monitoring**

  * Alert if any container becomes `unhealthy` or restarts frequently.

* **Application-level metrics**

  * Track API error rates (5xx), latency, and request volume.

* **Dependency monitoring**

  * Monitor PostgreSQL and Redis availability and connection counts.

* **Log aggregation**

  * Centralize logs using a stack like ELK or Loki for faster debugging.

* **Alerting**

  * Set alerts for:

    * API downtime
    * High error rate
    * Database connection failures

* **Observability stack**

  * Prometheus + Grafana for metrics
  * Alertmanager for notifications (Slack/Email)

---

## How I Would Prevent This in Production

* **Use readiness & liveness probes**

  * Ensure services only receive traffic when fully ready.

* **Adopt infrastructure standards**

  * Enforce configuration via environment variables and secrets management (e.g., AWS Secrets Manager, Vault).

* **CI/CD validation**

  * Add automated checks:

    * Lint `docker-compose.yml`
    * Validate nginx config
    * Run integration tests against the full stack

* **Resilience patterns**

  * Standardize retry logic and timeouts across services.

* **Environment parity**

  * Keep dev, staging, and production environments consistent to catch issues early.

* **Network segmentation & security**

  * Isolate internal services and restrict access using private networks and security groups.

* **Use orchestration in production**

  * Replace docker-compose with Kubernetes or ECS for:

    * Health-based scheduling
    * Auto-restart
    * Service discovery

* **Secrets management**

  * Never store credentials in source code; use secure secret injection mechanisms.
