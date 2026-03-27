// ===== USER.JS — SOS & GPS Tracking Logic =====
// Uses PostgreSQL backend API instead of Firestore

(function () {
  'use strict';

  // Auth validation is handled by appRouter

  // ---- State ----
  let currentLat      = null;
  let currentLng      = null;
  let gpsReady        = false;
  let selectedType    = null;
  let currentAcc      = 0;
  let isLowPrecision  = false;
  let trackingInterval = null;
  let userProfile     = null;
  let geoWatchId      = null;
  let userMap         = null;
  let userMarker      = null;
  let activeAlertId   = null;


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
  const userMapZone  = document.getElementById('user-map-zone');

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
      const session = getSession();
      if (!session) return;
      userProfile = await apiGet(`/api/users/${session.uid}`);
      if (userProfile && userProfile.name) nameEl.textContent = userProfile.name;
    } catch (e) {
      console.warn('Could not load profile:', e.message);
      const session = getSession();
      if (session) {
        userProfile = {
          uid: session.uid, email: session.email,
          name: session.email.split('@')[0], phone: '', emergencyContact: ''
        };
        nameEl.textContent = userProfile.name;
      }
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function onGPSSuccess(pos) {
    currentLat = pos.coords.latitude;
    currentLng = pos.coords.longitude;
    currentAcc = pos.coords.accuracy;
    isLowPrecision = currentAcc > 100;

    gpsReady   = true;
    if (isLowPrecision) {
      setGPSReadyWarning();
      initUserMap();
    } else {
      setGPSReady();
      userMapZone.classList.add('hidden');
    }
    if (userMap) updateUserMap();
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
  function setGPSReadyWarning() {
    gpsDot.className     = 'gps-dot warning';
    gpsTextEl.textContent = 'GPS de baja precisión';
    setStatus('warning', `⚠️ Ubicación aproximada (Margen: ${Math.round(currentAcc)}m). Considera ajustar manualmente si envías SOS.`);
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

  // ---- Manual Map Adjustment ----
  function initUserMap() {
    if (userMap) return;
    userMapZone.classList.remove('hidden');
    
    // Tiny delay to ensure container is visible before Leaflet init
    setTimeout(() => {
      userMap = L.map('user-map', { zoomControl: false }).setView([currentLat, currentLng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(userMap);

      userMarker = L.marker([currentLat, currentLng], { draggable: true }).addTo(userMap);
      
      userMarker.on('dragend', function(event) {
        const marker = event.target;
        const position = marker.getLatLng();
        currentLat = position.lat;
        currentLng = position.lng;
        console.log('Manual GPS adjustment:', currentLat, currentLng);
      });
    }, 100);
  }

  function updateUserMap() {
    if (userMap && userMarker) {
      const pos = [currentLat, currentLng];
      // Only auto-update if NOT being dragged (or just update view if marker is stationary)
      userMarker.setLatLng(pos);
      userMap.setView(pos);
    }
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
        uid:              getSession().uid,
        email:            getSession().email,
        name:             userProfile?.name || getSession().email.split('@')[0],
        phone:            userProfile?.phone || '',
        emergencyContact: userProfile?.emergencyContact || '',
        type:             selectedType,
        typeLabel:        getTypeLabel(selectedType),
        message:          msgInput.value.trim(),
        lat:              currentLat,
        lng:              currentLng,
        status:           'active',
        lowPrecision:     isLowPrecision
      });

      activeAlertId = alert._id;
      setAlertActive();
      setStatus('success', '🆘 ¡Alerta enviada! Seguimiento activo cada 30 segundos.');

      // Start location tracking interval
      trackingInterval = setInterval(pushLocationUpdate, 30000);
    } catch (err) {
      setSendingState(false);
      setStatus('error', '❌ Error al enviar alerta: ' + err.message);
    }
  };

  async function pushLocationUpdate() {
    if (!activeAlertId || !gpsReady) return;
    try {
      await getValidToken();
      const updatedAlert = await apiPatch(`/api/alerts/${activeAlertId}`, {
        lat:    currentLat,
        lng:    currentLng
      });
      
      if (updatedAlert && (updatedAlert.status === 'attended' || updatedAlert.status === 'cancelled')) {
        stopAlertUI(updatedAlert.status);
        return;
      }

      const now = new Date();
      trackingText.textContent = `📍 Ubicación actualizada: ${now.toLocaleTimeString()}`;
    } catch (err) {
      console.warn('Tracking update failed:', err.message);
    }
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

  function stopAlertUI(finalStatus) {
    clearInterval(trackingInterval);
    trackingInterval = null;
    activeAlertId    = null;
    // Reset UI
    sosBtnEl.classList.remove('active');
    sosBtnEl.disabled      = false;
    sosLabelEl.textContent = 'SOS';
    sosSubEl.textContent   = 'ENVIAR ALERTA';
    cancelBtnEl.classList.add('hidden');
    trackingBar.classList.remove('active-tracking');
    trackingText.textContent = 'Sin seguimiento activo';
    msgInput.disabled = false;
    document.querySelectorAll('.type-btn').forEach(b => b.disabled = false);
    
    if (finalStatus === 'attended') {
      setStatus('success', '✅ Un administrador ha marcado la alerta como ATENDIDA.');
    } else {
      setStatus('success', '✅ Alerta cancelada. Puedes enviar una nueva si es necesario.');
    }
  }

  // ---- CANCEL ALERT ----
  window.handleCancelAlert = async function () {
    if (!activeAlertId) return;
    if (!confirm('¿Confirmas que deseas cancelar la alerta de emergencia?')) return;
    try {
      await getValidToken();
      await apiPatch(`/api/alerts/${activeAlertId}`, { status: 'cancelled' });
    } catch (e) {
      console.warn('Cancel failed:', e.message);
    }
    stopAlertUI('cancelled');
  };

  // ---- Logout ----
  window.handleLogout = function () {
    if (activeAlertId) {
      if (!confirm('¿Seguro que deseas salir? Hay una alerta activa.')) return;
    }
    clearInterval(trackingInterval);
    if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
    if (window.appRouter) window.appRouter.logout();
  };

  // ---- Helpers ----
  function getTypeLabel(type) {
    return { fisica: 'Peligro físico', accidente: 'Accidente', medica: 'Emergencia médica', otro: 'Otro' }[type] || type;
  }

  // ---- INIT ----
  window.initUserView = function() {
    loadProfile();
    startGPS();
  };

})();
