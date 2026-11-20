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
};

const FIREBASE_VERSION = '10.12.2';
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

let firebaseApp: any = null;
let firebaseAuth: any = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/* Re-exported auth functions (resolved after Firebase CDN loads) */
export let signInWithEmailAndPassword: any = null;
export let createUserWithEmailAndPassword: any = null;
export let signOut: any = null;
export let signInWithPopup: any = null;
export let GoogleAuthProvider: any = null;

async function ensureFirebase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [appMod, authMod] = await Promise.all([
      import(APP_URL),
      import(AUTH_URL),
    ]);
    firebaseApp = appMod.initializeApp(firebaseConfig);
    firebaseAuth = authMod.getAuth(firebaseApp);

    signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
    createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
    signOut = authMod.signOut;
    signInWithPopup = authMod.signInWithPopup;
    GoogleAuthProvider = authMod.GoogleAuthProvider;

    initialized = true;
  })();

  return initPromise;
}

export async function initFirebase(): Promise<any> {
  await ensureFirebase();
  return firebaseAuth;
}

export async function signInWithGoogle(): Promise<any> {
  await ensureFirebase();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(firebaseAuth, provider);
}

export { firebaseConfig };