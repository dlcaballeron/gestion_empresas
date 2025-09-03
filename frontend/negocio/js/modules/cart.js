// frontend/negocio/js/modules/cart.js
// Lateral de carrito con precio unitario y subtotal por ítem.

import { state } from './state.js';
import { $, warnToast, getAttrCats } from './utils.js';
import { computeUnitPrice, fmtCOP } from './attr-prices.js';

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
  // Normaliza campos de precio para carros viejos
  for (const it of state.cart) {
    it.precio_unit = Number(it.precio_unit ?? it.precio ?? 0);
    it.qty = Math.max(1, Number(it.qty || 1));
    it.subtotal = Number(it.precio_unit) * Number(it.qty);
  }
  renderCartOffcanvas();
  updateCartBadge();
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
  return (state.cart || []).reduce((acc, it) => acc + Number(it.qty || 0), 0);
}

function cartTotalMoney() {
  return (state.cart || []).reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
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

        <div class="mt-2 d-flex justify-content-between align-items-center">
          <div class="fw-semibold">Total</div>
          <div id="cartTotalValue" class="fw-bold"></div>
        </div>

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
        const it = state.cart[idx]; if (!it) return;
        it.qty = Math.max(1, Number(it.qty || 1) + 1);
        it.subtotal = Number(it.precio_unit || 0) * Number(it.qty);
        saveCartToStorage(); renderCartOffcanvas(); updateCartBadge();
      }
      if (btnDec) {
        const idx = Number(btnDec.dataset.cartDec);
        const it = state.cart[idx]; if (!it) return;
        it.qty = Math.max(1, Number(it.qty || 1) - 1);
        it.subtotal = Number(it.precio_unit || 0) * Number(it.qty);
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
    const tv = $('#cartTotalValue'); if (tv) tv.textContent = fmtCOP(0);
    return;
  }
  $('#btnCartContinue')?.removeAttribute('disabled');

  host.innerHTML = state.cart.map((row, idx) => {
    const sels = (row.selections || [])
      .map(s => `<span class="badge bg-info text-dark me-1 mb-1">${s.catNombre}: ${s.itemLabel}</span>`)
      .join(' ');

    const unit = Number(row.precio_unit || 0);
    const sub  = Number(row.subtotal || (unit * Number(row.qty || 1)));

    return `
      <div class="card mb-2">
        <div class="card-body d-flex gap-2 align-items-start">
          <img src="${row.imagen}" style="width:56px;height:56px;object-fit:cover;border-radius:.5rem;border:1px solid #eee">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <div>
                <div class="fw-semibold">${row.nombre}</div>
                <div class="small text-secondary">ID #${row.pid}</div>
                ${sels ? `<div class="mt-1">${sels}</div>` : ''}
              </div>
              <div class="text-end">
                <div class="small text-secondary">Precio unit.</div>
                <div class="fw-semibold">${fmtCOP(unit)}</div>
                <div class="small text-secondary mt-1">Subtotal</div>
                <div class="fw-bold">${fmtCOP(sub)}</div>
              </div>
            </div>

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

  const tv = $('#cartTotalValue');
  if (tv) tv.textContent = fmtCOP(cartTotalMoney());
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
      // precio unitario = base_precio del producto
      const precio_unit = Number(p.base_precio ?? p.base ?? p.precio ?? 0);
      addToCart({
        pid: p.id, nombre: p.nombre, imagen: p.imagen,
        qty, selections: [], precio_unit,
      });
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
      const precio_unit = Number(computeUnitPrice(p, preSelMap) ?? 0);
      if (!Number.isFinite(precio_unit) || precio_unit <= 0) {
        warnToast?.('No se pudo calcular el precio del producto.');
        return;
      }
      addToCart({ pid: p.id, nombre: p.nombre, imagen: p.imagen, qty, selections, precio_unit });
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
    const precio_unit = Number(computeUnitPrice(p, selected) ?? 0);
    if (!Number.isFinite(precio_unit) || precio_unit <= 0) {
      warnToast?.('No se pudo calcular el precio del producto.');
      return;
    }
    addToCart({ pid: p.id, nombre: p.nombre, imagen: p.imagen, qty, selections, precio_unit });
    state.preselect.set(p.id, new Map(selected)); // persistimos selección en la tarjeta
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

  if (found) {
    found.qty = Math.max(1, Number(found.qty || 1) + Number(row.qty || 1));
    // precio_unit debe ser el mismo si la selección es la misma
    found.precio_unit = Number(found.precio_unit ?? row.precio_unit ?? 0);
    found.subtotal = Number(found.precio_unit || 0) * Number(found.qty || 1);
  } else {
    const precio_unit = Number(row.precio_unit ?? 0);
    state.cart.push({
      ...row,
      precio_unit,
      subtotal: precio_unit * Number(row.qty || 1),
    });
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartOffcanvas();
}

/**
 * Mapea el contenido del carrito al formato esperado por el checkout/backend
 * [{ producto_id, imagen_id, nombre, precio, cantidad, variante, img_url }]
 * OJO: el backend inserta 'precio' en la columna 'precio_unit', por eso
 * aquí enviamos el precio **unitario** en 'precio'.
 */
export function getCartForCheckout() {
  return (state.cart || []).map(r => ({
    producto_id: null,            // cuando exista tabla productos
    imagen_id: r.pid,             // tu id de imagen
    nombre: r.nombre,
    precio: Number(r.precio_unit || 0),        // unitario
    cantidad: Number(r.qty || 1),
    variante: (r.selections || []).map(s => ({ categoria: s.catNombre, item: s.itemLabel })), // JSON
    img_url: r.imagen || null
  }));
}
