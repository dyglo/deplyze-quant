import React, { useRef } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdown {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}

interface DashboardFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDropdown[];
  resultCount?: number;
  actions?: React.ReactNode;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  search, onSearchChange, searchPlaceholder = 'Search symbol or name…',
  filters, resultCount, actions,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 12, flexWrap: 'wrap',
    }}>
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flex: '1 1 180px', minWidth: 150, maxWidth: 280,
        padding: '5px 10px', borderRadius: 7,
        border: '1px solid var(--border)', background: 'var(--card)',
      }}>
        <Search size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, color: 'var(--foreground)',
          }}
        />
        {search && (
          <button
            onClick={() => { onSearchChange(''); inputRef.current?.focus(); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--muted-foreground)', display: 'flex' }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      {filters?.map((f) => (
        <div key={f.id} style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            border: `1px solid ${f.value !== 'all' ? 'var(--primary)' : 'var(--border)'}`,
            background: f.value !== 'all' ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'var(--card)',
            cursor: 'pointer',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {f.label}:
            </span>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: 12, fontWeight: 600,
                color: f.value !== 'all' ? 'var(--primary)' : 'var(--foreground)',
                cursor: 'pointer', padding: 0, appearance: 'none', paddingRight: 14,
              }}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={11} style={{ color: 'var(--muted-foreground)', pointerEvents: 'none', marginLeft: -14 }} />
          </div>
        </div>
      ))}

      {/* Result count */}
      {resultCount != null && (
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 2 }}>
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Right-side actions */}
      {actions && <div style={{ marginLeft: 'auto' }}>{actions}</div>}
    </div>
  );
};
