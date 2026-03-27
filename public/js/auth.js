// ===== AUTH.JS — Login & Register Logic =====
// Handles authentication, role detection, and page routing
// Data stored in PostgreSQL via backend API (Firestore removed)

(function () {
  'use strict';

  // Initialization logic is now moved to appRouter (app.js)

  // ---- Tab switching ----
  window.showTab = function (tab) {
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  };

  function showError(formId, msg) {
    const el = document.getElementById(formId + '-error');
    if (el) { el.textContent = translateError(msg); el.classList.remove('hidden'); }
  }
  function hideError(formId) {
    const el = document.getElementById(formId + '-error');
    if (el) el.classList.add('hidden');
  }

  function translateError(msg) {
    const map = {
      'EMAIL_NOT_FOUND':  'No existe una cuenta con ese correo.',
      'INVALID_PASSWORD': 'Contraseña incorrecta.',
      'INVALID_LOGIN_CREDENTIALS': 'Correo o contraseña incorrectos.',
      'USER_DISABLED':    'Esta cuenta ha sido deshabilitada.',
      'EMAIL_EXISTS':     'Ya existe una cuenta con ese correo.',
      'WEAK_PASSWORD : Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Demasiados intentos. Intenta más tarde.',
    };
    for (const [k, v] of Object.entries(map)) {
      if (msg && msg.includes(k)) return v;
    }
    return msg || 'Ocurrió un error. Intenta de nuevo.';
  }

  function setLoading(formId, loading) {
    const btn = document.getElementById(formId + '-btn');
    if (!btn) return;
    if (formId === 'login') {
      document.getElementById('login-btn-text').textContent = loading ? 'Ingresando...' : 'Ingresar';
    } else {
      document.getElementById('register-btn-text').textContent = loading ? 'Creando cuenta...' : 'Crear cuenta';
    }
    btn.disabled = loading;
  }

  function redirectByRole() {
    if (window.appRouter) {
      window.appRouter.navigate(getSession());
    }
  }

  // ---- LOGIN ----
  window.handleLogin = async function (e) {
    e.preventDefault();
    hideError('login');
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    setLoading('login', true);
    try {
      const data = await authSignIn(email, password);
      saveSession({
        uid:          data.localId,
        email:        data.email,
        idToken:      data.idToken,
        refreshToken: data.refreshToken,
        expiresAt:    Date.now() + (parseInt(data.expiresIn) * 1000)
      });
      redirectByRole(data.email);
    } catch (err) {
      showError('login', err.message);
      setLoading('login', false);
    }
  };

  // ---- REGISTER ----
  window.handleRegister = async function (e) {
    e.preventDefault();
    hideError('register');

    const name    = document.getElementById('reg-name').value.trim();
    const phone   = document.getElementById('reg-phone').value.trim();
    const contact = document.getElementById('reg-contact').value.trim();
    const email   = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    // Allow any email to register, but admin role enforcement happens on the backend/token

    setLoading('register', true);
    try {
      const data = await authSignUp(email, password);
      const session = {
        uid:          data.localId,
        email:        data.email,
        idToken:      data.idToken,
        refreshToken: data.refreshToken,
        expiresAt:    Date.now() + (parseInt(data.expiresIn) * 1000)
      };
      saveSession(session);

      // Save user profile to PostgreSQL via backend API
      try {
        await apiPost(`/api/users/${data.localId}`, {
          uid:              data.localId,
          email:            email,
          name:             name,
          phone:            phone,
          emergencyContact: contact,
          role:             'user'
        });
      } catch (apiErr) {
        console.warn('Could not save profile to API:', apiErr.message);
        // Continue anyway — user is created in Firebase Auth
      }

      redirectByRole(data.email);
    } catch (err) {
      showError('register', err.message);
      setLoading('register', false);
    }
  };

  // ---- GOOGLE LOGIN ----
  window.handleGoogleLogin = async function () {
    hideError('login');
    const btn = document.getElementById('google-btn');
    btn.disabled = true;

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      const result   = await firebase.auth().signInWithPopup(provider);
      const user     = result.user;

      const sData = {
        uid:          user.uid,
        email:        user.email,
        idToken:      await user.getIdToken(),
        refreshToken: user.refreshToken,
        expiresAt:    Date.now() + 3600000
      };
      saveSession(sData);

      // Ensure profile exists in PostgreSQL (upsert — safe to call every time)
      try {
        await apiPost(`/api/users/${user.uid}`, {
          uid:              user.uid,
          email:            user.email,
          name:             user.displayName || '',
          phone:            '',
          emergencyContact: '',
          role:             'user'
        });
      } catch (apiErr) {
        console.warn('Profile sync failed:', apiErr.message);
      }

      redirectByRole(user.email);
    } catch (err) {
      showError('login', err.message);
      btn.disabled = false;
    }
  };

  // ---- LOGOUT ----
  window.handleLogout = function () {
    clearSession();
    if (window.appRouter) {
      window.appRouter.showView('auth');
    } else {
      window.location.reload();
    }
  };

})();
