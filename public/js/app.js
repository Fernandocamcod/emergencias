// public/js/app.js - Main Router for SPA

window.appRouter = {
  currentView: 'auth',

  init: function() {
    const session = typeof getSession === 'function' ? getSession() : null;
    if (!session || !session.idToken) {
      this.showView('auth');
    } else {
      this.navigate(session);
    }
  },

  showView: async function(viewId) {
    await this.loadView(viewId);
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    this.currentView = viewId;
  },

  loadView: async function(viewId) {
    const container = document.getElementById('view-' + viewId);
    if (!container) return;
    if (container.innerHTML.trim() !== '') return; // Already loaded

    try {
      console.log(`Loading view: ${viewId}...`);
      const response = await fetch(`views/${viewId}.html`);
      if (!response.ok) throw new Error(`Failed to load ${viewId}.html`);
      const html = await response.text();
      container.innerHTML = html;
    } catch (err) {
      console.error('Error loading view:', err);
      container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red-light)">
        <h3>Error al cargar la vista</h3>
        <p>${err.message}</p>
        <button class="btn btn-secondary" onclick="location.reload()">Reintentar</button>
      </div>`;
    }
  },

  parseJwt: function(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  },

  navigate: async function(sessionData) {
    if (!sessionData || !sessionData.idToken) {
      await this.showView('auth');
      return;
    }
    
    // Check token expiration
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      if (typeof clearSession === 'function') clearSession();
      await this.showView('auth');
      return;
    }

    const decoded = this.parseJwt(sessionData.idToken);
    let isAdmin = decoded && decoded.admin === true;
    console.log('Role from JWT:', isAdmin ? 'admin' : 'user');

    // Enforce profile completion (mandatory for all users)
    console.log('Verifying profile completeness...');
    try {
      const profile = await apiGet(`/api/users/${sessionData.uid}`);
      console.log('Profile from API:', profile);
      
      const isIncomplete = !profile || !profile.phone || !profile.emergencyContactName || !profile.emergencyContactPhone;
      
      if (isIncomplete && profile?.role !== 'admin') {
        console.warn('Profile incomplete. Redirecting to completion form.');
        await this.showView('auth');
        if (typeof window.showGoogleComplete === 'function') {
          window.showGoogleComplete();
        }
        return;
      }
      
      if (profile && profile.role === 'admin') {
        isAdmin = true;
      }
    } catch (err) {
      console.warn('Could not verify profile/role from API:', err.message);
    }

    
    // Route based on detected role
    if (isAdmin) {
      await this.showView('admin');
      if (typeof window.initAdminView === 'function') window.initAdminView();
    } else {
      await this.showView('user');
      if (typeof window.initUserView === 'function') window.initUserView();
    }
  },

  logout: async function() {
    if (typeof clearSession === 'function') clearSession();
    await this.showView('auth');
  }

};

document.addEventListener('DOMContentLoaded', () => {
  window.appRouter.init();
});
