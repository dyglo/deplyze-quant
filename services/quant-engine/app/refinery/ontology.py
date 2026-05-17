"""
Financial entity ontology — the canonical dictionary that the entity extractor
(`entities.py`) matches against.

Structure: each entity has a stable `entity_id`, a human `entity_label`, an
`entity_type` (one of EntityType), and a list of surface aliases that the
extractor scans for.

The ontology is intentionally curated rather than learned. Institutional
research needs deterministic, auditable entity links — a fuzzy NER model can
produce spurious matches ("Apple" the company vs. the fruit) that erode trust.
Companies are sourced separately from the SEC ticker map at runtime so we
don't need to hand-curate 6000 tickers here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

EntityType = Literal[
    "company",     # SEC-registered issuer (resolved at runtime via EDGAR map)
    "etf",         # exchange-traded fund
    "index",       # market index (SPX, NDX, RTY, …)
    "currency",    # ISO 4217 / FX cross
    "commodity",   # physical commodity
    "rate",        # benchmark interest rate
    "macro",       # macro indicator (CPI, payrolls, GDP, …)
    "sector",      # GICS sector
    "country",     # sovereign / region
    "theme",       # narrative theme (AI, energy transition, …)
    "executive",   # named individual
]


@dataclass(frozen=True)
class Entity:
    entity_id: str
    entity_label: str
    entity_type: EntityType
    aliases: tuple[str, ...] = field(default_factory=tuple)


# ─── Indices ──────────────────────────────────────────────────────────────────

INDICES: tuple[Entity, ...] = (
    Entity("SPX",  "S&P 500",            "index", ("S&P 500", "SPX", "the S&P", "S&P500")),
    Entity("NDX",  "Nasdaq 100",         "index", ("Nasdaq 100", "NDX", "Nasdaq-100")),
    Entity("IXIC", "Nasdaq Composite",   "index", ("Nasdaq Composite", "IXIC")),
    Entity("DJI",  "Dow Jones Industrial Average", "index", ("Dow Jones", "the Dow", "DJIA", "DJI")),
    Entity("RTY",  "Russell 2000",       "index", ("Russell 2000", "RTY", "small caps")),
    Entity("VIX",  "CBOE Volatility Index", "index", ("VIX", "fear gauge", "volatility index")),
    Entity("SX5E", "Euro Stoxx 50",      "index", ("Euro Stoxx 50", "SX5E", "Stoxx 50")),
    Entity("UKX",  "FTSE 100",           "index", ("FTSE 100", "FTSE100", "UKX")),
    Entity("N225", "Nikkei 225",         "index", ("Nikkei 225", "Nikkei", "N225")),
    Entity("HSI",  "Hang Seng",          "index", ("Hang Seng", "HSI")),
)

# ─── ETFs (institutional core) ────────────────────────────────────────────────

ETFS: tuple[Entity, ...] = (
    Entity("SPY",  "SPDR S&P 500 ETF",      "etf", ("SPY",)),
    Entity("QQQ",  "Invesco Nasdaq-100 ETF","etf", ("QQQ",)),
    Entity("IWM",  "iShares Russell 2000 ETF", "etf", ("IWM",)),
    Entity("DIA",  "SPDR Dow Jones ETF",    "etf", ("DIA",)),
    Entity("TLT",  "iShares 20+ Year Treasury Bond ETF", "etf", ("TLT",)),
    Entity("IEF",  "iShares 7-10 Year Treasury Bond ETF","etf", ("IEF",)),
    Entity("SHY",  "iShares 1-3 Year Treasury Bond ETF", "etf", ("SHY",)),
    Entity("LQD",  "iShares iBoxx IG Corp ETF", "etf", ("LQD",)),
    Entity("HYG",  "iShares iBoxx HY Corp ETF", "etf", ("HYG",)),
    Entity("GLD",  "SPDR Gold Shares",      "etf", ("GLD",)),
    Entity("SLV",  "iShares Silver Trust",  "etf", ("SLV",)),
    Entity("USO",  "United States Oil Fund","etf", ("USO",)),
    Entity("UNG",  "United States Natural Gas Fund", "etf", ("UNG",)),
    Entity("UUP",  "Invesco DB USD Bullish ETF", "etf", ("UUP",)),
    Entity("FXE",  "Invesco CurrencyShares Euro Trust", "etf", ("FXE",)),
    Entity("VNQ",  "Vanguard Real Estate ETF", "etf", ("VNQ",)),
    Entity("XLE",  "Energy Select Sector SPDR", "etf", ("XLE",)),
    Entity("XLF",  "Financial Select Sector SPDR", "etf", ("XLF",)),
    Entity("XLK",  "Technology Select Sector SPDR", "etf", ("XLK",)),
    Entity("XLV",  "Health Care Select Sector SPDR", "etf", ("XLV",)),
    Entity("XLY",  "Consumer Discretionary Select Sector SPDR", "etf", ("XLY",)),
    Entity("XLP",  "Consumer Staples Select Sector SPDR", "etf", ("XLP",)),
    Entity("XLI",  "Industrial Select Sector SPDR", "etf", ("XLI",)),
    Entity("XLU",  "Utilities Select Sector SPDR", "etf", ("XLU",)),
    Entity("XLB",  "Materials Select Sector SPDR", "etf", ("XLB",)),
    Entity("XLC",  "Communication Services Select Sector SPDR", "etf", ("XLC",)),
    Entity("XLRE", "Real Estate Select Sector SPDR", "etf", ("XLRE",)),
)

# ─── Currencies / FX ──────────────────────────────────────────────────────────

CURRENCIES: tuple[Entity, ...] = (
    Entity("USD", "US Dollar",  "currency", ("US Dollar", "USD", "the dollar", "greenback")),
    Entity("EUR", "Euro",       "currency", ("Euro", "EUR")),
    Entity("JPY", "Japanese Yen","currency", ("Japanese Yen", "JPY", "yen")),
    Entity("GBP", "British Pound","currency", ("British Pound", "GBP", "sterling", "the pound")),
    Entity("CHF", "Swiss Franc","currency", ("Swiss Franc", "CHF")),
    Entity("CNY", "Chinese Yuan","currency", ("yuan", "CNY", "renminbi", "RMB")),
    Entity("CAD", "Canadian Dollar","currency", ("Canadian Dollar", "CAD", "loonie")),
    Entity("AUD", "Australian Dollar","currency", ("Australian Dollar", "AUD", "Aussie dollar")),
    Entity("DXY", "USD Index", "currency", ("DXY", "dollar index", "USD index")),
)

# ─── Commodities ──────────────────────────────────────────────────────────────

COMMODITIES: tuple[Entity, ...] = (
    Entity("WTI",     "WTI Crude Oil",      "commodity", ("WTI", "WTI crude", "West Texas Intermediate", "crude oil")),
    Entity("BRENT",   "Brent Crude",        "commodity", ("Brent", "Brent crude")),
    Entity("NATGAS",  "Natural Gas",        "commodity", ("natural gas", "natgas", "Henry Hub")),
    Entity("GOLD",    "Gold",               "commodity", ("gold", "bullion")),
    Entity("SILVER",  "Silver",             "commodity", ("silver",)),
    Entity("COPPER",  "Copper",             "commodity", ("copper", "Dr. Copper")),
    Entity("CORN",    "Corn",               "commodity", ("corn",)),
    Entity("WHEAT",   "Wheat",              "commodity", ("wheat",)),
    Entity("SOYBEAN", "Soybean",            "commodity", ("soybean", "soybeans", "soy")),
    Entity("LUMBER",  "Lumber",             "commodity", ("lumber",)),
)

# ─── Rates ────────────────────────────────────────────────────────────────────

RATES: tuple[Entity, ...] = (
    Entity("FEDFUNDS", "Federal Funds Rate", "rate", ("Fed Funds", "federal funds rate", "FFR", "policy rate")),
    Entity("SOFR",     "SOFR",               "rate", ("SOFR",)),
    Entity("UST10Y",   "10-Year US Treasury yield", "rate", ("10-year", "10-year yield", "10-yr Treasury", "UST 10Y", "10y yield")),
    Entity("UST2Y",    "2-Year US Treasury yield",  "rate", ("2-year", "2-year yield", "2-yr Treasury", "UST 2Y")),
    Entity("UST30Y",   "30-Year US Treasury yield", "rate", ("30-year", "30-year yield", "UST 30Y")),
    Entity("UST3M",    "3-Month US Treasury yield", "rate", ("3-month", "3-month yield", "UST 3M", "T-bill")),
    Entity("BUND10Y",  "10-Year German Bund yield", "rate", ("Bund yield", "10-year Bund")),
    Entity("JGB10Y",   "10-Year JGB yield",         "rate", ("JGB", "10-year JGB")),
)

# ─── Macro indicators (FRED-keyed) ────────────────────────────────────────────

MACRO_INDICATORS: tuple[Entity, ...] = (
    Entity("CPI",     "Consumer Price Index", "macro", ("CPI", "consumer price index", "headline inflation")),
    Entity("CORECPI", "Core CPI",              "macro", ("core CPI", "CPILFESL")),
    Entity("PCE",     "Personal Consumption Expenditures", "macro", ("PCE", "PCE inflation", "PCEPI")),
    Entity("COREPCE", "Core PCE",              "macro", ("core PCE", "PCEPILFE")),
    Entity("GDP",     "Gross Domestic Product","macro", ("GDP", "gross domestic product")),
    Entity("UNRATE",  "Unemployment Rate",     "macro", ("unemployment rate", "U-3", "UNRATE")),
    Entity("NFP",     "Nonfarm Payrolls",      "macro", ("nonfarm payrolls", "NFP", "payrolls", "PAYEMS")),
    Entity("ISMMFG",  "ISM Manufacturing PMI", "macro", ("ISM Manufacturing", "ISM PMI", "manufacturing PMI")),
    Entity("ISMSVC",  "ISM Services PMI",      "macro", ("ISM Services", "services PMI")),
    Entity("INDPRO",  "Industrial Production", "macro", ("industrial production", "INDPRO")),
    Entity("RETAIL",  "Retail Sales",          "macro", ("retail sales",)),
    Entity("INITIAL_CLAIMS", "Initial Jobless Claims", "macro", ("jobless claims", "initial claims", "ICSA")),
)

# ─── GICS sectors ─────────────────────────────────────────────────────────────

SECTORS: tuple[Entity, ...] = (
    Entity("SEC_TECH",   "Information Technology", "sector", ("Information Technology", "tech sector", "technology sector")),
    Entity("SEC_FIN",    "Financials",             "sector", ("Financials", "financial sector", "banks")),
    Entity("SEC_ENE",    "Energy",                 "sector", ("Energy sector", "oil & gas sector")),
    Entity("SEC_HEALTH", "Health Care",            "sector", ("Health Care", "healthcare sector", "biotech sector")),
    Entity("SEC_CONS_D", "Consumer Discretionary", "sector", ("Consumer Discretionary",)),
    Entity("SEC_CONS_S", "Consumer Staples",       "sector", ("Consumer Staples",)),
    Entity("SEC_IND",    "Industrials",            "sector", ("Industrials",)),
    Entity("SEC_UTIL",   "Utilities",              "sector", ("Utilities sector",)),
    Entity("SEC_MAT",    "Materials",              "sector", ("Materials sector",)),
    Entity("SEC_COMM",   "Communication Services", "sector", ("Communication Services",)),
    Entity("SEC_RE",     "Real Estate",            "sector", ("Real Estate sector", "REITs")),
)

# ─── Countries / regions ──────────────────────────────────────────────────────

COUNTRIES: tuple[Entity, ...] = (
    Entity("US",     "United States",     "country", ("United States", "U.S.", "America")),
    Entity("EU",     "European Union",    "country", ("European Union", "the EU", "eurozone", "euro area")),
    Entity("UK",     "United Kingdom",    "country", ("United Kingdom", "the UK", "Britain")),
    Entity("JP",     "Japan",             "country", ("Japan",)),
    Entity("CN",     "China",             "country", ("China",)),
    Entity("DE",     "Germany",           "country", ("Germany",)),
    Entity("FR",     "France",            "country", ("France",)),
    Entity("CA",     "Canada",            "country", ("Canada",)),
    Entity("AU",     "Australia",         "country", ("Australia",)),
    Entity("IN",     "India",             "country", ("India",)),
    Entity("BR",     "Brazil",            "country", ("Brazil",)),
    Entity("EM",     "Emerging Markets",  "country", ("Emerging Markets", "EM", "emerging market")),
    Entity("DM",     "Developed Markets", "country", ("Developed Markets", "DM")),
)

# ─── Themes (narrative seeds — Wave H accumulates more dynamically) ───────────

THEMES: tuple[Entity, ...] = (
    Entity("THM_AI",          "Artificial Intelligence",    "theme", ("artificial intelligence", "AI", "generative AI", "large language model", "LLM")),
    Entity("THM_INFLATION",   "Inflation",                  "theme", ("inflation", "inflationary", "disinflation", "deflation")),
    Entity("THM_RECESSION",   "Recession risk",             "theme", ("recession", "hard landing", "soft landing")),
    Entity("THM_ENERGY",      "Energy transition",          "theme", ("energy transition", "green energy", "renewables", "clean energy")),
    Entity("THM_RATES",       "Rates cycle",                "theme", ("rate cycle", "rate hike", "rate cut", "tightening", "easing", "pivot")),
    Entity("THM_LIQUIDITY",   "Liquidity",                  "theme", ("liquidity", "QT", "quantitative tightening", "QE", "quantitative easing", "balance sheet")),
    Entity("THM_GEOPOLITIK",  "Geopolitical risk",          "theme", ("geopolitical risk", "geopolitics", "sanctions", "war")),
    Entity("THM_DEDOLLAR",    "De-dollarization",           "theme", ("de-dollarization", "dedollarization", "reserve currency")),
    Entity("THM_REGULATION",  "Financial regulation",       "theme", ("regulation", "regulatory", "Basel", "Dodd-Frank")),
    Entity("THM_EARNINGS",    "Earnings cycle",             "theme", ("earnings season", "earnings cycle", "guidance")),
    Entity("THM_CHINAREOPEN", "China reopening",            "theme", ("China reopening",)),
    Entity("THM_BANKSTRESS",  "Bank stress",                "theme", ("bank stress", "regional banks", "bank run", "deposit flight")),
)

# ─── Aggregator ──────────────────────────────────────────────────────────────

CURATED_ENTITIES: tuple[Entity, ...] = (
    *INDICES, *ETFS, *CURRENCIES, *COMMODITIES, *RATES,
    *MACRO_INDICATORS, *SECTORS, *COUNTRIES, *THEMES,
)
