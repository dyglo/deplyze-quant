# CI/CD Architecture — Deplyze Quant

> **Audience**: contributors, future agents, DevOps reviewers.  
> This document is the authoritative source for how CI/CD works in this repository.

---

## Overview

Two workflows govern the entire lifecycle from commit to production:

| Workflow | File | Triggered by | Purpose |
|----------|------|-------------|---------|
| **CI** | `ci.yml` | PR → main, push to main | Validate: lint, type-check, Vite build, Docker validation |
| **Deploy** | `deploy.yml` | Push to main, `workflow_dispatch` | Deploy: Cloud Run gateway, Firestore rules, Firebase Hosting, Quant Engine |

---

## CI Execution Flow

### When does CI run?

```
Feature branch commit (no PR)  →  NO CI (saves cost; PR covers it)
Feature branch commit (PR open) →  FULL CI via pull_request event
Push to main (after merge)      →  LIGHTWEIGHT CI (no Docker — already validated by PR)
```

### Job graph

```
detect-changes
├── [frontend changed] → type-check-frontend → build-frontend
└── [gateway changed]  → type-check-gateway  → build-gateway-docker (PR only)
                                                       ↓
                                               ci-passed (gate)
```

The `ci-passed` gate job always runs (`if: always()`) and fails the check if any
required job failed. Skipped jobs (path not changed) are treated as passing.

### Path filters

| Changed path pattern | Frontend jobs | Gateway jobs |
|----------------------|:---:|:---:|
| `src/**`, `index.html`, `vite.config.*`, `tsconfig*.json`, `package*.json` | ✓ | — |
| `cloud-run/gateway/**` | — | ✓ |
| `**.md`, `docs/**` | — | — |
| Both frontend + gateway | ✓ | ✓ |

### Docker build in CI

The gateway Docker build (`build-gateway-docker`) runs **only on pull_request events**.
On post-merge pushes to main, the Docker image was already validated by the PR — there
is no value in rebuilding it before `deploy.yml` does the real push to Artifact Registry.

### Concurrency

```yaml
group: ci-${{ github.event.pull_request.head.ref || github.ref_name }}
cancel-in-progress: true
```

Normalising to branch name ensures push and PR events for the same branch share a
concurrency group. When a new commit is pushed, any stale CI run for that branch is
cancelled automatically.

---

## Deploy Execution Flow

### When does Deploy run?

```
Push to main  →  detect-changes → deploy only affected services
workflow_dispatch  →  deploy all services (unless skip_* input set)
```

### Job graph

```
detect-changes
├── [gateway changed / dispatch]   → deploy-gateway → (verify health)
├── [firestore changed / dispatch] → deploy-firestore
├── [frontend changed / dispatch]  → needs deploy-gateway → deploy-hosting → (verify)
└── [quant changed / dispatch]     → deploy-quant-engine → (verify health)
```

`deploy-hosting` waits for `deploy-gateway` to succeed or be skipped before running,
ensuring the API is live before the frontend is deployed.

### Path-to-service mapping

| Changed path | Service deployed |
|---|---|
| `cloud-run/gateway/**` | Cloud Run gateway (`deplyze-gateway`) |
| `src/**`, `index.html`, `vite.config.*`, `tsconfig*.json`, `package*.json` | Firebase Hosting |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json` | Firestore rules + indexes |
| `services/quant-engine/**` | Cloud Run quant engine (`deplyze-quant-engine`) |

### Manual deployment (workflow_dispatch)

All services deploy unless a `skip_*` input is set to `true`:

| Input | Default | Effect |
|---|---|---|
| `skip_gateway` | false | Skip gateway Cloud Run deploy |
| `skip_hosting` | false | Skip Firebase Hosting deploy |
| `skip_quant_engine` | false | Skip quant engine deploy |
| `skip_firestore` | false | Skip Firestore rules + indexes |

### Production safety

- Concurrency group `deploy-production` with `cancel-in-progress: false` — a live
  deployment is never interrupted by a second push.
- Health checks with 12 retries / 5s intervals on both Cloud Run services.
- Cloud Run deploys by SHA tag (not `:latest`) for rollback-exact traceability.
- `:latest` tag is also pushed for convenience but never used in the `--image` flag.

---

## Rollback Procedure

### Gateway / Quant Engine (Cloud Run)

```bash
# List recent revisions
gcloud run revisions list --service deplyze-gateway --region us-central1

# Roll back to a specific revision
gcloud run services update-traffic deplyze-gateway \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

Or via the GCP Console: Cloud Run → Service → Revisions → split/redirect traffic.

### Firebase Hosting

```bash
# List recent releases
firebase hosting:releases:list --project deplyze-quant

# Roll back to a specific version
firebase hosting:rollback --project deplyze-quant
```

### Firestore rules

Firestore rules are version-controlled in `firestore.rules`. To roll back:
1. Revert the file in git and merge to main — deploy runs automatically.
2. Or deploy manually: `firebase deploy --only firestore --project deplyze-quant`.

---

## Cost-Reduction Practices

1. **No duplicate runs**: Feature branch pushes no longer trigger CI. Only the PR event runs CI. This eliminates the push+PR duplicate that was doubling metered minutes on every commit.

2. **Path filtering in CI**: Frontend-only changes skip all gateway jobs. Gateway-only changes skip all frontend jobs. Documentation-only changes skip everything.

3. **Path filtering in Deploy**: An unrelated frontend commit no longer rebuilds and redeploys the gateway Docker image or quant engine. Each service deploys only when its source changed.

4. **Docker build only on PR**: The gateway Docker image is validated once during PR review. The post-merge push to main goes straight to deploy (which builds the real push-to-registry image). No double Docker build per merge.

5. **Concurrency cancellation**: Stale CI runs for a PR are cancelled when a new commit is pushed. No wasted minutes on superseded runs.

6. **GHA cache**: Docker layer cache and npm cache are reused across runs via `type=gha` and `actions/setup-node cache: npm`.

---

## PR and Branching Strategy

- **One PR per feature/fix**: avoid separate PRs for tightly related changes that would each trigger their own CI + deploy cycle.
- **Batch small related commits** into a single PR rather than opening multiple PRs that each merge to main (each merge is a deploy trigger).
- **Branch protection on `main`**: require `CI passed` (the `ci-passed` gate job) before merge. Never force-push main.
- **Feature branches**: push freely — no CI cost until a PR is opened.

---

## Adding a New Service

1. Add the service under `services/<name>/` or `cloud-run/<name>/`.
2. Add a path filter entry in both `ci.yml` and `deploy.yml` `detect-changes` jobs.
3. Add CI validation jobs (type-check + build/test) gated on the new output.
4. Add a deploy job in `deploy.yml` gated on `detect-changes.outputs.<name>`.
5. Add a `skip_<name>` workflow_dispatch input.
6. Document in this file.

---

## Secrets Reference

See [SECRETS.md](SECRETS.md) for the full list of required repository secrets and how to create them.

---

## Known Limitations

- `dorny/paths-filter@v3` is pinned to the major version, not a SHA. Review its changelog if GitHub Actions security policy requires SHA pinning.
- The `detect-changes` job on the very first push to a branch (where `github.event.before` is all zeros) treats all paths as changed. This is intentional — safe default.
- `deploy-hosting` depends on `deploy-gateway` completing (success or skip) before running. If you need to deploy hosting independently, use `workflow_dispatch` with `skip_gateway: true`.
