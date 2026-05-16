import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';

interface Props {
  /** Earliest available timestamp (ms). */
  start: number;
  /** Latest available timestamp (ms). */
  end: number;
  /** Currently selected "as of" timestamp. `null` means "present" (end). */
  value: number | null;
  onChange: (asOf: number | null) => void;
  /** Step size for play / skip in days. Default 5. */
  stepDays?: number;
  /** ms between auto-play frames. Default 220. */
  playIntervalMs?: number;
}

const DAY_MS = 86_400_000;

/**
 * Historical replay scrubber. The user can drag through the loaded
 * history; producers re-derive the snapshot with `asOfTs ≤ value` so
 * the graph reflects only what was known at that point. "Present"
 * (value == null) clamps to `end` and stops play.
 *
 * The timeline auto-disables when there isn't enough history to make
 * replay meaningful (< 90 days of bars).
 */
export const ReplayTimeline: React.FC<Props> = ({
  start, end, value, onChange, stepDays = 5, playIntervalMs = 220,
}) => {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasEnoughHistory = end - start >= 90 * DAY_MS;

  // Auto-play steps forward by `stepDays`; stops on reaching present.
  useEffect(() => {
    if (!playing) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(() => {
      const cur = value ?? end;
      const next = cur + stepDays * DAY_MS;
      if (next >= end) { onChange(null); setPlaying(false); return; }
      onChange(next);
    }, playIntervalMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, value, end, stepDays, playIntervalMs, onChange]);

  if (!hasEnoughHistory) return null;

  const effective = value ?? end;
  const pct = clamp01((effective - start) / Math.max(1, end - start));

  const setFromPct = (p: number) => {
    const ts = Math.round(start + clamp01(p) * (end - start));
    if (ts >= end) onChange(null);
    else onChange(ts);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--card)',
      marginBottom: 10,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)',
      }}>Replay</span>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ControlButton
          label="Skip back"
          onClick={() => onChange(Math.max(start, (value ?? end) - stepDays * DAY_MS))}
        ><SkipBack size={12} /></ControlButton>
        <ControlButton
          label={playing ? 'Pause replay' : 'Play replay'}
          primary
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </ControlButton>
        <ControlButton
          label="Skip forward"
          onClick={() => {
            const next = (value ?? end) + stepDays * DAY_MS;
            if (next >= end) onChange(null);
            else onChange(next);
          }}
        ><SkipForward size={12} /></ControlButton>
        <ControlButton
          label="Return to present"
          onClick={() => { setPlaying(false); onChange(null); }}
        ><RotateCcw size={12} /></ControlButton>
      </div>

      {/* Scrubber track */}
      <div
        role="slider"
        aria-label="Replay timeline"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={effective}
        onMouseDown={(e) => {
          const track = e.currentTarget;
          const move = (ev: MouseEvent) => {
            const rect = track.getBoundingClientRect();
            setFromPct((ev.clientX - rect.left) / rect.width);
          };
          const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          move(e.nativeEvent);
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
        style={{
          position: 'relative',
          flex: 1,
          height: 22,
          padding: '0 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{
          width: '100%', height: 4,
          background: 'var(--muted)',
          borderRadius: 999,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct * 100}%`,
            background: 'var(--primary)',
            borderRadius: 999,
            opacity: value == null ? 0.4 : 1,
          }} />
          <div style={{
            position: 'absolute',
            left: `${pct * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12,
            background: 'var(--primary)',
            borderRadius: 999,
            border: '2px solid var(--card)',
            boxShadow: '0 0 0 1px var(--primary)',
          }} />
        </div>
      </div>

      <span style={{
        fontSize: 11, fontWeight: 700,
        fontFamily: 'ui-monospace, monospace',
        color: value == null ? 'var(--muted-foreground)' : 'var(--foreground)',
        minWidth: 88, textAlign: 'right',
      }}>
        {value == null ? 'present' : formatDate(effective)}
      </span>
    </div>
  );
};

const ControlButton: React.FC<{
  label: string;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, primary, onClick, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    style={{
      width: 24, height: 24,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`,
      background: primary ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
      color: primary ? 'var(--primary)' : 'var(--muted-foreground)',
      borderRadius: 6,
      cursor: 'pointer',
    }}
  >{children}</button>
);

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}
function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
