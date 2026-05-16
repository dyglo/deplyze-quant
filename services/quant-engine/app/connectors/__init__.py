"""
Public-source connectors — controlled ingestion from public datasets.

V3 Phase 2 introduces these source families:
  • SEC EDGAR (filings)            → app.connectors.edgar    (Wave B)
  • FRED + Treasury yields (macro) → app.connectors.fred     (Wave C)
  • CFTC COT (positioning)         → app.connectors.cot      (Wave D)
  • Public RSS feeds (narrative)   → app.connectors.rss      (Wave D)
  • Economic calendar (releases)   → app.connectors.calendar (Wave D)

Each connector is an *attribution-preserving* fetcher:
every record it produces carries `provider`, `source_url`, `source_type`,
`ingestion_time`, and a `lineage_id` so the warehouse can reconstruct origin.
"""
