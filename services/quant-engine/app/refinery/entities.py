"""
Entity extraction — deterministic, rule-based.

Why rule-based and not ML:
  • Institutional research needs auditable links. "Apple" the company vs. the
    fruit kills a transformer-based NER's precision; a curated alias list with
    word-boundary regex is reproducible and inspectable.
  • Docker image stays small — no spaCy / transformers dependency.

What this module does:
  1. Build a compiled Aho-Corasick-equivalent matcher from the curated
     ontology (`ontology.CURATED_ENTITIES`) plus the dynamic ticker map from
     EDGAR (resolved at runtime per request).
  2. Scan a text body, returning `EntityMention(entity_id, label, type,
     surface, char_start)` per match.
  3. Aggregate mentions into `EntityFeature` summaries (mention_count,
     salience, first/last position, co-mentioned entities).

Salience formula: weighted mention count where each mention's weight is
`1 / (1 + position_quartile)`. Earlier mentions count more (institutional
prose puts the main subject up front).
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Optional

import structlog

from app.refinery.ontology import CURATED_ENTITIES, Entity, EntityType

log = structlog.get_logger("quant_engine.refinery.entities")


@dataclass
class EntityMention:
    entity_id: str
    entity_label: str
    entity_type: EntityType
    surface: str
    char_start: int


@dataclass
class EntityFeature:
    entity_id: str
    entity_label: str
    entity_type: EntityType
    mention_count: int
    salience: float
    first_char: int
    last_char: int
    co_entities: list[str] = field(default_factory=list)


# ─── Matcher ──────────────────────────────────────────────────────────────────

# We compile one big alternation regex with word boundaries. For curated
# entities the alias set is small (~150 phrases) so a compiled OR-pattern with
# longest-match priority is fast and dependency-free.

def _build_pattern(entities: Iterable[Entity]) -> tuple[re.Pattern, dict[str, Entity]]:
    """Returns (compiled_regex, surface_lower → Entity)."""
    by_surface: dict[str, Entity] = {}
    surfaces: list[str] = []
    for ent in entities:
        for alias in ent.aliases:
            key = alias.lower()
            if key in by_surface:
                continue
            by_surface[key] = ent
            surfaces.append(re.escape(alias))
    # Sort by length desc so "10-year yield" wins over "10-year".
    surfaces.sort(key=len, reverse=True)
    # \b doesn't handle punctuation alias edges well, so we use explicit
    # boundary lookarounds that allow alphanum / underscore boundaries.
    body = "|".join(surfaces) if surfaces else r"(?!x)x"  # never-match fallback
    pat = re.compile(rf"(?<![A-Za-z0-9_])(?:{body})(?![A-Za-z0-9_])", re.IGNORECASE)
    return pat, by_surface


_CURATED_PATTERN, _CURATED_SURFACE_MAP = _build_pattern(CURATED_ENTITIES)


def _build_runtime_matcher(
    extra_companies: Optional[dict[str, str]] = None,
) -> tuple[re.Pattern, dict[str, Entity]]:
    """
    Build a combined matcher = curated entities + runtime-resolved companies.

    `extra_companies` is {ticker → entity_name}, typically the SEC ticker map.
    Each ticker contributes one entity with aliases (ticker upper-case + the
    cleaned company name truncated to its lead phrase).
    """
    if not extra_companies:
        return _CURATED_PATTERN, _CURATED_SURFACE_MAP

    company_entities: list[Entity] = []
    for ticker, name in extra_companies.items():
        t = (ticker or "").upper().strip()
        n = (name or "").strip()
        if not t:
            continue
        # Use just the lead phrase of the legal name as a fuzzy alias. We strip
        # legal suffixes that cause false positives ("Inc.", "Corp.").
        lead = re.split(r",|\bInc\.?\b|\bCorp\.?\b|\bL\.?P\.?\b|\bLtd\.?\b", n)[0].strip()
        aliases: list[str] = [t]
        if lead and len(lead) >= 4:
            aliases.append(lead)
        company_entities.append(Entity(f"CO_{t}", n or t, "company", tuple(aliases)))

    combined = list(CURATED_ENTITIES) + company_entities
    return _build_pattern(combined)


# ─── Extraction ───────────────────────────────────────────────────────────────


def extract_mentions(
    text: str,
    *,
    extra_companies: Optional[dict[str, str]] = None,
) -> list[EntityMention]:
    """Scan `text` and return every entity surface mention in order."""
    if not text:
        return []
    pat, surface_map = _build_runtime_matcher(extra_companies)
    mentions: list[EntityMention] = []
    for m in pat.finditer(text):
        surface = m.group(0)
        ent = surface_map.get(surface.lower())
        if ent is None:
            continue
        mentions.append(EntityMention(
            entity_id=ent.entity_id,
            entity_label=ent.entity_label,
            entity_type=ent.entity_type,
            surface=surface,
            char_start=m.start(),
        ))
    return mentions


def aggregate_features(
    mentions: list[EntityMention],
    *,
    text_length: Optional[int] = None,
) -> list[EntityFeature]:
    """
    Collapse mentions to per-entity features with salience + co-mentions.

    Salience formula:
      For each mention, compute its position quartile q (0..3) based on
      char_start / text_length. Each mention contributes weight 1/(1+q).
      Result is sum of weights, then normalized by document-mention-volume so
      cross-document comparison is reasonable.
    """
    if not mentions:
        return []
    if text_length is None or text_length <= 0:
        text_length = max((m.char_start for m in mentions), default=1) + 1

    by_id: dict[str, list[EntityMention]] = defaultdict(list)
    for m in mentions:
        by_id[m.entity_id].append(m)

    # build co-mention map (sentence-window approximation: ±400 chars)
    WINDOW = 400
    co_pairs: dict[str, set[str]] = defaultdict(set)
    sorted_ms = sorted(mentions, key=lambda x: x.char_start)
    for i, m in enumerate(sorted_ms):
        for j in range(i + 1, len(sorted_ms)):
            n = sorted_ms[j]
            if n.char_start - m.char_start > WINDOW:
                break
            if n.entity_id != m.entity_id:
                co_pairs[m.entity_id].add(n.entity_id)
                co_pairs[n.entity_id].add(m.entity_id)

    features: list[EntityFeature] = []
    total_mentions = len(mentions)
    for eid, group in by_id.items():
        first = group[0]
        weight = 0.0
        for mm in group:
            q = min(3, int((mm.char_start / max(1, text_length)) * 4))
            weight += 1.0 / (1.0 + q)
        salience = round(weight / max(1.0, total_mentions ** 0.5), 4)
        features.append(EntityFeature(
            entity_id=eid,
            entity_label=first.entity_label,
            entity_type=first.entity_type,
            mention_count=len(group),
            salience=salience,
            first_char=min(g.char_start for g in group),
            last_char=max(g.char_start for g in group),
            co_entities=sorted(co_pairs.get(eid, set())),
        ))
    # sort by salience desc — caller can truncate
    features.sort(key=lambda f: (-f.salience, -f.mention_count))
    return features
