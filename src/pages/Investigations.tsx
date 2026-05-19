/**
 * Investigations page — standalone surface for the investigation memory UI.
 * Embedded form is also usable inside the Copilot sidebar via
 * `<InvestigationsPanel embedded />`.
 */

import React, { useEffect } from 'react';
import { logPageView } from '../lib/telemetry';
import { InvestigationsPanel } from '../components/personalization/InvestigationsPanel';

export const Investigations: React.FC = () => {
  useEffect(() => {
    logPageView('InvestigationsPage');
  }, []);
  return <InvestigationsPanel />;
};

export default Investigations;
