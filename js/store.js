// App state, local storage, Firebase auth + Firestore with a device fallback.
//
// Every Firestore call is wrapped: if the network is down or security rules deny a
// write, the entry stays in localStorage (namespaced per uid) marked _pending and is
// pushed again on the next start or sign-in.
import { uid as newId, todayKey, daysBetween } from './util.js';

const FB_VER = '10.12.2';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
export const firebaseConfig = {
  apiKey: 'AIzaSyDYS7IpJUzlZjLDXxEU_n0qq6VEwYnTks4',
  authDomain: 'calledto-pray-zds4g4.firebaseapp.com',
  projectId: 'calledto-pray-zds4g4',
  storageBucket: 'calledto-pray-zds4g4.firebasestorage.app',
  messagingSenderId: '659792329056',
  appId: '1:659792329056:web:5372cb29baa8705ae04605',
  measurementId: 'G-NLQK46BLFE'
};

export const KINDS = ['prayers', 'praise', 'people', 'topics', 'journal', 'notes'];
const WRITE_TIMEOUT = 9000;

// ---------------- localStorage helpers ----------------
function lsGet(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { listeners.forEach(fn => { try { fn(what); } catch (e) { console.warn(e); } }); }

// ---------------- state ----------------
export const state = {
  mode: lsGet('ctp:mode', null),          // 'guest' | 'account' | null (not chosen yet)
  user: null,                              // { uid, email, displayName }
  fbReady: false,
  fbError: null,
  remoteOk: null,                          // last Firestore write outcome
  profile: null,
  entries: {},                             // kind -> array
  groupsDenied: false,
};

export const ns = () => (state.user ? state.user.uid : 'guest');
const key = k => `ctp:${ns()}:${k}`;

const DEFAULT_PROFILE = {
  name: '', callings: [], family: [], carrying: [], translation: 'BSB',
  reminderTime: '07:30', textSize: 1, onboarded: false,
  streakCurrent: 0, streakBest: 0, lastActive: null,
};

export function loadLocal() {
  state.profile = { ...DEFAULT_PROFILE, ...lsGet(key('profile'), {}) };
  for (const k of KINDS) state.entries[k] = lsGet(key('e:' + k), []);
  applyTextSize();
}
loadLocal();

export function applyTextSize() {
  const s = state.profile?.textSize || 1;
  document.documentElement.style.setProperty('--fs-scale', String(s));
}

export function saveProfile(patch = {}, { remote = true } = {}) {
  state.profile = { ...state.profile, ...patch };
  lsSet(key('profile'), state.profile);
  applyTextSize();
  emit('profile');
  if (remote) pushProfile();
}
export const tr = () => (state.profile.translation === 'KJV' ? 'KJV' : 'BSB');

export function setMode(m) { state.mode = m; lsSet('ctp:mode', m); }

// Per-user small key/value (verse history, plan progress, private pin…)
export function kvGet(k, def) { return lsGet(key('kv:' + k), def); }
export function kvSet(k, v) { lsSet(key('kv:' + k), v); }

// ---------------- streak ----------------
export function markActive() {
  const p = state.profile, t = todayKey();
  if (p.lastActive === t) return;
  let cur = 1;
  if (p.lastActive && daysBetween(p.lastActive, t) === 1) cur = (p.streakCurrent || 0) + 1;
  saveProfile({ lastActive: t, streakCurrent: cur, streakBest: Math.max(cur, p.streakBest || 0) });
}

// ---------------- Firebase ----------------
let fb = null; // { app, auth, db, m: modules }
let fbPromise = null;
export function firebase() {
  if (fbPromise) return fbPromise;
  fbPromise = (async () => {
    try {
      const [appM, authM, fsM] = await Promise.all([
        import(FB_BASE + 'firebase-app.js'),
        import(FB_BASE + 'firebase-auth.js'),
        import(FB_BASE + 'firebase-firestore.js'),
      ]);
      const app = appM.initializeApp(firebaseConfig);
      const auth = authM.getAuth(app);
      const db = fsM.getFirestore(app);
      fb = { app, auth, db, a: authM, f: fsM };
      state.fbReady = true;
      return fb;
    } catch (e) {
      state.fbError = e;
      console.warn('Firebase unavailable', e);
      return null;
    }
  })();
  return fbPromise;
}

function withTimeout(p, ms = WRITE_TIMEOUT) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
}
const toMs = v => v == null ? null : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : Date.parse(v) || null;

// Wait for the first auth state; resolves with user or null.
export function initAuth() {
  return new Promise(async resolve => {
    const f = await firebase();
    if (!f) return resolve(null);
    let first = true;
    f.a.onAuthStateChanged(f.auth, async u => {
      const prevNs = ns();
      if (u) {
        state.user = { uid: u.uid, email: u.email, displayName: u.displayName };
        setMode('account');
      } else {
        state.user = null;
      }
      if (prevNs !== ns()) loadLocal();
      if (u) await pullRemote();
      if (first) { first = false; resolve(state.user); } else emit('auth');
    });
  });
}

export function authErrorMessage(e) {
  const c = e?.code || '';
  const map = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/weak-password': 'Please choose a password with at least 6 characters.',
    'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
    'auth/invalid-credential': 'The email or password is not correct.',
    'auth/wrong-password': 'The email or password is not correct.',
    'auth/user-not-found': 'We could not find an account with that email.',
    'auth/too-many-requests': 'Too many tries. Please wait a minute and try again.',
    'auth/network-request-failed': 'No internet connection. Please check your connection and try again.',
    'auth/unauthorized-domain': 'Google sign-in is not switched on for this web address yet. Please use email and password for now.',
    'auth/operation-not-allowed': 'This sign-in method is not switched on yet. Please use email and password for now.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Please allow pop-ups or use email and password.',
    'auth/popup-closed-by-user': 'The Google window was closed before finishing.',
    'auth/cancelled-popup-request': 'The Google window was closed before finishing.',
  };
  return map[c] || 'Something went wrong. Please try again.';
}

export async function signUp(email, password, name) {
  const f = await firebase(); if (!f) throw { code: 'auth/network-request-failed' };
  const guestProfile = state.mode === 'guest' ? { ...state.profile } : null;
  const guestEntries = state.mode === 'guest' ? JSON.parse(JSON.stringify(state.entries)) : null;
  const cred = await f.a.createUserWithEmailAndPassword(f.auth, email, password);
  if (name) { try { await f.a.updateProfile(cred.user, { displayName: name }); } catch {} }
  await adoptGuestData(cred.user, guestProfile, guestEntries, name);
  return cred.user;
}
export async function signIn(email, password) {
  const f = await firebase(); if (!f) throw { code: 'auth/network-request-failed' };
  const guestProfile = state.mode === 'guest' ? { ...state.profile } : null;
  const guestEntries = state.mode === 'guest' ? JSON.parse(JSON.stringify(state.entries)) : null;
  const cred = await f.a.signInWithEmailAndPassword(f.auth, email, password);
  await adoptGuestData(cred.user, guestProfile, guestEntries);
  return cred.user;
}
export async function signInGoogle() {
  const f = await firebase(); if (!f) throw { code: 'auth/network-request-failed' };
  const guestProfile = state.mode === 'guest' ? { ...state.profile } : null;
  const guestEntries = state.mode === 'guest' ? JSON.parse(JSON.stringify(state.entries)) : null;
  const cred = await f.a.signInWithPopup(f.auth, new f.a.GoogleAuthProvider());
  await adoptGuestData(cred.user, guestProfile, guestEntries);
  return cred.user;
}
export async function resetPassword(email) {
  const f = await firebase(); if (!f) throw { code: 'auth/network-request-failed' };
  await f.a.sendPasswordResetEmail(f.auth, email);
}
export async function signOutUser() {
  const f = await firebase();
  if (f) await f.a.signOut(f.auth);
  state.user = null;
  setMode(null);
  loadLocal();
}

// When someone who tried the app without an account signs in, carry their entries over.
async function adoptGuestData(u, gp, ge, name) {
  state.user = { uid: u.uid, email: u.email, displayName: u.displayName || name };
  setMode('account');
  loadLocal();
  if (gp && gp.onboarded) {
    const keep = state.profile.onboarded ? state.profile : {};
    saveProfile({ ...gp, ...pick(keep, ['name']), name: keep.name || gp.name || name || '' }, { remote: false });
  } else if (name && !state.profile.name) saveProfile({ name }, { remote: false });
  if (ge) {
    for (const k of KINDS) {
      const have = new Set(state.entries[k].map(e => e.id));
      for (const e of ge[k] || []) if (!have.has(e.id)) state.entries[k].push({ ...e, _pending: true });
      lsSet(key('e:' + k), state.entries[k]);
    }
    // move guest kv (pin, plan, verse history)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ctp:guest:kv:')) {
          const nk = `ctp:${u.uid}:kv:` + k.slice('ctp:guest:kv:'.length);
          if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
        }
      }
    } catch {}
  }
  await pullRemote();
  pushProfile();
  syncPending();
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] != null).map(k => [k, o[k]]));

// ---------------- remote profile ----------------
function normTr(v) { return /kjv|king/i.test(String(v || '')) ? 'KJV' : 'BSB'; }

async function pullRemote() {
  const f = await firebase(); if (!f || !state.user) return;
  const { doc, getDoc, collection, getDocs } = f.f;
  try {
    const snap = await withTimeout(getDoc(doc(f.db, 'users', state.user.uid)));
    if (snap.exists()) {
      const d = snap.data();
      const patch = {};
      if (d.display_name && !state.profile.name) patch.name = d.display_name;
      if (Array.isArray(d.ctp_callings)) patch.callings = d.ctp_callings;
      else if (d.calling && !state.profile.callings.length) patch.callings = String(d.calling).split(/\s*,\s*/).filter(Boolean);
      if (Array.isArray(d.ctp_family)) patch.family = d.ctp_family;
      if (Array.isArray(d.ctp_carrying)) patch.carrying = d.ctp_carrying;
      if (d.translation) patch.translation = normTr(d.translation);
      if (d.reminder_time) patch.reminderTime = d.reminder_time;
      if (d.text_size) patch.textSize = d.text_size;
      if (d.streak_best) patch.streakBest = Math.max(d.streak_best, state.profile.streakBest || 0);
      if (d.private_pin_hash && !kvGet('pin')) kvSet('pin', { hash: d.private_pin_hash, salt: d.private_pin_salt });
      if (d.ctp_onboarded || patch.callings?.length) patch.onboarded = true;
      if (d.verse_seen && Array.isArray(d.verse_seen)) {
        const local = kvGet('verseSeen', []);
        kvSet('verseSeen', Array.from(new Set([...local, ...d.verse_seen])));
      }
      saveProfile(patch, { remote: false });
    }
  } catch (e) { console.info('Profile read not available', e.code || e.message); }

  for (const k of KINDS) {
    try {
      const qs = await withTimeout(getDocs(collection(f.db, 'users', state.user.uid, k)));
      const remote = qs.docs.map(d => fromRemote(k, d.id, d.data()));
      const localPending = state.entries[k].filter(e => e._pending);
      const byId = new Map(remote.map(e => [e.id, e]));
      for (const e of localPending) byId.set(e.id, e);
      // keep local items that never reached the server even if not marked (defensive)
      for (const e of state.entries[k]) if (!byId.has(e.id) && e._localOnly) byId.set(e.id, e);
      state.entries[k] = Array.from(byId.values());
      lsSet(key('e:' + k), state.entries[k]);
    } catch (e) { console.info('Entries read not available for', k, e.code || e.message); }
  }
  emit('entries');
}

// Read existing documents (including ones made by the earlier app) into one shape.
function fromRemote(kind, id, d) {
  const text = d.text ?? d.content ?? d.body ?? d.request ?? d.prayer ?? d.note ?? d.description ?? '';
  const title = d.title ?? d.name ?? d.display_name ?? '';
  return {
    id, kind,
    text: String(text || (kind === 'people' || kind === 'topics' ? '' : title) || ''),
    title: String(title || ''),
    createdAt: toMs(d.createdAt ?? d.created_time ?? d.created_at ?? d.date ?? d.timestamp) || Date.now(),
    updatedAt: toMs(d.updatedAt ?? d.updated_at) || null,
    answered: !!(d.answered ?? d.is_answered),
    answeredAt: toMs(d.answeredAt ?? d.answered_at),
    answerNote: d.answerNote ?? d.answer_note ?? '',
    people: Array.isArray(d.people) ? d.people : [],
    topics: Array.isArray(d.topics) ? d.topics : [],
    private: !!d.private,
    source: d.source || 'typed',
    linkedId: d.linkedId || null,
  };
}

let profileTimer;
export function pushProfile() {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(async () => {
    const f = await firebase(); if (!f || !state.user) return;
    const p = state.profile;
    const pin = kvGet('pin');
    const data = {
      email: state.user.email || '',
      display_name: p.name || state.user.displayName || '',
      calling: (p.callings || []).join(', '),
      translation: p.translation,
      ctp_callings: p.callings || [], ctp_family: p.family || [], ctp_carrying: p.carrying || [],
      ctp_onboarded: !!p.onboarded,
      reminder_time: p.reminderTime || '', text_size: p.textSize || 1,
      streak_current: p.streakCurrent || 0, streak_best: p.streakBest || 0,
      verse_seen: kvGet('verseSeen', []).slice(-500),
    };
    if (pin) { data.private_pin_hash = pin.hash; data.private_pin_salt = pin.salt; }
    try { await withTimeout(f.f.setDoc(f.f.doc(f.db, 'users', state.user.uid), data, { merge: true })); }
    catch (e) { console.info('Profile not saved to account yet', e.code || e.message); }
  }, 600);
}

// ---------------- entries ----------------
export function listEntries(kind, { includePrivate = false } = {}) {
  return (state.entries[kind] || []).filter(e => includePrivate || !e.private).sort((a, b) => b.createdAt - a.createdAt);
}
export function allEntries({ includePrivate = false, onlyPrivate = false } = {}) {
  const out = [];
  for (const k of KINDS) for (const e of state.entries[k] || []) {
    if (onlyPrivate ? e.private : (includePrivate || !e.private)) out.push({ ...e, kind: k });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
export function findEntry(id) {
  for (const k of KINDS) { const e = (state.entries[k] || []).find(x => x.id === id); if (e) return { ...e, kind: k }; }
  return null;
}

function toRemote(e, f) {
  const { Timestamp } = f.f;
  const ts = ms => (ms ? Timestamp.fromMillis(ms) : null);
  return {
    text: e.text || '', title: e.title || '',
    createdAt: ts(e.createdAt), updatedAt: ts(e.updatedAt || e.createdAt),
    answered: !!e.answered, answeredAt: ts(e.answeredAt), answerNote: e.answerNote || '',
    people: e.people || [], topics: e.topics || [], private: !!e.private,
    audio: false, source: e.source || 'typed', linkedId: e.linkedId || null,
  };
}

// Returns { remote: true|false } so the UI can say "saved on this device".
export async function saveEntry(kind, data) {
  const now = Date.now();
  const list = state.entries[kind] || (state.entries[kind] = []);
  let e = data.id ? list.find(x => x.id === data.id) : null;
  if (e) Object.assign(e, data, { updatedAt: now });
  else { e = { id: newId(), createdAt: now, updatedAt: now, answered: false, people: [], topics: [], private: false, source: 'typed', ...data }; list.push(e); }
  e._pending = true;
  lsSet(key('e:' + kind), list);
  markActive();
  emit('entries');
  const remote = await pushEntry(kind, e);
  return { entry: e, remote };
}

async function pushEntry(kind, e) {
  if (!state.user) return false;
  const f = await firebase(); if (!f) return false;
  try {
    await withTimeout(f.f.setDoc(f.f.doc(f.db, 'users', state.user.uid, kind, e.id), toRemote(e, f)));
    e._pending = false;
    lsSet(key('e:' + kind), state.entries[kind]);
    state.remoteOk = true;
    return true;
  } catch (err) {
    console.info('Saved on this device; will sync later', err.code || err.message);
    state.remoteOk = false;
    return false;
  }
}

export async function deleteEntry(kind, id) {
  state.entries[kind] = (state.entries[kind] || []).filter(e => e.id !== id);
  lsSet(key('e:' + kind), state.entries[kind]);
  const tomb = kvGet('deleted', []); tomb.push([kind, id]); kvSet('deleted', tomb);
  emit('entries');
  if (state.user) {
    const f = await firebase();
    if (f) try {
      await withTimeout(f.f.deleteDoc(f.f.doc(f.db, 'users', state.user.uid, kind, id)));
      kvSet('deleted', kvGet('deleted', []).filter(([k, i]) => !(k === kind && i === id)));
    } catch {}
  }
}

export async function syncPending() {
  if (!state.user) return;
  for (const k of KINDS) for (const e of (state.entries[k] || []).filter(x => x._pending)) await pushEntry(k, e);
  const f = await firebase();
  if (f) for (const [k, id] of kvGet('deleted', [])) {
    try { await withTimeout(f.f.deleteDoc(f.f.doc(f.db, 'users', state.user.uid, k, id))); kvSet('deleted', kvGet('deleted', []).filter(([a, b]) => !(a === k && b === id))); } catch {}
  }
  emit('entries');
}
export function pendingCount() { let n = 0; for (const k of KINDS) n += (state.entries[k] || []).filter(e => e._pending).length; return state.user ? n : 0; }

// Raw Firestore access for groups.js
export async function fs() { const f = await firebase(); return f; }
export { withTimeout, toMs, lsGet, lsSet, lsDel };

// Confirm identity again before sensitive changes (resetting the private passcode).
export async function reauthenticate(password) {
  const f = await firebase(); if (!f || !f.auth.currentUser) throw new Error('no user');
  const u = f.auth.currentUser;
  const google = u.providerData.some(p => p.providerId === 'google.com');
  if (password) await f.a.reauthenticateWithCredential(u, f.a.EmailAuthProvider.credential(u.email, password));
  else if (google) await f.a.reauthenticateWithPopup(u, new f.a.GoogleAuthProvider());
  else throw new Error('password needed');
}
