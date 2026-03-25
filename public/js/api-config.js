// ===== API CONFIG =====
// Replaces firebase-config.js
// - Keeps Firebase Auth (email/password + Google)
// - Replaces Firestore with our PostgreSQL backend API

// ---- Firebase Auth config (kept for authentication only) ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvv67WmimCBYS8tda6p_NTWUq8x6M_Y-w",
  authDomain: "emergencias-b16bd.firebaseapp.com",
  projectId: "emergencias-b16bd",
  storageBucket: "emergencias-b16bd.firebasestorage.app",
  messagingSenderId: "767406492125",
  appId: "1:767406492125:web:3149b5a924fe09d002ce34"
};

const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1/accounts`;
const API_KEY   = FIREBASE_CONFIG.apiKey;

// ---- Backend API base URL ----
const API_BASE = 'https://emergencias.onrender.com';

// ---- Admin email ----
const ADMIN_EMAIL = "leandroescorza789@gmail.com";

// ===== LOCAL STORAGE SESSION =====
const SESSION_KEY = 'em_session';
function saveSession(data)  { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function getSession()       {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}
function clearSession()     { localStorage.removeItem(SESSION_KEY); }

// ===== FIREBASE AUTH REST =====
async function authSignIn(email, password) {
  const res = await fetch(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Login failed');
  return data;
}

async function authSignUp(email, password) {
  const res = await fetch(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Signup failed');
  return data;
}

async function refreshIdToken(refreshToken) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed');
  return { idToken: data.id_token, refreshToken: data.refresh_token };
}

// ===== BACKEND API (PostgreSQL) =====

async function apiRequest(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${path} failed (${res.status})`);
  return data;
}

async function apiGet(path)          { return apiRequest('GET',   path, null); }
async function apiPost(path, body)   { return apiRequest('POST',  path, body); }
async function apiPatch(path, body)  { return apiRequest('PATCH', path, body); }

// ===== IS ADMIN =====
function isAdminEmail(email) {
  return email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
