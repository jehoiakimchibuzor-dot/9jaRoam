/* ── Firebase via CDN (no npm install required) ───────────────
   Firebase config — paste your web app config from Firebase Console →
   Project Settings → General → Your apps → </> Config.
   https://console.firebase.google.com/project/naija-freeroam/settings/general
──────────────────────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: 'AIzaSyDWumyPsuvSBtY-MZQJ_GrQyOimUBAhKnQ',
  authDomain: 'naija-freeroam.firebaseapp.com',
  projectId: 'naija-freeroam',
  storageBucket: 'naija-freeroam.firebasestorage.app',
  messagingSenderId: '63965121760',
  appId: '1:63965121760:web:ccfaef605d1b9f987b9485',
  databaseURL: 'https://naija-freeroam-default-rtdb.firebaseio.com',
};

const FIREBASE_VERSION = '10.12.2';
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
const DATABASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;

let firebaseApp: any = null;
let firebaseAuth: any = null;
let firebaseDb: any = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/* Re-exported auth functions (resolved after Firebase CDN loads) */
export let signInWithEmailAndPassword: any = null;
export let createUserWithEmailAndPassword: any = null;
export let signOut: any = null;
export let signInWithPopup: any = null;
export let GoogleAuthProvider: any = null;
export let onAuthStateChanged: any = null;

/* Re-exported Realtime Database functions */
export let ref: any = null;
export let set: any = null;
export let remove: any = null;
export let onValue: any = null;
export let off: any = null;
export let onDisconnect: any = null;
export let serverTimestamp: any = null;

async function ensureFirebase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [appMod, authMod, dbMod] = await Promise.all([
      import(/* @vite-ignore */ APP_URL),
      import(/* @vite-ignore */ AUTH_URL),
      import(/* @vite-ignore */ DATABASE_URL),
    ]);
    firebaseApp = appMod.initializeApp(firebaseConfig);
    firebaseAuth = authMod.getAuth(firebaseApp);
    firebaseDb = dbMod.getDatabase(firebaseApp, firebaseConfig.databaseURL);

    // Keep the signed-in account available after the app is killed and reopened.
    try {
      await authMod.setPersistence(firebaseAuth, authMod.browserLocalPersistence);
    } catch {
      // Local persistence is the web default; keep going if a WebView blocks it.
    }

    signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
    createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
    signOut = authMod.signOut;
    signInWithPopup = authMod.signInWithPopup;
    GoogleAuthProvider = authMod.GoogleAuthProvider;
    onAuthStateChanged = authMod.onAuthStateChanged;

    ref = dbMod.ref;
    set = dbMod.set;
    remove = dbMod.remove;
    onValue = dbMod.onValue;
    off = dbMod.off;
    onDisconnect = dbMod.onDisconnect;
    serverTimestamp = dbMod.serverTimestamp;

    initialized = true;
  })();

  return initPromise;
}

export async function initFirebase(): Promise<any> {
  await ensureFirebase();
  return firebaseAuth;
}

export async function initRealtimeDatabase(): Promise<any> {
  await ensureFirebase();
  return firebaseDb;
}

export async function signInWithGoogle(): Promise<any> {
  await ensureFirebase();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(firebaseAuth, provider);
}

/**
 * Firebase auth restores from IndexedDB asynchronously after a cold start.
 * The intro flow waits for that result so a saved account is not mistaken for
 * a signed-out player (which would send them back to the auth screen).
 */
export async function waitForFirebaseUser(
  timeoutMs = 3500
): Promise<{ ready: boolean; user: any | null }> {
  try {
    await Promise.race([
      ensureFirebase(),
      new Promise<never>((_resolve, reject) => {
        window.setTimeout(() => reject(new Error('Firebase auth init timeout')), timeoutMs);
      })
    ]);
  } catch {
    return { ready: false, user: null };
  }

  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | null = null;
    let timer: number | null = null;

    const finish = (ready: boolean, user: any | null): void => {
      if (done) return;
      done = true;
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe?.();
      resolve({ ready, user });
    };

    try {
      unsubscribe = onAuthStateChanged(
        firebaseAuth,
        (user: any) => finish(true, user),
        () => finish(false, null)
      );
    } catch {
      finish(false, null);
      return;
    }

    timer = window.setTimeout(() => finish(false, null), timeoutMs);
  });
}

export { firebaseConfig };