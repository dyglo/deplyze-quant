import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  User,
  AuthError,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getUserProfile, upsertUserProfile } from '../services/firestoreService';
import type { UserProfile, AuthState } from '../types';

// ─── Context type ──────────────────────────────────────────────────────────

export interface AuthContextType extends AuthState {
  /** True for anonymous (guest) sessions or before any sign-in resolves.
   *  A guest carries a real Firebase ID token (so gateway calls work) but has
   *  no persisted profile/workspace and is gated out of personalized features. */
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: (uid: string) => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isGuest: true,
  authError: null,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  clearAuthError: () => {},
});

// ─── Helper ────────────────────────────────────────────────────────────────

function parseAuthError(error: unknown): string {
  if (!error) return 'An unknown error occurred.';
  const code = (error as AuthError).code || '';
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed. Please try again.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by your browser. Please allow popups for this site or try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection or DNS settings.';
    default:
      return (error as AuthError).message || 'Authentication failed.';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = () => setAuthError(null);

  // ── Profile bootstrap ──────────────────────────────────────────────────

  const refreshProfile = async (uid: string, fbUser?: User) => {
    let existing = await getUserProfile(uid);

    if (!existing) {
      // First sign-in: create default profile
      const currentUser = fbUser || auth.currentUser;
      const newProfile: UserProfile = {
        uid,
        email: currentUser?.email || '',
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
        role: 'manager',
        // orgId is set later when user creates / joins an org
      };
      await upsertUserProfile(newProfile);
      existing = newProfile;
    }

    setProfile(existing);
  };

  // ── Auth state listener ────────────────────────────────────────────────
  // Guards against repeated anonymous sign-in attempts within a session.
  const anonAttemptedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      // No session yet → silently establish a *guest* identity so public
      // surfaces and the gateway (which requires a real ID token) work without
      // a signup wall. Anonymous provider must be enabled in the Firebase
      // console; if it isn't, we fail open to the signed-out state (the app
      // keeps its existing behavior) and never throw.
      if (!fbUser) {
        if (!anonAttemptedRef.current) {
          anonAttemptedRef.current = true;
          try {
            await signInAnonymously(auth);
            return; // onAuthStateChanged re-fires with the anonymous user
          } catch (err) {
            console.warn('[Auth] Anonymous sign-in unavailable — staying signed out.', err);
          }
        }
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(fbUser);
      // Guests carry a token but get no persisted profile/workspace. Skipping
      // the profile upsert keeps anonymous uids out of Firestore entirely.
      if (fbUser.isAnonymous) {
        setProfile(null);
      } else {
        await refreshProfile(fbUser.uid, fbUser);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Auth actions ───────────────────────────────────────────────────────

  const signInWithGoogle = async () => {
    clearAuthError();
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const current = auth.currentUser;
      // Upgrade a guest in place so the uid (and any guest-created state) is
      // preserved. If the Google account already exists, linking fails with
      // credential-already-in-use → fall back to a normal sign-in.
      if (current?.isAnonymous) {
        try {
          const linked = await linkWithPopup(current, provider);
          // Linking keeps the same session signed in, so onAuthStateChanged
          // may not re-fire — update local state + bootstrap the profile here.
          setUser(linked.user);
          await refreshProfile(linked.user.uid, linked.user);
          return;
        } catch (linkErr) {
          const code = (linkErr as AuthError).code || '';
          if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') {
            throw linkErr;
          }
          // Existing account — sign in normally (guest session is discarded).
        }
      }
      await signInWithPopup(auth, provider);
    } catch (err) {
      setAuthError(parseAuthError(err));
      throw err;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    clearAuthError();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(parseAuthError(err));
      throw err;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    clearAuthError();
    try {
      const current = auth.currentUser;
      // Upgrade an anonymous guest into a permanent account, keeping the uid.
      if (current?.isAnonymous) {
        const credential = EmailAuthProvider.credential(email, password);
        const linked = await linkWithCredential(current, credential);
        if (displayName) {
          await updateProfile(linked.user, { displayName });
        }
        // Linking keeps the same session signed in (onAuthStateChanged may not
        // re-fire) — update local state + bootstrap the profile here.
        setUser(linked.user);
        await refreshProfile(linked.user.uid, linked.user);
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
      }
    } catch (err) {
      setAuthError(parseAuthError(err));
      throw err;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isGuest: !user || user.isAnonymous,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
