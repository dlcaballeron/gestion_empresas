// modules/cart.js
import { state } from './state.js';
import { $, warnToast, getAttrCats } from './utils.js';

function storageKey() { return `cart:${state.slug || 'negocio'}`; }

/* =========================================================
 * Estado / Storage
 * ========================================================= */
export function loadCartFromStorage() {
  try {
    state.cart = JSON.parse(localStorage.getItem(storageKey())) || [];
  } catch {
    state.cart = [];
  }
  renderCartOffcanvas();
}

function saveCartToStorage() {
  localStorage.setItem(storageKey(), JSON.stringify(state.cart));
}

export function clearCart() {
  state.cart = [];
  saveCartToStorage();
  renderCartOffcanvas();
  updateCartBadge();
}

/* =========================================================
 * Cálculos / UI
 * ========================================================= */
function cartTotalQty() {
  return state.cart.reduce((acc, it) => acc + Number(it.qty || 0), 0);
}

export function updateCartBadge() {
  const badge = $('#cartBadge');
  const n = cartTotalQty();
  if (!badge) return;
  if (n > 0) { badge.textContent = String(n); badge.classList.remove('d-none'); }
  else { badge.textContent = '0'; badge.classList.add('d-none'); }
}

/* =========================================================
 * Offcanvas + Modal "Añadir"
 * ========================================================= */
export function ensureCartUI() {
  // Offcanvas
  if (!$('#cartOffcanvas')) {
    const oc = document.createElement('div');
    oc.className = 'offcanvas offcanvas-end';
    oc.id = 'cartOffcanvas';
    oc.tabIndex = -1;
    oc.innerHTML = `
      <div class="offcanvas-header">
        <h5 class="offcanvas-title">Carrito</h5>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
      </div>
      <div class="offcanvas-body d-flex flex-column">
        <div id="cartItemsHost" class="flex-grow-1"></div>
        <div class="border-top pt-3 d-flex justify-content-between">
          <button id="btnEmptyCart" class="btn btn-outline-danger btn-sm">
            <i class="bi bi-trash"></i> Vaciar
          </button>
          <!-- Este botón lo escucha checkout.js -->
          <button id="btnCartContinue" class="btn btn-primary btn-sm" disabled>Continuar</button>
        </div>
      </div>`;
    document.body.appendChild(oc);

    // Delegación de clicks dentro del offcanvas (sumar/restar/eliminar)
    oc.addEventListener('click', (e) => {
      const btnInc = e.target.closest('[data-cart-inc]');
      const btnDec = e.target.closest('[data-cart-dec]');
      const btnDel = e.target.closest('[data-cart-del]');

      if (btnInc) {
        const idx = Number(btnInc.dataset.cartInc);
        state.cart[idx].qty += 1;
        saveCartToStorage(); renderCartOffcanvas(); updateCartBadge();
      }
      if (btnDec) {
        const idx = Number(btnDec.dataset.cartDec);
        state.cart[idx].qty = Math.max(1, state.cart[idx].qty - 1);
        saveCartToStorage(); renderCartOffcanvas(); updateCartBadge();
      }
      if (btnDel) {
        const idx = Number(btnDel.dataset.cartDel);
        state.cart.splice(idx, 1);
        saveCartToStorage(); renderCartOffcanvas(); updateCartBadge();
      }
    });

    // Vaciar
    $('#btnEmptyCart')?.addEventListener('click', () => {
      if (!state.cart.length) return;
      if (!confirm('¿Vaciar el carrito?')) return;
      clearCart();
    });

    // NOTA: NO asignamos click al botón "Continuar" aquí.
    // El módulo checkout.js escucha por delegación el id #btnCartContinue.
  }

  // Modal "Añadir al carrito"
  if (!$('#addToCartModal')) {
    const m = document.createElement('div');
    m.className = 'modal fade';
    m.id = 'addToCartModal';
    m.tabIndex = -1;
    m.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Añadir al carrito</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="addAttrHost" class="small"></div>
            <div class="mt-3">
              <label class="form-label">Cantidad</label>
              <input id="addQtyInput" type="number" class="form-control" min="1" value="1">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button id="btnConfirmAdd" class="btn btn-primary" disabled>Agregar al carrito</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
}

export function bindCartHeaderButton() {
  $('#cartFab')?.addEventListener('click', () => openCartOffcanvas());
}

export function openCartOffcanvas() {
  const oc = $('#cartOffcanvas'); if (!oc) return;
  renderCartOffcanvas();
  const BS = window.bootstrap;
  new BS.Offcanvas(oc).show();
}

export function renderCartOffcanvas() {
  const host = $('#cartItemsHost'); if (!host) return;

  if (!state.cart.length) {
    host.innerHTML = `<div class="text-secondary small">Tu carrito está vacío.</div>`;
    $('#btnCartContinue')?.setAttribute('disabled', 'disabled');
    return;
  }
  $('#btnCartContinue')?.removeAttribute('disabled');

  host.innerHTML = state.cart.map((row, idx) => {
    const sels = (row.selections || [])
      .map(s => `<span class="badge bg-info text-dark me-1 mb-1">${s.catNombre}: ${s.itemLabel}</span>`)
      .join(' ');
    return `
      <div class="card mb-2">
        <div class="card-body d-flex gap-2 align-items-start">
          <img src="${row.imagen}" style="width:56px;height:56px;object-fit:cover;border-radius:.5rem;border:1px solid #eee">
          <div class="flex-grow-1">
            <div class="fw-semibold">${row.nombre}</div>
            <div class="small text-secondary">ID #${row.pid}</div>
            ${sels ? `<div class="mt-1">${sels}</div>` : ''}
            <div class="d-flex align-items-center gap-2 mt-2">
              <button class="btn btn-sm btn-outline-secondary" data-cart-dec="${idx}">–</button>
              <span>${row.qty}</span>
              <button class="btn btn-sm btn-outline-secondary" data-cart-inc="${idx}">+</button>
              <button class="btn btn-sm btn-outline-danger ms-2" data-cart-del="${idx}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* =========================================================
 * Modal "Añadir" (atributos + cantidad)
 * ========================================================= */
export function openAddToCartModal(p, preSelMap = new Map()) {
  const title      = $('#addToCartModal .modal-title');
  const host       = $('#addAttrHost');
  const qtyInput   = $('#addQtyInput');
  const btnConfirm = $('#btnConfirmAdd');

  if (title) title.textContent = `Añadir: ${p.nombre}`;
  if (qtyInput) qtyInput.value = '1';

  const attrCats = getAttrCats(p);
  const haveAll  = attrCats.every(c => preSelMap.has(c.id));
  const BS = window.bootstrap;

  // Caso sin atributos
  if (attrCats.length === 0) {
    host.innerHTML = `<div class="text-secondary small">Este producto no necesita atributos.</div>`;
    btnConfirm.disabled = false;
    btnConfirm.onclick = () => {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      addToCart({ pid: p.id, nombre: p.nombre, imagen: p.imagen, qty, selections: [] });
      BS.Modal.getInstance($('#addToCartModal'))?.hide();
      openCartOffcanvas();
    };
    new BS.Modal($('#addToCartModal')).show();
    return;
  }

  // Si ya vienen preseleccionados todos los atributos
  if (haveAll) {
    const summary = [...preSelMap.entries()].map(([catId, v]) => {
      const name = v.catNombre || attrCats.find(c => c.id === catId)?.nombre || '';
      return `<span class="badge bg-info text-dark me-1 mb-1">${name}: ${v.itemLabel}</span>`;
    }).join(' ');
    host.innerHTML = `<div class="small"><div class="mb-1">Atributos seleccionados:</div>${summary}</div>`;
    btnConfirm.disabled = false;
    btnConfirm.onclick = () => {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      const selections = [...preSelMap.entries()].map(([catId, v]) => ({
        catId, catNombre: v.catNombre ?? (attrCats.find(c => c.id === catId)?.nombre || ''),
        itemId: v.itemId, itemLabel: v.itemLabel
      }));
      addToCart({ pid: p.id, nombre: p.nombre, imagen: p.imagen, qty, selections });
      BS.Modal.getInstance($('#addToCartModal'))?.hide();
      openCartOffcanvas();
    };
    new BS.Modal($('#addToCartModal')).show();
    return;
  }

  // Selección interactiva de atributos
  host.innerHTML = attrCats.map(c => {
    const pills = c.items.map(i => `
      <button class="btn btn-sm btn-outline-secondary me-2 mb-2 attr-pill"
              data-cat="${c.id}" data-catname="${c.nombre}"
              data-item="${i.id}" data-itemlabel="${i.label}">${i.label}</button>`).join('');
    return `<div class="mb-2"><div class="fw-semibold mb-1">${c.nombre}</div><div>${pills}</div></div>`;
  }).join('');

  const selected = new Map(preSelMap);
  const validate = () => {
    const required = attrCats.length;
    const okQty = Number(qtyInput.value) >= 1;
    $('#btnConfirmAdd').disabled = !(okQty && selected.size === required);
  };

  $('#addAttrHost').querySelectorAll('.attr-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = Number(btn.dataset.cat);
      const catNombre = String(btn.dataset.catname || '');
      const itemId = Number(btn.dataset.item);
      const itemLabel = String(btn.dataset.itemlabel || '');
      // activar pill seleccionada
      $('#addAttrHost').querySelectorAll(`.attr-pill[data-cat="${catId}"]`).forEach(b => {
        b.classList.remove('btn-primary'); b.classList.add('btn-outline-secondary');
      });
      btn.classList.remove('btn-outline-secondary'); btn.classList.add('btn-primary');
      selected.set(catId, { itemId, itemLabel, catNombre });
      validate();
    });
  });
  qtyInput?.addEventListener('input', validate);
  validate();

  btnConfirm.onclick = () => {
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    const selections = [...selected.entries()].map(([catId, v]) => ({
      catId, catNombre: v.catNombre ?? '', itemId: v.itemId, itemLabel: v.itemLabel
    }));
    addToCart({ pid: p.id, nombre: p.nombre, imagen: p.imagen, qty, selections });
    state.preselect.set(p.id, new Map(selected));
    const BS = window.bootstrap;
    BS.Modal.getInstance($('#addToCartModal'))?.hide();
    openCartOffcanvas();
  };

  new window.bootstrap.Modal($('#addToCartModal')).show();
};

/* =========================================================
 * API pública del carrito
 * ========================================================= */
export function addToCart(row) {
  // Único por combinación de producto + atributos seleccionados
  const keyOf = (r) => `${r.pid}|` + (r.selections || [])
    .map(s => `${s.catId}:${s.itemId}`)
    .sort()
    .join(',');

  const k = keyOf(row);
  const found = state.cart.find(it => keyOf(it) === k);

  if (found) { found.qty += row.qty; }
  else { state.cart.push({ ...row }); }

  saveCartToStorage();
  updateCartBadge();
  renderCartOffcanvas();
}

/**
 * Mapea el contenido del carrito al formato esperado por el checkout/backend
 * [{ producto_id, imagen_id, nombre, precio, cantidad, variante, img_url }]
 * Nota: por ahora no manejamos precio aquí; déjalo en 0 o súbelo desde el catálogo.
 */
export function getCartForCheckout() {
  return (state.cart || []).map(r => ({
    producto_id: null,            // cuando exista tabla productos
    imagen_id: r.pid,             // tu id de imagen
    nombre: r.nombre,
    precio: Number(r.precio || 0),
    cantidad: Number(r.qty || 1),
    variante: (r.selections || []).map(s => ({ categoria: s.catNombre, item: s.itemLabel })), // JSON
    img_url: r.imagen || null
  }));
}
