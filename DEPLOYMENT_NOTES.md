# Deployment Notes

This fork is configured for a single personal CFSM instance.

Operational choices:

- Use one Cloudflare Workers Cron trigger: `0 * * * *`.
- Do not enable CFSM offline or resource notifications. Uptime Kuma handles uptime and resource alerts.
- Keep Wallos as the source of truth for asset renewal notifications.
- Use agent `report_interval=180`, `collect_interval=0`, and `auto_update=0`.
- Keep this instance private by default: data should be visible only after login unless intentionally changed.

Why only one Cron:

- The upstream per-minute Cron runs CFSM offline and resource-alert checks.
- This deployment does not need those checks because Uptime Kuma already handles them.
- The hourly Cron still keeps CFSM maintenance tasks available, including history table rotation and expiry-date processing.

Scope:

- This instance is for personal VPS, server, and NAT visibility.
- Do not split into multiple CFSM instances unless trust domains or usage growth make one instance hard to operate.
- Do not store Cloudflare API tokens, Worker secrets, server passwords, or payment details in this repository.
