export { IntelligenceDrawer } from './IntelligenceDrawer';
export type {
  IntelligenceDrawerProps,
  IntelligenceDrawerSectionConfig,
  IntelligenceSectionKey,
} from './IntelligenceDrawer';
export { useIntelligenceDrawer } from './useIntelligenceDrawer';
export type { DrawerState, UseIntelligenceDrawerReturn } from './useIntelligenceDrawer';

export { SummarySection } from './sections/SummarySection';
export { HistoricalSection } from './sections/HistoricalSection';
export { RelatedSection } from './sections/RelatedSection';
export { NarrativeSection } from './sections/NarrativeSection';
export { MacroSection } from './sections/MacroSection';
export { LinkedSection } from './sections/LinkedSection';

export type {
  SectionState,
  SummaryPayload,
  HistoricalPayload,
  HistoricalAnalog,
  RelatedPayload,
  RelatedAsset,
  NarrativePayload,
  NarrativeTheme,
  MacroPayload,
  MacroIndicator,
  LinkedPayload,
  LinkedDashboard,
} from './sections/types';
