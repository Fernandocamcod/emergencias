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

  showView: function(viewId) {
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    this.currentView = viewId;
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
      this.showView('auth');
      return;
    }
    
    // Check token expiration
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      if (typeof clearSession === 'function') clearSession();
      this.showView('auth');
      return;
    }

    const decoded = this.parseJwt(sessionData.idToken);
    let isAdmin = decoded && decoded.admin === true;

    // Fallback: check PostgreSQL database via API if not admin in JWT
    if (!isAdmin) {
      try {
        const profile = await apiGet(`/api/users/${sessionData.uid}`);
        if (profile && profile.role === 'admin') {
          isAdmin = true;
        }
      } catch (err) {
        console.warn('Could not verify admin role from API:', err.message);
      }
    }
    
    // Route based on detected role
    if (isAdmin) {
      this.showView('admin');
      if (typeof window.initAdminView === 'function') window.initAdminView();
    } else {
      this.showView('user');
      if (typeof window.initUserView === 'function') window.initUserView();
    }
  }

};

document.addEventListener('DOMContentLoaded', () => {
  window.appRouter.init();
});
