# Security boundaries observed during development

- No real network, LAN, router, NAS, Proxmox host, cloud account or public host was scanned or contacted. Network traffic was limited to localhost (API, Vite, Playwright), package registries (pip, npm, Playwright browser, Docker base images) and the local Docker daemon.
- No secrets, credentials or tokens were used or committed. The dev seed password is a documented dev-only default.
- Nothing was pushed or deployed. Commits are local on `feature/aegisai-v1`.
- A process already bound to host port 8080 was left alone; Compose was moved to 8088.
- The home-directory repo's uncommitted changes were not modified.
- Runtime enforcement is described in docs/security/THREAT_MODEL.md.
