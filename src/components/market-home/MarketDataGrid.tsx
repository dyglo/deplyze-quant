import React from 'react';
import { useSWR } from '../../hooks/useSWR';
import { SectionCard } from './SectionCard';
import { MiniQuoteTable } from './MiniQuoteTable';
import {
  fetchWorldIndices, fetchSnapshot, type FlaggedRow,
} from '../../services/marketHomeService';

function useClass(key: Parameters<typeof fetchSnapshot>[0]) {
  return useSWR(() => fetchSnapshot(key), [key], { cacheKey: `marketHome:grid:${key}` });
}

export const MarketDataGrid: React.FC = () => {
  const indices = useSWR(() => fetchWorldIndices(), [], { cacheKey: 'marketHome:worldIndices' });
  const commodities = useClass('commodities');
  const etfs = useClass('etfs');
  const crypto = useClass('crypto');
  const bonds = useClass('bonds');
  const stocks = useClass('stocks');

  // Leading stocks = strongest movers from the tracked mega-cap set.
  const leading: FlaggedRow[] = [...(stocks.data ?? [])]
    .sort((a, b) => b.changePercent - a.changePercent);

  return (
    <SectionCard title="Market Data" subtitle="Cross-asset overview">
      <div
        className="market-home-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 28 }}
      >
        <MiniQuoteTable title="World Indices" rows={indices.data ?? []} loading={indices.loading} error={indices.error?.message} showFlags />
        <MiniQuoteTable title="Leading Stocks" rows={leading} loading={stocks.loading} error={stocks.error?.message} showFlags />
        <MiniQuoteTable title="Commodities" rows={commodities.data ?? []} loading={commodities.loading} error={commodities.error?.message} />
        <MiniQuoteTable title="ETFs" rows={etfs.data ?? []} loading={etfs.loading} error={etfs.error?.message} />
        <MiniQuoteTable title="Bond Proxies" rows={bonds.data ?? []} loading={bonds.loading} error={bonds.error?.message} />
        <MiniQuoteTable title="Crypto" rows={crypto.data ?? []} loading={crypto.loading} error={crypto.error?.message} />
      </div>
    </SectionCard>
  );
};
