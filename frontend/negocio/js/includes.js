// /frontend/negocio/js/includes.js
console.log('[includes] cargado');

async function fetchTextFirst(paths) {
  for (const url of paths) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      console.log('[includes] intento:', url, '->', res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.warn('[includes] falló', url, e.message);
    }
  }
  throw new Error('Ninguna ruta de partial funcionó');
}

export async function loadLayout() {
  console.log('[includes] loadLayout() llamado');

  // Header
  const headerHost = document.getElementById('appHeader');
  if (headerHost) {
    try {
      const html = await fetchTextFirst([
        '/partials/header.html',          // app.js lo sirve aquí
        '/negocio/partials/header.html',  // alias (por si acaso)
      ]);
      headerHost.innerHTML = html;
      console.log('[includes] header inyectado');
    } catch (err) {
      console.error('[includes] error cargando header:', err);
    }
  } else {
    console.warn('[includes] #appHeader no existe');
  }

  // Footer (opcional)
  const footerHost = document.getElementById('appFooter');
  if (footerHost) {
    try {
      const html = await fetchTextFirst([
        '/partials/footer.html',
        '/negocio/partials/footer.html',
      ]);
      footerHost.innerHTML = html;
      console.log('[includes] footer inyectado');
    } catch (e) {
      console.warn('[includes] no hay footer:', e.message);
    }
  }
}
