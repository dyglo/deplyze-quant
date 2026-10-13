import { createContext, useContext } from 'react';
import type { Organization, Site } from '../types';

// Account-owned Firebase data stays unselected while the backend is replaced.
// Opening a page must not subscribe to a previous user's private workspace.
export interface WorkspaceContextType {
  userId: string | null;
  currentWorkspace: Organization | null;
  currentProject: Site | null;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  userId: null,
  currentWorkspace: null,
  currentProject: null,
});

export const useWorkspace = () => useContext(WorkspaceContext);
