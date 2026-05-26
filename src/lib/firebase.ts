import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

/**
 * Firebase configuration for Deplyze Quant.
 * All values are sourced from environment variables (VITE_ prefix for Vite).
 * Set these in .env.local for local development.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initialization in HMR / SSR scenarios
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const analyticsEnabled =
  import.meta.env.VITE_ENABLE_FIREBASE_ANALYTICS === 'true' &&
  Boolean(firebaseConfig.measurementId);

// Initialize analytics only when explicitly enabled; otherwise Firebase injects
// Google Tag Manager, which can create noisy DNS failures in locked-down clients.
export const analytics = typeof window !== 'undefined' && analyticsEnabled
  ? isSupported().then(yes => yes ? getAnalytics(app) : null)
  : null;

export default app;
