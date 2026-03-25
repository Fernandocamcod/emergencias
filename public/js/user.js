// ===== USER.JS — SOS & GPS Tracking Logic =====
// Uses PostgreSQL backend API instead of Firestore

(function () {
  'use strict';

  // ---- Guard: require session ----
  const session = getSession();
  if (!session || !session.idToken) {
    window.location.href = 'index.html';
    return;
  }
  // Redirect admin away
  if (isAdminEmail(session.email)) {
    window.location.href = 'admin.html';
    return;
  }

  // ---- State ----
  let currentLat      = null;
  let currentLng      = null;
  let gpsReady        = false;
  let selectedType    = null;
  let activeAlertId   = null;
  let trackingInterval = null;
  let userProfile     = null;
  let geoWatchId      = null;

  // ---- DOM refs ----
  const sosBtnEl     = document.getElementById('sos-btn');
  const sosLabelEl   = document.getElementById('sos-label');
  const sosSubEl     = document.getElementById('sos-sub');
  const cancelBtnEl  = document.getElementById('cancel-btn');
  const trackingBar  = document.getElementById('tracking-bar');
  const trackingText = document.getElementById('tracking-text');
  const statusBar    = document.getElementById('status-bar');
  const statusText   = document.getElementById('status-text');
  const gpsDot       = document.getElementById('gps-status-dot');
  const gpsTextEl    = document.getElementById('gps-status-text');
  const nameEl       = document.getElementById('user-display-name');
  const msgInput     = document.getElementById('msg-input');

  // ---- Token management (refresh if needed) ----
  async function getValidToken() {
    let s = getSession();
    if (!s) throw new Error('No session');
    if (Date.now() > s.expiresAt - 60000) {
      const refreshed  = await refreshIdToken(s.refreshToken);
      s.idToken        = refreshed.idToken;
      s.refreshToken   = refreshed.refreshToken;
      s.expiresAt      = Date.now() + 3590000;
      saveSession(s);
    }
    return s.idToken;
  }

  // ---- Load user profile from PostgreSQL ----
  async function loadProfile() {
    try {
      await getValidToken(); // ensure token is fresh
      userProfile = await apiGet(`/api/users/${session.uid}`);
      if (userProfile.name) nameEl.textContent = userProfile.name;
    } catch (e) {
      console.warn('Could not load profile:', e.message);
      userProfile = {
        uid: session.uid, email: session.email,
        name: session.email.split('@')[0], phone: '', emergencyContact: ''
      };
      nameEl.textContent = userProfile.name;
    }
  }

  // ---- Geolocation ----
  function startGPS() {
    if (!navigator.geolocation) {
      setGPSError('GPS no disponible en este dispositivo');
      return;
    }
    setGPSSearching();
    geoWatchId = navigator.geolocation.watchPosition(
      onGPSSuccess, onGPSError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  function onGPSSuccess(pos) {
    currentLat = pos.coords.latitude;
    currentLng = pos.coords.longitude;
    gpsReady   = true;
    setGPSReady();
    if (activeAlertId) pushLocationUpdate();
  }

  function onGPSError(err) {
    const msgs = {
      1: 'Permiso de ubicación denegado. Por favor permite el acceso en tu navegador.',
      2: 'No se pudo obtener la ubicación.',
      3: 'Tiempo de espera al obtener ubicación.'
    };
    setGPSError(msgs[err.code] || 'Error de GPS');
  }

  function setGPSSearching() {
    gpsDot.className     = 'gps-dot searching';
    gpsTextEl.textContent = 'Buscando GPS...';
    setStatus('warning', '📡 Obteniendo tu ubicación GPS...');
  }
  function setGPSReady() {
    gpsDot.className     = 'gps-dot';
    gpsTextEl.textContent = 'GPS activo';
    setStatus('success', '✅ Ubicación obtenida. Listo para enviar alerta.');
  }
  function setGPSError(msg) {
    gpsDot.className     = 'gps-dot error';
    gpsTextEl.textContent = 'GPS no disponible';
    setStatus('error', '⚠️ ' + msg);
  }
  function setStatus(type, msg) {
    statusBar.className  = 'status-bar' + (type === 'warning' ? ' warning' : type === 'error' ? ' error' : '');
    statusText.textContent = msg;
  }

  // ---- Emergency type selection ----
  window.selectType = function (type, btn) {
    selectedType = type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };

  // ---- SOS BUTTON ----
  window.handleSOS = async function () {
    if (activeAlertId) return;
    if (!gpsReady || currentLat === null) {
      setStatus('error', '⚠️ Espera a que el GPS esté listo para enviar la alerta.');
      return;
    }
    if (!selectedType) {
      setStatus('warning', '⚠️ Por favor selecciona el tipo de emergencia primero.');
      return;
    }

    setSendingState(true);
    setStatus('warning', '📤 Enviando alerta de emergencia...');

    try {
      await getValidToken();
      const alert = await apiPost('/api/alerts', {
        uid:              session.uid,
        email:            session.email,
        name:             userProfile?.name || session.email.split('@')[0],
        phone:            userProfile?.phone || '',
        emergencyContact: userProfile?.emergencyContact || '',
        type:             selectedType,
        typeLabel:        getTypeLabel(selectedType),
        message:          msgInput.value.trim(),
        lat:              currentLat,
        lng:              currentLng,
        status:           'active'
      });

      activeAlertId = alert._id;
      setAlertActive();
      setStatus('success', '🆘 ¡Alerta enviada! Seguimiento activo cada 30 segundos.');

      // Start location tracking and status checking
      trackingInterval = setInterval(pushLocationUpdate, 5000); // Check/Update every 5s
    } catch (err) {
      setSendingState(false);
      setStatus('error', '❌ Error al enviar alerta: ' + err.message);
    }
  };

  async function pushLocationUpdate() {
    if (!activeAlertId || !gpsReady) return;
    try {
      await getValidToken();
      const alert = await apiPatch(`/api/alerts/${activeAlertId}`, {
        lat:    currentLat,
        lng:    currentLng,
        status: 'active'
      });
      
      // If server says it's no longer active, reset locally
      if (alert.status !== 'active' && alert.status !== 'in_progress') {
        console.log('Alerta terminada por el administrador.');
        resetUserUI();
      }

      const now = new Date();
      trackingText.textContent = `📍 Ubicación actualizada: ${now.toLocaleTimeString()}`;
    } catch (err) {
      console.warn('Tracking update failed:', err.message);
    }
  }

  function resetUserUI() {
    clearInterval(trackingInterval);
    trackingInterval = null;
    activeAlertId    = null;
    sosBtnEl.classList.remove('active');
    sosBtnEl.disabled      = false;
    sosLabelEl.textContent = 'SOS';
    sosSubEl.textContent   = 'ENVIAR ALERTA';
    cancelBtnEl.classList.add('hidden');
    trackingBar.classList.remove('active-tracking');
    trackingText.textContent = 'Sin seguimiento activo';
    msgInput.disabled = false;
    document.querySelectorAll('.type-btn').forEach(b => b.disabled = false);
    setStatus('success', '✅ La alerta ha sido atendida o finalizada.');
  }

  function setAlertActive() {
    sosBtnEl.classList.add('active');
    sosLabelEl.textContent = '⚠️';
    sosSubEl.textContent   = 'ALERTA ACTIVA';
    sosBtnEl.disabled      = true;
    cancelBtnEl.classList.remove('hidden');
    trackingBar.classList.add('active-tracking');
    trackingText.textContent = '📡 Seguimiento GPS activo';
    msgInput.disabled = true;
    document.querySelectorAll('.type-btn').forEach(b => b.disabled = true);
  }

  function setSendingState(loading) {
    sosBtnEl.disabled = loading;
    if (loading) {
      sosLabelEl.innerHTML = '<span class="spinner"></span>';
      sosSubEl.textContent = 'ENVIANDO...';
    } else {
      sosLabelEl.textContent = 'SOS';
      sosSubEl.textContent   = 'ENVIAR ALERTA';
    }
  }

  // ---- CANCEL ALERT ----
  window.handleCancelAlert = async function () {
    if (!activeAlertId) return;
    if (!confirm('¿Confirmas que deseas cancelar la alerta de emergencia?')) return;
    try {
      await getValidToken();
      await apiPatch(`/api/alerts/${activeAlertId}`, { status: 'cancelled' });
      resetUserUI();
    } catch (e) {
      console.warn('Cancel failed:', e.message);
    }
  };

  // ---- Logout ----
  window.handleLogout = function () {
    if (activeAlertId) {
      if (!confirm('¿Seguro que deseas salir? Hay una alerta activa.')) return;
    }
    clearInterval(trackingInterval);
    if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
    clearSession();
    window.location.href = 'index.html';
  };

  // ---- Helpers ----
  function getTypeLabel(type) {
    return { fisica: 'Peligro físico', accidente: 'Accidente', medica: 'Emergencia médica', otro: 'Otro' }[type] || type;
  }

  // ---- INIT ----
  loadProfile();
  startGPS();

})();
