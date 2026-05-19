import React, { useState, useMemo } from 'react';
import type { AssetClass } from '../../types';

/**
 * AssetIcon — recognizable visual identity for a symbol.
 *
 * Sources, by asset class:
 *   - equity / ETF → financialmodelingprep public stock-image CDN
 *   - crypto       → coincap public icon CDN
 *   - fx           → composed currency-pair badge (no good free flag CDN for pairs)
 *   - commodity    → labeled gradient badge
 *   - other        → deterministic ticker badge
 *
 * Any image failure falls back to the deterministic ticker badge — never
 * leaves a broken-image rectangle.
 */

const STOCK_TICKERS = new Set([
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','NFLX','AMD','INTC',
  'JPM','BAC','GS','MS','BRK.B','UNH','JNJ','PG','XOM','CVX','KO','PEP','WMT',
  'COST','HD','MCD','DIS','BA','CAT','GE','IBM','ORCL','CRM','ADBE','PYPL',
]);
const ETF_TICKERS = new Set(['SPY','QQQ','GLD','SLV','TLT','UUP','IWM','DIA','VTI','VOO','HYG','LQD','XLE','XLF','XLK','XLI','XLV','XLY','XLP']);
const CRYPTO_BASES = new Set(['BTC','ETH','SOL','XRP','ADA','DOGE','MATIC','DOT','LINK','AVAX','LTC','BCH']);

function classify(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(s)) {
    const [a] = s.split('/');
    if (a === 'XAU' || a === 'XAG' || a === 'XPD' || a === 'XPT') return 'commodity';
    if (CRYPTO_BASES.has(a)) return 'crypto';
    return 'fx';
  }
  if (CRYPTO_BASES.has(s)) return 'crypto';
  if (ETF_TICKERS.has(s)) return 'equity'; // ETFs use the same logo CDN as stocks
  if (STOCK_TICKERS.has(s)) return 'equity';
  // Heuristic: pure letters w/ no slash and length 1–5 → likely equity.
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(s)) return 'equity';
  return 'equity';
}

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 38%, 42%)`;
}

function logoUrlFor(symbol: string, cls: AssetClass): string | null {
  const s = symbol.toUpperCase().replace(/\s+/g, '');
  // Never call image CDNs for FX/commodity pairs that contain '/' — those
  // aren't valid stock tickers and will always 404.
  if (s.includes('/')) return null;
  if (cls === 'equity') {
    return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`;
  }
  if (cls === 'crypto') {
    return `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`;
  }
  return null; // fx / commodity / unknown → badge
}

export const AssetIcon: React.FC<{
  symbol: string;
  size?: number;
  className?: string;
  title?: string;
}> = ({ symbol, size = 28, className, title }) => {
  const [failed, setFailed] = useState(false);
  const cls = useMemo(() => classify(symbol), [symbol]);
  const url = !failed ? logoUrlFor(symbol, cls) : null;

  const badgeLabel = useMemo(() => {
    const s = symbol.toUpperCase();
    if (cls === 'fx') return s.replace('/', '·');
    if (cls === 'commodity') {
      if (s.startsWith('XAU')) return 'Au';
      if (s.startsWith('XAG')) return 'Ag';
      if (s.startsWith('XPT')) return 'Pt';
      if (s.startsWith('XPD')) return 'Pd';
      return s.slice(0, 3);
    }
    if (s.length <= 4) return s;
    return s.slice(0, 3);
  }, [symbol, cls]);

  const bg = useMemo(() => {
    if (cls === 'fx') return 'linear-gradient(135deg, #2e3a4a, #1d2530)';
    if (cls === 'commodity') return 'linear-gradient(135deg, #8a6a2a, #5d4513)';
    if (cls === 'crypto') return 'linear-gradient(135deg, #c2701f, #823f0a)';
    return hashColor(symbol);
  }, [symbol, cls]);

  const fontSize = Math.max(8, Math.round(size * 0.36));

  return (
    <div
      className={className}
      title={title ?? symbol}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      {url ? (
        <img
          src={url}
          alt={symbol}
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#fff' }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{badgeLabel}</span>
      )}
    </div>
  );
};
