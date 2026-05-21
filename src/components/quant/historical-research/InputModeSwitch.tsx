/**
 * InputModeSwitch — small segmented control that toggles between the
 * natural-language CommandBar and the structured QuickBuild form on the
 * landing.
 */

import React from 'react';
import { Sparkles, SlidersHorizontal } from 'lucide-react';

export type InputMode = 'nl' | 'quick';

interface Props {
  mode: InputMode;
  onChange: (m: InputMode) => void;
}

export const InputModeSwitch: React.FC<Props> = ({ mode, onChange }) => (
  <div role="tablist" aria-label="Input mode" style={wrap}>
    <Btn active={mode === 'nl'} onClick={() => onChange('nl')}>
      <Sparkles size={12} /> Ask a question
    </Btn>
    <Btn active={mode === 'quick'} onClick={() => onChange('quick')}>
      <SlidersHorizontal size={12} /> Quick build
    </Btn>
  </div>
);

const Btn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active, onClick, children,
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px',
      borderRadius: 6,
      border: 'none',
      background: active ? 'var(--card)' : 'transparent',
      color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
      fontSize: 12,
      fontWeight: active ? 500 : 400,
      cursor: 'pointer',
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
    }}
  >
    {children}
  </button>
);

const wrap: React.CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 3,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--muted)',
};
