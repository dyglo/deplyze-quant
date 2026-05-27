import React, { useState } from 'react';
import { countryFlagUrl } from '../../lib/countryDatabase';

/**
 * Flag — real flag image (flagcdn PNG), because Unicode flag emoji do not
 * render on Windows Chrome. Falls back to a neutral chip with the ISO code.
 */
export const Flag: React.FC<{ iso?: string | null; width?: number }> = ({ iso, width = 20 }) => {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * 0.72);

  if (!iso) {
    // Asset classes without a country (crypto, FX, commodities) get a neutral slot.
    return <span style={{ display: 'inline-block', width, height, flexShrink: 0 }} aria-hidden />;
  }

  if (failed) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width, height, flexShrink: 0, borderRadius: 2, background: 'var(--muted)',
        fontSize: 8, fontWeight: 700, color: 'var(--muted-foreground)',
      }}>{iso.toUpperCase()}</span>
    );
  }

  return (
    <img
      src={countryFlagUrl(iso, 20)}
      alt={iso.toUpperCase()}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ flexShrink: 0, borderRadius: 2, objectFit: 'cover', display: 'block', boxShadow: '0 0 0 1px var(--border)' }}
    />
  );
};
