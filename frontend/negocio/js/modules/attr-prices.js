// frontend/negocio/js/modules/attr-prices.js
// Mantiene el modal de administración de precios por atributo (global)
// y agrega helpers reutilizables para cálculo de precios en el carrito/marketplace.

import { state } from './state.js';

/* =========================================================
 * Atajos DOM locales
 * ========================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* =========================================================
 * ----------------- HELPERS REUTILIZABLES -----------------
 * ========================================================= */

/** Devuelve true si todas las categorías de rol 'atributo' tienen un item elegido. */
export function selectionComplete(prod, preSel) {
  const cats = (prod?.categorias || []).filter(
    (c) => String(c?.rol || '').toLowerCase() === 'atributo'
  );
  if (cats.length === 0) return true;

  const getSel = (catId) =>
    preSel?.get ? preSel.get(catId) : (preSel?.[catId]);

  return cats.every((c) => !!getSel(Number(c.id)));
}

/**
 * Calcula el precio unitario:
 * base_precio + suma(recargos de los items seleccionados).
 * Si falta seleccionar alguno, retorna null.
 */
export function computeUnitPrice(prod, preSel) {
  const cats = (prod?.categorias || []).filter(
    (c) => String(c?.rol || '').toLowerCase() === 'atributo'
  );
  const base = Number(prod?.base_precio ?? prod?.base ?? prod?.precio ?? 0);
  let total = base;

  for (const c of cats) {
    const chosen = preSel?.get
      ? preSel.get(Number(c.id))
      : preSel?.[Number(c.id)];
    if (!chosen) return null;

    const itemId = Number(chosen.itemId ?? chosen.id ?? chosen);
    const it = (c.items || []).find((x) => Number(x.id) === itemId);
    if (it) total += Number(it.recargo || 0);
  }
  return total;
}

/** Formatea número a COP sin decimales. */
export function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(Number(n || 0)));
}

/**
 * Firma estable para “agrupar” en carrito un mismo producto con la misma selección.
 * Ej.: "12:3|18:7"
 */
export function selectionSignature(preSel) {
  const pairs = [];
  if (preSel?.forEach) {
    preSel.forEach((v, k) => {
      pairs.push([Number(k), Number(v?.itemId ?? v?.id ?? v)]);
    });
  } else if (preSel && typeof preSel === 'object') {
    for (const k of Object.keys(preSel)) {
      const v = preSel[k];
      pairs.push([Number(k), Number(v?.itemId ?? v?.id ?? v)]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map(([c, i]) => `${c}:${i}`).join('|');
}

/** Convierte Map selección → objeto simple útil para persistir/mostrar en el carrito. */
export function selectionToObject(preSel) {
  const out = {};
  if (preSel?.forEach) {
    preSel.forEach((v, k) => {
      const catId = Number(k);
      out[catId] = {
        catId,
        catNombre: String(v?.catNombre ?? ''),
        itemId: Number(v?.itemId ?? v?.id ?? v),
        itemLabel: String(v?.itemLabel ?? v?.nombre ?? v ?? ''),
      };
    });
  } else if (preSel && typeof preSel === 'object') {
    for (const k of Object.keys(preSel)) {
      const v = preSel[k];
      const catId = Number(k);
      out[catId] = {
        catId,
        catNombre: String(v?.catNombre ?? ''),
        itemId: Number(v?.itemId ?? v?.id ?? v),
        itemLabel: String(v?.itemLabel ?? v?.nombre ?? v ?? ''),
      };
    }
  }
  return out;
}

/* =========================================================
 * -------- MODAL DE ADMINISTRACIÓN (GLOBAL PRICES) --------
 * ========================================================= */

export function ensureAttrPricesModal() {
  let el = $('#attrPricesModal');
  if (el) return el;

  el = document.createElement('div');
  el.className = 'modal fade';
  el.id = 'attrPricesModal';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Precios por atributo (global)</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <div class="small text-secondary mb-2">
            Define los recargos para los <strong>ítems</strong> de cada categoría (rol = "atributo"). Se aplican a todos los productos.
          </div>
          <div id="attrPricesWrap" class="border rounded p-2" style="max-height:420px;overflow:auto">Cargando…</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>
          <button id="btnSaveAttrPrices" class="btn btn-primary">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export async function openAttrPricesModal() {
  const el = ensureAttrPricesModal();
  const wrap = $('#attrPricesWrap', el);

  // 1) árbol de categorías/ítems (rol atributo)
  const cats = (Array.isArray(state.categoriasTree) ? state.categoriasTree : [])
    .filter((c) => String(c.rol) === 'atributo' && Number(c.estado) === 1);

  // 2) precios actuales
  const precios = await fetch(
    `/api/negocios/${state.negocio.id}/atributos/precios`
  ).then((r) => (r.ok ? r.json() : []));
  const map = new Map(
    precios.map((p) => [`${p.categoria_id}:${p.item_id}`, Number(p.precio || 0)])
  );

  // 3) render
  wrap.innerHTML =
    cats
      .map((c) => {
        const items = (c.items || []).filter((it) => Number(it.estado) === 1);
        const lis =
          items
            .map((it) => {
              const k = `${c.id}:${it.id}`;
              const v = map.has(k) ? map.get(k) : '';
              return `
                <div class="d-flex align-items-center mb-1">
                  <div class="me-2" style="min-width:160px">${it.label || it.nombre || it.id}</div>
                  <div class="input-group input-group-sm" style="max-width:180px">
                    <span class="input-group-text">$</span>
                    <input type="number" class="form-control nip-price" step="0.01" min="0"
                           data-cat="${c.id}" data-item="${it.id}" placeholder="0.00"
                           value="${v === '' ? '' : String(v)}">
                  </div>
                </div>`;
            })
            .join('') || `<div class="text-secondary small">— sin ítems —</div>`;
        return `<div class="mb-2">
          <div class="fw-semibold mb-1">${c.nombre}</div>
          ${lis}
        </div>`;
      })
      .join('') || `<div class="text-secondary small">No hay categorías de atributos activas.</div>`;

  // Guardar
  $('#btnSaveAttrPrices', el).onclick = async () => {
    const inputs = $$('.nip-price', wrap);
    const payload = [];
    for (const inp of inputs) {
      const raw = String(inp.value || '').trim();
      if (raw === '') continue;
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v >= 0) {
        payload.push({
          categoria_id: Number(inp.dataset.cat),
          item_id: Number(inp.dataset.item),
          precio: v,
        });
      }
    }
    const r = await fetch(
      `/api/negocios/${state.negocio.id}/atributos/precios`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precios: payload }),
      }
    );
    if (!r.ok) {
      alert('No se pudo guardar');
      return;
    }
    const BS = window.bootstrap;
    new BS.Modal(el).hide();
  };

  const BS = window.bootstrap;
  new BS.Modal(el).show();
}
