import React, { useState } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { OHLCVChart } from './OHLCVChart';
import { FreshnessBadge } from './FreshnessBadge';

type TFKey = '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y';
const TF_SIZES: Record<TFKey, number> = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '2Y': 504 };
const TF_LABELS: TFKey[] = ['1W', '1M', '3M', '6M', '1Y', '2Y'];

export const InstrumentOHLCVSection: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [tf, setTf] = useState<TFKey>('3M');
  const ohlcv = useOHLCV(symbol, '1day', TF_SIZES[tf]);
  const bars = ohlcv.data?.bars ?? [];

  return (
    <section className="ds-surface" style={{ padding: 16, borderRadius: 10, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ds-heading" style={{ margin: 0 }}>Price History</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FreshnessBadge status={ohlcv.status} fetchedAt={ohlcv.fetchedAt} compact />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {TF_LABELS.map((t) => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600,
                background: tf === t ? 'var(--foreground)' : 'transparent',
                color: tf === t ? 'var(--background)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      {ohlcv.loading && !bars.length ? (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
          Loading {tf} bars…
        </div>
      ) : bars.length > 1 ? (
        <OHLCVChart bars={bars} height={260} symbol={symbol} />
      ) : (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          {ohlcv.error ? `Failed: ${ohlcv.error.message}` : 'No bars available.'}
          {' '}<button onClick={() => ohlcv.refresh()} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Retry</button>
        </p>
      )}
    </section>
  );
};
