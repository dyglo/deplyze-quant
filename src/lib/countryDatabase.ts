/**
 * Global country database with ETF mappings.
 * Covers 60+ countries across all regions.
 * ETF symbols are the primary vehicle for market data.
 */

export type Region = 'developed' | 'emerging' | 'frontier';
export type Continent = 'north_america' | 'europe' | 'asia_pacific' | 'latin_america' | 'middle_east_africa';

export interface CountryEntry {
  name: string;
  isoCode: string;        // 2-letter ISO 3166-1 alpha-2
  etf: string | null;     // Primary ETF symbol (null = no liquid ETF)
  etfName?: string;       // ETF fund name
  region: Region;
  continent: Continent;
  aliases?: string[];     // Alternative search terms
}

export const COUNTRY_DATABASE: CountryEntry[] = [
  // ── United States ──────────────────────────────────────────────────────────
  { name: 'United States',   isoCode: 'US', etf: 'SPY',  etfName: 'SPDR S&P 500',        region: 'developed', continent: 'north_america' },

  // ── North America ──────────────────────────────────────────────────────────
  { name: 'Canada',          isoCode: 'CA', etf: 'EWC',  etfName: 'iShares MSCI Canada',  region: 'developed', continent: 'north_america' },
  { name: 'Mexico',          isoCode: 'MX', etf: 'EWW',  etfName: 'iShares MSCI Mexico',  region: 'emerging',  continent: 'north_america' },

  // ── Europe — Developed ────────────────────────────────────────────────────
  { name: 'United Kingdom',  isoCode: 'GB', etf: 'EWU',  etfName: 'iShares MSCI UK',      region: 'developed', continent: 'europe', aliases: ['UK', 'Britain', 'England'] },
  { name: 'Germany',         isoCode: 'DE', etf: 'EWG',  etfName: 'iShares MSCI Germany', region: 'developed', continent: 'europe' },
  { name: 'France',          isoCode: 'FR', etf: 'EWQ',  etfName: 'iShares MSCI France',  region: 'developed', continent: 'europe' },
  { name: 'Switzerland',     isoCode: 'CH', etf: 'EWL',  etfName: 'iShares MSCI Switzerland', region: 'developed', continent: 'europe' },
  { name: 'Sweden',          isoCode: 'SE', etf: 'EWD',  etfName: 'iShares MSCI Sweden',  region: 'developed', continent: 'europe' },
  { name: 'Netherlands',     isoCode: 'NL', etf: 'EWN',  etfName: 'iShares MSCI Netherlands', region: 'developed', continent: 'europe' },
  { name: 'Spain',           isoCode: 'ES', etf: 'EWP',  etfName: 'iShares MSCI Spain',   region: 'developed', continent: 'europe' },
  { name: 'Italy',           isoCode: 'IT', etf: 'EWI',  etfName: 'iShares MSCI Italy',   region: 'developed', continent: 'europe' },
  { name: 'Austria',         isoCode: 'AT', etf: 'EWO',  etfName: 'iShares MSCI Austria', region: 'developed', continent: 'europe' },
  { name: 'Belgium',         isoCode: 'BE', etf: 'EWK',  etfName: 'iShares MSCI Belgium', region: 'developed', continent: 'europe' },
  { name: 'Denmark',         isoCode: 'DK', etf: 'EDEN', etfName: 'iShares MSCI Denmark', region: 'developed', continent: 'europe' },
  { name: 'Finland',         isoCode: 'FI', etf: 'EFNL', etfName: 'iShares MSCI Finland', region: 'developed', continent: 'europe' },
  { name: 'Norway',          isoCode: 'NO', etf: 'ENOR', etfName: 'iShares MSCI Norway',  region: 'developed', continent: 'europe' },
  { name: 'Portugal',        isoCode: 'PT', etf: 'PGAL', etfName: 'Global X MSCI Portugal', region: 'developed', continent: 'europe' },
  { name: 'Ireland',         isoCode: 'IE', etf: 'EIRL', etfName: 'iShares MSCI Ireland', region: 'developed', continent: 'europe' },

  // ── Europe — Emerging ────────────────────────────────────────────────────
  { name: 'Poland',          isoCode: 'PL', etf: 'EPOL', etfName: 'iShares MSCI Poland',  region: 'emerging',  continent: 'europe' },
  { name: 'Turkey',          isoCode: 'TR', etf: 'TUR',  etfName: 'iShares MSCI Turkey',  region: 'emerging',  continent: 'europe' },
  { name: 'Greece',          isoCode: 'GR', etf: 'GREK', etfName: 'Global X MSCI Greece', region: 'emerging',  continent: 'europe' },
  { name: 'Czech Republic',  isoCode: 'CZ', etf: null,   region: 'emerging',  continent: 'europe', aliases: ['Czechia'] },
  { name: 'Hungary',         isoCode: 'HU', etf: null,   region: 'emerging',  continent: 'europe' },

  // ── Asia Pacific — Developed ──────────────────────────────────────────────
  { name: 'Japan',           isoCode: 'JP', etf: 'EWJ',  etfName: 'iShares MSCI Japan',   region: 'developed', continent: 'asia_pacific' },
  { name: 'Australia',       isoCode: 'AU', etf: 'EWA',  etfName: 'iShares MSCI Australia', region: 'developed', continent: 'asia_pacific' },
  { name: 'Singapore',       isoCode: 'SG', etf: 'EWS',  etfName: 'iShares MSCI Singapore', region: 'developed', continent: 'asia_pacific' },
  { name: 'Hong Kong',       isoCode: 'HK', etf: 'EWH',  etfName: 'iShares MSCI Hong Kong', region: 'developed', continent: 'asia_pacific' },
  { name: 'New Zealand',     isoCode: 'NZ', etf: 'ENZL', etfName: 'iShares MSCI New Zealand', region: 'developed', continent: 'asia_pacific' },
  { name: 'South Korea',     isoCode: 'KR', etf: 'EWY',  etfName: 'iShares MSCI South Korea', region: 'developed', continent: 'asia_pacific', aliases: ['Korea'] },

  // ── Asia Pacific — Emerging ───────────────────────────────────────────────
  { name: 'China',           isoCode: 'CN', etf: 'FXI',  etfName: 'iShares China Large-Cap', region: 'emerging', continent: 'asia_pacific', aliases: ['PRC'] },
  { name: 'Taiwan',          isoCode: 'TW', etf: 'EWT',  etfName: 'iShares MSCI Taiwan',  region: 'emerging',  continent: 'asia_pacific' },
  { name: 'India',           isoCode: 'IN', etf: 'INDA', etfName: 'iShares MSCI India',   region: 'emerging',  continent: 'asia_pacific' },
  { name: 'Thailand',        isoCode: 'TH', etf: 'THD',  etfName: 'iShares MSCI Thailand', region: 'emerging', continent: 'asia_pacific' },
  { name: 'Malaysia',        isoCode: 'MY', etf: 'EWM',  etfName: 'iShares MSCI Malaysia', region: 'emerging', continent: 'asia_pacific' },
  { name: 'Indonesia',       isoCode: 'ID', etf: 'EIDO', etfName: 'iShares MSCI Indonesia', region: 'emerging', continent: 'asia_pacific' },
  { name: 'Philippines',     isoCode: 'PH', etf: 'EPHE', etfName: 'iShares MSCI Philippines', region: 'emerging', continent: 'asia_pacific' },
  { name: 'Vietnam',         isoCode: 'VN', etf: 'VNM',  etfName: 'VanEck Vietnam',       region: 'frontier',  continent: 'asia_pacific' },
  { name: 'Pakistan',        isoCode: 'PK', etf: 'PAK',  etfName: 'Global X MSCI Pakistan', region: 'frontier', continent: 'asia_pacific' },
  { name: 'Bangladesh',      isoCode: 'BD', etf: null,   region: 'frontier',  continent: 'asia_pacific' },
  { name: 'Sri Lanka',       isoCode: 'LK', etf: null,   region: 'frontier',  continent: 'asia_pacific' },

  // ── Latin America ─────────────────────────────────────────────────────────
  { name: 'Brazil',          isoCode: 'BR', etf: 'EWZ',  etfName: 'iShares MSCI Brazil',  region: 'emerging',  continent: 'latin_america' },
  { name: 'Chile',           isoCode: 'CL', etf: 'ECH',  etfName: 'iShares MSCI Chile',   region: 'emerging',  continent: 'latin_america' },
  { name: 'Colombia',        isoCode: 'CO', etf: 'GXG',  etfName: 'Global X MSCI Colombia', region: 'emerging', continent: 'latin_america' },
  { name: 'Peru',            isoCode: 'PE', etf: 'EPU',  etfName: 'iShares MSCI Peru',    region: 'emerging',  continent: 'latin_america' },
  { name: 'Argentina',       isoCode: 'AR', etf: 'ARGT', etfName: 'Global X MSCI Argentina', region: 'emerging', continent: 'latin_america' },

  // ── Middle East & Africa ──────────────────────────────────────────────────
  { name: 'Saudi Arabia',    isoCode: 'SA', etf: 'KSA',  etfName: 'iShares MSCI Saudi Arabia', region: 'emerging', continent: 'middle_east_africa', aliases: ['KSA'] },
  { name: 'United Arab Emirates', isoCode: 'AE', etf: 'UAE', etfName: 'iShares MSCI UAE',  region: 'emerging', continent: 'middle_east_africa', aliases: ['UAE', 'Dubai'] },
  { name: 'Qatar',           isoCode: 'QA', etf: 'QAT',  etfName: 'iShares MSCI Qatar',   region: 'emerging',  continent: 'middle_east_africa' },
  { name: 'Israel',          isoCode: 'IL', etf: 'EIS',  etfName: 'iShares MSCI Israel',  region: 'developed', continent: 'middle_east_africa' },
  { name: 'South Africa',    isoCode: 'ZA', etf: 'EZA',  etfName: 'iShares MSCI South Africa', region: 'emerging', continent: 'middle_east_africa' },
  { name: 'Egypt',           isoCode: 'EG', etf: 'EGPT', etfName: 'VanEck Egypt',         region: 'frontier',  continent: 'middle_east_africa' },
  { name: 'Nigeria',         isoCode: 'NG', etf: 'NGE',  etfName: 'Global X Nigeria',     region: 'frontier',  continent: 'middle_east_africa' },
  { name: 'Kenya',           isoCode: 'KE', etf: null,   region: 'frontier',  continent: 'middle_east_africa' },
  { name: 'Kuwait',          isoCode: 'KW', etf: 'KUWT', etfName: 'iShares MSCI Kuwait',  region: 'emerging',  continent: 'middle_east_africa' },
  { name: 'Jordan',          isoCode: 'JO', etf: null,   region: 'frontier',  continent: 'middle_east_africa' },
  { name: 'Morocco',         isoCode: 'MA', etf: null,   region: 'frontier',  continent: 'middle_east_africa' },
];

/** Reliable flag image URL via flagcdn.com */
export function countryFlagUrl(isoCode: string, size: 20 | 40 | 80 = 20): string {
  return `https://flagcdn.com/w${size}/${isoCode.toLowerCase()}.png`;
}

/** Fuzzy search against name, aliases, ISO code, ETF, continent, region */
export function searchCountries(query: string): CountryEntry[] {
  if (!query.trim()) return COUNTRY_DATABASE;
  const q = query.toLowerCase().trim();
  return COUNTRY_DATABASE.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.isoCode.toLowerCase() === q) return true;
    if (c.etf?.toLowerCase().includes(q)) return true;
    if (c.etfName?.toLowerCase().includes(q)) return true;
    if (c.region.includes(q)) return true;
    if (c.continent.replace(/_/g, ' ').includes(q)) return true;
    if (c.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}

export const CONTINENT_LABELS: Record<Continent, string> = {
  north_america: 'North America',
  europe: 'Europe',
  asia_pacific: 'Asia Pacific',
  latin_america: 'Latin America',
  middle_east_africa: 'Middle East & Africa',
};

export const REGION_LABELS: Record<Region, string> = {
  developed: 'Developed',
  emerging: 'Emerging',
  frontier: 'Frontier',
};
