"""
Autonomous briefing engines (Wave K).

Each briefing type is a deterministic template renderer that pulls the latest
artifacts/observations from the warehouse and produces a markdown body. We
deliberately avoid LLM-call generation here:
  • Deterministic = reproducible = auditable for institutional consumers.
  • No external model dependency keeps the engine cheap to run on Cloud Run.
  • The frontend Copilot remains the place for LLM narrative; briefings are
    the structured, citation-bearing layer underneath it.
"""
