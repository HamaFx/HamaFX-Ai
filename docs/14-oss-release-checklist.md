# OSS Release Checklist

This checklist applies to the public **single-user, self-hosted BYOK** release. It does not enable shared multi-user mode or change any existing credentials.

## Release boundary

- [ ] Describe the release as single-user self-hosted BYOK.
- [ ] Keep `MULTI_USER_ENABLED=0`, `HAMAFX_ENABLE_RLS=0`, and `REGISTRATION_MODE=owner-first`.
- [ ] Do not advertise open registration, shared hosting, or hosted billing as OSS features.
- [ ] Review provider terms before redistributing market data or enabling commercial use.

## Repository hygiene

- [ ] Review every modified and untracked file before staging.
- [ ] Confirm all files referenced by README and setup docs are included.
- [ ] Regenerate architecture explorer and knowledge artifacts after source changes.
- [ ] Check generated artifacts for current framework/version metadata.
- [ ] Run `git diff --check` and inspect the final diff manually.

## Credential safety

This checklist intentionally does **not** revoke or rotate credentials.

- [ ] Keep local `.env*`, `.hamafx/`, provider keys, database URLs, and service-account material untracked.
- [ ] Run a secret scan against tracked files and the complete Git history before publication.
- [ ] If a real credential is detected, stop publication and perform a separate operator-approved remediation.
- [ ] Do not paste secret values into issues, commits, logs, or review comments.

## Validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm turbo run test -- --run`
- [ ] `pnpm turbo run build`
- [ ] `pnpm --filter @kestrel/web bundle-size:check`
- [ ] `./docker/backup-restore-smoke.sh` with Docker available
- [ ] Verify a clean checkout can complete the documented local or Docker setup.

## Recovery and operations

- [ ] Configure off-host backup copies; the default Docker volume is not disaster recovery.
- [ ] Rehearse restore on a disposable instance and verify app/worker startup.
- [ ] Preserve `ENCRYPTION_SECRET` with the database backup; losing it makes encrypted BYOK data unrecoverable.
- [ ] Treat encryption-key rotation as a separate maintenance operation requiring stopped writers and an approved change window.

## Publication decision

Publish only after the repository is cleanly classified, validation passes from a clean checkout, and the release notes clearly state that shared multi-user/RLS mode is intentionally unavailable.
