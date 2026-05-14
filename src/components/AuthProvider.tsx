import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
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
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        await refreshProfile(fbUser.uid, fbUser);
      } else {
        setProfile(null);
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
