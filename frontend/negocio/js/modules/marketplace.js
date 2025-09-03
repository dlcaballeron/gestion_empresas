// frontend/negocio/js/modules/marketplace.js
import { state } from './state.js';
import { $, $$, cldFill, warnToast } from './utils.js';
import {
  loadFiltroCategorias,
  preloadCategoriasTree,
  loadGaleriaActiva,
  loadProductosActivos, // debe llamar /api/negocios/:id/marketplace y devolver {items,total,page,size}
} from './api.js';
import { openAddToCartModal } from './cart.js';

/* =========================================================
 * Helpers para precio condicional (según selección)
 * ========================================================= */

const getAttrCats = (prod) =>
  (prod?.categorias || []).filter(
    (c) => String(c?.rol || '').toLowerCase() === 'atributo'
  );

// Devuelve true si el producto tiene TODAS sus categorías de atributo con un item elegido.
function isSelectionComplete(prodId, prod) {
  const cats = getAttrCats(prod) || [];
  if (cats.length === 0) return true; // sin atributos → considerar completo (muestra base)
  const sel = state.preselect.get(prodId) || new Map();
  for (const c of cats) {
    if (!sel.has(Number(c.id))) return false;
  }
  return true;
}

// Calcula el total = base + suma de recargos de items seleccionados.
// Si la selección no está completa, devuelve null (para pintar “Selecciona atributos”).
function computeSelectedTotal(prodId, prod) {
  if (!isSelectionComplete(prodId, prod)) return null;

  // Fuente del base: siempre prioriza base_precio del backend
  const base = Number(
    prod.base_precio ?? prod.base ?? prod.precio ?? 0
  );

  const sel  = state.preselect.get(prodId) || new Map();
  const cats = getAttrCats(prod) || [];

  let total = base;
  for (const c of cats) {
    const chosen = sel.get(Number(c.id));
    if (!chosen) continue;
    const itemId = Number(chosen.itemId ?? chosen.id ?? chosen);
    const it = (c.items || []).find(x => Number(x.id) === itemId);
    if (it) total += Number(it.recargo || 0);
  }
  return total;
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(Math.round(Number(n || 0)));
}

// Pinta el precio condicional dentro de la tarjeta y habilita/deshabilita “Añadir”.
function renderCardPrice(cardEl, prod) {
  const priceEl = cardEl.querySelector('.js-price');
  if (!priceEl) return;

  const total = computeSelectedTotal(prod.id, prod);
  if (total == null) {
    priceEl.innerHTML = `<span class="text-secondary">Selecciona atributos</span>`;
  } else {
    priceEl.textContent = fmtCOP(total);
  }

  const addBtn = cardEl.querySelector('[data-add]');
  if (addBtn) addBtn.disabled = (total == null) || !prod.stock;
}

/* =========================================================
 * Normalización (del feed de /marketplace → state.productos)
 * ========================================================= */
function normalizeFromMarketItems(items = []) {
  // Backend item: { id, nombre, descripcion, base_precio, precio_card, imagen_url, imagen_id, filtros[], atributos[] }
  // UI espera: p = {
  //   id, nombre, descripcion, imagen,
  //   base_precio (precio base – fuente para la suma),
  //   precio (compat),
  //   categorias: [ {id,nombre,rol='filtro'}, {id,nombre,rol='atributo', items:[{id,label,recargo}]} ]
  // }
  return items.map((it) => {
    // 1) filtros (chips grises)
    const filtroCats = (it.filtros || []).map(f => ({
      id: Number(f.id),
      nombre: f.nombre,
      rol: 'filtro',
    }));

    // 2) atributos agrupados por categoría
    const grouped = new Map(); // catId -> { id, nombre, rol:'atributo', items:[] }
    (it.atributos || []).forEach(a => {
      const catId   = Number(a?.categoria?.id);
      const catNm   = String(a?.categoria?.nombre || '');
      const itemId  = Number(a?.item?.id);
      const label   = String(a?.item?.label ?? a?.item?.nombre ?? itemId);
      const recargo = Number(a?.recargo || 0);
      if (!catId || !itemId) return;
      if (!grouped.has(catId)) {
        grouped.set(catId, { id: catId, nombre: catNm, rol: 'atributo', items: [] });
      }
      grouped.get(catId).items.push({ id: itemId, label, recargo });
    });
    const attrCats = Array.from(grouped.values());

    // base y compat
    const base_precio = Number(it.base_precio ?? 0);

    return {
      id: Number(it.id),
      nombre: it.nombre || (it.imagen_titulo || 'Producto'),
      descripcion: it.descripcion || '',
      imagen: it.imagen_url || '',
      base_precio,            // <- usamos esto para sumar con recargos
      precio: base_precio,    // compat: algunos flujos esperan p.precio
      rating: Number(it.rating || 0),
      stock: it.stock ?? 1,
      categorias: [...filtroCats, ...attrCats],
    };
  });
}

/* =========================================================
 * Píldoras de categorías (rol=filtro)
 * ========================================================= */
export function buildCategoryPills() {
  const host  = $('#categoryPills');
  const hostM = $('#categoryPillsMobile');
  if (!host || !hostM) return;

  const mk = (label, catId = null) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-outline-secondary pill category-pill';
    if (catId != null) b.dataset.catId = String(catId);
    b.textContent = label;
    b.addEventListener('click', () => {
      // limpiar selección visual
      $$('#categoryPills .category-pill').forEach((x) => x.classList.remove('active'));
      $$('#categoryPillsMobile .category-pill').forEach((x) => x.classList.remove('active'));

      const selAll = (catId == null);
      state.filtro.filtroCategoriaId = selAll ? null : Number(catId);

      // marcar selección actual en ambos contenedores
      [...host.querySelectorAll('.category-pill')].forEach(btn => {
        const bid = btn.dataset.catId ? Number(btn.dataset.catId) : null;
        if (bid === state.filtro.filtroCategoriaId) btn.classList.add('active');
        if (selAll && !btn.dataset.catId) btn.classList.add('active');
      });
      [...hostM.querySelectorAll('.category-pill')].forEach(btn => {
        const bid = btn.dataset.catId ? Number(btn.dataset.catId) : null;
        if (bid === state.filtro.filtroCategoriaId) btn.classList.add('active');
        if (selAll && !btn.dataset.catId) btn.classList.add('active');
      });

      state.pag.page = 1;
      applyFilters();
    });
    return b;
  };

  // "Todo"
  host.innerHTML = ''; host.appendChild(mk('Todo', null));
  hostM.innerHTML = ''; hostM.appendChild(mk('Todo', null));

  // Píldoras por cada categoría de filtro
  (state.filtroCategorias || []).forEach(c => {
    host.appendChild(mk(c.nombre, c.id));
    hostM.appendChild(mk(c.nombre, c.id));
  });

  // Marcar "Todo" por defecto
  host.querySelector('.category-pill')?.classList.add('active');
  hostM.querySelector('.category-pill')?.classList.add('active');
}

/* =========================================================
 * Filtros + orden + paginación → renderGrid
 * ========================================================= */
export function applyFilters() {
  const f = state.filtro;
  const q = (f.q || '').toLowerCase();

  let items = (state.productos || []).filter((p) => {
    const byFiltroCat =
      f.filtroCategoriaId == null
        ? true
        : (p.categorias || []).some(cat =>
            String(cat?.rol || '').toLowerCase() === 'filtro' &&
            Number(cat.id) === Number(f.filtroCategoriaId)
          );

    const hayTexto = (p.nombre || '') + ' ' + (p.descripcion || '');
    const byQ    = !q || hayTexto.toLowerCase().includes(q);

    // Para filtros min/max seguimos usando el base como referencia.
    const base  = Number(p.base_precio ?? p.base ?? p.precio ?? 0);
    const byMin = f.minPrice == null || base >= f.minPrice;
    const byMax = f.maxPrice == null || base <= f.maxPrice;

    const byStk  = !f.inStock || !!p.stock;
    const byRate = (Number(p.rating || 0) >= (Number(f.minRating || 0)));

    return byFiltroCat && byQ && byMin && byMax && byStk && byRate;
  });

  // Orden
  const priceForSort = (x) => Number(x.base_precio ?? x.base ?? x.precio ?? 0);
  items.sort((a, b) => {
    switch (f.sortBy) {
      case 'price_asc':   return priceForSort(a) - priceForSort(b);
      case 'price_desc':  return priceForSort(b) - priceForSort(a);
      case 'rating_desc': return (Number(b.rating || 0)) - (Number(a.rating || 0));
      case 'newest':      return Number(b.id) - Number(a.id);
      default:            return 0;
    }
  });

  const totalEl = document.getElementById('totalFound');
  if (totalEl) totalEl.textContent = String(items.length);

  const end = (state.pag.size || 12) * (state.pag.page || 1);
  renderGrid(items.slice(0, end));

  const lm = document.getElementById('btnLoadMore');
  if (lm) lm.classList.toggle('d-none', end >= items.length);
}

/* =========================================================
 * Render de grilla
 * ========================================================= */
export function renderGrid(items) {
  const grid = $('#grid');
  if (!grid) return;

  // asegurar preselect como Map
  if (!(state.preselect instanceof Map)) {
    state.preselect = new Map();
  }

  if (!items.length) {
    grid.classList.add('row', 'g-3');
    grid.innerHTML = `
      <div class="col-12">
        <div class="alert alert-light border">No hay resultados con los filtros seleccionados.</div>
      </div>`;
    return;
  }

  const ratingStars = (r) => {
    const n = Math.max(0, Math.min(5, Math.round(Number(r || 0))));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  grid.classList.add('row','g-3');
  grid.innerHTML = items.map((p) => {
    const imgUrl = cldFill ? cldFill(p.imagen, { ar: '4:5', w: 800 }) : (p.imagen || '');

    // Chips visibles: SOLO rol=filtro
    const filtroBadges = (p.categorias || [])
      .filter(c => c && String(c.rol).toLowerCase() === 'filtro')
      .map(c => `<span class="badge rounded-pill text-bg-primary">${c.nombre}</span>`)
      .join(' ');

    // Píldoras de atributos clicables (rol=atributo)
    const preSel = state.preselect.get(p.id) || new Map();
    const attrPillsHTML = getAttrCats(p).map(cat => {
      const selectedItemId = preSel.get(Number(cat.id))?.itemId;
      const pills = (cat.items || []).map(it => {
        const active = Number(selectedItemId) === Number(it.id);
        const cls = active ? 'btn-primary' : 'btn-outline-secondary';
        const label = it.label ?? it.nombre ?? String(it.id);
        return `
          <button class="btn btn-sm ${cls} me-1 mb-1 attr-pill"
                  data-pid="${p.id}" data-cat="${cat.id}" data-catname="${cat.nombre}"
                  data-item="${it.id}" data-itemlabel="${label}">
            ${label}
          </button>`;
      }).join('');
      return `
        <div class="mb-1 attr-group small" data-pid="${p.id}" data-cat="${cat.id}">
          <div class="fw-semibold mb-1">${cat.nombre}</div>
          <div class="attr-pills-line">${pills}</div>
        </div>`;
    }).join('');

    // Precio: placeholder (se calcula/actualiza en runtime)
    const pricePlaceholder = `<div class="fw-semibold small js-price"></div>`;

    // Botón añadir (arranca deshabilitado; se habilita cuando selección completa)
    const addDisabled = isSelectionComplete(p.id, p) ? '' : 'disabled';

    return `
      <div class="col-6 col-md-4 col-lg-3 col-xxl-2">
        <div class="card product-card h-100" data-card="${p.id}">
          <div class="thumb"><img src="${imgUrl}" alt="${p.nombre || 'Producto'}" loading="lazy"></div>
          <div class="card-body">
            <h6 class="card-title mb-1">${p.nombre || 'Producto'}</h6>
            <div class="d-flex align-items-center gap-2 mb-1 meta">
              <div class="rating text-warning">${ratingStars(p.rating)}</div>
              ${filtroBadges}
            </div>
            ${attrPillsHTML ? `<div class="mb-1">${attrPillsHTML}</div>` : ''}
            <div class="d-flex justify-content-between align-items-center">
              ${pricePlaceholder}
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" data-detalle="${p.id}">Ver</button>
                <button class="btn btn-sm btn-primary" data-add="${p.id}" ${addDisabled}>Añadir</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Pintar el precio condicional inicial y habilitar/deshabilitar "Añadir"
  $$('#grid .product-card').forEach(card => {
    const pid = Number(card.getAttribute('data-card'));
    const p = (state.productos || []).find(x => x.id === pid);
    if (p) renderCardPrice(card, p);
  });

  // Acción: Detalle (modal simple)
  $$('#grid [data-detalle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = (state.productos || []).find(x => x.id === Number(btn.dataset.detalle));
      if (p) openModal(p);
    });
  });

  // Acción: Selección de píldoras de atributos (recalcula precio)
  $$('#grid .attr-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid       = Number(btn.dataset.pid);
      const catId     = Number(btn.dataset.cat);
      const catNombre = String(btn.dataset.catname || '');
      const itemId    = Number(btn.dataset.item);
      const itemLabel = String(btn.dataset.itemlabel || '');
      const selMap    = state.preselect.get(pid) || new Map();

      const isActive = btn.classList.contains('btn-primary');
      if (isActive) {
        selMap.delete(catId);
        state.preselect.set(pid, selMap);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-secondary');
      } else {
        // Dejar uno solo activo por categoría
        $(`#grid .attr-group[data-pid="${pid}"][data-cat="${catId}"]`)
          ?.querySelectorAll('.attr-pill')
          .forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-outline-secondary'); });

        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-primary');

        selMap.set(catId, { itemId, itemLabel, catNombre });
        state.preselect.set(pid, selMap);
      }

      // Recalcular precio y habilitar botón en la tarjeta correspondiente
      const card = btn.closest('.product-card');
      const p = (state.productos || []).find(x => x.id === pid);
      if (card && p) renderCardPrice(card, p);
    });
  });

  // Acción: Añadir (valida selección completa)
  $$('#grid [data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = Number(btn.dataset.add);
      const p = (state.productos || []).find(x => x.id === pid);
      if (!p) return;

      const attrCats = getAttrCats(p);
      const preSel   = state.preselect.get(pid) || new Map();
      const missing  = attrCats.filter(c => !preSel.has(c.id));

      if (attrCats.length > 0 && missing.length > 0) {
        // Resalta grupos faltantes y lanza aviso
        missing.forEach(c => {
          const group = $(`#grid .attr-group[data-pid="${pid}"][data-cat="${c.id}"]`);
          if (group) {
            const old = group.style.boxShadow;
            group.style.boxShadow = '0 0 0 2px #dc3545 inset';
            setTimeout(() => { group.style.boxShadow = old || ''; }, 1400);
          }
        });
        warnToast(`Selecciona: ${missing.map(c => c.nombre).join(', ')} para continuar.`);
        return;
      }

      // Abre modal de "Añadir al carrito" con las preselecciones
      openAddToCartModal(p, preSel);
    });
  });
}

/* =========================================================
 * Modal "Ver"
 * ========================================================= */
export function openModal(p) {
  const img   = document.getElementById('modalImg');    if (img)   img.src = p.imagen || '';
  const title = document.getElementById('modalTitle');  if (title) title.textContent = p.nombre || 'Producto';

  // Precio del modal: igual lógica condicional (si no completo, mostrar “Selecciona atributos”)
  const price = document.getElementById('modalPrice');
  if (price) {
    const total = computeSelectedTotal(p.id, p);
    price.textContent = (total == null)
      ? 'Selecciona atributos'
      : fmtCOP(total);
  }

  const rating = document.getElementById('modalRating');
  if (rating) {
    const n = Math.max(0, Math.min(5, Math.round(Number(p.rating || 0))));
    rating.innerHTML = '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  const desc = document.getElementById('modalDesc'); if (desc) desc.textContent = p.descripcion || '—';

  // Chips de categorías filtro
  const filtroBadges = (p.categorias || [])
    .filter(c => c && String(c.rol).toLowerCase() === 'filtro')
    .map(c => `<span class="badge rounded-pill text-bg-primary me-1">${c.nombre}</span>`).join('');
  const filtroContainer = document.getElementById('modalFiltroCats');
  if (filtroContainer) filtroContainer.innerHTML = filtroBadges;

  // Atributos como badges informativos
  const catsHTML = (p.categorias || [])
    .filter(c => String(c.rol).toLowerCase() !== 'filtro')
    .map((cat) => {
      const itemsHTML = (cat.items || [])
        .map((it) => `<span class="badge bg-info text-dark me-1 mb-1">${it.label ?? it.nombre ?? it.id}</span>`).join('');
      return itemsHTML ? `<div class="mb-1"><strong>${cat.nombre}:</strong> ${itemsHTML}</div>` : '';
    }).join('');
  const catsContainer = document.getElementById('modalExtraCats');
  if (catsContainer) catsContainer.innerHTML = catsHTML;

  const BS = window.bootstrap;
  new BS.Modal($('#productModal')).show();
}

/* =========================================================
 * Wire de filtros y controles
 * ========================================================= */
export function wireFiltersAndControls() {
  $('#searchForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.filtro.q = $('#q')?.value.trim() || '';
    state.pag.page = 1;
    applyFilters();
  });

  $('#searchFormTop')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.filtro.q = $('#qTop')?.value.trim() || '';
    state.pag.page = 1;
    applyFilters();
  });

  $('#btnApply')?.addEventListener('click', () => {
    state.filtro.minPrice  = parseFloat($('#minPrice')?.value) || null;
    state.filtro.maxPrice  = parseFloat($('#maxPrice')?.value) || null;
    state.filtro.inStock   = !!($('#inStock')?.checked);
    state.filtro.minRating = parseInt($('#minRating')?.value, 10) || 0;
    state.pag.page = 1;
    applyFilters();
  });

  $('#btnClear')?.addEventListener('click', () => {
    const minP = $('#minPrice'); const maxP = $('#maxPrice');
    const inSt = $('#inStock');  const minR = $('#minRating');
    if (minP) minP.value = '';
    if (maxP) maxP.value = '';
    if (inSt) inSt.checked = false;
    if (minR) minR.value = '0';

    state.filtro = {
      ...state.filtro,
      q: '',
      filtroCategoriaId: null,
      minPrice: null,
      maxPrice: null,
      inStock: false,
      minRating: 0,
    };

    // reset píldoras
    $$('#categoryPills .category-pill').forEach((x) => x.classList.remove('active'));
    $$('#categoryPillsMobile .category-pill').forEach((x) => x.classList.remove('active'));
    $('#categoryPills .category-pill')?.classList.add('active');
    $('#categoryPillsMobile .category-pill')?.classList.add('active');

    const qEl = $('#q'); if (qEl) qEl.value = '';
    const qTopEl = $('#qTop'); if (qTopEl) qTopEl.value = '';

    state.pag.page = 1;
    applyFilters();
  });

  $('#btnApplyMobile')?.addEventListener('click', () => {
    state.filtro.q         = $('#qMobile')?.value.trim() || '';
    state.filtro.minPrice  = parseFloat($('#minPriceMobile')?.value) || null;
    state.filtro.maxPrice  = parseFloat($('#maxPriceMobile')?.value) || null;
    state.filtro.inStock   = !!($('#inStockMobile')?.checked);
    state.filtro.minRating = parseInt($('#minRatingMobile')?.value, 10) || 0;
    state.pag.page = 1;
    applyFilters();
  });

  $('#btnClearMobile')?.addEventListener('click', () => {
    const qM = $('#qMobile');
    const miM = $('#minPriceMobile');
    const maM = $('#maxPriceMobile');
    const stM = $('#inStockMobile');
    const raM = $('#minRatingMobile');
    if (qM) qM.value = '';
    if (miM) miM.value = '';
    if (maM) maM.value = '';
    if (stM) stM.checked = false;
    if (raM) raM.value = '0';
  });

  $('#sortBy')?.addEventListener('change', (e) => {
    state.filtro.sortBy = e.target.value;
    state.pag.page = 1;
    applyFilters();
  });

  $('#btnLoadMore')?.addEventListener('click', () => {
    state.pag.page += 1;
    applyFilters();
  });
}

/* =========================================================
 * Refresh helpers
 * ========================================================= */

// Usar **GALERÍA** como fuente de productos
export async function refreshMarketplaceFromGaleria() {
  await preloadCategoriasTree();
  await loadFiltroCategorias();
  await loadGaleriaActiva(); // esta ya debe poblar state.productos como antes
  buildCategoryPills();
  state.pag.page = 1;
  applyFilters();
}

// Usar **PRODUCTOS de BD** como fuente de productos
export async function refreshMarketplaceFromProductos() {
  await preloadCategoriasTree();
  await loadFiltroCategorias();

  // items seleccionados a nivel de filtro (si tu UI los maneja así)
  const selectedItems = Array.isArray(state.filtro?.selectedItemIds)
    ? state.filtro.selectedItemIds.map(Number).filter(Number.isFinite)
    : [];

  // loadProductosActivos devuelve { items, total, ... } del endpoint /marketplace
  const res = await loadProductosActivos({
    q: state.filtro.q || '',
    categoriaId: state.filtro.filtroCategoriaId ?? null,
    page: 1,
    size: 200,
    ...(selectedItems.length ? { items: selectedItems } : {})
  });

  // Normaliza a state.productos para que toda la UI siga funcionando
  state.productos = normalizeFromMarketItems(res?.items || []);

  buildCategoryPills();
  state.pag.page = 1;
  applyFilters();
}

// Reconstruir las pills tras crear/editar categorías, etc.
export async function rebuildPillsAndRefresh() {
  await loadFiltroCategorias();
  buildCategoryPills();
  applyFilters();
}
