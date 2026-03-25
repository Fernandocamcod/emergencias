// Firebase Configuration for Emergencias App
// Project: emergencias-b16bd

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvv67WmimCBYS8tda6p_NTWUq8x6M_Y-w",
  authDomain: "emergencias-b16bd.firebaseapp.com",
  projectId: "emergencias-b16bd",
  storageBucket: "emergencias-b16bd.firebasestorage.app",
  messagingSenderId: "767406492125",
  appId: "1:767406492125:web:3149b5a924fe09d002ce34",
  measurementId: "G-VLR3W5QY72"
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1/accounts`;
const API_KEY = FIREBASE_CONFIG.apiKey;

// Admin email (the ONLY account with admin privileges)
const ADMIN_EMAIL = "leandroescorza789@gmail.com";

// ===== LOCAL STORAGE SESSION =====
const SESSION_KEY = 'em_session';
function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ===== FIRESTORE VALUE HELPERS =====
function fsString(v) { return { stringValue: String(v || '') }; }
function fsNumber(v) { return { doubleValue: Number(v) }; }
function fsBool(v) { return { booleanValue: Boolean(v) }; }
function fsTimestamp(d) { return { timestampValue: (d || new Date()).toISOString() }; }

function parseValue(val) {
  if (val === undefined || val === null) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.nullValue !== undefined) return null;
  if (val.mapValue) return parseDoc({ fields: val.mapValue.fields });
  return null;
}

function parseDoc(doc) {
  if (!doc || !doc.fields) return {};
  const obj = {};
  if (doc.name) obj._id = doc.name.split('/').pop();
  for (const [k, v] of Object.entries(doc.fields)) {
    obj[k] = parseValue(v);
  }
  return obj;
}

// ===== HEADERS =====
function getHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ===== FIRESTORE REST API =====
async function fsGet(path, token) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: getHeaders(token) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'GET failed'); }
  return res.json();
}

async function fsPatch(path, fields, token) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: 'PATCH', headers: getHeaders(token),
    body: JSON.stringify({ fields })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'PATCH failed'); }
  return res.json();
}

async function fsAdd(collection, fields, token) {
  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, {
    method: 'POST', headers: getHeaders(token),
    body: JSON.stringify({ fields })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'POST failed'); }
  return res.json();
}

async function fsList(collection, token) {
  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, { headers: getHeaders(token) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'LIST failed'); }
  return res.json();
}

async function fsDelete(path, token) {
  await fetch(`${FIRESTORE_BASE}/${path}`, { method: 'DELETE', headers: getHeaders(token) });
}

async function fsQuery(q, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST', headers: getHeaders(token),
    body: JSON.stringify({ structuredQuery: q })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'QUERY failed'); }
  const results = await res.json();
  return results.filter(r => r.document).map(r => parseDoc(r.document));
}

// ===== AUTH REST API =====
async function authSignIn(email, password) {
  const res = await fetch(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Login failed');
  return data;
}

async function authSignUp(email, password) {
  const res = await fetch(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Signup failed');
  return data;
}

async function refreshIdToken(refreshToken) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed');
  return { idToken: data.id_token, refreshToken: data.refresh_token };
}

// ===== IS ADMIN =====
function isAdminEmail(email) {
  return email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
