// frontend/negocio/js/modules/products.js
// CRUD de productos basados en imagen + recargos por ítems (categorías rol='atributo')

import { state } from './state.js';
import { loadProductosActivos } from './api.js';

let NEGOCIO_ID = null;
let ON_CHANGE  = null;
let PRODUCTS   = [];     // cache listado
let IMAGENES   = [];     // cache para el selector de imágenes

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ================================
 * PÚBLICO: inicializar la sección
 * ================================ */
export async function initProductosAdmin(negocio, opts = {}) {
  NEGOCIO_ID = Number(negocio?.id || 0);
  if (!NEGOCIO_ID) return;

  const mountSelector = opts.mountSelector || '#adminPanel .offcanvas-body';
  ON_CHANGE = typeof opts.onChange === 'function' ? opts.onChange : null;

  const mount = $(mountSelector);
  if (!mount) return;

  let sec = $('#adminProductos', mount);
  if (!sec) {
    sec = document.createElement('section');
    sec.id = 'adminProductos';
    sec.className = 'mt-4';
    sec.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">Productos</h6>
        <div class="d-flex gap-2 align-items-center">
          <input id="prdSearch" class="form-control form-control-sm" type="search" placeholder="Buscar…">
          <button id="btnAddProducto" class="btn btn-sm btn-success">
            <i class="bi bi-plus-lg me-1"></i>Nuevo
          </button>
        </div>
      </div>
      <div id="productosTableWrap" class="table-responsive small">
        <div class="text-secondary py-2">Cargando…</div>
      </div>
    `;
    mount.appendChild(sec);
  }

  $('#btnAddProducto', sec)?.addEventListener('click', () => openForm());
  $('#prdSearch', sec)?.addEventListener('input', (e) => {
    const q = String(e.target.value || '').toLowerCase();
    const filtered = !q
      ? PRODUCTS
      : PRODUCTS.filter(p =>
          (p.nombre || '').toLowerCase().includes(q) ||
          (p.descripcion || '').toLowerCase().includes(q) ||
          (p.imagen_titulo || '').toLowerCase().includes(q)
        );
    renderTable(filtered);
  });

  await reloadProductos();
}

/* =========================
 * Carga & render del grid
 * ========================= */
async function reloadProductos() {
  const wrap = $('#productosTableWrap');
  if (wrap) wrap.innerHTML = `<div class="text-secondary py-2">Cargando…</div>`;

  try {
    const res = await fetch(`/api/negocios/${NEGOCIO_ID}/productos`);
    if (!res.ok) throw new Error('No se pudo obtener productos');
    const data = await res.json();
    PRODUCTS = Array.isArray(data) ? data : [];
    renderTable(PRODUCTS);
  } catch (e) {
    if (wrap) {
      wrap.innerHTML = `
        <div class="alert alert-light border text-danger my-2">
          ${escapeHTML(e.message || 'Error cargando productos')}
        </div>`;
    }
  }
}

function renderTable(items) {
  const wrap = $('#productosTableWrap');
  if (!wrap) return;

  if (!items || !items.length) {
    wrap.innerHTML = `<div class="alert alert-light border my-2">Aún no hay productos.</div>`;
    return;
  }

  const rows = items.map(p => {
    const img = p.imagen_url || '';
    const imgThumb = thumb80x60(img);
    const precio = Number(p.base_precio ?? 0);
    const estado = Number(p.estado ?? 1);
    const badge = estado ? 'success' : 'secondary';
    const badgeTxt = estado ? 'Activo' : 'Inactivo';

    return `
      <tr data-id="${p.id}">
        <td style="width:88px">
          <img src="${imgThumb}" alt="" class="rounded" style="width:80px;height:60px;object-fit:cover;">
        </td>
        <td>
          <div class="fw-semibold">${escapeHTML(p.nombre || p.imagen_titulo || '(Sin nombre)')}</div>
          <div class="text-secondary small text-truncate" style="max-width:360px">
            ${escapeHTML(p.descripcion || '')}
          </div>
          <div class="small text-secondary mt-1">Imagen ID: ${p.imagen_id}</div>
        </td>
        <td class="text-nowrap">$ ${precio.toFixed(2)}</td>
        <td><span class="badge text-bg-${badge}">${badgeTxt}</span></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-edit="${p.id}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-secondary" data-toggle="${p.id}" data-estado="${estado}">
              <i class="bi bi-power"></i>
            </button>
            <button class="btn btn-outline-danger" data-del="${p.id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="table align-middle table-hover">
      <thead class="table-light">
        <tr>
          <th>Imagen</th>
          <th>Producto (Imagen)</th>
          <th>Precio base</th>
          <th>Estado</th>
          <th class="text-end">Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Bind acciones
  $$('#productosTableWrap [data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-edit'));
      const p = PRODUCTS.find(x => Number(x.id) === id);
      openForm(p);
    });
  });
  $$('#productosTableWrap [data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-del'));
      if (!confirm('¿Eliminar este producto?')) return;
      await deleteProducto(id);
    });
  });
  $$('#productosTableWrap [data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-toggle'));
      const est = Number(btn.getAttribute('data-estado')) === 1 ? 0 : 1;
      await toggleEstado(id, est);
    });
  });
}

/* ================
 * Form modal CRUD
 * ================ */
function ensureFormModal() {
  let modal = $('#productoFormModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.id = 'productoFormModal';
  modal.tabIndex = -1;
  modal.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <form id="productoForm">
          <div class="modal-header">
            <h5 class="modal-title" id="productoFormTitle">Nuevo producto</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="prdId">

            <div class="row g-3">
              <div class="col-7">
                <label class="form-label">Imagen (ID)</label>
                <div class="input-group">
                  <input type="number" class="form-control" id="prdImagenId" min="1" placeholder="ID de imagen" required>
                  <button class="btn btn-outline-secondary" type="button" id="btnPickImagen">
                    <i class="bi bi-images me-1"></i> Elegir
                  </button>
                </div>
                <div class="form-text">Selecciona una imagen del negocio para este producto.</div>
              </div>
              <div class="col-5">
                <img id="prdImgPreview" class="rounded border" style="width:100%;max-height:160px;object-fit:cover;display:none">
              </div>

              <div class="col-12">
                <label class="form-label">Nombre (opcional)</label>
                <input type="text" class="form-control" id="prdNombre" maxlength="120">
              </div>

              <div class="col-12">
                <label class="form-label">Descripción (opcional)</label>
                <textarea class="form-control" id="prdDesc" rows="2" maxlength="400"></textarea>
              </div>

              <div class="col-6">
                <label class="form-label">Precio base</label>
                <input type="number" class="form-control" id="prdPrecio" min="0" step="0.01" required>
              </div>

              <div class="col-6">
                <div class="form-check mt-4">
                  <input class="form-check-input" type="checkbox" id="prdActivo" checked>
                  <label class="form-check-label" for="prdActivo">Activo</label>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <h6 class="mb-2">Atributos y recargos</h6>
              <div class="small text-secondary mb-2">
                Solo se listan categorías <strong>rol="atributo"</strong> activas. Deja vacío para no aplicar recargo.
              </div>
              <div id="precioAtributosWrap" class="border rounded p-2" style="max-height:280px;overflow:auto">
                <!-- render dinámico -->
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btnSavePrd">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Picker de imágenes
  $('#btnPickImagen', modal).addEventListener('click', async () => {
    await openImagenPicker();
  });

  // Preview al escribir ID
  $('#prdImagenId', modal).addEventListener('change', async () => {
    const id = Number($('#prdImagenId').value || 0);
    await setPreviewFromImagenId(id);
  });

  return modal;
}

function fillForm(product) {
  $('#productoFormTitle').textContent = product?.id ? 'Editar producto' : 'Nuevo producto';
  $('#prdId').value       = product?.id ?? '';
  $('#prdImagenId').value = product?.imagen_id ?? '';
  $('#prdNombre').value   = product?.nombre ?? '';
  $('#prdDesc').value     = product?.descripcion ?? '';
  $('#prdPrecio').value   = Number(product?.base_precio ?? 0).toString();
  $('#prdActivo').checked = Number(product?.estado ?? 1) === 1;

  const imgPrev = $('#prdImgPreview');
  const url = product?.imagen_url || null;
  if (url) { imgPrev.src = url; imgPrev.style.display = 'block'; }
  else { imgPrev.style.display = 'none'; }
}

function readForm() {
  const id        = Number($('#prdId').value || 0) || null;
  const imagen_id = Number($('#prdImagenId').value || 0);
  const body = {
    imagen_id,
    nombre: String($('#prdNombre').value || '').trim() || null,
    descripcion: String($('#prdDesc').value || '').trim() || null,
    base_precio: parseFloat($('#prdPrecio').value || '0') || 0,
    estado: $('#prdActivo').checked ? 1 : 0,
  };
  return { id, body };
}

function openForm(product = null) {
  const modalEl = ensureFormModal();
  fillForm(product);

  // Render editor de atributos+precios
  buildAttrPriceEditor(product?.id || null).catch(() => {
    $('#precioAtributosWrap').innerHTML = `<div class="text-danger small">No se pudieron cargar los atributos.</div>`;
  });

  const form = $('#productoForm', modalEl);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { id, body } = readForm();

    if (!Number(body.imagen_id)) {
      alert('Debes seleccionar una imagen válida.');
      return;
    }

    const opciones = collectAttrPrices(); // [{categoria_id,item_id,precio}]

    try {
      $('#btnSavePrd').disabled = true;

      // 1) crear/actualizar producto
      let url   = `/api/negocios/${NEGOCIO_ID}/productos`;
      let method= 'POST';
      if (id) { url += `/${id}`; method = 'PUT'; }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el producto');

      const prdId = id || Number(data.id);

      // 2) upsert de recargos por ítem
      const r2 = await fetch(`/api/negocios/${NEGOCIO_ID}/productos/${prdId}/opciones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opciones }),
      });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j.error || 'No se pudieron guardar las opciones');

      // refrescos
      await reloadProductos();
      await refreshMarketplace();

      const BS = window.bootstrap; new BS.Modal(modalEl).hide();
    } catch (err) {
      alert(err.message || 'Error guardando');
    } finally {
      $('#btnSavePrd').disabled = false;
    }
  };

  const BS = window.bootstrap;
  new BS.Modal(modalEl).show();
}

/* ===================================================
 * Editor de Atributos+Precios (categorías con ítems)
 * =================================================== */
async function buildAttrPriceEditor(productId = null) {
  const wrap = $('#precioAtributosWrap'); if (!wrap) return;

  // 1) árbol desde state (precargado en principal.js)
  const tree = Array.isArray(state.categoriasTree) ? state.categoriasTree : [];

  // 2) si estoy editando, traigo opciones previas
  const existing = productId ? await fetchProductoOpciones(productId) : [];
  const priceMap = new Map(existing.map(o => [`${o.categoria_id}:${o.item_id}`, Number(o.precio || 0)]));

  // 3) pinto (solo rol atributo y activos)
  const grupos = tree
    .filter(c => String(c.rol) === 'atributo' && Number(c.estado) === 1)
    .map(c => {
      const items = (c.items || []).filter(it => Number(it.estado) === 1);
      const lis = items.map(it => {
        const key = `${c.id}:${it.id}`;
        const val = priceMap.has(key) ? priceMap.get(key) : '';
        return `
          <div class="d-flex align-items-center mb-1">
            <div class="me-2" style="min-width:140px">${escapeHTML(it.label || it.nombre || '')}</div>
            <div class="input-group input-group-sm" style="max-width:160px">
              <span class="input-group-text">$</span>
              <input type="number" class="form-control attr-price" step="0.01" min="0"
                     data-cat="${c.id}" data-item="${it.id}" placeholder="0.00"
                     value="${val === '' ? '' : String(val)}">
            </div>
          </div>`;
      }).join('') || `<div class="text-secondary small">— sin ítems —</div>`;

      return `
        <div class="mb-2">
          <div class="fw-semibold mb-1">${escapeHTML(c.nombre)}</div>
          ${lis}
        </div>`;
    }).join('');

  wrap.innerHTML = grupos || `<div class="text-secondary small">No hay categorías de atributos activas.</div>`;
}

function collectAttrPrices() {
  const inputs = $$('.attr-price');
  const out = [];
  for (const inp of inputs) {
    const raw = String(inp.value || '').trim();
    if (raw === '') continue; // vacío → no guardar
    const v = parseFloat(raw);
    if (Number.isFinite(v) && v >= 0) {
      out.push({
        categoria_id: Number(inp.dataset.cat),
        item_id: Number(inp.dataset.item),
        precio: v,
      });
    }
  }
  return out;
}

/* ======================
 * Selector de imágenes
 * ====================== */
async function openImagenPicker() {
  const picker = ensureImagenPicker();
  await loadImagenesIfNeeded();

  // Render listado
  const list = $('#imgPickerList', picker);
  const qInput = $('#imgPickerSearch', picker);

  function render(q = '') {
    const term = q.trim().toLowerCase();
    const data = !term ? IMAGENES : IMAGENES.filter(x =>
      String(x.titulo || '').toLowerCase().includes(term) ||
      String(x.id).includes(term)
    );
    list.innerHTML = data.map(img => `
      <div class="col-6 col-md-4 mb-2">
        <div class="card h-100 shadow-sm img-pick" data-id="${img.id}" role="button">
          <img src="${thumb160(img.url)}" class="card-img-top" alt="">
          <div class="card-body p-2">
            <div class="small fw-semibold text-truncate">${escapeHTML(img.titulo || '(Sin título)')}</div>
            <div class="small text-secondary">ID: ${img.id}</div>
          </div>
        </div>
      </div>
    `).join('') || `<div class="text-secondary small">Sin imágenes.</div>`;

    $$('.img-pick', list).forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.getAttribute('data-id'));
        $('#prdImagenId').value = id;
        setPreviewFromImagenId(id).finally(() => {
          const BS = window.bootstrap; new BS.Modal(picker).hide();
        });
      });
    });
  }

  qInput.oninput = () => render(qInput.value || '');
  render();

  const BS = window.bootstrap;
  new BS.Modal(picker).show();
}

function ensureImagenPicker() {
  let el = $('#imagenPickerModal');
  if (el) return el;

  el = document.createElement('div');
  el.className = 'modal fade';
  el.id = 'imagenPickerModal';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Seleccionar imagen</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <input id="imgPickerSearch" class="form-control form-control-sm mb-3" placeholder="Buscar por título o ID…">
          <div id="imgPickerList" class="row"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

async function loadImagenesIfNeeded() {
  if (IMAGENES.length) return;
  try {
    // Usa tu endpoint real de imágenes. Si no tienes filtros, quita params.
    const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes`);
    if (!r.ok) throw new Error();
    const j = await r.json().catch(() => []);
    IMAGENES = Array.isArray(j) ? j : [];
  } catch {
    IMAGENES = [];
  }
}

async function setPreviewFromImagenId(imagenId) {
  const imgPrev = $('#prdImgPreview');
  if (!imagenId) { imgPrev.style.display = 'none'; return; }

  // Busca en cache
  let info = IMAGENES.find(i => Number(i.id) === Number(imagenId));
  if (!info) {
    // intenta endpoint de detalle si existe
    try {
      const r = await fetch(`/api/negocios/${NEGOCIO_ID}/imagenes/${imagenId}`);
      if (r.ok) info = await r.json();
    } catch {}
  }

  if (info?.url) { imgPrev.src = info.url; imgPrev.style.display = 'block'; }
  else { imgPrev.style.display = 'none'; }
}

/* ======================
 * Acciones del listado
 * ====================== */
async function deleteProducto(id) {
  try {
    const res = await fetch(`/api/negocios/${NEGOCIO_ID}/productos/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
    await reloadProductos();
    await refreshMarketplace();
  } catch (e) {
    alert(e.message || 'Error eliminando');
  }
}

async function toggleEstado(id, estado) {
  try {
    const res = await fetch(`/api/negocios/${NEGOCIO_ID}/productos/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (!res.ok) {
      const res2 = await fetch(`/api/negocios/${NEGOCIO_ID}/productos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (!res2.ok) throw new Error('No se pudo cambiar el estado');
    }
    await reloadProductos();
    await refreshMarketplace();
  } catch (e) {
    alert(e.message || 'Error cambiando estado');
  }
}

/* =====================
 * Auxiliares y refresh
 * ===================== */
async function refreshMarketplace() {
  try {
    await loadProductosActivos({
      q: state.filtro.q || '',
      categoriaId: state.filtro.filtroCategoriaId ?? null,
      page: 1,
      size: 200,
    });
    state.pag.page = 1;
    if (ON_CHANGE) await ON_CHANGE();
  } catch {}
}

async function fetchProductoOpciones(productId) {
  const r = await fetch(`/api/negocios/${NEGOCIO_ID}/productos/${productId}/opciones`);
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

/* =============
 * Utils
 * ============= */
function escapeHTML(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function thumb80x60(url) {
  if (!url) return 'https://via.placeholder.com/80x60?text=%E2%80%94';
  try {
    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
      return url.replace('/upload/', '/upload/f_auto,q_auto,w_80,h_60,c_fill/');
    }
    return url;
  } catch { return url; }
}

function thumb160(url) {
  if (!url) return 'https://via.placeholder.com/320x200?text=%E2%80%94';
  try {
    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
      return url.replace('/upload/', '/upload/f_auto,q_auto,w_320,h_200,c_fill/');
    }
    return url;
  } catch { return url; }
}
