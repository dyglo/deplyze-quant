# Backend migration audit — 2026-10-13

Status: **pre-implementation audit; migration and deployment are not complete**.
This report describes source contracts and observed baseline behavior, not a
working replacement. No live resources or existing records have been deleted.

## Source and evidence

`git ls-remote` verified the latest remote `chore/vercel-frontend` HEAD as
`618177e08ea5a7d026c0d377871da3b68148e7b7`, then the repository was cloned at that
commit and `feat/rust-cloudflare-supabase` was created. No `AGENTS.md` was found
in the checkout or workspace. The installed cloud-environment, Supabase,
Vercel CLI, and plugin-management skills were read.

The current source takes precedence over the earlier page-removal documents.
The repeatable, read-only inventory is:

```sh
node scripts/audit-backend-dependencies.mjs > docs/backend-migration-inventory.json
```

[The inventory](backend-migration-inventory.json) records per-page transitive
dependencies, browser API calls with their TypeScript response types, gateway
handlers, Firebase consumers, and unreachable deletion candidates. It follows
relative imports, re-exports, and dynamic imports using the TypeScript parser.
It establishes module reachability, not usage of every export in a module.

## Surviving routes and complete flow boundaries

| Route | Active data flow |
| --- | --- |
| `/` | Market snapshots, quotes, chart history, fundamentals/valuation, news, calendar; agent outputs, ranked feed, emerging narratives, investigations, watchlists/holdings; shared intelligence drawer and Copilot |
| `/instruments/:symbol` | Quote/history → local analytics; provider intelligence bundle, financials, analyst, ownership, earnings, EDGAR; relation context, macro, agent narratives; snapshot/artifact save |
| `/macro` | Macro series/FX → local macro/yield/real-rate analytics; warehouse regimes/global indicators/country regimes/observations; narratives, research synthesis, portfolio context and vulnerability; artifact save |
| `/market/global-yields` | Treasury series including real yields and spread; regimes/global indicators; locally computed curve interpretation; shared drawer |
| `/market/commodities` | Cross-asset quotes/history/news, warehouse narrative memory and outputs; locally computed comparisons; shared drawer |
| `/historical-intelligence` | Individual tab components retrieve up to 5,000 bars and compute analogs, regimes, extremes, cross-asset correlations, forward distributions, reversion, benchmarks, scenarios; timeline uses warehouse intelligence; quant artifact persistence |
| `/research`, `/research/i/:id` | Gemini plan → browser price/macro retrieval → existing browser numerical analytics → Gemini grounded prose; follow-up ask/refine; session report cache plus account-owned saved reports |
| `/copilot` | Message tail/context → Gemini tool loop → BigQuery/quant-engine read-only tools → reply/evidence/tool trace; saved insights and artifacts |
| `/library`, `/artifacts/:id` | Private Firestore artifacts, pins, saved reports, insights, briefings; agent earnings feed and latest warehouse briefings; artifact detail/update/delete/related intelligence |
| `/investigations` | Personalization investigation memory list/create/status patch plus ranked intelligence |
| `/settings` | Provider configuration/health; email preferences read/patch; workspace labels; browser-local appearance preference |
| `/login`, `/positioning`, unknown paths | Existing Home/research redirects; no app authentication |

`useHistoricalIntelligence.ts` is currently unreachable; the terminal imports
its tab components directly. It is not evidence for deleting Historical
Intelligence. Country-regime and relation APIs remain consumed despite removal
of the corresponding standalone pages. Portfolio holdings and watchlists remain
consumed by Macro, Home, personalization, email, and Copilot.

## Capability migration table

All browser paths below retain `/api/v1` unless explicitly identified as public
email/webhook paths. Proposed implementations have **not** yet been deployed.

| Existing capability / consumers | Existing API and persistence contract | Proposed replacement | Data import | Verification | Runtime/cost constraint |
| --- | --- | --- | --- | --- | --- |
| Quotes, search, movers; Home, instruments, dashboards, selectors | `/market/quote/:symbol`, `/quotes`, `/search`, `/movers`; normalized quote, per-symbol `ok/data/error`; max 100 batch symbols | Rust async provider adapters; preserve symbol mapping, ordered fallbacks, partial errors; bounded batch execution | Rebuild expiring provider cache | Recorded provider fixtures plus live equity/index/commodity/crypto requests | Free Worker max 50 external subrequests and 6 connections; a 100-symbol cold batch cannot fan out unchanged |
| OHLCV; all chart/research surfaces | `/market/ohlcv/:symbol?interval&outputsize`; 10–5,000 bars, millisecond timestamps; warehouse-first/coverage-aware provider fallback, aggregate weekly/monthly | Rust adapters and Supabase OHLCV; retain coverage/aggregation and insufficient-data errors; browser analytics stay in browser | Historical cleaned bars, preserving adjustment/provenance if accessible | Order, units, aggregation/coverage fixtures; real 10-year ETF study | Parse/serialize up to 5,000 bars must be measured against 10 ms CPU; use bounded provider responses and persisted series |
| Macro/FX/yield curves | `/macro/series`, `/series/:id`, `/fx`; `points`, name/unit/frequency; `T10Y2Y` aligned subtraction; 24h route cache | Rust AV/FRED routing and normalization; Supabase macro observations/cache | Cleaned macro history if accessible; real provider backfill otherwise | CPI year-over-year, GDP units, Treasury/spread alignment; live Macro/Yields | AV quota, FRED key, long series CPU/egress; preserve actual routing rather than comments |
| Profiles, metrics, financials, analyst, peers, ownership, earnings, filings | `/instruments/:symbol/intelligence`, `/fundamentals/:symbol/*`, `/earnings/*`, `/edgar/*`; distinct typed wrappers and nullable fields | Rust FMP/Finnhub/EODHD/EDGAR adapters; cached bounded provider calls | Filings metadata/XBRL and cached fundamentals may be regenerated | Adapter fixtures, real AAPL detail, statement periods, calendar | SEC user agent and rate limits; large companyfacts cannot be buffered without a cap |
| Web research and synthesis | `/research/web`, `/web/google`, `/synthesize`; Tavily/Serper results, Gemini narrative, compliance footer | Rust HTTPS calls to same providers/model; same bounds and cache | Expiring synthesis cache optional | Source/URL retention, error fixtures; live synthesis | Provider keys/quotas; 30s frontend request deadline |
| Deep Research and follow-ups | `/historical-research/{plan,reason,followup-ask,followup-refine}`; plan/degraded, narrative, answer; deterministic planner fallback exists | Rust Gemini planner/prose, port fallback rules/validation; retain existing browser numerical engine and progress log | `users/{uid}/historical_research/{id}` schema v2 `resultJson` and older nested `result` | Plan fixtures, invalid inputs, real study, follow-up, save/reload/library | Gemini latency/token limits; no successful fabricated prose; slim save currently capped at 800,000 string characters |
| Artifacts, saved reports, pins, insights; Library/detail/drawer | Firestore subscriptions/CRUD under `workspaces/{wid}/projects/{pid}`; created/updated times, types, symbols, evidence; pin ID equals artifact ID | Rust protected CRUD; PostgreSQL workspace/project FKs, typed identity/time/type columns plus JSONB payload; polling replaces snapshots | Preserve source IDs, types (including historical lab/briefing artifacts), timestamps, references | Create/read/update/delete, concurrent save, reload/library, cross-workspace rejection | Private responses `no-store`; bounded pages; avoid full-list polling/egress |
| Shared holdings/watchlists | Root `portfolios`, holdings/transactions children, `portfolioIntelligence`, `intelligenceWatchlists`; transaction ledger and reconciled holdings/cash | Rust personal-workspace CRUD and atomic SQL ledger/snapshot update; retain numerical semantics | Preserve holdings, transactions, weights, closed status, cash, workspace references | Transaction fixtures plus atomicity/retry/concurrent-write checks; Macro context | No fake user; account-oriented public signatures may remain only until consumers are rewired |
| Warehouse timeline/artifacts/features/relations/health | `/intelligence/{timeline,artifacts,artifacts/:id,features/:symbol,pipeline/runs,relations,warehouse/status}`; BQ research/features/ops tables | Indexed PostgreSQL tables/views and Rust projections preserving envelopes | Timeline/artifact IDs, lineage, feature windows, model runs if readable | Contract fixtures, FK integrity, real timeline and pipeline output | SQL row limits/timeouts and retention; not whole-warehouse JSON documents |
| Agent intelligence/reasoning/analog/risk/vulnerability | `/agents/{outputs,outputs/:domain,portfolio/:id,registry,status,runs,regime,risk,reasoning,analog,vulnerability,narrative-exposure}`; BQ `agent_outputs`, engine proxies | Rust bounded analytics; PostgreSQL deduped feature/materialized outputs and run ledger | Existing output/run history; regenerate from real input if no import access | Numerical parity fixtures; all six Copilot tools; insufficient-history behavior | Native pandas/scipy/sklearn dependencies cannot run unchanged; move aggregates to SQL and split jobs |
| Instrument relation and narrative context | `/relations/context`, `/narratives/{emerging,memory}`, `/research/macro-observations`; ontology/relationship features and narrative memory | Rust normalized context assembly + indexed SQL relationships/narrative history | Entity/lineage/link IDs, observations and memory | Instrument drawer plus Copilot citations and macro research context | Document extraction dependency is retained; removing Relation Maps does not remove this flow |
| Macro/global country regimes and briefing feeds | `/macro/{regimes,global-indicators,country-regimes,observations}`, `/filings/{recent,symbol/:symbol}`, `/briefings/latest` | Rust ingestion/classification/briefing generation + PostgreSQL observations/artifacts | Global macro/COT/calendar/filing history and briefing records | Home/Library/Global Yields, generated briefing lineage | Provider quotas and bounded daily universe; preserve empty data honestly |
| Telemetry/sessionization/profile/ranking | `/personalization/{events,feedback,profile,feed,watchlist,copilot-context}`; BQ raw events, cleaned sessions/value events, daily profile, notification decisions | Protected Rust ingestion; personal workspace identity; SQL session/aggregate queries, Rust scoring/tone | Historical event/profile rows only with explicit source owner mapping | Feedback changes ranking; profile/job idempotency; unauthorized telemetry rejection | Current browser sends batches of 25 every 5s; retention/egress matters even for one user |
| Investigation memory | `/personalization/investigation` GET/POST and PATCH `/:id` `{patch}` | Rust validation + SQL structured status/focus/symbol/timestamps | BQ `investigation_memory` IDs/statuses | Create/list/pause/resolve/reload and Copilot context | Validate status transitions and prevent cross-workspace access |
| Email preferences, unsubscribe, delivery/webhook | `/email/preferences` GET/PATCH; `/api/email/unsubscribe` GET/POST signed token; `/api/webhooks/resend` signature; Firestore prefs/events/delivery logs, BQ awareness context | Rust preference/signature/template/provider code; PostgreSQL delivery claim unique by workspace/type/date; Cloudflare job sends only opted-in recipient | Preference consent, unsubscribes, provider delivery IDs/log state; preserve legacy unsubscribe validity when secret accessible | Signed-link tamper/replay checks, retry idempotency, live opted-in test delivery/webhook | Resend key/verified sender; no account onboarding flow; public exceptions grant no research access |
| Ingestion/refinery/materialization schedules | GCP manifests: daily price/refine/features/artifacts; EDGAR/FRED/COT/RSS/calendar; document/entity extraction; macro/narrative/briefings; sessionize/profile/awareness | One bounded Cron dispatcher + persistent job ledger; Queues only if needed; SQL aggregates; native Rust document-extraction alternative pending decision | Persist checkpoints/lineage/dedupe keys; don't import ephemeral process `_runs` as durable truth | Manually invoke then observe scheduled run; retries yield no duplicate outputs/emails | 5 free Cron triggers/account; 10 ms CPU per free Cron; UTC schedules must preserve ET/DST behavior |
| File storage | `src/lib/firebase.ts` exports Storage, but surviving code has no Storage upload/download consumer; PDF export is browser-local | **No Supabase Storage bucket justified initially**; records live in PostgreSQL | No confirmed application files to import; inspect source before adding any bucket | Scan all consumers/import source; browser PDF export | Avoid a speculative bucket/API; document parsing does not require permanently storing original binary files |

Provider cache TTLs are source-specific: server quote 60s, intraday 5m, daily
history 6h, news 5m, fundamentals 24h, search 1h, synthesis 30m; macro route
overrides its generic TTL to 24h. The browser has different freshness budgets
and stale-on-error behavior. Preserve both layers. Use a shared PostgreSQL
cache/quota claim rather than an unbounded isolate Map or an extra paid Redis.

The actual OHLCV chain is EODHD → Yahoo (supported indices) → Twelve Data →
FMP → Polygon → Alpha Vantage → configured Stooq, with warehouse coverage and
special macro/crypto branches. Quote chain is Polygon → Finnhub → Twelve Data
→ EODHD, with cross-asset restrictions. News is Polygon → Finnhub → Tavily →
Serper. Fundamentals are FMP → Finnhub → EODHD → EDGAR where supported.
Macro routing prefers FRED for the exact regex-selected IDs, otherwise AV then
FRED. Some comments and `/providers/health` routing labels lag actual source.

Copilot has six retained tools: agent intelligence, market reasoning,
regime/risk, narrative exposure, historical analogs, and portfolio context.
It currently permits four tool rounds, six total calls, a 12-message tail,
1,024 output tokens, and a final tool-free call. Its API is JSON, not SSE;
the research progress trace is produced by the browser, not server streaming.

## Personal access and database design

Keep frontend presentation on Vercel. Protect sensitive API requests using
Cloudflare Access identity, with Rust verification of the Access JWT issuer,
audience, signature, expiry, and the approved personal principal. A forwarded
identity header alone is insufficient. CORS, a workers.dev hostname, and a
browser API key are not authorization. Public market reads are optional, but
all private reads, research/provider operations, telemetry, and writes must
have an enforceable boundary before production cutover.

The existing Vercel setting is `prod_deployment_urls_and_all_previews`, and
the production hostname returns 200 without authentication. This does not
protect the public production alias. An Access browser session for a Worker
origin also needs a working same-origin ingress/session design: a Vercel
rewrite must not be assumed to forward an Access cookie belonging to another
hostname. Prefer a protected dedicated hostname/front door pointing to the
Vercel presentation and Worker API, or a verified infrastructure-session
proxy. Do not insert an app login or ship a proxy secret to the browser.
Keep signed unsubscribe and verified webhook exceptions narrowly scoped.

The new workspace is explicit application data, not a fabricated Supabase
Auth user. It gets its own workspace/project IDs and protected backend
context. Browser-provided historical UIDs do not select private imported data.
Old records are imported only under an explicitly selected owner mapping.

Prefer Rust Workers `Fetch` → Supabase HTTPS Data API/RPC. PostgREST manages
database connections; a per-isolate native PostgreSQL pool is unnecessary.
Expose only necessary tables/RPCs, revoke anon/authenticated access, enable RLS
without public policies, and keep the privileged key solely in Worker secrets.
Atomic operations use tightly granted transactional RPCs. Preserve first-class
keys, status/type/date/symbol columns and FKs; JSONB holds flexible evidence and
report payloads. Index workspace/time, symbol/time, unique observation keys,
job claim keys, and artifact/pin relationships.

The database design requires bounded OHLCV/macro retention, provider-cache TTL
cleanup, event retention, and run-log retention. Full replication of an
unbounded BigQuery warehouse into a 500 MB free database is not feasible.
No existing rows may be dropped to enforce new limits without approval.

## Official runtime documentation checked

Cloudflare developer HTTP pages returned 403 from this environment initially;
the corresponding official `cloudflare/cloudflare-docs` production sources
were retrieved instead. Cloudflare documentation tools became available after
the user enabled the connector. The first broad documentation search returned
no matches; that does not invalidate the retrieved official sources.

| Product | Verified documented constraint | Source |
| --- | --- | --- |
| Rust Workers | `wasm32-unknown-unknown`, workers-rs, worker-build/wasm bindings; async Fetch and scheduled events; not a native server | [Rust](https://developers.cloudflare.com/workers/languages/rust/) |
| Rust crates | Reqwest Wasm uses JS Fetch; tokio-postgres needs Workers Socket; native Hyper Client timing dependencies are unsuitable | [Supported crates](https://developers.cloudflare.com/workers/languages/rust/crates/) |
| Workers Free | 100,000 requests/day; 10 ms CPU/request and Cron invocation; 128 MB shared isolate memory; 50 external subrequests; 6 outgoing connections; 1s startup; 5 Cron triggers/account | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Worker bundle | Retrieved main limits page says 64 MiB; Workflows limits page still cites 3 MB free/10 MB paid. Treat as a documentation discrepancy; verify actual Wasm upload/dry-run rather than assuming the higher allowance | [Limits source](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/limits.mdx) |
| Background lifetime | Cron/Queue consumer wall time up to 15m; HTTP requires connected client; `waitUntil` only extends work up to 30s after response/disconnect and grants no extra CPU | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Queues Free | 10,000 operations/day; normally 3/message plus retries; 24h retention; messages max 128 KB; consumer remains subject to free CPU | [Pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Limits](https://developers.cloudflare.com/queues/platform/limits/) |
| Workflows Free | 10 ms CPU/step; 3,000 steps/day; 1,024 steps/instance; 100 concurrent instances; 1 MiB event/non-stream result; 1 GB-month storage; 3-day retained state | [Pricing](https://developers.cloudflare.com/workflows/reference/pricing/), [Limits](https://developers.cloudflare.com/workflows/reference/limits/) |
| Supabase Free | Two active free projects; paused projects excluded; 500 MB database/project; 5 GB egress and 1 GB Storage quota | [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| PostgreSQL connection | HTTPS Data API; direct IPv6; free shared Supavisor transaction pool IPv4 :6543 for transient clients; transaction pooling does not support prepared statements | [Connections](https://supabase.com/docs/guides/database/connecting-to-postgres) |

Pin workers-rs/serde/serde_json dependencies and commit Cargo.lock. Use Workers
Fetch/timers, not Tokio's native executor, blocking HTTP clients, OS threads,
native OpenSSL, filesystem temp files, or a long-running server. Actual Wasm
compilation and deployed CPU measurements remain required.

### Workload requiring an architecture decision

`services/quant-engine/app/refinery/document_parser.py` selects up to 200
documents, fetches four concurrently, and calls `parsers.py` for full HTML/XML
or PDF extraction. Each document is capped at 25 MB; PDF parsing walks every
page. Entity extraction feeds ontology features, narrative memory/artifacts,
briefings, relation context, and Copilot. This is not an orphaned pipeline.

A normal native PDF/DOM parsing job cannot reliably meet 10 ms active CPU or
128 MB shared isolate memory for that input contract. Queues and Workflows Free
do not remove that CPU limit. Merely limiting the batch to one document is
insufficient for large PDFs. No Wasm parser has been selected or benchmarked;
claiming full free-Worker compatibility would be unsupported.

The smallest proposed free alternative is a bounded **native Rust GitHub
Actions document-extraction job**, using the public repository's standard
runner, with private inputs/results in Supabase and no private data in logs or
public artifacts. Keep API, ingestion dispatch, other bounded jobs, and data
access on Cloudflare. This changes batch execution hosting and requires the
user's decision before implementing it. Paid Workers is another option, but
must not be activated without approval. Keep this decision pending; do not
silently drop document extraction or report failed parses as successes.

## Available account access and migration status

- Supabase: sole organization `Tafar`, ID `afwkalnaplqvoblbpmzj`, Free. Existing
  `MindFlow-Routines` is healthy and `smartmoney-book` inactive; neither is a
  dedicated Deplyze project. Dedicated project organization confirmation is
  pending. No project, schema, bucket, or data import has been created.
- Vercel: confirmed `deplyze-quant`, project
  `prj_driGsM8ftyGdbSyBPIqbtxdxqzB7`, team
  `team_5sOdHI6Lp35U60vlevwPPTid`; Vite/Node 24. Environment metadata lists
  seven public Firebase configuration keys. It lists no provider credentials.
  Values were not printed. No deployment/configuration was changed.
- Cloudflare: connector became available after user action. Account `Tafar`,
  `34c5468ebfcd71e2a958b25cfb0bde40`; active Free zone `deplyzegpt.xyz`.
  Worker list is empty; no workers.dev subdomain is configured; Access is not
  enabled. Subscription read returns an authentication error. Zone permission
  metadata advertises read permissions. The authorized PUT creating the new
  `deplyze-quant-tafar` workers.dev subdomain failed with API error `10000:
  Authentication error`; no subdomain/resource was created. Write access for
  Workers, Access/Zero Trust, and DNS is a deployment blocker.
- Managed environment: no bound provider/GCP/Supabase privileged credentials.
  Connected Supabase administration does not automatically provide a
  service-role key to the execution environment or Worker.
- Firebase/BigQuery historical data: no live credentials or connection were
  available; no records were read, exported, or imported. Clean backend
  delivery must not depend on that optional historical import.

The importer must accept a read-only export, require an explicit owner to
workspace mapping, preserve IDs/timestamps/type/lineage, import parents before
children transactionally, record source-path/hash provenance and row counts,
and be repeatable with conflict detection. It must not merge all old users
into the personal workspace or overwrite differing target records silently.
Verify counts, payload hashes, orphan/FK checks, time ranges, and sample UI
retrieval. Missing source access must remain explicitly reported.

## Baseline verification

| Check | Observed result before runtime edits |
| --- | --- |
| `npm ci` | Pass; dependency deprecation notices |
| `npm run build` | Pass; existing 2.4 MB frontend chunk warning |
| `npx tsc -b --pretty false` | Pass |
| `npm run lint` | Pass; script is TypeScript checking, not a separate style linter |
| `npm test` | 55/55 pass; existing portfolio math and provider-label tests |
| Gateway `npm ci`, build, lint | Pass |
| Gateway planner/account fixture tests | 16/16 pass; source behavior only, not live backend verification |
| Functions dependency install/build | Pass under Node 24 with package's Node 20 engine warning |
| Python tests | Initial attempt could not collect because pytest was absent; after installing pinned dependencies in an isolated venv, 26/26 pass; live integration was not enabled |
| Firestore emulator | 26/26 rules tests pass using `demo-deplyze` and Java 21; this is local security-rule evidence, not live record access |
| Gateway Docker validation | Not run; gateway TypeScript build passes, but container validation is not claimed |
| Production frontend documents | Chromium/Playwright: 15 route examples loaded and refreshed with HTTP 200; missing saved research redirects to `/research`; login/positioning redirects retained |
| Existing backend health | HTTP 503 on `deplyze-quant.web.app/api/health` |
| Browser API data flows | Observed production requests return upstream HTTP 503; saved/private data remains unselected; no uncaught page errors, Firebase Auth requests, or Firestore requests during route checks |

Critical missing coverage: provider contract normalization/fallback/coverage,
research completion and follow-ups, persistence after reload, atomic mutations,
access denial, signed email links/webhooks, scheduled ingestion and output
lineage. Existing fixture tests do not establish any of these live flows.

Source-contract defects include Global Yields requesting `DGS3MO` while the
macro gateway accepts `DGS3M`, and historical terminal requesting 5,040 bars
for its 20-year option while the gateway validation caps outputsize at 5,000.
The unselected workspace disables cloud saves; several guard paths resolve
without writing. Replacement guards must reject unavailable writes clearly.
The old gateway still requires Firebase authorization although the frontend
no longer sends it; the current 503 masks that incompatibility.

The inventory contains 65 browser gateway call sites, 76 gateway route
handlers, and six reachable modules importing Firebase. Retiring unused
exports inside reachable modules still requires symbol/call-site review.

Baseline rerun commands for the additional suites:

```sh
npm --prefix cloud-run/gateway ci
npm --prefix cloud-run/gateway run build
npm --prefix cloud-run/gateway run lint
node --import ./cloud-run/gateway/node_modules/tsx/dist/loader.mjs --test \
  cloud-run/gateway/src/lib/researchPlanFallback.test.mjs \
  cloud-run/gateway/src/middleware/requireFullAccount.test.mjs
npm --prefix functions ci
npm --prefix functions run build
# In an isolated Python venv, install services/quant-engine/requirements.txt,
# then run from services/quant-engine:
python -m pytest tests -q
npm --prefix firestore-tests ci
npx firebase-tools emulators:exec --only firestore --project=demo-deplyze \
  'node --test firestore-tests/rules.test.mjs'
```

Python warns about Pydantic class-based config and the unset pytest-asyncio
fixture loop scope. The emulator emits expected permission-denied logs for
negative security tests. Existing rules retain a documented broad user-profile
read behavior; no live rules were modified. Chromium baseline used Playwright
with the system Chromium executable and monitored page errors, API statuses,
Auth/Firestore requests, and reloads. It did not establish functional research,
provider, or persistence results.

## Cleanup gates and later infrastructure candidates

Only after replacement verification: remove frontend Firebase imports/dependency,
unused workspace/project/account services, Node gateway, Python quant-engine,
Firebase Functions, rules/emulator-only tests, Firebase/Google deployment files,
old environment examples, Redis/VPC assumptions, and obsolete workflow steps.
Retain the current shared UI, quantitative browser libraries, holdings ledger
math, historical artifact types, relation schemas, and provider contracts.

Functions source is a logging-only macro schedule and artifact trigger; it is
not a real briefing generator to port. The V5 sentinel materializer requests
`persist:false` and is not proof of successful personal briefing persistence.
Email batch delivery is an explicitly controlled CLI utility; source manifests
do not prove a live email schedule exists. All old scheduler/source manifests
are source evidence only, pending live GCP inventory.

Later deletion candidates (require separate explicit approval and live inventory):
Firebase Hosting/API ingress, Cloud Run gateway/quant-engine, Firestore/Storage,
BigQuery datasets, Cloud Scheduler jobs, Memorystore/VPC connector, Google
Secret Manager bindings/service accounts, Artifact Registry images. Do not
delete them during source cleanup. Mark historical architecture documents as
historical when the replacement exists; do not rewrite their findings as a
deployed migration now.
