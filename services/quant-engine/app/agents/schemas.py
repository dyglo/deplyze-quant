"""
V4 Agent Output Schema.

Every agent writes one or more AgentOutput records to artifacts.agent_outputs.
The schema is the contract between background intelligence and the product.

BQ table: artifacts.agent_outputs
Lineage key: f"agent:{agent_id}:{date}:{hash(title)[:8]}"
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google.cloud import bigquery

# ─── Severity / placement constants ──────────────────────────────────────────

SEVERITY_HIGH = "high"
SEVERITY_MEDIUM = "medium"
SEVERITY_LOW = "low"
SEVERITY_INFO = "info"

PLACEMENT_INTELLIGENCE_TERMINAL = "IntelligenceTerminal"
PLACEMENT_PORTFOLIO_OVERVIEW = "PortfolioOverview"
PLACEMENT_RISK_REGIME_FIT = "RiskRegimeFit"
PLACEMENT_SCENARIO_STRESS = "ScenarioStress"
PLACEMENT_MACRO_REGIME_DESK = "MacroRegimeDesk"
PLACEMENT_RESEARCH_LIBRARY = "ResearchLibrary"
PLACEMENT_BRIEFINGS = "Briefings"
PLACEMENT_INSTRUMENT_INTELLIGENCE = "InstrumentIntelligence"
PLACEMENT_RESEARCH_COPILOT = "ResearchCopilot"


# ─── Core output dataclass ────────────────────────────────────────────────────

@dataclass
class AgentOutput:
    agent_id: str
    domain: str
    artifact_type: str

    title: str
    summary: str
    body: str

    confidence: float               # 0.0 – 1.0
    severity: str                   # SEVERITY_* constants above

    symbols: List[str] = field(default_factory=list)
    portfolio_id: Optional[str] = None

    evidence: Dict[str, Any] = field(default_factory=dict)
    source_tables: List[str] = field(default_factory=list)

    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    observation_date: str = field(default_factory=lambda: datetime.now(timezone.utc).date().isoformat())

    recommended_placements: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    is_test: bool = False

    # auto-generated on to_bq_row()
    artifact_id: str = field(default="")
    lineage_id: str = field(default="")

    def __post_init__(self) -> None:
        if not self.artifact_id:
            self.artifact_id = str(uuid.uuid4())
        if not self.lineage_id:
            key = f"agent:{self.agent_id}:{self.observation_date}:{self.title[:40]}"
            self.lineage_id = f"v4:{hashlib.sha1(key.encode()).hexdigest()[:12]}"
        self.confidence = max(0.0, min(1.0, self.confidence))

    def to_bq_row(self) -> dict:
        """Serialise to a BigQuery insert-compatible dict."""
        ev = self.evidence
        src = self.source_tables

        return {
            "artifact_id": self.artifact_id,
            "agent_id": self.agent_id,
            "domain": self.domain,
            "artifact_type": self.artifact_type,
            "title": self.title,
            "summary": self.summary[:500],
            "body": self.body,
            "confidence": self.confidence,
            "severity": self.severity,
            "symbols": self.symbols or [],
            "portfolio_id": self.portfolio_id,
            "evidence": json.dumps(ev) if isinstance(ev, dict) else str(ev),
            "source_tables": src or [],
            "generated_at": self.generated_at,
            "observation_date": self.observation_date,
            "recommended_placements": self.recommended_placements or [],
            "tags": self.tags or [],
            "lineage_id": self.lineage_id,
            "is_test": self.is_test,
        }


# ─── BigQuery schema for artifacts.agent_outputs ─────────────────────────────

S = bigquery.SchemaField

AGENT_OUTPUTS_SCHEMA = [
    S("artifact_id", "STRING", "REQUIRED"),
    S("agent_id", "STRING", "REQUIRED"),
    S("domain", "STRING", "REQUIRED"),
    S("artifact_type", "STRING", "REQUIRED"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("body", "STRING", "NULLABLE"),
    S("confidence", "FLOAT64", "NULLABLE"),
    S("severity", "STRING", "NULLABLE"),
    S("symbols", "STRING", "REPEATED"),
    S("portfolio_id", "STRING", "NULLABLE"),
    S("evidence", "JSON", "NULLABLE"),
    S("source_tables", "STRING", "REPEATED"),
    S("generated_at", "TIMESTAMP", "NULLABLE"),
    S("observation_date", "DATE", "NULLABLE"),
    S("recommended_placements", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("lineage_id", "STRING", "NULLABLE"),
    S("is_test", "BOOL", "NULLABLE"),
]
