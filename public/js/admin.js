// ===== ADMIN.JS — Admin Dashboard Logic =====
// Uses PostgreSQL backend API instead of Firestore

(function () {
  'use strict';

  // Auth validation is handled by appRouter

  // ---- State ----
  let allAlerts  = {};        // id -> alert object
  let map        = null;
  let markers    = {};        // id -> Leaflet marker
  let currentTab = 'active';
  let knownIds   = new Set(); // already-seen alert IDs (for notifications)
  let pollInterval = null;
  let doneCount  = 0;
  let isFirstLoadAdmin = true;

  // ---- DOM refs ----
  let alertsList, historyList, emptyActive, emptyHistory, activeCount, statActive, statDone, statCancelled, statName, toastContainer;

  function initElements() {
    alertsList     = document.getElementById('alerts-list');
    historyList    = document.getElementById('history-list');
    emptyActive    = document.getElementById('empty-active');
    emptyHistory   = document.getElementById('empty-history');
    activeCount    = document.getElementById('active-count');
    statActive     = document.getElementById('stat-active');
    statDone       = document.getElementById('stat-done');
    statCancelled  = document.getElementById('stat-cancelled');
    statName       = document.getElementById('admin-name-display');
    toastContainer = document.getElementById('toast-container');
  }

  // ---- Token management ----
  async function getToken() {
    let s = getSession();
    if (!s) throw new Error('No session');
    if (Date.now() > s.expiresAt - 60000) {
      const r      = await refreshIdToken(s.refreshToken);
      s.idToken    = r.idToken;
      s.refreshToken = r.refreshToken;
      s.expiresAt  = Date.now() + 3590000;
      saveSession(s);
    }
    return s.idToken;
  }

  // ---- Init Leaflet Map ----
  function initMap() {
    map = L.map('admin-map', { zoomControl: true }).setView([-1.831239, -78.183406], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
  }

  // ---- Custom map icon ----
  function makeIcon(status) {
    const color = status === 'active' ? '#e74c3c' : status === 'in_progress' ? '#f39c12' : '#27ae60';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <ellipse cx="18" cy="40" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
      <path d="M18 0C9 0 2 7 2 16c0 12 16 28 16 28S34 28 34 16C34 7 27 0 18 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="18" y="20" text-anchor="middle" fill="white" font-size="14" font-family="Arial" font-weight="bold">!</text>
    </svg>`;
    return L.divIcon({
      html: svg, className: '', iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44]
    });
  }

  // ---- Fetch all alerts from PostgreSQL ----
  async function fetchAlerts() {
    try {
      await getToken();
      const alerts = await apiGet('/api/alerts');
      console.log('--- ADMIN FETCH ---', alerts.length, 'alerts found');
      return Array.isArray(alerts) ? alerts : [];
    } catch (e) {
      console.warn('Fetch alerts error:', e.message);
      return [];
    }
  }

  // ---- Poll for new alerts ----
  async function pollAlerts() {
    const alerts   = await fetchAlerts();
    const newActive = [];

    alerts.forEach(alert => {
      if (!alert._id) return;
      allAlerts[alert._id] = alert;

      // New active alert?
      if (alert.status === 'active' && !knownIds.has(alert._id)) {
        knownIds.add(alert._id);
        if (!isFirstLoadAdmin) {
          newActive.push(alert);
        }
      }

      updateMarker(alert);
    });

    if (newActive.length > 0) {
      newActive.forEach(a => showToast(a));
      playAlertSound();
      flashTitle(newActive.length);
      const latest = newActive[0];
      const lt = parseFloat(latest.lat);
      const lg = parseFloat(latest.lng);
      if (!isNaN(lt) && !isNaN(lg)) {
        map.flyTo([lt, lg], 14, { duration: 1.5 });
        if (markers[latest._id]) markers[latest._id].openPopup();
      }
    }

    if (isFirstLoadAdmin) {
      isFirstLoadAdmin = false;
      setTimeout(() => {
        if (map) map.invalidateSize();
        const actives = alerts.filter(a => a.status === 'active' && !isNaN(parseFloat(a.lat)) && !isNaN(parseFloat(a.lng)));
        if (actives.length > 0) {
          const first = actives[0];
          map.setView([parseFloat(first.lat), parseFloat(first.lng)], 14);
          if (markers[first._id]) markers[first._id].openPopup();
        }
      }, 300);
    }

    renderLists();
    updateStats();
  }

  // ---- Map marker management ----
  function updateMarker(alert) {
    try {
      const lat = parseFloat(alert.lat);
      const lng = parseFloat(alert.lng);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Skipping marker for alert ${alert._id} due to invalid coordinates: (${alert.lat}, ${alert.lng})`);
        return;
      }
      
      const pos   = [lat, lng];
      const label = getTypeEmoji(alert.type) + ' ' + (alert.typeLabel || alert.type);
      const time  = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : '';

      const popupContent = `
        <div class="popup-content">
          <div class="popup-name">👤 ${escHtml(alert.name || 'Usuario')}</div>
          <div class="popup-type">${label}</div>
          <div class="popup-time">⏱️ ${time}</div>
          ${alert.phone ? `<div style="margin-top:4px;font-size:0.78rem">📞 <a href="tel:${escHtml(alert.phone)}" style="color:#e74c3c">${escHtml(alert.phone)}</a></div>` : ''}
          ${alert.lowPrecision ? `<div style="margin-top:4px;font-size:0.78rem;color:#f39c12" title="Precisión > 100m">⚠️ Ubicación aproximada (PC/Red)</div>` : ''}
          ${alert.message ? `<div style="margin-top:4px;font-size:0.78rem;color:#bdc3c7">"${escHtml(alert.message)}"</div>` : ''}
        </div>
      `;

      if (markers[alert._id]) {
        markers[alert._id].setLatLng(pos);
        if (alert.status === 'cancelled') {
          map.removeLayer(markers[alert._id]);
          delete markers[alert._id];
          return;
        }
        markers[alert._id].setIcon(makeIcon(alert.status));
        markers[alert._id].setPopupContent(popupContent);
      } else if (alert.status !== 'cancelled') {
        const marker = L.marker(pos, { icon: makeIcon(alert.status) })
          .addTo(map)
          .bindPopup(popupContent);
        markers[alert._id] = marker;
      }
    } catch (err) {
      console.error(`Error updating marker for alert ${alert._id}:`, err);
    }
  }


  // ---- Render alert lists ----
  function renderLists() {
    const active  = Object.values(allAlerts).filter(a => a.status === 'active' || a.status === 'in_progress');
    const history = Object.values(allAlerts).filter(a => a.status === 'attended' || a.status === 'cancelled');

    active.sort((a, b)  => (b.timestamp || '').localeCompare(a.timestamp || ''));
    history.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    activeCount.textContent = active.length;
    emptyActive.classList.toggle('hidden', active.length > 0);
    alertsList.innerHTML = active.map(renderAlertCard).join('');

    emptyHistory.classList.toggle('hidden', history.length > 0);
    historyList.innerHTML = history.map(renderHistoryCard).join('');

    doneCount = history.filter(a => a.status === 'attended').length;
  }

  function renderAlertCard(alert) {
    const time  = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
    const badge = alert.status === 'in_progress'
      ? '<span class="badge badge-progress">En proceso</span>'
      : '<span class="badge badge-active">Activa</span>';
    return `
      <div class="alert-card ${alert.status}" id="card-${alert._id}" onclick="focusAlert('${alert._id}')">
        <div class="alert-card-header">
          <span class="alert-name">👤 ${escHtml(alert.name || 'Sin nombre')}</span>
          <span class="alert-time">${time}</span>
        </div>
        ${badge}
        <div class="alert-type-label" style="margin-top:0.4rem">${getTypeEmoji(alert.type)} ${escHtml(alert.typeLabel || alert.type)}</div>
        ${alert.lat ? `<div class="alert-coords">📍 ${parseFloat(alert.lat).toFixed(5)}, ${parseFloat(alert.lng).toFixed(5)}</div>` : ''}
        ${alert.lowPrecision ? `<div style="font-size:0.75rem;color:#f39c12;margin-top:4px;font-weight:bold" title="Precisión > 100m">⚠️ Ubicación aproximada (PC/Red)</div>` : ''}
        ${alert.message ? `<div class="alert-message">"${escHtml(alert.message)}"</div>` : ''}

        <div class="alert-emergency-box" style="margin-top:0.8rem; padding:0.8rem; background:rgba(231,76,60,0.15); border-radius:12px; border:2px dashed rgba(231,76,60,0.3)">
          <div style="font-size:0.7rem; color:var(--red-light); font-weight:700; margin-bottom:0.4rem; text-transform:uppercase; letter-spacing:0.05em">🚨 Contacto de Emergencia</div>
          <div style="font-weight:bold; font-size:1.05rem; color:var(--white); margin-bottom:0.3rem">${escHtml(alert.emergencyContactName || 'No especificado')}</div>
          ${alert.emergencyContactPhone ? `<a href="tel:${escHtml(alert.emergencyContactPhone)}" style="color:var(--red-light); font-size:1rem; text-decoration:none; display:flex; align-items:center; gap:0.5rem; font-weight:600"><span>📞</span> ${escHtml(alert.emergencyContactPhone)}</a>` : '<div style="font-size:0.9rem; color:var(--grey-mid)">📞 No provisto</div>'}
        </div>

        <div class="alert-actions" style="margin-top:1.2rem; border-top:1px solid rgba(255,255,255,0.05); padding-top:1rem; display:grid; grid-template-columns:1fr 1fr; gap:0.5rem">
          ${alert.phone ? `<a href="tel:${escHtml(alert.phone)}" class="btn btn-secondary btn-sm" style="grid-column: span 2" title="Llamar al usuario">Llamar Usuario</a>` : ''}
          <button class="btn btn-warning btn-sm" onclick="updateStatus(event,'${alert._id}', 'in_progress')">⏳ Proceso</button>
          <button class="btn btn-success btn-sm" onclick="updateStatus(event,'${alert._id}','attended')">✅ OK</button>
          <button class="btn btn-danger btn-sm" style="grid-column: span 2; background:rgba(231,76,60,0.2); color:#e74c3c" onclick="updateStatus(event,'${alert._id}','cancelled')">❌ Cancelar (Falsa)</button>
        </div>
      </div>`;
  }

  function renderHistoryCard(alert) {
    const time  = alert.timestamp ? new Date(alert.timestamp).toLocaleString('es') : '';
    const badge = alert.status === 'attended'
      ? '<span class="badge badge-done">Atendida</span>'
      : '<span class="badge" style="background:rgba(231,76,60,0.1);color:#e74c3c;border:1px solid rgba(231,76,60,0.2)">Falsa / Cancelada</span>';
    return `
      <div class="alert-card" style="opacity:0.7">
        <div class="alert-card-header">
          <span class="alert-name">👤 ${escHtml(alert.name || 'Sin nombre')}</span>
          <span class="alert-time">${time}</span>
        </div>
        ${badge}
        <div class="alert-type-label" style="margin-top:0.4rem">${getTypeEmoji(alert.type)} ${escHtml(alert.typeLabel || alert.type)}</div>
        ${alert.phone ? `<div class="alert-coords" style="margin-top:0.3rem">📞 ${escHtml(alert.phone)}</div>` : ''}
      </div>`;
  }

  function updateStats() {
    const active    = Object.values(allAlerts).filter(a => a.status === 'active' || a.status === 'in_progress').length;
    const done      = Object.values(allAlerts).filter(a => a.status === 'attended').length;
    const cancelled = Object.values(allAlerts).filter(a => a.status === 'cancelled').length;
    
    statActive.textContent    = active + ' activa' + (active !== 1 ? 's' : '');
    statDone.textContent      = done   + ' atendida' + (done !== 1 ? 's' : '');
    statCancelled.textContent = cancelled + ' falsa' + (cancelled !== 1 ? 's' : '');
    const session = getSession();
    document.getElementById('admin-name-display').textContent = session && session.email ? session.email.split('@')[0] : 'Admin';
  }

  // ---- Focus alert on map ----
  window.focusAlert = function (id) {
    const alert = allAlerts[id];
    if (!alert || !alert.lat) return;
    map.flyTo([parseFloat(alert.lat), parseFloat(alert.lng)], 16, { duration: 1.2 });
    if (markers[id]) markers[id].openPopup();
    document.querySelectorAll('.alert-card').forEach(c => c.classList.remove('selected-alert'));
    const card = document.getElementById('card-' + id);
    if (card) card.classList.add('selected-alert');
  };

  // ---- Update alert status in PostgreSQL ----
  window.updateStatus = async function (e, id, status) {
    e.stopPropagation();
    try {
      await getToken();
      await apiPatch(`/api/alerts/${id}`, { status });
      if (allAlerts[id]) allAlerts[id].status = status;
      if (status === 'attended' && markers[id]) {
        markers[id].setIcon(makeIcon('attended'));
      }
      renderLists();
      updateStats();
    } catch (e) {
      console.error('Update status failed:', e.message);
    }
  };

  // ---- Tab switching ----
  window.switchTab = function (tab) {
    currentTab = tab;
    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-history').classList.toggle('active', tab === 'history');
    document.getElementById('panel-active').classList.toggle('hidden', tab !== 'active');
    document.getElementById('panel-history').classList.toggle('hidden', tab !== 'history');
  };

  // ---- Toast notification ----
  function showToast(alert) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon">${getTypeEmoji(alert.type)}</div>
      <div class="toast-body">
        <div class="toast-title">🆘 Nueva alerta — ${escHtml(alert.name || 'Usuario')}</div>
        <div class="toast-msg">${escHtml(alert.typeLabel || alert.type)} · ${alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}</div>
      </div>
    `;
    toastContainer.prepend(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  // ---- Sound alert ----
  function playAlertSound() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn('Audio failed:', e);
    }
  }

  // ---- Title flash ----
  let flashTimer = null;
  function flashTitle(count) {
    let state  = true;
    const orig = 'AlertaEmergencia — Panel de Control';
    if (flashTimer) clearInterval(flashTimer);
    let flashes = 0;
    flashTimer = setInterval(() => {
      document.title = state ? `🆘 ${count} NUEVA${count > 1 ? 'S' : ''} ALERTA${count > 1 ? 'S' : ''}` : orig;
      state = !state;
      if (++flashes >= 10) { clearInterval(flashTimer); document.title = orig; }
    }, 700);
  }

  // ---- Logout ----
  window.handleLogout = function () {
    clearInterval(pollInterval);
    pollInterval = null;
    if (window.appRouter) window.appRouter.logout();
  };

  // ---- Helpers ----
  function getTypeEmoji(type) {
    return { fisica: '⚠️', accidente: '🚗', medica: '🏥', otro: '🔴' }[type] || '🔴';
  }
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---- INIT ----
  window.initAdminView = function() {
    console.log('--- ADMIN VIEW INIT ---');
    initElements();
    try {
      if (!map) {
        console.log('Initializing admin map...');
        initMap();
      }
      
      pollAlerts();
      
      if (!pollInterval) {
        console.log('Starting alert polling...');
        pollInterval = setInterval(pollAlerts, 5000);
      }
    } catch (err) {
      console.error('Fatal error in initAdminView:', err);
    }
  };

})();

