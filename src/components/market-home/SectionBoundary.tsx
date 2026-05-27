import React from 'react';

interface Props { children: React.ReactNode; label?: string }
interface State { hasError: boolean }

/** Isolates a landing section so a render error degrades to a quiet notice
 * instead of blanking the whole page. */
export class SectionBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== 'undefined') console.warn('[MarketHome section error]', this.props.label, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '12px 2px' }}>
          {this.props.label ? `${this.props.label} could not be displayed.` : 'This section could not be displayed.'}
        </p>
      );
    }
    return this.props.children;
  }
}
