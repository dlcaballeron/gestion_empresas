// /frontend/negocio/js/includes.js
console.log('[includes] cargado');

/* =========================================================
 * Helpers
 * =======================================================*/
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

function injectHTMLOnceById(expectedRootId, html) {
  // Evita duplicados si ya existe el nodo raíz (ej. #productosAdminModal)
  if (expectedRootId && document.getElementById(expectedRootId)) {
    console.log(`[includes] ${expectedRootId} ya existe; no se inyecta de nuevo`);
    return;
  }
  document.body.insertAdjacentHTML('beforeend', html);
  console.log('[includes] partial inyectado en <body>');
}

/* =========================================================
 * Layout (Header/Footer)
 * =======================================================*/
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

  // Cargar modales globales (partials) al final del layout
  try {
    await loadModals();
  } catch (e) {
    // No es crítico para el layout
    console.warn('[includes] loadModals() opcional falló:', e?.message || e);
  }
}

/* =========================================================
 * Modales globales (partials)
 * - Inyecta en <body> los modales compartidos por la app.
 * - Diseñado para trabajar con admin-panel.js que espera:
 *   #productosAdminModal + #productosAdminMount dentro del modal.
 * =======================================================*/
export async function loadModals() {
  console.log('[includes] loadModals() llamado');

  // ---- Modal: Productos (admin) ----
  // Debe existir un archivo partial que defina:
  // <div id="productosAdminModal" class="modal fade"> ... <div id="productosAdminMount"></div> ... </div>
  try {
    const productosModalHTML = await fetchTextFirst([
      '/partials/productos-modal.html',
      '/negocio/partials/productos-modal.html',
    ]);
    // Evitar doble inyección si ya existe el modal (por recargas o SPA)
    injectHTMLOnceById('productosAdminModal', productosModalHTML);
    console.log('[includes] productos-modal inyectado');
  } catch (e) {
    console.warn('[includes] productos-modal no encontrado (se usará creación dinámica desde JS si aplica):', e.message);
  }

  // ---- (Opcional) Modal: Precios de atributos ----
  // Si tienes el partial del modal de precios de atributos, lo cargamos también.
  // admin-panel.js invoca openAttrPricesModal(); si ese módulo crea dinámicamente el modal,
  // este bloque es opcional y seguro.
  try {
    const attrPricesHTML = await fetchTextFirst([
      '/partials/attr-prices-modal.html',
      '/negocio/partials/attr-prices-modal.html',
    ]);
    injectHTMLOnceById('attrPricesModal', attrPricesHTML);
    console.log('[includes] attr-prices-modal inyectado');
  } catch (e) {
    // Es opcional, no todos los proyectos lo usan como partial
    console.info('[includes] attr-prices-modal no encontrado (ok si se crea dinámicamente):', e.message);
  }
}
