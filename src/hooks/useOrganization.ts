import { useState, useEffect } from 'react';
import { getOrganization } from '../services/firestoreService';
import type { Organization } from '../types';
import { useAuth } from './useAuth';

interface UseOrganizationResult {
  organization: Organization | null;
  loading: boolean;
  error: Error | null;
}

/**
 * useOrganization — fetches the user's organization from Firestore.
 *
 * Returns null until the user profile (and orgId) is loaded.
 */
export function useOrganization(): UseOrganizationResult {
  const { profile } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!profile?.orgId) {
      setOrganization(null);
      return;
    }

    setLoading(true);
    getOrganization(profile.orgId)
      .then((org) => {
        setOrganization(org);
        setError(null);
      })
      .catch((err) => {
        console.error('[useOrganization]', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setLoading(false));
  }, [profile?.orgId]);

  return { organization, loading, error };
}
