// frontend/negocio/js/modules/header.js
import { state } from './state.js';
import { $ } from './utils.js';

async function doLogout() {
  // Intenta cerrar sesión en el backend (borra cookie de sesión)
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    // Si falla el fetch, igual seguimos limpiando el lado cliente
    console.warn('[header] fallo al llamar /api/logout:', e);
  }

  // Limpia sesión del lado cliente
  localStorage.removeItem('usuarioNegocio');
}

export function bindHeaderEvents() {
  $('#btnSalir')?.addEventListener('click', async () => {
    const btn = $('#btnSalir');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saliendo…'; }

    await doLogout();

    // Redirige al login del negocio
    location.href = `/negocio/${encodeURIComponent(state.slug)}`;
  });
}

export function paintHeader(negocio, sesion) {
  const logoEl = document.getElementById('negocio-logo');
  const nomEl  = document.getElementById('negocioNombre');
  const usrEl  = document.getElementById('usuarioNombre');

  if (logoEl) {
    if (negocio.logo) {
      logoEl.src = negocio.logo;
    } else {
      // Fallback si no hay logo en BD
      logoEl.src = '/img/logo-placeholder.png';
    }
    logoEl.alt = `Logo de ${negocio.razon_social || 'Negocio'}`;
  }

  if (nomEl) nomEl.textContent = negocio.razon_social || 'Marketplace';

  if (usrEl && sesion) {
    const nombre = [sesion.nombre, sesion.apellido].filter(Boolean).join(' ');
    usrEl.textContent = nombre || sesion.email || 'Usuario';
  }
}
