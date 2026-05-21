/**
 * AwarenessToneContext — page-level provider that injects the resolved
 * `AwarenessTone` into every SectionNarrative without threading it
 * through each section component's props.
 *
 * The PortfolioAwareness page derives the tone once (from useUserProfile
 * + URL/LS overrides via deriveTone) and wraps the workspace tree in
 * this provider. SectionNarrative consumes it via useAwarenessTone() and
 * applies depth/posture to its `lines` array.
 *
 * Default context value is DEFAULT_TONE so any SectionNarrative rendered
 * outside the provider keeps the existing pre-personalisation behaviour.
 */

import React from 'react';
import { DEFAULT_TONE, type AwarenessTone } from '../../../lib/portfolio/awarenessTone';

const AwarenessToneContext = React.createContext<AwarenessTone>(DEFAULT_TONE);

export const AwarenessToneProvider: React.FC<{
  tone: AwarenessTone;
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <AwarenessToneContext.Provider value={tone}>{children}</AwarenessToneContext.Provider>
);

export function useAwarenessTone(): AwarenessTone {
  return React.useContext(AwarenessToneContext);
}
