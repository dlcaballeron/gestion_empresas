// frontend/negocio/js/modules/productos-modal.js
// Orquestador del modal de Productos: tabs, montaje del listado (products.js) y "Crear nuevo".

import { initProductosAdmin } from './products.js';
import { state } from './state.js';

let NEGOCIO     = null;
let MODAL_EL    = null;
let IS_MOUNTED  = false;
let ON_CHANGE   = null;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* =========================================================
 * API PÚBLICA
 * =======================================================*/

/**
 * Inicializa el modal de productos (idempotente).
 * - Asegura el DOM del modal (desde parcial o dinámico).
 * - Cablea tabs y botones "Crear" / "Listar".
 * - Monta products.js al abrir (lazy) o inmediatamente si opts.mountNow = true.
 */
export async function initProductosModal(negocio, opts = {}) {
  NEGOCIO   = negocio || state.negocio || NEGOCIO;
  ON_CHANGE = typeof opts.onChange === 'function' ? opts.onChange : null;

  MODAL_EL = ensureModalDom();
  wireTabsAndButtons();

  if (opts.mountNow) {
    await mountProductsIfNeeded();
  }

  // Lazy-mount en el primer "show"
  MODAL_EL.addEventListener('show.bs.modal', async () => {
    await mountProductsIfNeeded();
  }, { once: true });
}

/**
 * Abre el modal de productos.
 * Si no está montado el módulo, lo monta al vuelo.
 */
export async function showProductosModal(negocio, opts = {}) {
  await initProductosModal(negocio, opts);
  const BS = window.bootstrap;
  const inst = BS ? BS.Modal.getOrCreateInstance(MODAL_EL) : null;
  if (inst) inst.show();
  else MODAL_EL.classList.add('show'); // fallback visual mínimo
}

/**
 * Abre el modal directamente en flujo de "Crear nuevo".
 * Intenta disparar el formulario de products.js mediante su propio botón.
 */
export async function openCrearProducto(negocio, opts = {}) {
  await showProductosModal(negocio, opts);
  // asegurar que el listado está montado
  await mountProductsIfNeeded();
  // cambiar a tab Listar (donde vive el botón real)
  switchToTab('listar');

  // esperar al botón y simular click
  const btn = await waitFor(() => $('#productosAdminMount #btnAddProducto'), 1200);
  if (btn) btn.click();
}

/* =========================================================
 * Internas
 * =======================================================*/

function ensureModalDom() {
  let el = $('#productosAdminModal');
  if (el) return el;

  // Fallback: crear un modal básico si no existe el partial
  el = document.createElement('div');
  el.className = 'modal fade';
  el.id = 'productosAdminModal';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-bag me-2"></i>Productos</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <div class="modal-body p-0">
          <ul class="nav nav-tabs px-3 pt-2" id="productosTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active" id="tab-listar" data-bs-toggle="tab" data-bs-target="#tabPaneListar" type="button" role="tab" aria-controls="tabPaneListar" aria-selected="true">Listar / Consultar</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" id="tab-crear" data-bs-toggle="tab" data-bs-target="#tabPaneCrear" type="button" role="tab" aria-controls="tabPaneCrear" aria-selected="false">Crear nuevo</button>
            </li>
          </ul>

          <div class="tab-content">
            <div class="tab-pane fade show active" id="tabPaneListar" role="tabpanel" aria-labelledby="tab-listar" tabindex="0">
              <div id="productosAdminMount" class="p-3">
                <div class="text-secondary small">Cargando módulo de productos…</div>
              </div>
            </div>

            <div class="tab-pane fade" id="tabPaneCrear" role="tabpanel" aria-labelledby="tab-crear" tabindex="0">
              <div class="p-3">
                <div class="alert alert-light border d-flex align-items-start gap-2">
                  <i class="bi bi-info-circle text-primary mt-1"></i>
                  <div>El formulario de creación/edición se abre como un modal independiente. Usa el botón <b>“Crear producto”</b> para abrirlo.</div>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <button id="btnOpenNuevoProducto" type="button" class="btn btn-success">
                    <i class="bi bi-plus-lg me-1"></i> Crear producto
                  </button>
                  <button id="btnIrAListar" type="button" class="btn btn-outline-secondary">
                    <i class="bi bi-card-list me-1"></i> Ir a Listar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function wireTabsAndButtons() {
  // Botón "Crear producto" (pestaña Crear) → simula click al botón real del listado
  MODAL_EL.addEventListener('click', (ev) => {
    const btn = ev.target.closest('#btnOpenNuevoProducto, #btnIrAListar');
    if (!btn) return;

    ev.preventDefault();
    if (btn.id === 'btnOpenNuevoProducto') {
      switchToTab('listar');
      // defer hasta que el listado esté seguro en DOM
      setTimeout(async () => {
        await mountProductsIfNeeded();
        const nuevo = $('#productosAdminMount #btnAddProducto');
        if (nuevo) nuevo.click();
      }, 60);
    } else if (btn.id === 'btnIrAListar') {
      switchToTab('listar');
    }
  });

  // Al cambiar a la pestaña Listar, asegura el montaje
  const listarTabBtn = $('#tab-listar', MODAL_EL);
  if (listarTabBtn) {
    listarTabBtn.addEventListener('shown.bs.tab', async () => {
      await mountProductsIfNeeded();
    });
  }
}

function switchToTab(which) {
  const id = which === 'crear' ? '#tab-crear' : '#tab-listar';
  const btn = $(id, MODAL_EL);
  // Si Bootstrap está cargado, usa su API para activar
  const BS = window.bootstrap;
  if (BS && btn) {
    const Tab = BS.Tab;
    const inst = Tab ? Tab.getOrCreateInstance(btn) : null;
    if (inst) inst.show();
  } else if (btn) {
    // Fallback mínimo: alterna clases
    const targetSel = btn.getAttribute('data-bs-target');
    $$('.tab-pane', MODAL_EL).forEach(p => p.classList.remove('show', 'active'));
    $(targetSel, MODAL_EL)?.classList.add('show', 'active');
    $$('#productosTabs .nav-link', MODAL_EL).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

async function mountProductsIfNeeded() {
  if (IS_MOUNTED) return;
  const mount = $('#productosAdminMount', MODAL_EL);
  if (!mount) return;

  await initProductosAdmin(NEGOCIO || state.negocio, {
    mountSelector: '#productosAdminMount',
    onChange: async () => {
      if (typeof ON_CHANGE === 'function') await ON_CHANGE();
    },
  });

  IS_MOUNTED = true;
}

/* =========================================================
 * Pequeños helpers
 * =======================================================*/

async function waitFor(getterFn, timeoutMs = 1000, intervalMs = 40) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const it = setInterval(() => {
      const el = safeCall(getterFn);
      if (el) {
        clearInterval(it);
        resolve(el);
      } else if (Date.now() - t0 >= timeoutMs) {
        clearInterval(it);
        resolve(null);
      }
    }, intervalMs);
  });
}

function safeCall(fn) {
  try { return fn(); } catch { return null; }
}
