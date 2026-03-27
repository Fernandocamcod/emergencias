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
    document.getElementById('form-google-complete').classList.add('hidden');
    document.querySelector('.auth-tabs').classList.remove('hidden');
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

    const name          = document.getElementById('reg-name').value.trim();
    const phone         = document.getElementById('reg-phone').value.trim();
    const contactName   = document.getElementById('reg-contact-name').value.trim();
    const contactPhone  = document.getElementById('reg-contact-phone').value.trim();
    const email         = document.getElementById('reg-email').value.trim().toLowerCase();
    const password      = document.getElementById('reg-password').value;

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
          emergencyContactName:  contactName,
          emergencyContactPhone: contactPhone,
          role:             'user'
        });
      } catch (apiErr) {
        console.warn('Could not save profile to API:', apiErr.message);
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

      // Check if profile is complete
      let profile = null;
      try {
        profile = await apiGet(`/api/users/${user.uid}`);
      } catch (e) {
        console.log('New Google user, profile incomplete.');
      }

      if (!profile || !profile.phone || !profile.emergencyContactPhone) {
        // Show "Complete Profile" form
        document.getElementById('form-login').classList.add('hidden');
        document.getElementById('form-register').classList.add('hidden');
        document.querySelector('.auth-tabs').classList.add('hidden');
        document.getElementById('form-google-complete').classList.remove('hidden');
        btn.disabled = false;
        return;
      }

      redirectByRole(user.email);
    } catch (err) {
      showError('login', err.message);
      btn.disabled = false;
    }
  };

  // ---- GOOGLE COMPLETE ----
  window.handleGoogleComplete = async function (e) {
    e.preventDefault();
    const session = getSession();
    if (!session) return;

    const phone         = document.getElementById('g-phone').value.trim();
    const contactName   = document.getElementById('g-contact-name').value.trim();
    const contactPhone  = document.getElementById('g-contact-phone').value.trim();

    try {
      await apiPost(`/api/users/${session.uid}`, {
        uid:              session.uid,
        email:            session.email,
        phone:            phone,
        emergencyContactName:  contactName,
        emergencyContactPhone: contactPhone,
        role:             'user'
      });
      redirectByRole(session.email);
    } catch (err) {
      alert('Error al guardar datos: ' + err.message);
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
