import React, { useState } from 'react';
import { ExternalLink, Building2, Users, Calendar, Globe } from 'lucide-react';
import type { InstrumentProfile } from '../../services/instrumentService';

function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtEmployees(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

const MetaItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <span style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>{icon}</span>
    <div style={{ minWidth: 0 }}>
      <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, lineHeight: 1.2 }}>{label}</div>
      <div className="ds-label" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  </div>
);

export const InstrumentProfileCard: React.FC<{
  profile: InstrumentProfile;
  symbol: string;
}> = ({ profile, symbol }) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveMarketCap = profile.marketCap ?? profile.marketCapitalization;
  const effectiveWebsite = profile.website ?? profile.weburl;
  const effectiveIndustry = profile.industry ?? profile.finnhubIndustry;

  return (
    <section className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {profile.logo && (
          <img
            src={profile.logo}
            alt={`${symbol} logo`}
            style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: 'var(--muted)', padding: 2, flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            {profile.name ?? symbol}
          </h3>
          {(profile.sector || effectiveIndustry) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
              {profile.sector && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--muted)', color: 'var(--muted-foreground)',
                  letterSpacing: 0.2, textTransform: 'uppercase',
                }}>{profile.sector}</span>
              )}
              {effectiveIndustry && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--muted)', color: 'var(--muted-foreground)',
                }}>{effectiveIndustry}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {profile.description && (
        <div>
          <p className="ds-caption" style={{
            margin: 0, lineHeight: 1.55, color: 'var(--foreground)',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 3,
            WebkitBoxOrient: expanded ? undefined : 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
            fontSize: 12,
          }}>
            {profile.description}
          </p>
          {profile.description.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--primary)', fontSize: 11, fontWeight: 600, marginTop: 3,
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 12px',
        paddingTop: 4,
        borderTop: '1px solid var(--border)',
      }}>
        {effectiveMarketCap != null && (
          <MetaItem icon={<Building2 size={11} />} label="Market Cap" value={fmtMarketCap(effectiveMarketCap)} />
        )}
        {profile.employees != null && (
          <MetaItem icon={<Users size={11} />} label="Employees" value={fmtEmployees(profile.employees)} />
        )}
        {profile.ipoDate && (
          <MetaItem icon={<Calendar size={11} />} label="IPO Date" value={profile.ipoDate} />
        )}
        {profile.exchange && (
          <MetaItem icon={<Building2 size={11} />} label="Exchange" value={profile.exchange} />
        )}
        {profile.country && (
          <MetaItem icon={<Globe size={11} />} label="Country" value={profile.country} />
        )}
        {profile.ceo && (
          <MetaItem icon={<Users size={11} />} label="CEO" value={profile.ceo} />
        )}
      </div>

      {effectiveWebsite && (
        <a
          href={effectiveWebsite}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: 'var(--muted-foreground)', fontSize: 11,
            textDecoration: 'none',
          }}
        >
          <Globe size={11} />
          {effectiveWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          <ExternalLink size={9} />
        </a>
      )}
    </section>
  );
};
