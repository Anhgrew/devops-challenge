Provide your solution here:
# Production Troubleshooting

## Disk 99% on Ubuntu 24.04 VM running NGINX Load Balancer

**Context**: The VM has 64GB disk and runs only NGINX as a traffic router.
**Risk**: Disk exhaustion on a load balancer can lead to request failures, health check failures, and loss of SSH/system stability.
**Approach**: Stabilize → Identify → Prove cause → Apply permanent fix.

---

## 1) Stabilize the machine (first 60 seconds)

Free a small amount of space safely so the system remains usable during investigation.

```bash
df -h
sudo truncate -s 0 /var/log/nginx/access.log 2>/dev/null || true
sudo truncate -s 0 /var/log/nginx/error.log 2>/dev/null || true
sudo journalctl --vacuum-time=2d 2>/dev/null || true
df -h
```

**Purpose**

| Command                    | Reason                                              |
| -------------------------- | --------------------------------------------------- |
| `df -h`                    | Confirm which filesystem is full                    |
| `truncate`                 | Empty log files without breaking NGINX file handles |
| `journalctl --vacuum-time` | Free space from systemd journal logs                |
| `df -h`                    | Verify space has been recovered                     |

Do not delete files and do not restart services at this stage.

---

## 2) Identify where the disk space is used (≤ 2 minutes)

Focus only on directories that can grow on this host.

```bash
sudo du -xhd1 / | sort -rh | head
sudo du -xhd1 /var | sort -rh | head
sudo du -xhd1 /var/log | sort -rh | head
```

On an NGINX-only VM, large usage under `/var/log` is a strong indicator.

---

## 3) Expected root causes (ranked by likelihood)

### Root Cause #1 — NGINX access/error logs grew unbounded

NGINX handles all traffic. Log growth scales with request rate.

Check:

```bash
ls -lh /var/log/nginx
systemctl status logrotate.timer
cat /etc/logrotate.d/nginx
```

**Edge case** — Disk full but logs not large:

```bash
lsof | grep deleted | grep nginx
```

If present, reload NGINX to release deleted file handles:

```bash
sudo systemctl reload nginx
```

---

### Root Cause #2 — Debug logging or `$request_body` logging enabled

```bash
nginx -T | grep -E 'error_log|log_format'
```

If configuration contains:

* `error_log ... debug`
* `$request_body` in `log_format`

This can cause rapid log growth.

---

### Root Cause #3 — systemd journal consuming disk

```bash
journalctl --disk-usage
```

System journals may silently consume many GB under `/var/log/journal`.

---

## 4) Apply permanent fixes (not just cleanup)

### Fix NGINX log rotation policy

Edit `/etc/logrotate.d/nginx` to ensure:

* `daily`
* `rotate 7–14`
* `compress`
* `postrotate systemctl reload nginx`

Enable and start rotation:

```bash
systemctl enable --now logrotate.timer
```

---

### Limit journald disk usage

Edit `/etc/systemd/journald.conf`:

```
SystemMaxUse=500M
```

Restart:

```bash
systemctl restart systemd-journald
```

---

### If debug or `$request_body` logging was found

* Remove it from the configuration
* Reload NGINX

---

## 5) Prevent recurrence across environments

* Include logrotate and journald limits in the base image
* Monitor:

  * Size and growth rate of `/var/log/nginx`
  * Health of `logrotate.timer`
* Add configuration checks to prevent:

  * `debug` log level
  * `$request_body` in log format
* Prefer forwarding logs to a centralized logging system instead of storing locally

---

## Most probable findings

| Likelihood | Cause                              |
| ---------- | ---------------------------------- |
| 70%        | NGINX logs not rotating            |
| 15%        | Debug or `$request_body` logging   |
| 10%        | Journald growth                    |
| 5%         | Deleted file handles or core dumps |

---
