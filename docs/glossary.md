# Glossary — Deplyze Quant

This file maps internal Firestore/codebase identifiers to the PRD product
vocabulary. The Sentinel-era tenancy collections were named `organizations` /
`sites`; in Deplyze Quant they are reframed as **research desks** and
**strategies** but the on-disk names are preserved for backwards compatibility.

| Internal name (code / Firestore)         | Product vocabulary (PRD)                |
| ---------------------------------------- | --------------------------------------- |
| `Workspace` / `workspaces/{wid}`         | Research Desk                           |
| `Project` / `workspaces/{wid}/projects`  | Strategy / Portfolio bucket             |
| `Organization` (legacy, alias of Workspace) | Research Desk                       |
| `Site` (legacy, alias of Project)        | Strategy                                |
| `IntelligenceArtifact`                   | Agent-generated insight (Terminal feed) |
| `Briefing`                               | Institutional Research Briefing         |
| `Watchlist`                              | Instrument watchlist                    |
| `AgentRun`                               | Autonomous agent execution log          |
| `apiKeys` subcollection                  | Provider API keys (SERVER-ONLY)         |
| `providerCache` collection               | Gateway TTL cache (SERVER-ONLY)         |

## Provider IDs

| ID              | Provider       | Used for                              |
| --------------- | -------------- | ------------------------------------- |
| `finnhub`       | Finnhub        | Equity quotes, fundamentals, news     |
| `alpha_vantage` | Alpha Vantage  | Macro time series                     |
| `twelve_data`   | Twelve Data    | OHLCV across asset classes            |
| `tavily`        | Tavily         | AI web research                       |
| `serper`        | Serper         | Google news / web                     |
| `gemini`        | Gemini         | Synthesis, Research Copilot           |
