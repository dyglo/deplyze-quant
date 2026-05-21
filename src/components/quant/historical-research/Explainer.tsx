/**
 * Explainer — calm, evidence-grounded one-paragraph caption that sits below
 * a widget's chart. The text is computed locally from the chart's own data,
 * never LLM-generated, so the explanation can never disagree with the
 * numbers a user is looking at.
 */

import React from 'react';
import { Lightbulb } from 'lucide-react';

interface Props {
  text: string;
}

export const Explainer: React.FC<Props> = ({ text }) => {
  if (!text) return null;
  return (
    <div style={wrap}>
      <Lightbulb size={12} style={{ color: 'var(--muted-foreground)', flex: '0 0 auto', marginTop: 2 }} />
      <div style={textStyle}>{text}</div>
    </div>
  );
};

const wrap: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px dashed var(--border)',
};

const textStyle: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.55,
  color: 'var(--muted-foreground)',
};
