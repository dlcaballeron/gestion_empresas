// frontend/negocio/js/admin-panel.js

// ===== Imports =====
import { initProductosAdmin } from './modules/products.js';
import { state } from './modules/state.js';
import { openAttrPricesModal } from './modules/attr-prices.js';

// ===== Estado local =====
let NEGOCIO_ID = null;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/**
 * Inicializa el panel del administrador (offcanvas).
 * Se llama desde principal.js con el objeto "negocio" ya cargado.
 */
export async function initAdminPanel(negocio) {
  NEGOCIO_ID = negocio?.id;
  if (!NEGOCIO_ID) return;

  // ——— Título/encabezado del panel ———
  const info = $('#adminNegocioInfo');
  if (info) info.textContent = `${negocio.razon_social || 'Negocio'} · ID ${NEGOCIO_ID}`;

  // ——— Acciones rápidas ———
  ensureTopActions();

  // ——— Previews iniciales de logo y portada ———
  let logoURL  = negocio.logo || '';
  let coverURL = negocio.portada || '';

  const navbarLogo = $('#negocio-logo');
  const prevLogo   = $('#previewLogo');
  const prevCover  = $('#previewPortada');
  if (prevLogo)  prevLogo.src  = logoURL || (navbarLogo ? navbarLogo.src : '');
  if (prevCover) prevCover.src = coverURL || 'https://picsum.photos/seed/cover/1200/400';

  /* ================== LOGO ================== */
  const fileLogo      = $('#fileLogo');
  const btnSaveLogo   = $('#btnSaveLogo');
  const btnResetLogo  = $('#btnResetLogo');

  if (fileLogo) {
    fileLogo.addEventListener('change', () => {
      const f = fileLogo.files && fileLogo.files[0];
      if (!f || !prevLogo) return;
      prevLogo.src = URL.createObjectURL(f);
      if (btnSaveLogo)  btnSaveLogo.disabled  = false;
      if (btnResetLogo) btnResetLogo.disabled = false;
    });
  }
  if (btnResetLogo) {
    btnResetLogo.addEventListener('click', () => {
      if (prevLogo) prevLogo.src = logoURL || (navbarLogo ? navbarLogo.src : '');
      if (fileLogo) fileLogo.value = '';
      if (btnSaveLogo)  btnSaveLogo.disabled  = true;
      if (btnResetLogo) btnResetLogo.disabled = true;
    });
  }
  if (btnSaveLogo) {
    btnSaveLogo.addEventListener('click', async () => {
      const f = fileLogo && fileLogo.files && fileLogo.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('file', f);
      fd.append('type', 'logo');

      btnSaveLogo.disabled = true;
      const oldText = btnSaveLogo.textContent;
      btnSaveLogo.textContent = 'Guardando…';
      try {
        const r = await fetch(`/api/negocios/${NEGOCIO_ID}/media`, { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No se pudo guardar el logo');
        logoURL = data.url || logoURL;
        if (navbarLogo) navbarLogo.src = logoURL;
        if (prevLogo) prevLogo.src = logoURL;
        if (fileLogo) fileLogo.value = '';
        if (btnResetLogo) btnResetLogo.disabled = true;
      } catch (e) { alert(e.message); }
      finally {
        btnSaveLogo.disabled = false;
        btnSaveLogo.textContent = oldText;
      }
    });
  }

  /* ================== PORTADA ================== */
  const filePortada     = $('#filePortada');
  const btnSavePortada  = $('#btnSavePortada');
  const btnResetPortada = $('#btnResetPortada');

  if (filePortada) {
    filePortada.addEventListener('change', () => {
      const f = filePortada.files && filePortada.files[0];
      if (!f || !prevCover) return;
      prevCover.src = URL.createObjectURL(f);
      if (btnSavePortada)  btnSavePortada.disabled  = false;
      if (btnResetPortada) btnResetPortada.disabled = false;
    });
  }
  if (btnResetPortada) {
    btnResetPortada.addEventListener('click', () => {
      if (prevCover) prevCover.src = coverURL || 'https://picsum.photos/seed/cover/1200/400';
      if (filePortada) filePortada.value = '';
      if (btnSavePortada)  btnSavePortada.disabled  = true;
      if (btnResetPortada) btnResetPortada.disabled = true;
    });
  }
  if (btnSavePortada) {
    btnSavePortada.addEventListener('click', async () => {
      const f = filePortada && filePortada.files && filePortada.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('file', f);
      fd.append('type', 'portada');

      btnSavePortada.disabled = true;
      const old = btnSavePortada.textContent;
      btnSavePortada.textContent = 'Guardando…';
      try {
        const r = await fetch(`/api/negocios/${NEGOCIO_ID}/media`, { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No se pudo guardar la portada');
        coverURL = data.url || coverURL;
        if (prevCover) prevCover.src = coverURL;
        if (filePortada) filePortada.value = '';
        if (btnResetPortada) btnResetPortada.disabled = true;
      } catch (e) { alert(e.message); }
      finally {
        btnSavePortada.disabled = false;
        btnSavePortada.textContent = old;
      }
    });
  }

  /* ================== CATEGORÍAS ================== */
  async function cargarCategorias() {
    try {
      const r = await fetch(`/api/negocios/${NEGOCIO_ID}/categorias`);
      const cats = r.ok ? await r.json() : [];
      renderCategorias(cats);
    } catch {
      renderCategorias([]);
    }
  }

  function renderCategorias(cats) {
    const ul = $('#listaCategorias');
    if (!ul) return;
    ul.innerHTML = '';
    if (!cats || !cats.length) {
      ul.innerHTML = '<li class="list-group-item text-secondary">Sin categorías aún.</li>';
      return;
    }
    cats.forEach(c => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `
        <span class="text-capitalize">${c.nombre}</span>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar"><i class="bi bi-trash"></i></button>
      `;
      li.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Eliminar categoría "${c.nombre}"?`)) return;
        try {
          const r = await fetch(`/api/negocios/${NEGOCIO_ID}/categorias/${c.id}`, { method: 'DELETE' });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'No se pudo eliminar');
          li.remove();
        } catch (e) { alert(e.message); }
      });
      ul.appendChild(li);
    });
  }

  const formCategoria = $('#formCategoria');
  if (formCategoria) {
    formCategoria.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#catNombre');
      const nombre = input ? input.value.trim() : '';
      if (!nombre) return;
      try {
        const r = await fetch(`/api/negocios/${NEGOCIO_ID}/categorias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No se pudo crear la categoría');
        if (input) input.value = '';
        await cargarCategorias();
      } catch (e) { alert(e.message); }
    });
  }

  await cargarCategorias();

  /* ============== GALERÍA DEL MARKETPLACE ============== */
  wireGaleria();
  await listarGaleria();

  /* ============== BOTONES DEL MENÚ LATERAL ============== */
  const btnGaleria    = $('#btnModGaleria');
  const btnCategorias = $('#btnModCategorias');
  const btnProductos  = $('#btnModProductos'); // abrirá el modal

  // Secciones visibles dentro del offcanvas (galería / categorías)
  const secGaleria    = $('#modGaleriaSection');
  const secCategorias = $('#modCategoriasSection');

  function showSection(which) {
    const all = [secGaleria, secCategorias].filter(Boolean);
    all.forEach(el => (el.style.display = 'none'));

    if (which === 'galeria' && secGaleria)      secGaleria.style.display = 'block';
    if (which === 'categorias' && secCategorias) secCategorias.style.display = 'block';

    // Activar botones visualmente
    $$('.admin-mod-btn').forEach(b => b.classList.remove('active'));
    if (which === 'galeria'    && btnGaleria)    btnGaleria.classList.add('active');
    if (which === 'categorias' && btnCategorias) btnCategorias.classList.add('active');
  }

  // Listeners del menú lateral
  if (btnGaleria)    btnGaleria.addEventListener('click', () => showSection('galeria'));
  if (btnCategorias) btnCategorias.addEventListener('click', () => showSection('categorias'));
  if (btnProductos)  btnProductos.addEventListener('click', () => showProductosModal(negocio));

  // Si tu HTML marca un módulo por defecto, respétalo; si no, deja visible lo que ya estaba.
  // Puedes forzar por defecto:
  // showSection('galeria');
}

/* ------------------------- Modal de PRODUCTOS ------------------------- */

/**
 * Crea (si hace falta) y retorna el modal de Productos.
 * Monta dentro un contenedor #productosAdminMount para products.js
 */
function ensureProductosModal() {
  let modal = $('#productosAdminModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'productosAdminModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-bag me-2"></i>Productos</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0">
            <div id="productosAdminMount"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Preferir Bootstrap si está disponible; si no, proveer un fallback simple
  let bsModal = null;
  try { bsModal = window.bootstrap ? new window.bootstrap.Modal(modal, { backdrop: 'static' }) : null; }
  catch { bsModal = null; }

  return { modal, bsModal };
}

/**
 * Abre el modal y realiza la inicialización perezosa del módulo de productos.
 */
async function showProductosModal(negocio) {
  const { modal, bsModal } = ensureProductosModal();

  // Inicialización perezosa SOLO una vez
  if (!modal.dataset._init) {
    await ensureCategoriasTree(); // requiere state.categoriasTree
    const mount = $('#productosAdminMount', modal);
    if (mount && !$('#adminProductos', mount)) {
      await initProductosAdmin(negocio, { mountSelector: '#productosAdminMount' });
    }
    modal.dataset._init = '1';
  }

  if (bsModal) {
    bsModal.show();
  } else {
    // Fallback si no está Bootstrap JS
    modal.classList.add('show', 'd-block');
    modal.removeAttribute('aria-hidden');
    // Cerrar con botón (data-bs-dismiss) en fallback
    const closeBtn = modal.querySelector('[data-bs-dismiss="modal"]');
    if (closeBtn && !closeBtn._fallbackBound) {
      closeBtn._fallbackBound = true;
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('show', 'd-block');
        modal.setAttribute('aria-hidden', 'true');
      });
    }
  }
}

/* -------------- Carga de categorías para products.js -------------- */

async function ensureCategoriasTree() {
  if (Array.isArray(state.categoriasTree) && state.categoriasTree.length) return;
  try {
    const r = await fetch(`/api/negocios/${NEGOCIO_ID}/categorias/tree`);
    const j = r.ok ? await r.json() : [];
    if (Array.isArray(j)) state.categoriasTree = j;
  } catch {
    state.categoriasTree = Array.isArray(state.categoriasTree) ? state.categoriasTree : [];
  }
}

/* ----------------- GALERÍA: UI y llamadas ----------------- */

// Crea la tarjeta (card) para una imagen
function cardImagen(it) {
  const thumb = safeCloudinaryThumb(it.url, 400, 300);
  const badgeCls = it.estado ? 'text-bg-success' : 'text-bg-secondary';
  const badgeTxt = it.estado ? 'Activo' : 'Inactivo';

  return `
    <div class="col">
      <div class="card border-0 shadow-sm h-100">
        <img src="${thumb}" class="card-img-top" alt="${it.alt_text || ''}" style="height:140px;object-fit:cover">
        <div class="card-body p-2 d-flex justify-content-between align-items-center">
          <span class="badge ${badgeCls} mb-0">${badgeTxt}</span>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" title="Activar/Inactivar" data-toggle="${it.id}" data-estado="${it.estado}">
              <i class="bi bi-power"></i>
            </button>
            <button class="btn btn-outline-danger" title="Eliminar" data-del="${it.id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Enlaza los eventos de la sección de galería (subir)
function wireGaleria() {
  const input = $('#filesGaleria');
  const btn   = $('#btnSubirGaleria');
  if (!input || !btn || !NEGOCIO_ID) return;

  btn.addEventListener('click', async () => {
    if (!input.files || !input.files.length) {
      alert('Selecciona una o varias imágenes');
      return;
    }

    const fd = new FormData();
    for (const f of input.files) fd.append('files', f);

    btn.disabled = true;
    const txt = btn.textContent;
    btn.textContent = 'Subiendo…';

    try {
      const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo subir');
      input.value = '';
      await listarGaleria();
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });
}

// Lista y pinta la galería desde la API; crea eventos para activar/eliminar
async function listarGaleria() {
  const wrap = $('#gridGaleria');
  if (!wrap || !NEGOCIO_ID) return;

  wrap.innerHTML = `
    <div class="col-12 text-center text-secondary py-3">
      Cargando imágenes…
    </div>
  `;

  try {
    const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes`);
    const items = r.ok ? await r.json() : [];

    if (!items.length) {
      wrap.innerHTML = `
        <div class="col-12 text-center text-secondary py-3">
          Aún no hay imágenes.
        </div>
      `;
      return;
    }

    wrap.innerHTML = items.map(cardImagen).join('');

    // Activar/Inactivar
    $$('#gridGaleria [data-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idImg  = btn.getAttribute('data-toggle');
        const activo = btn.getAttribute('data-estado') === '1';
        try {
          const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes/${idImg}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: activo ? 0 : 1 })
          });
          if (!r.ok) throw new Error('No fue posible cambiar el estado');
          await listarGaleria();
        } catch (e) { alert(e.message); }
      });
    });

    // Eliminar
    $$('#gridGaleria [data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idImg = btn.getAttribute('data-del');
        if (!confirm('¿Eliminar imagen definitivamente?')) return;
        try {
          const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes/${idImg}`, { method: 'DELETE' });
          if (!r.ok) throw new Error('No fue posible eliminar');
          await listarGaleria();
        } catch (e) { alert(e.message); }
      });
    });

  } catch (e) {
    wrap.innerHTML = `
      <div class="col-12 text-center text-danger py-3">
        Error cargando la galería
      </div>
    `;
  }
}

/* ------------------------- Quick actions ------------------------- */
function ensureTopActions() {
  const body = $('#adminPanel .offcanvas-body');
  if (!body) return;

  let wrap = $('#adminQuickActions', body);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'adminQuickActions';
    wrap.className = 'mb-3';
    body.insertBefore(wrap, body.firstChild);
  }

  // Botón: Precios de atributos
  if (!$('#btnAttrPrices', wrap)) {
    const btn = document.createElement('button');
    btn.id = 'btnAttrPrices';
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-secondary w-100 text-start';
    btn.innerHTML = `<i class="bi bi-cash-coin me-1"></i> Precios de atributos`;
    wrap.appendChild(btn);
    btn.addEventListener('click', () => openAttrPricesModal({ negocioId: NEGOCIO_ID }));
  }

  // (Opcional) Acceso rápido a Productos desde el panel
  if (!$('#btnQuickProductos', wrap)) {
    const btnP = document.createElement('button');
    btnP.id = 'btnQuickProductos';
    btnP.type = 'button';
    btnP.className = 'btn btn-sm btn-outline-primary w-100 text-start mt-2';
    btnP.innerHTML = `<i class="bi bi-bag me-1"></i> Gestionar productos`;
    wrap.appendChild(btnP);
    btnP.addEventListener('click', () => showProductosModal({ id: NEGOCIO_ID, ...state.negocio, ...{} }));
  }
}

/* ------------------------- Utils ------------------------- */
function safeCloudinaryThumb(url, w = 400, h = 300) {
  try {
    if (!url) return `https://via.placeholder.com/${w}x${h}?text=%E2%80%94`;
    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
      return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w},h_${h},c_fill/`);
    }
    return url;
  } catch {
    return url;
  }
}
