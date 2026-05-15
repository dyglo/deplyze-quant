/**
 * ChartDownloadButton — camera icon that exports the nearest chart to PNG.
 *
 * Usage with SVG charts (Recharts):
 *   const { chartRef, download, downloading } = useChartExport('my-chart.png');
 *   <div style={{ position: 'relative' }}>
 *     <ChartDownloadButton onDownload={download} downloading={downloading} />
 *     <div ref={chartRef}><LineChart ... /></div>
 *   </div>
 *
 * Usage with correlation heatmap:
 *   <ChartDownloadButton onDownload={() => exportHeatmapAsPng(snapshot, 'Correlation Matrix')} />
 */

import React, { useRef, useCallback, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { exportChartAsPng } from '../../lib/chartExport';
import { toast } from 'sonner';

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useChartExport(filename = 'deplyze-chart.png') {
  const chartRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(async () => {
    if (!chartRef.current || downloading) return;
    setDownloading(true);
    try {
      await exportChartAsPng(chartRef.current, filename);
      toast.success('Chart exported');
    } catch (e) {
      toast.error('Export failed — try again');
      console.error('[chartExport]', e);
    } finally {
      setDownloading(false);
    }
  }, [filename, downloading]);

  return { chartRef, download, downloading };
}

// ─── Button ───────────────────────────────────────────────────────────────

interface ChartDownloadButtonProps {
  onDownload: () => void;
  downloading?: boolean;
  /** Position variant. 'corner' floats absolutely inside a relative parent. */
  position?: 'corner' | 'inline';
  label?: string;
}

export const ChartDownloadButton: React.FC<ChartDownloadButtonProps> = ({
  onDownload,
  downloading = false,
  position = 'corner',
  label,
}) => {
  const style: React.CSSProperties = position === 'corner' ? {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  } : {};

  return (
    <button
      onClick={onDownload}
      disabled={downloading}
      title={downloading ? 'Exporting…' : 'Download chart as PNG'}
      aria-label="Download chart as PNG"
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: label ? '4px 8px' : '5px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: downloading ? 'var(--muted-foreground)' : 'var(--foreground)',
        cursor: downloading ? 'not-allowed' : 'pointer',
        opacity: downloading ? 0.6 : 1,
        fontSize: 11,
        fontWeight: 600,
        transition: 'opacity 0.15s, background 0.15s',
        backdropFilter: 'blur(4px)',
      }}
      onMouseEnter={(e) => {
        if (!downloading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--card)';
      }}
    >
      {downloading
        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
        : <Camera size={13} />}
      {label && <span>{downloading ? 'Exporting…' : label}</span>}
    </button>
  );
};

// ─── Convenience wrapper: ChartFrame ──────────────────────────────────────
// Drop-in replacement for a section header + chart that adds download support.

interface ChartFrameProps {
  title?: string;
  filename?: string;
  children: React.ReactNode;
  /** Extra elements to render in the header row (e.g., a legend). */
  headerRight?: React.ReactNode;
  style?: React.CSSProperties;
}

export const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  filename,
  children,
  headerRight,
  style,
}) => {
  const { chartRef, download, downloading } = useChartExport(
    filename ?? (title ? `${title.toLowerCase().replace(/\s+/g, '-')}.png` : 'chart.png'),
  );

  return (
    <div
      style={{ position: 'relative', ...style }}
    >
      {(title || headerRight) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          {title && <h2 className="ds-heading" style={{ margin: 0 }}>{title}</h2>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            {headerRight}
            <ChartDownloadButton onDownload={download} downloading={downloading} position="inline" />
          </div>
        </div>
      )}
      {!title && !headerRight && (
        <ChartDownloadButton onDownload={download} downloading={downloading} position="corner" />
      )}
      <div ref={chartRef}>{children}</div>
    </div>
  );
};

export default ChartDownloadButton;
