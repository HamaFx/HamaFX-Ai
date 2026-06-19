# Security Policy

## Supported Versions

We provide security updates for the `main` branch and the latest stable release. Please ensure you are running the latest version of HamaFX-Ai to remain secure.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within HamaFX-Ai, please **do not** open a public issue. We ask that you practice responsible disclosure to protect the community.

Instead, please send an email to **security@hamafx.com**. We will strive to acknowledge your report within 48 hours and work with you to understand and mitigate the issue.

Please include the following information in your report:
* A description of the vulnerability.
* Steps to reproduce the issue.
* The impact of the vulnerability.
* Any potential mitigations you may suggest.

## Known Security Considerations

* **BYOK API Keys**: The Bring Your Own Key (BYOK) architecture encrypts API keys at rest in the database using the `ENCRYPTION_SECRET`. However, when interacting with the AI agent, these keys are decrypted in memory. Please ensure that `ENCRYPTION_SECRET` is strong, kept secret, and never committed to source control.
* **Self-Hosted Deployments**: As a self-hosted platform, the security of the underlying infrastructure, operating system, and network access is the responsibility of the deployment operator. We recommend using reverse proxies (like Nginx, Traefik, or Caddy) with TLS/SSL enabled to secure data in transit.
