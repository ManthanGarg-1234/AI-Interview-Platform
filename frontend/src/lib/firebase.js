import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const emulatorEnabled = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR === "true"
  && import.meta.env.MODE !== "production";
const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || "http://127.0.0.1:9099";

function getFirebaseClientAuth() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (emulatorEnabled && !auth.config.emulator) connectAuthEmulator(auth, emulatorHost, { disableWarnings: true });
  return auth;
}

export function firebaseGoogleConfigured() {
  return Boolean(
    firebaseConfig.apiKey
    && firebaseConfig.authDomain
    && firebaseConfig.projectId
    && firebaseConfig.appId
  );
}

export async function signInWithFirebaseGoogle() {
  if (!firebaseGoogleConfigured()) {
    const error = new Error("Firebase Google sign-in is not configured.");
    error.code = "FIREBASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  const auth = getFirebaseClientAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}

export async function signInWithFirebaseGoogleRedirect() {
  if (!firebaseGoogleConfigured()) throw new Error("Firebase Google sign-in is not configured.");
  if (emulatorEnabled && typeof window !== "undefined") {
    const errorCode = window.__E2E_FIREBASE_ERROR__;
    if (errorCode) {
      const error = new Error(errorCode);
      error.code = errorCode;
      throw error;
    }
    const testToken = window.__E2E_FIREBASE_ID_TOKEN__;
    if (testToken) {
      sessionStorage.setItem("career_firebase_test_token", testToken);
      window.location.assign("/login");
      return;
    }
  }
  const auth = getFirebaseClientAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithRedirect(auth, provider);
}

export async function completeFirebaseGoogleRedirect() {
  if (!firebaseGoogleConfigured()) return null;
  if (emulatorEnabled && typeof window !== "undefined") {
    const testToken = sessionStorage.getItem("career_firebase_test_token");
    if (testToken) {
      sessionStorage.removeItem("career_firebase_test_token");
      return testToken;
    }
  }
  const auth = getFirebaseClientAuth();
  const result = await getRedirectResult(auth);
  return result?.user ? result.user.getIdToken() : null;
}

export function getFirebaseAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/configuration-not-found") {
    return "Google sign-in is not configured in Firebase. Enable the Google provider in Firebase Authentication, then add localhost as an authorized domain.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized by Firebase. Add localhost and this frontend domain to Firebase Authentication authorized domains.";
  }
  if (code === "auth/popup-closed-by-user") return "The Google sign-in window was closed before completion.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
  if (code === "auth/network-request-failed") return "Google sign-in could not connect to Firebase. Check your network and try again.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is disabled. Enable the Google provider in Firebase Authentication.";
  return error?.message || "Google sign-in could not be completed.";
}
