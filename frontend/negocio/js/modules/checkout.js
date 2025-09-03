// frontend/negocio/js/modules/checkout.js
import { state } from './state.js';
import { $, warnToast } from './utils.js';
import { getCheckoutPrefill, createPedido } from './api.js';

/* ========= helpers de dinero (fallback si utils no exporta) ========= */
const _fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
function moneyLocal(v) { try { return _fmt.format(Number(v || 0)); } catch { return `$${Number(v||0).toFixed(0)}`; } }
function parseMoneyLocal(txt) {
  const n = String(txt || '').replace(/[^\d.-]/g, '');
  return Number(n || 0);
}
// Si utils.js define money/parseMoney, úsalos; si no, usa los locales
const money = (globalThis.money) ? globalThis.money : moneyLocal;
const parseMoney = (globalThis.parseMoney) ? globalThis.parseMoney : parseMoneyLocal;

/* =================== UI: Modal checkout =================== */
function ensureCheckoutModal() {
  if ($('#checkoutModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal fade" id="checkoutModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Confirmar pedido</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>

        <form id="checkoutForm" class="modal-body">
          <div class="row g-4">
            <!-- Col izquierda: resumen del carrito -->
            <div class="col-lg-6">
              <h6 class="mb-3">Tu carrito</h6>
              <div id="coItems" class="vstack gap-3"></div>
              <hr>
              <div class="d-flex justify-content-between">
                <span>Subtotal</span><strong id="coSubtotal">$0</strong>
              </div>
              <div class="d-flex justify-content-between align-items-center mt-1">
                <span>Domicilio</span>
                <div class="input-group input-group-sm" style="max-width:160px">
                  <span class="input-group-text">$</span>
                  <input id="coDomicilio" type="number" min="0" step="100" class="form-control text-end" value="0">
                </div>
              </div>
              <div class="d-flex justify-content-between fs-5 mt-2">
                <span>Total</span><strong id="coTotal">$0</strong>
              </div>
            </div>

            <!-- Col derecha: datos de contacto y dirección -->
            <div class="col-lg-6">
              <h6 class="mb-3">Datos de contacto</h6>
              <div class="row g-2">
                <div class="col-md-6">
                  <label class="form-label">Nombre</label>
                  <input id="coNombre" class="form-control">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Apellido</label>
                  <input id="coApellido" class="form-control">
                </div>
                <div class="col-md-12">
                  <label class="form-label">Email</label>
                  <input id="coEmail" type="email" class="form-control" readonly>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Teléfono</label>
                  <input id="coTelefono" class="form-control">
                </div>
              </div>

              <h6 class="mt-4 mb-2">Dirección de entrega</h6>
              <div class="row g-2">
                <div class="col-12">
                  <label class="form-label">Dirección</label>
                  <input id="coDir1" class="form-control" placeholder="Calle 00 #00-00">
                </div>
                <div class="col-12">
                  <label class="form-label">Complemento</label>
                  <input id="coDir2" class="form-control" placeholder="Apto / Interior (opcional)">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Barrio</label>
                  <input id="coBarrio" class="form-control">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Ciudad</label>
                  <input id="coCiudad" class="form-control">
                </div>
                <div class="col-12">
                  <label class="form-label">Referencia</label>
                  <input id="coReferencia" class="form-control" placeholder="Punto de referencia">
                </div>
              </div>

              <div class="row g-2 mt-3">
                <div class="col-md-6">
                  <label class="form-label">Tipo de entrega</label>
                  <select id="coTipoEntrega" class="form-select">
                    <option value="domicilio" selected>Domicilio</option>
                    <option value="recoger">Recoger en tienda</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Método de pago</label>
                  <select id="coMetodoPago" class="form-select">
                    <option value="efectivo" selected>Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="contraentrega">Contraentrega</option>
                  </select>
                </div>
              </div>

              <div class="mt-3">
                <label class="form-label">Notas para el vendedor</label>
                <textarea id="coNotas" class="form-control" rows="2" placeholder="Ej: llamar al llegar"></textarea>
              </div>
            </div>
          </div>
        </form>

        <div class="modal-footer">
          <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button id="btnCoConfirmar" class="btn btn-primary">Confirmar pedido</button>
        </div>
      </div>
    </div>
  </div>`);
}

/* ================ Adaptar carrito -> items del pedido ================ */
function cartToOrderItems() {
  // state.cart = [{ pid, nombre, imagen, qty, selections:[{catId,catNombre,itemId,itemLabel}] }]
  const cart = Array.isArray(state.cart) ? state.cart : [];
  return cart.map((row) => {
    const variante =
      Array.isArray(row.selections) && row.selections.length
        ? row.selections.reduce((acc, s) => {
            acc[s.catNombre || `cat_${s.catId}`] = s.itemLabel || s.itemId;
            return acc;
          }, {})
        : null;

    return {
      producto_id: null,                // sin productos todavía
      imagen_id: Number(row.pid) || null,
      nombre: row.nombre || 'Item',
      precio: Number(row.precio || 0),  // hoy 0 (no manejas precios)
      cantidad: Number(row.qty || 1),
      variante,
      img_url: row.imagen || null,
    };
  });
}

/* ========================= UI helpers ========================= */
function renderItemsList(items) {
  $('#coItems').innerHTML = items.map((it) => {
    const det =
      it.variante
        ? Object.entries(it.variante)
            .map(([k, v]) => `<span class="badge bg-info text-dark me-1 mb-1">${k}: ${v}</span>`)
            .join(' ')
        : '';

    return `
      <div class="d-flex gap-3 align-items-start">
        <img src="${it.img_url || '/img/placeholder.png'}" width="56" height="56"
             class="rounded" style="object-fit:cover">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <strong>${it.nombre}</strong>
            <span>${money(it.precio)}</span>
          </div>
          <div class="small text-muted">Cant: ${it.cantidad}</div>
          ${det ? `<div class="mt-1 small">${det}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function recalcTotal() {
  const sub = parseMoney($('#coSubtotal').textContent);
  const dom = Number($('#coDomicilio').value || 0);
  $('#coTotal').textContent = money(sub + dom);
}

function buildPayload(negocioId, items, subtotal) {
  const costoDomicilio = Number($('#coDomicilio').value || 0);
  const total = subtotal + costoDomicilio;
  return {
    negocioId,
    contacto: {
      nombre:   $('#coNombre').value.trim(),
      apellido: $('#coApellido').value.trim(),
      email:    $('#coEmail').value.trim(),
      telefono: $('#coTelefono').value.trim()
    },
    direccion: {
      etiqueta: 'Principal',
      direccion1: $('#coDir1').value.trim(),
      direccion2: $('#coDir2').value.trim(),
      barrio:     $('#coBarrio').value.trim(),
      ciudad:     $('#coCiudad').value.trim(),
      departamento: null,
      referencia: $('#coReferencia').value.trim(),
      telefono:   $('#coTelefono').value.trim()
    },
    tipo_entrega: $('#coTipoEntrega').value,
    metodo_pago:  $('#coMetodoPago').value,
    costoDomicilio,
    notas: $('#coNotas').value.trim(),
    items,
    subtotal,
    total
  };
}

function validatePayload(p) {
  if (!p.contacto.nombre || !p.contacto.telefono) {
    warnToast?.('Nombre y teléfono son obligatorios.') || alert('Nombre y teléfono son obligatorios.');
    return false;
  }
  if (p.tipo_entrega === 'domicilio' && (!p.direccion.direccion1 || !p.direccion.ciudad)) {
    warnToast?.('Completa la dirección y la ciudad.') || alert('Completa la dirección y la ciudad.');
    return false;
  }
  if (!p.items?.length) {
    warnToast?.('El carrito está vacío.') || alert('El carrito está vacío.');
    return false;
  }
  return true;
}

/* ========================= Abrir modal ========================= */
async function openCheckoutModal() {
  const items = cartToOrderItems();
  if (!items.length) { alert('Debes añadir al menos un ítem.'); return; }

  ensureCheckoutModal();

  // Prefill desde backend
  const negocioId = state?.negocio?.id;
  const pre = await getCheckoutPrefill(negocioId);
  if (!pre?.ok) { alert('Debes iniciar sesión para continuar.'); return; }

  // Subtotal + render
  const subtotal = items.reduce((s, it) => s + (Number(it.precio || 0) * Number(it.cantidad || 1)), 0);
  renderItemsList(items);
  $('#coSubtotal').textContent = money(subtotal);
  $('#coDomicilio').value = Number(pre.costoDomicilio || 0);
  recalcTotal();

  // Prefill contacto/dirección
  const u = pre.usuario || {};
  const d = pre.direccion || {};
  $('#coNombre').value     = u.nombre || '';
  $('#coApellido').value   = u.apellido || '';
  $('#coEmail').value      = u.email || '';
  $('#coTelefono').value   = u.telefono || '';
  $('#coDir1').value       = d.direccion1 || '';
  $('#coDir2').value       = d.direccion2 || '';
  $('#coBarrio').value     = d.barrio || '';
  $('#coCiudad').value     = d.ciudad || '';
  $('#coReferencia').value = d.referencia || '';

  // Abrir modal
  const modal = new bootstrap.Modal($('#checkoutModal'));
  modal.show();

  $('#coDomicilio').oninput = recalcTotal;

  // Confirmar
  $('#btnCoConfirmar').onclick = async () => {
    const payload = buildPayload(negocioId, items, subtotal);
    if (!validatePayload(payload)) return;

    const res = await createPedido(payload);
    if (res?.ok) {
      modal.hide();
      // Notificar a otros módulos (si deseas limpiar carrito allí)
      document.dispatchEvent(new CustomEvent('pedido:creado', { detail: { pedidoId: res.pedidoId }}));
      alert(`¡Pedido creado! No. ${res.pedidoId}`);
    } else {
      alert(res?.msg || 'No se pudo crear el pedido.');
    }
  };
}

/* ========================= Init público ========================= */
export function initCheckout() {
  // Escucha el botón "Continuar" del offcanvas del carrito
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('#btnCartContinue');
    if (btn) {
      ev.preventDefault();
      openCheckoutModal();
    }
  });
}
