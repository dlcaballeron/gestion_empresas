// frontend/negocio/js/modules/checkout.js
import { state } from './state.js';
import { $, warnToast, money as moneyUtil, parseMoney as parseMoneyUtil } from './utils.js';
import { getCheckoutPrefill, createPedido } from './api.js';

/* ========= helpers de dinero (fallback si utils no exporta) ========= */
const _fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
function moneyLocal(v) { try { return _fmt.format(Number(v || 0)); } catch { return `$${Number(v||0).toFixed(0)}`; } }
function parseMoneyLocal(txt) { const n = String(txt || '').replace(/[^\d.-]/g, ''); return Number(n || 0); }

const money = moneyUtil || moneyLocal;
const parseMoney = parseMoneyUtil || parseMoneyLocal;

/* ========================= Helpers DOM ========================= */
const q = (sel) => document.querySelector(sel);
const firstOf = (...ids) => ids.map((id) => q(id)).find(Boolean);
const val = (...ids) => {
  const el = firstOf(...ids);
  if (!el) return '';
  return (el.value ?? el.textContent ?? '').toString().trim();
};
const setVal = (value, ...ids) => {
  const el = firstOf(...ids);
  if (!el) return;
  if ('value' in el) el.value = value;
  else el.textContent = value;
};
const setHTML = (html, ...ids) => {
  const el = firstOf(...ids);
  if (!el) return false;
  el.innerHTML = html;
  return true;
};
const markInvalid = (ok, ...ids) => {
  const el = firstOf(...ids);
  if (!el) return;
  el.classList.toggle('is-invalid', !ok);
};

/* =================== Reglas de validación =================== */
const RX = {
  name: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{1,20}$/,
  phone10: /^\d{10}$/,
  alnum20: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{1,20}$/,
  alnum50: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{1,50}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

// Dirección Colombia (flexible): requiere token de vía + al menos un número y longitud 5–50
const STREET_TOKENS = [
  'calle','cl',
  'carrera','cra','cr','kr','kra',
  'avenida','av','ak','ac','autopista',
  'diagonal','dg',
  'transversal','tv','transv',
  'circular',
  'km','via'
];
const TOKEN_RE = new RegExp(`\\b(${STREET_TOKENS.join('|')})\\b`, 'i');

function isValidColAddress(value) {
  if (!value) return false;
  const txt = String(value)
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  if (txt.length < 5 || txt.length > 50) return false;
  const hasToken  = TOKEN_RE.test(txt);
  const hasNumber = /\d/.test(txt);
  return hasToken && hasNumber;
}

/* =================== UI: asegurar modal si faltara =================== */
/** Si ya tienes el modal en principal.html NO se inyecta nada. */
function ensureCheckoutModal() {
  if (q('#checkoutModal')) return; // ya existe
  // Fallback minimalista (usa los IDs #chk* como estándar) — CIUDAD antes que BARRIO
  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal fade" id="checkoutModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Confirmar pedido</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12 col-lg-7">
              <h6 class="mb-2">Tu carrito</h6>
              <div id="chkCartList" class="vstack gap-2"></div>
              <hr class="my-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary">Subtotal</span>
                <span id="chkSubtotalValue" class="fw-semibold">$ 0</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label for="chkShippingInput" class="mb-0 text-secondary">Domicilio</label>
                <div class="input-group" style="max-width: 180px;">
                  <span class="input-group-text bg-white">$</span>
                  <input id="chkShippingInput" type="text" class="form-control text-end" placeholder="0" inputmode="numeric" maxlength="10">
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center border-top pt-2">
                <span class="fw-bold">Total</span>
                <span id="chkTotalValue" class="fw-bold h5 mb-0">$ 0</span>
              </div>
            </div>
            <div class="col-12 col-lg-5">
              <h6 class="mb-2">Datos de contacto</h6>
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label small">Nombre</label>
                  <input id="chkNombre" class="form-control form-control-sm" type="text" required maxlength="20" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{1,20}">
                </div>
                <div class="col-6">
                  <label class="form-label small">Apellido</label>
                  <input id="chkApellido" class="form-control form-control-sm" type="text" required maxlength="20" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{1,20}">
                </div>
                <div class="col-12">
                  <label class="form-label small">Email</label>
                  <input id="chkEmail" class="form-control form-control-sm" type="email" required>
                </div>
                <div class="col-12">
                  <label class="form-label small">Teléfono</label>
                  <input id="chkTelefono" class="form-control form-control-sm" type="text" required inputmode="numeric" maxlength="10" pattern="\\d{10}">
                </div>
              </div>
              <h6 class="mb-2 mt-2">Dirección de entrega</h6>
              <div class="row g-2 mb-2">
                <div class="col-12">
                  <label class="form-label small">Dirección</label>
                  <input id="chkDireccion" class="form-control form-control-sm" type="text" required maxlength="50" placeholder="Calle 12 # 34-56">
                </div>
                <div class="col-12">
                  <label class="form-label small">Complemento</label>
                  <input id="chkComplemento" class="form-control form-control-sm" type="text" required maxlength="50">
                </div>
                <div class="col-6">
                  <label class="form-label small">Ciudad</label>
                  <input id="chkCiudad" class="form-control form-control-sm" type="text" required maxlength="20" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{1,20}">
                </div>
                <div class="col-6">
                  <label class="form-label small">Barrio</label>
                  <input id="chkBarrio" class="form-control form-control-sm" type="text" maxlength="20" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{0,20}">
                </div>
                <div class="col-12">
                  <label class="form-label small">Referencia</label>
                  <input id="chkReferencia" class="form-control form-control-sm" type="text" maxlength="20" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{0,20}">
                </div>
              </div>
              <div class="row g-2 mb-2">
                <div class="col-6"><label class="form-label small">Tipo de entrega</label>
                  <select id="chkDeliveryType" class="form-select form-select-sm"><option value="domicilio">Domicilio</option><option value="recoger">Recoger en tienda</option></select>
                </div>
                <div class="col-6"><label class="form-label small">Método de pago</label>
                  <select id="chkPaymentMethod" class="form-select form-select-sm"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="contraentrega">Contraentrega</option></select>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label small">Notas para el vendedor</label>
                <textarea id="chkNotas" class="form-control form-control-sm" rows="3" maxlength="30"></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button id="btnCheckoutConfirm" class="btn btn-primary">Confirmar pedido</button>
        </div>
      </div>
    </div>
  </div>`);
}

/* ================ Filtros de entrada (UX) ================ */
function wireFieldConstraints() {
  const on = (selA, selB, fn) => {
    const el = firstOf(selA, selB);
    if (!el) return;
    el.addEventListener('input', () => fn(el));
  };

  // solo letras y espacios, máx 20
  const onlyLetters = (el, max = 20) => {
    el.value = el.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '').slice(0, max);
  };
  // solo dígitos
  const onlyDigits = (el, max) => {
    const lim = (typeof max === 'number' && max >= 0)
      ? max
      : ((typeof el.maxLength === 'number' && el.maxLength > 0) ? el.maxLength : 99);
    el.value = el.value.replace(/\D/g, '').slice(0, lim);
  };

  // alfanumérico + espacios
  const onlyAlnumSpaces = (el, max) => {
    el.value = el.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]/g, '').slice(0, max);
  };
  // dirección: permitir letras/números/espacios/#/-/./ /°/º
  const addrFilter = (el) => {
    el.value = el.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9#\-\s\.\/°º]/g, '').slice(0, 50);
  };

  on('#chkNombre', '#coNombre', (el) => onlyLetters(el, 20));
  on('#chkApellido', '#coApellido', (el) => onlyLetters(el, 20));
  on('#chkTelefono', '#coTelefono', (el) => onlyDigits(el, 10));
  on('#chkCiudad', '#coCiudad', (el) => onlyAlnumSpaces(el, 20));
  on('#chkBarrio', '#coBarrio', (el) => onlyAlnumSpaces(el, 20));
  on('#chkReferencia', '#coReferencia', (el) => onlyAlnumSpaces(el, 20));
  on('#chkNotas', '#coNotas', (el) => onlyAlnumSpaces(el, 30));
  on('#chkComplemento', '#coDir2', (el) => onlyAlnumSpaces(el, 50));
  on('#chkDireccion', '#coDir1', addrFilter);
  on('#chkShippingInput', '#coDomicilio', (el) => onlyDigits(el, 10));
}

/* ================ Adaptar carrito -> items del pedido ================ */
function cartToOrderItems() {
  // state.cart = [{ pid, nombre, imagen, qty, selections[], precio_unit, subtotal }]
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
      producto_id: null,                                // aún no hay productos
      imagen_id: Number(row.pid) || null,
      nombre: row.nombre || 'Item',
      precio: Number(row.precio_unit ?? row.precio ?? 0), // **unitario real del carrito**
      cantidad: Math.max(1, Number(row.qty || 1)),
      variante,
      img_url: row.imagen || null,
    };
  });
}

/* ========================= UI helpers ========================= */
function renderItemsList(items) {
  const html = items.map((it) => {
    const det = it.variante
      ? Object.entries(it.variante)
          .map(([k, v]) => `<span class="badge bg-info text-dark me-1 mb-1">${k}: ${v}</span>`)
          .join(' ')
      : '';
    const sub = Number(it.precio || 0) * Number(it.cantidad || 1);
    return `
      <div class="d-flex gap-3 align-items-start">
        <img src="${it.img_url || '/img/placeholder.png'}" width="56" height="56"
             class="rounded" style="object-fit:cover">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <strong>${it.nombre}</strong>
            <span>${money(it.precio)}</span>
          </div>
          <div class="small text-muted">Cant: ${it.cantidad} · Subtotal: <b>${money(sub)}</b></div>
          ${det ? `<div class="mt-1 small">${det}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Acepta ambos contenedores (#chkCartList preferido, #coItems alternativo)
  const ok = setHTML(html, '#chkCartList', '#coItems');
  if (!ok) console.error('[checkout] Falta el contenedor de líneas (#chkCartList/#coItems) en el DOM');
}

function recalcTotal() {
  const subTxt = val('#chkSubtotalValue', '#coSubtotal');
  const sub = parseMoney(subTxt);
  const domEl = firstOf('#chkShippingInput', '#coDomicilio');
  const domNum = domEl ? Number(domEl.value || 0) : 0;
  setVal(money(sub + domNum), '#chkTotalValue', '#coTotal');
}

function buildPayload(negocioId, items, subtotal) {
  const costoDomicilio = Number(val('#chkShippingInput', '#coDomicilio') || 0);
  const total = subtotal + costoDomicilio;
  return {
    negocioId,
    contacto: {
      nombre:   val('#chkNombre', '#coNombre'),
      apellido: val('#chkApellido', '#coApellido'),
      email:    val('#chkEmail', '#coEmail'),
      telefono: val('#chkTelefono', '#coTelefono'),
    },
    direccion: {
      etiqueta: 'Principal',
      direccion1:   val('#chkDireccion', '#coDir1'),
      direccion2:   val('#chkComplemento', '#coDir2'),
      // Nota: ahora ciudad primero y barrio después (pero el payload mantiene ambas claves)
      ciudad:       val('#chkCiudad', '#coCiudad'),
      barrio:       val('#chkBarrio', '#coBarrio'),
      departamento: null,
      referencia:   val('#chkReferencia', '#coReferencia'),
      telefono:     val('#chkTelefono', '#coTelefono'),
      id: null,
    },
    tipo_entrega: val('#chkDeliveryType', '#coTipoEntrega') || 'domicilio',
    metodo_pago:  val('#chkPaymentMethod', '#coMetodoPago') || 'efectivo',
    costoDomicilio,
    notas: val('#chkNotas', '#coNotas'),
    items,
    subtotal,
    total
  };
}

/* ========================= Validaciones ========================= */
function validatePayload(p) {
  // limpia marcas
  ['#chkNombre','#coNombre','#chkApellido','#coApellido','#chkEmail','#coEmail',
   '#chkTelefono','#coTelefono','#chkDireccion','#coDir1','#chkComplemento','#coDir2',
   '#chkCiudad','#coCiudad','#chkBarrio','#coBarrio','#chkReferencia','#coReferencia',
   '#chkNotas','#coNotas'
  ].forEach(id => q(id)?.classList.remove('is-invalid'));

  let ok = true;
  const pushErr = (cond, msg, ...ids) => {
    if (!cond) {
      ok = false;
      markInvalid(false, ...ids);
      warnToast?.(msg);
    } else {
      markInvalid(true, ...ids);
    }
  };

  // Reglas
  pushErr(RX.name.test(p.contacto.nombre), 'Nombre: solo letras y máximo 20.', '#chkNombre', '#coNombre');
  pushErr(RX.name.test(p.contacto.apellido), 'Apellido: solo letras y máximo 20.', '#chkApellido', '#coApellido');
  pushErr(RX.email.test(p.contacto.email), 'Email inválido.', '#chkEmail', '#coEmail');
  pushErr(RX.phone10.test(p.contacto.telefono), 'Teléfono: 10 dígitos.', '#chkTelefono', '#coTelefono');

  pushErr(
    p.direccion.direccion1 && isValidColAddress(p.direccion.direccion1),
    'Dirección inválida. Ej: "Cra 8B # 30B-62 Sur" (5–50).',
    '#chkDireccion', '#coDir1'
  );

  pushErr(RX.alnum50.test(p.direccion.direccion2 || ''), 'Complemento: solo letras/números y máximo 50.',
          '#chkComplemento', '#coDir2');

  pushErr(RX.alnum20.test(p.direccion.ciudad || ''), 'Ciudad: solo letras/números y máximo 20.',
          '#chkCiudad', '#coCiudad');

  if (p.direccion.barrio) {
    pushErr(RX.alnum20.test(p.direccion.barrio), 'Barrio: solo letras/números y máximo 20.',
            '#chkBarrio', '#coBarrio');
  }

  if (p.direccion.referencia) {
    pushErr(RX.alnum20.test(p.direccion.referencia), 'Referencia: solo letras/números y máximo 20.',
            '#chkReferencia', '#coReferencia');
  }

  if (p.notas) {
    pushErr(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{0,30}$/.test(p.notas), 'Notas: solo letras/números y máximo 30.',
            '#chkNotas', '#coNotas');
  }

  // Campos requeridos explícitos
  const requiredOk =
    p.contacto.nombre && p.contacto.apellido && p.contacto.email &&
    p.contacto.telefono && p.direccion.direccion1 && p.direccion.direccion2 &&
    p.direccion.ciudad;

  if (!requiredOk) ok = false;

  return ok;
}

/* ========================= Abrir modal ========================= */
async function openCheckoutModal() {
  const items = cartToOrderItems();
  if (!items.length) { alert('Debes añadir al menos un ítem.'); return; }

  ensureCheckoutModal();

  // Prefill desde backend
  const negocioId = state?.negocio?.id;
  const pre = await getCheckoutPrefill(negocioId);
  if (!pre?.ok) { alert(pre?.msg || 'Debes iniciar sesión para continuar.'); return; }

  // Subtotal + render
  const subtotal = items.reduce((s, it) => s + (Number(it.precio || 0) * Number(it.cantidad || 1)), 0);
  renderItemsList(items);
  setVal(money(subtotal), '#chkSubtotalValue', '#coSubtotal');
  setVal(Number(pre.costoDomicilio || 0), '#chkShippingInput', '#coDomicilio');
  recalcTotal();

  // Prefill contacto/dirección
  const u = pre.usuario || {};
  const d = pre.direccion || {};
  setVal(u.nombre || '',   '#chkNombre', '#coNombre');
  setVal(u.apellido || '', '#chkApellido', '#coApellido');
  setVal(u.email || '',    '#chkEmail', '#coEmail');
  setVal(u.telefono || '', '#chkTelefono', '#coTelefono');
  setVal(d.direccion1 || '', '#chkDireccion', '#coDir1');
  setVal(d.direccion2 || '', '#chkComplemento', '#coDir2');
  setVal(d.ciudad || '',     '#chkCiudad', '#coCiudad');   // Ciudad primero
  setVal(d.barrio || '',     '#chkBarrio', '#coBarrio');
  setVal(d.referencia || '', '#chkReferencia', '#coReferencia');

  // Abrir modal
  const BS = window.bootstrap;
  new BS.Modal(q('#checkoutModal')).show();

  // Wire filtros de entrada y listeners de totales/confirmar
  wireFieldConstraints();

  const ship = firstOf('#chkShippingInput', '#coDomicilio');
  if (ship) ship.oninput = recalcTotal;

  const btnConfirm = firstOf('#btnCheckoutConfirm', '#btnCoConfirmar');
  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      const payload = buildPayload(negocioId, items, subtotal);
      if (!validatePayload(payload)) return;

      const res = await createPedido(payload);
      if (res?.ok) {
        BS.Modal.getInstance(q('#checkoutModal'))?.hide();
        document.dispatchEvent(new CustomEvent('pedido:creado', { detail: { pedidoId: res.pedidoId }}));
        alert(`¡Pedido creado! No. ${res.pedidoId}`);
      } else {
        alert(res?.msg || 'No se pudo crear el pedido.');
      }
    };
  }
}

/* ========================= Init público ========================= */
let wired = false;
export function initCheckout() {
  if (wired) return;
  wired = true;

  // Botón "Continuar" del offcanvas del carrito
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('#btnCartContinue');
    if (btn) {
      ev.preventDefault();
      openCheckoutModal();
    }
  });

  // (Opcional) si el carrito cambia mientras el modal está abierto, recalcular total
  document.addEventListener('cart:changed', () => {
    const isOpen = q('#checkoutModal.show');
    if (isOpen) {
      // Recalcular subtotal/total con items actuales
      const items = cartToOrderItems();
      const subtotal = items.reduce((s, it) => s + (Number(it.precio || 0) * Number(it.cantidad || 1)), 0);
      renderItemsList(items);
      setVal(money(subtotal), '#chkSubtotalValue', '#coSubtotal');
      recalcTotal();
    }
  });
}
