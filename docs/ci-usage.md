# CI Usage Discipline

GitHub Actions minutes are limited on the free plan. This repository keeps CI scoped so feature work does not burn minutes on every intermediate push.

## Trigger policy

The main CI workflow runs on:

- pull requests targeting `main`
- direct pushes to `main`

It should not run on every feature branch push. Feature branches already get validation through the pull request event, and running both `push` and `pull_request` for the same commit can double CI usage.

## Before pushing

Run the local checks first:

```powershell
npm run lint
npm --prefix cloud-run/gateway run lint
npm run build
```

Push only after the local checks pass. Batch related fixes into fewer commits when possible.

## When CI is not needed

For documentation-only or metadata-only commits, include `[skip ci]` in the commit message:

```powershell
git commit -m "docs: update notes [skip ci]"
```

Do not use `[skip ci]` for code, workflow, dependency, build, deployment, or security-related changes.

## If GitHub blocks runners

If checks fail immediately with no logs and an annotation about payments, spending limits, or budgets, the job did not start. Check GitHub billing usage and budgets for the repository owner before looking for TypeScript or build failures.

Local checks can still be used to validate code while hosted runners are blocked.
