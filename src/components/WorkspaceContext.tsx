import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc,
  doc, 
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { createSite, subscribeToSites } from '../services/firestoreService';
import type { Organization, Site, UserProfile, Workspace } from '../types';
import { toast } from 'sonner';

export interface WorkspaceContextType {
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  workspaces: Organization[];
  currentWorkspace: Organization | null;
  projects: Site[];
  currentProject: Site | null;
  members: UserProfile[];
  invites: any[];
  loading: boolean;
  /** True when an org/workspace sync was rejected (e.g. Firestore permissions).
   *  The app stays usable; consumers can surface a non-blocking notice. */
  syncDegraded: boolean;

  // Actions
  selectWorkspace: (orgId: string) => Promise<void>;
  selectProject: (siteId: string | null) => void;
  createNewWorkspace: (name: string, slug: string, type: string) => Promise<string>;
  createNewProject: (name: string, location: string, type: string, description?: string) => Promise<string>;
  inviteNewMember: (email: string, role: 'admin' | 'manager' | 'viewer') => Promise<void>;
  removeWorkspaceMember: (uid: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  deleteWorkspace: async () => {},
  workspaces: [],
  currentWorkspace: null,
  projects: [],
  currentProject: null,
  members: [],
  invites: [],
  loading: true,
  syncDegraded: false,
  selectWorkspace: async () => {},
  selectProject: () => {},
  createNewWorkspace: async () => '',
  createNewProject: async () => '',
  inviteNewMember: async () => {},
  removeWorkspaceMember: async () => {},
  revokeInvite: async () => {},
  updateWorkspace: async () => {},
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [workspaces, setWorkspaces] = useState<Organization[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Site[]>([]);
  const [currentProject, setCurrentProject] = useState<Site | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [memberOrgIds, setMemberOrgIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncingMemberships, setIsSyncingMemberships] = useState(true);
  const [syncDegraded, setSyncDegraded] = useState(false);

  // Track specific load states to prevent race conditions
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);

  const isCreatingRef = useRef(false);
  const didInitialSyncRef = useRef(false);
  // Set when ANY org sync this session was rejected (permissions / outage). We
  // must NOT treat a failed sync as "user has zero workspaces" — auto-creating
  // a default in that state would spawn duplicate orgs behind a transient error.
  const syncErrorRef = useRef(false);

  // 1a. Realtime sync of memberships for this user
  useEffect(() => {
    if (!user) {
      setMemberOrgIds([]);
      return;
    }

    const q = query(
      collection(db, 'memberships'),
      where('uid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ids: string[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.orgId) ids.push(data.orgId);
      });
      setMemberOrgIds(ids);
      setIsSyncingMemberships(false);
    }, (err) => {
      console.error('[Memberships Sync Error]', err);
      syncErrorRef.current = true;
      setSyncDegraded(true);
      setIsSyncingMemberships(false);
    });

    return unsubscribe;
  }, [user]);

  // 1b. Realtime sync of organizations (Owned + Member Of)
  useEffect(() => {
    if (!user || isSyncingMemberships) {
      if (!user) {
        setWorkspaces([]);
        setCurrentWorkspace(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);

    // We use targeted queries to stay within security boundaries
    const ownedQ = query(
      collection(db, 'organizations'),
      where('ownerId', '==', user.uid)
    );

    let unsubOwned: () => void;
    let unsubMemberships: (() => void) | null = null;

    const syncOrgs = (ownedOrgs: Organization[], memberOrgs: Organization[]) => {
      const allOrgs = [...ownedOrgs];
      memberOrgs.forEach(m => {
        if (!allOrgs.find(o => o.id === m.id)) {
          allOrgs.push(m);
        }
      });

      const getTimestampMillis = (date: any): number => {
        if (!date) return 0;
        if (typeof date === 'object' && 'seconds' in date) return date.seconds * 1000;
        return 0;
      };

      allOrgs.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      setWorkspaces(allOrgs);

      // Set current active workspace
      const savedOrgId = profile?.orgId || localStorage.getItem('deplyze_active_workspace_id');
      const activeOrg = allOrgs.find(o => o.id === savedOrgId) || allOrgs[0];
      
      if (activeOrg) {
        setCurrentWorkspace(activeOrg);
        if (activeOrg.id !== profile?.orgId) {
          updateDoc(doc(db, 'users', user.uid), { orgId: activeOrg.id }).catch(console.error);
        }
      }
      
      // If we've finished both syncs at least once, mark initial sync as done
      if (ownedLoaded && membersLoaded) {
        didInitialSyncRef.current = true;
        setLoading(false);
      }
    };

    let latestOwned: Organization[] = [];
    let latestMember: Organization[] = [];

    unsubOwned = onSnapshot(ownedQ, (snap) => {
      // A successful read clears any earlier degraded state for this session.
      syncErrorRef.current = false;
      setSyncDegraded(false);
      latestOwned = snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
      setOwnedLoaded(true);
      syncOrgs(latestOwned, latestMember);
    }, (err) => {
      console.error('[Owned Orgs Sync Error]', err);
      // Fail safe: mark loaded + resolve loading so the app never hangs, flag
      // the session as degraded, and record the error so auto-create is skipped.
      syncErrorRef.current = true;
      setSyncDegraded(true);
      setOwnedLoaded(true);
      setLoading(false);
    });

    // 1b. Sync Organizations where user is a member
    // Firebase 'in' query limit is officially 30, but we use 10 to be safe and avoid any SDK bugs
    const chunkArray = (arr: string[], size: number) => {
      const chunks: string[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // Make sure we filter out empty strings or undefined
    const validMemberOrgIds = memberOrgIds.filter(id => !!id);
    const memberOrgChunks = chunkArray(validMemberOrgIds, 10);
    const unsubs: Unsubscribe[] = [];
    const allMemberResults: Map<string, Organization[]> = new Map();

    if (memberOrgChunks.length > 0) {
      memberOrgChunks.forEach((chunk, index) => {
        if (chunk.length === 0) return;
        
        const memberQ = query(
          collection(db, 'organizations'),
          where('__name__', 'in', chunk)
        );
        const unsub = onSnapshot(memberQ, (snap) => {
          const chunkOrgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
          allMemberResults.set(`chunk-${index}`, chunkOrgs);
          
          // Merge all chunks
          const mergedMemberOrgs: Organization[] = [];
          allMemberResults.forEach(orgs => mergedMemberOrgs.push(...orgs));
          latestMember = mergedMemberOrgs;
          
          // Once we have results from all chunks at least once, we are loaded
          // Since onSnapshot fires immediately with local/server data, we can just mark it here
          setMembersLoaded(true);
          syncOrgs(latestOwned, latestMember);
        }, (err) => {
          console.error(`[Member Orgs Sync Error - Chunk ${index}]`, err);
          syncErrorRef.current = true;
          setSyncDegraded(true);
          setMembersLoaded(true);
          setLoading(false);
        });
        unsubs.push(unsub);
      });
    } else {
      latestMember = [];
      setMembersLoaded(true);
      syncOrgs(latestOwned, latestMember);
    }

    return () => {
      unsubOwned();
      unsubs.forEach(unsub => unsub());
    };
  }, [user, profile?.orgId, memberOrgIds, ownedLoaded, membersLoaded]);

  // 1c. Auto-create default workspace if none exist
  useEffect(() => {
    // Only proceed if we HAVE finished the initial sync of owned AND member organizations.
    // Never auto-create while a sync errored — the user may already own orgs that a
    // transient permission error is hiding; creating a default would duplicate them.
    if (!user || !profile || !didInitialSyncRef.current || workspaces.length > 0 || syncErrorRef.current) return;

    const createDefault = async () => {
      if (isCreatingRef.current) return;
      isCreatingRef.current = true;
      try {
        // Double check workspaces array inside the async function to prevent race conditions
        if (workspaces.length > 0) {
          isCreatingRef.current = false;
          return;
        }

        const defaultName = `${profile.displayName || 'Default'}'s Workspace`;
        const defaultSlug = (profile.displayName || 'default').toLowerCase().replace(/\s+/g, '-') + '-workspace';
        
        console.log('[WorkspaceContext] Auto-creating default workspace:', defaultName);
        const orgRef = await addDoc(collection(db, 'organizations'), {
          name: defaultName,
          slug: defaultSlug,
          type: 'Research Desk',
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });

        // Use deterministic ID for membership
        await setDoc(doc(db, 'memberships', `${user.uid}_${orgRef.id}`), {
          uid: user.uid,
          orgId: orgRef.id,
          role: 'admin',
          joinedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'users', user.uid), { orgId: orgRef.id });
        await refreshProfile(user.uid);
      } catch (err) {
        console.error('[DefaultOrgCreation Error]', err);
      } finally {
        isCreatingRef.current = false;
      }
    };

    createDefault();
  }, [user, profile, loading, workspaces.length]);

  // 2. Sync Projects for Current Workspace
  useEffect(() => {
    if (!currentWorkspace) {
      setProjects([]);
      setCurrentProject(null);
      return;
    }

    const unsubscribe = subscribeToSites(currentWorkspace.id, (loadedProjects) => {
      setProjects(loadedProjects);

      // Select active project from localStorage or default to the first one
      const savedProjId = localStorage.getItem(`deplyze_active_proj_id_${currentWorkspace.id}`);
      const activeProj = loadedProjects.find(p => p.id === savedProjId) || loadedProjects[0] || null;
      setCurrentProject(activeProj);
    });

    return unsubscribe;
  }, [currentWorkspace]);

  // 3. Sync Workspace Members & Invites
  useEffect(() => {
    if (!currentWorkspace) {
      setMembers([]);
      setInvites([]);
      return;
    }

    // Load active members (users linked to this orgId)
    const membersQuery = query(
      collection(db, 'users'),
      where('orgId', '==', currentWorkspace.id)
    );

    const unsubMembers = onSnapshot(membersQuery, (snapshot) => {
      const activeMembers: UserProfile[] = [];
      snapshot.forEach((d) => {
        activeMembers.push({ uid: d.id, ...d.data() } as UserProfile);
      });
      setMembers(activeMembers);
    });

    // Load pending invites
    const invitesQuery = query(
      collection(db, 'invites'),
      where('orgId', '==', currentWorkspace.id),
      where('status', '==', 'pending')
    );

    const unsubInvites = onSnapshot(invitesQuery, (snapshot) => {
      const activeInvites: any[] = [];
      snapshot.forEach((d) => {
        activeInvites.push({ id: d.id, ...d.data() });
      });
      setInvites(activeInvites);
    });

    return () => {
      unsubMembers();
      unsubInvites();
    };
  }, [currentWorkspace]);

  // Actions
  const selectWorkspace = async (orgId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const orgRef = doc(db, 'organizations', orgId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const orgData = { id: orgSnap.id, ...orgSnap.data() } as Organization;
        setCurrentWorkspace(orgData);
        localStorage.setItem('deplyze_active_workspace_id', orgId);

        // Update profile in Firestore
        await updateDoc(doc(db, 'users', user.uid), { orgId });
        await refreshProfile(user.uid);
        toast.success(`Switched to workspace: ${orgData.name}`);
      }
    } catch (err) {
      toast.error('Failed to switch workspace context');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectProject = (siteId: string | null) => {
    if (!currentWorkspace) return;
    const proj = projects.find(p => p.id === siteId) || null;
    setCurrentProject(proj);
    if (siteId) {
      localStorage.setItem(`deplyze_active_proj_id_${currentWorkspace.id}`, siteId);
      toast.info(`Active project: ${proj?.name}`);
    } else {
      localStorage.removeItem(`deplyze_active_proj_id_${currentWorkspace.id}`);
    }
  };

  const createNewWorkspace = async (name: string, slug: string, type: string): Promise<string> => {
    if (!user) throw new Error('Unauthenticated');
    setLoading(true);
    try {
      const formattedSlug = slug.toLowerCase().replace(/\s+/g, '-').trim();

      // Create Org
      const orgRef = await addDoc(collection(db, 'organizations'), {
        name,
        slug: formattedSlug,
        type,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });

      // Create Membership with deterministic ID
      await setDoc(doc(db, 'memberships', `${user.uid}_${orgRef.id}`), {
        uid: user.uid,
        orgId: orgRef.id,
        role: 'admin',
        joinedAt: serverTimestamp(),
      });

      // Update active profile orgId
      await updateDoc(doc(db, 'users', user.uid), { orgId: orgRef.id });
      localStorage.setItem('deplyze_active_workspace_id', orgRef.id);
      await refreshProfile(user.uid);

      toast.success(`Workspace "${name}" successfully created.`);
      return orgRef.id;
    } catch (err) {
      toast.error('Failed to create workspace.');
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createNewProject = async (
    name: string,
    location: string,
    type: string,
    description?: string
  ): Promise<string> => {
    if (!currentWorkspace) throw new Error('No active workspace');
    try {
      const siteId = await createSite({
        orgId: currentWorkspace.id,
        name,
        address: location,
        description: description || `Site operations for ${name}`,
        status: 'active',
      });

      // Set as active project automatically
      selectProject(siteId);
      toast.success(`Project "${name}" successfully created.`);
      return siteId;
    } catch (err) {
      toast.error('Failed to create project.');
      console.error(err);
      throw err;
    }
  };

  const inviteNewMember = async (email: string, role: 'admin' | 'manager' | 'viewer') => {
    if (!currentWorkspace) return;
    try {
      // 1. Check if user already exists
      const userQ = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const userSnap = await getDocs(userQ);

      if (!userSnap.empty) {
        // User exists! Add membership immediately for seamless integration
        const existingUser = userSnap.docs[0];
        const existingUid = existingUser.id;

        // Create membership with deterministic ID
        await setDoc(doc(db, 'memberships', `${existingUid}_${currentWorkspace.id}`), {
          uid: existingUid,
          orgId: currentWorkspace.id,
          role,
          joinedAt: serverTimestamp(),
        });

        // Set default orgId if they don't have one
        if (!existingUser.data().orgId) {
          await updateDoc(doc(db, 'users', existingUid), { orgId: currentWorkspace.id });
        }

        toast.success(`Added ${email} to this workspace immediately.`);
        return;
      }

      // 2. Add as pending invitation
      await addDoc(collection(db, 'invites'), {
        orgId: currentWorkspace.id,
        email: email.trim().toLowerCase(),
        role,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      toast.success(`Invitation successfully sent to ${email}`);
    } catch (err) {
      toast.error('Failed to send invite.');
      console.error(err);
    }
  };

  const removeWorkspaceMember = async (uid: string) => {
    if (!currentWorkspace) return;
    try {
      // 1. Delete user memberships
      const memQ = query(
        collection(db, 'memberships'),
        where('orgId', '==', currentWorkspace.id),
        where('uid', '==', uid)
      );
      const memSnap = await getDocs(memQ);
      memSnap.forEach(async (d) => {
        await deleteDoc(doc(db, 'memberships', d.id));
      });

      // 2. Clear orgId if it matched this workspace
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().orgId === currentWorkspace.id) {
        await updateDoc(userRef, { orgId: null });
      }

      toast.success('Member removed from workspace');
    } catch (err) {
      toast.error('Failed to remove member');
      console.error(err);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      await deleteDoc(doc(db, 'invites', inviteId));
      toast.success('Invitation successfully revoked');
    } catch (err) {
      toast.error('Failed to revoke invitation');
      console.error(err);
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    if (!user) return;
    const isOwner = workspaces.find(w => w.id === workspaceId)?.ownerId === user.uid;
    if (!isOwner) {
      toast.error('Only the workspace owner can delete it');
      return;
    }

    try {
      // 1. Delete all sites (projects) for this workspace.
      // Org-scoped query (not a full-collection read) so it satisfies the
      // tenant-isolation rules — clients may only read sites in their own org.
      const sitesSnap = await getDocs(
        query(collection(db, 'sites'), where('orgId', '==', workspaceId))
      );
      for (const s of sitesSnap.docs) {
        await deleteDoc(doc(db, 'sites', s.id));
      }

      // 2. Delete all memberships for this workspace (org-scoped query).
      const membershipsSnap = await getDocs(
        query(collection(db, 'memberships'), where('orgId', '==', workspaceId))
      );
      for (const m of membershipsSnap.docs) {
        await deleteDoc(doc(db, 'memberships', m.id));
      }

      // 3. Delete the organization itself
      await deleteDoc(doc(db, 'organizations', workspaceId));

      // 4. Update user profile if this was their active workspace
      if (profile?.orgId === workspaceId) {
        const remainingOrgs = workspaces.filter(w => w.id !== workspaceId);
        const nextOrgId = remainingOrgs[0]?.id || '';
        await updateDoc(doc(db, 'users', user.uid), { orgId: nextOrgId });
        await refreshProfile(user.uid);
      }

      toast.success('Workspace deleted successfully');
    } catch (err) {
      console.error('[DeleteWorkspace Error]', err);
      toast.error('Failed to delete workspace');
    }
  };

  const updateWorkspace = async (workspaceId: string, updates: Partial<Workspace>) => {
    try {
      await updateDoc(doc(db, 'organizations', workspaceId), updates);
      toast.success('Workspace updated successfully');
    } catch (err) {
      console.error('[UpdateWorkspace Error]', err);
      toast.error('Failed to update workspace');
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        projects,
        currentProject,
        members,
        invites,
        loading,
        syncDegraded,
        selectWorkspace,
        selectProject,
        createNewWorkspace,
        createNewProject,
        inviteNewMember,
        removeWorkspaceMember,
        revokeInvite,
        deleteWorkspace,
        updateWorkspace
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);
