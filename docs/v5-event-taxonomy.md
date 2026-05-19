# V5 Event Taxonomy

Canonical event types and categories for the V5 behavioral spine. This file
is the human-readable reference; the machine-readable definitions live in
three places that must stay in sync:

| Surface | File | Definition |
|---|---|---|
| Backend (gateway, zod-validated) | `cloud-run/gateway/src/lib/personalization.ts` | `EVENT_TYPES`, `EVENT_CATEGORIES` |
| Engine (sessionization) | `services/quant-engine/app/personalization/sessionizer.py` | `VALUE_EVENT_TYPES` |
| BigQuery schema | `services/quant-engine/app/bigquery/v5_schemas.py` | `USER_EVENTS` |
| Frontend (telemetry) | `src/lib/telemetry/types.ts` | `EVENT_TYPES`, `EVENT_CATEGORIES` |

## Event types

| Type | Category (typical) | Value action? | Notes |
|---|---|:---:|---|
| `impression` | any | no | Card/item rendered on screen. Sample at viewport-enter. |
| `open` | any | no | User opened an item (click, key) |
| `expand` | any | **yes** | User expanded evidence/detail beyond summary |
| `save` | any | **yes** | Added to library/pin/save |
| `dismiss` | any | no | Removed from UI; informs fatigue |
| `pin` | any | no | Pinned to investigation/board |
| `share` | any | no | Copy-link/share action |
| `export` | research_library | **yes** | Exported (PDF, JSON, CSV) |
| `scenario_run` | portfolio | **yes** | Ran a what-if scenario |
| `copilot_query` | copilot | no | Sent a query to Copilot |
| `copilot_followup` | copilot | **yes** | Sent a follow-up in the same thread |
| `briefing_open` | briefing | no | Opened the Morning Terminal briefing |
| `briefing_section_open` | briefing | no | Expanded a briefing section |
| `alert_open` | alert | no | Opened an alert |
| `alert_dismiss` | alert | no | Dismissed an alert |
| `watchlist_add` | watchlist | no | Added a symbol/theme to watchlist |
| `watchlist_remove` | watchlist | no | Removed from watchlist |
| `portfolio_view` | portfolio | no | Visited the portfolio overview |
| `portfolio_holding_open` | portfolio | no | Drilled into a specific holding |
| `investigation_create` | investigation | **yes** | Created a new investigation |
| `investigation_update` | investigation | **yes** | Updated an existing investigation |
| `investigation_close` | investigation | no | Closed/archived an investigation |
| `investigation_pin` | investigation | **yes** | Pinned evidence to an investigation |
| `feedback_relevance` | feed | no | "more/less like this" |
| `feedback_dismiss_category` | feed | no | Dismissed an entire category |
| `feedback_mute` | feed | no | Muted a category/symbol |
| `session_start` | — | no | Synthetic; the sessionizer derives sessions |
| `session_end` | — | no | Synthetic; same as above |
| `page_view` | any | no | SPA route change |

Value-action membership is **server-authoritative** (`isValueAction()` in the
gateway lib + `VALUE_EVENT_TYPES` in the sessionizer). The client cannot lie
about which events count toward retention metrics.

## Event categories

| Category | Used by |
|---|---|
| `briefing` | Morning Terminal, briefing cards |
| `feed` | Personalized intelligence feed |
| `alert` | In-app alerts, email/push delivery |
| `copilot` | Research Copilot |
| `portfolio` | Portfolio overview, risk, scenario |
| `watchlist` | Watchlist tools |
| `investigation` | Investigation memory |
| `research_library` | Saved research, exports |
| `macro` | Macro Regime Desk |
| `instrument` | Instrument Intelligence |

## Implementer notes

- **Impression sampling**: do not log impressions for off-screen cards.
  Use `IntersectionObserver` (50% threshold) once per card per render.
- **Dwell time**: emit `dwell_ms` on the next event (or session end) so
  hot/cold reading patterns can be modeled later.
- **PII**: never put free-text user content into `properties`. The
  `reason` field on `feedback_*` events is capped at 400 chars and
  intended for short structured strings (e.g., `"too_repetitive"`,
  `"not_relevant_to_my_book"`), not narrative.
- **app_version**: optional but recommended. Set `__APP_VERSION__` via
  Vite `define` if you want version-aware analytics.
- **Rollout**: telemetry is feature-flagged on the client
  (`setTelemetryEnabled`) and the gateway (`PERSONALIZATION_ENABLED`).
  Both default off until the schema lands.
