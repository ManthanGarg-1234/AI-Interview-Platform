"use strict";

const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let firebaseApp;

function configureFirebaseEmulator() {
  if (process.env.FIREBASE_AUTH_EMULATOR !== "true") return;
  if (process.env.NODE_ENV === "production") {
    const error = new Error("Firebase Auth Emulator is forbidden in production.");
    error.code = "FIREBASE_AUTH_EMULATOR_FORBIDDEN";
    throw error;
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const error = new Error("Firebase Auth Emulator host is required when emulator mode is enabled.");
    error.code = "FIREBASE_AUTH_EMULATOR_NOT_CONFIGURED";
    throw error;
  }
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

function getFirebaseApp(projectId) {
  if (!projectId) {
    const error = new Error("Firebase Authentication is not configured.");
    error.code = "FIREBASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  if (firebaseApp) return firebaseApp;
  firebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp({ projectId });
  return firebaseApp;
}

async function verifyFirebaseGoogleToken(idToken, projectId) {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) {
    const error = new Error("A valid Firebase ID token is required.");
    error.status = 400;
    error.code = "INVALID_FIREBASE_TOKEN";
    throw error;
  }
  configureFirebaseEmulator();
  const app = getFirebaseApp(projectId);
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(idToken, true);
  } catch (error) {
    console.warn("Firebase ID token verification failed", {
      code: error?.code || "UNKNOWN",
      message: typeof error?.message === "string" ? error.message.slice(0, 300) : "Unknown Firebase verification error",
    });
    const verificationError = new Error("Firebase authentication verification failed.");
    verificationError.status = 401;
    verificationError.code = "INVALID_FIREBASE_TOKEN";
    throw verificationError;
  }
  if (decoded.email_verified !== true
    || typeof decoded.email !== "string"
    || typeof decoded.sub !== "string"
    || !decoded.sub) {
    console.warn("Firebase Google identity claim validation failed", {
      emailVerified: decoded.email_verified === true,
      hasEmail: typeof decoded.email === "string",
      hasSubject: typeof decoded.sub === "string" && Boolean(decoded.sub),
      provider: decoded.firebase?.sign_in_provider || "unknown",
    });
    const error = new Error("The Firebase identity is not an eligible Google account.");
    error.status = 401;
    error.code = "INVALID_FIREBASE_TOKEN";
    throw error;
  }
  return decoded;
}

module.exports = { verifyFirebaseGoogleToken };
