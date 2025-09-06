// frontend/negocio/js/modules/utils.js
// Utilidades DOM, formato de dinero, toasts, validaciones y helpers de producto.

/* =========================
 * DOM helpers
 * ========================= */
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => r.querySelectorAll(s);

/**
 * Escucha eventos con (opcional) delegación.
 * on(el, 'click', '.selector', handler)  // delegación
 * on(el, 'click', handler)               // directo
 */
export function on(el, type, selector, handler) {
  if (typeof selector === 'function') {
    el.addEventListener(type, selector);
    return;
  }
  el.addEventListener(type, (ev) => {
    const target = ev.target.closest(selector);
    if (target && el.contains(target)) handler(ev, target);
  });
}

/* =========================
 * Dinero y parsing
 * ========================= */
export const money = (n, curr = 'COP') =>
  Number(n || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: curr,
    maximumFractionDigits: 0
  });

/** Alias conveniente para COP. */
export const fmtCOP = (n) => money(n, 'COP');

/** Convierte texto con moneda a número entero (ej: "$ 12.345" -> 12345). */
export const parseMoney = (t) => Number(String(t == null ? '' : t).replace(/[^\d]/g, ''));

/** Fuerza número seguro (entero) con mínimo opcional. */
export const num = (v, min = 0) => Math.max(min, Number(v || 0));

/** Suma con selector: sumBy(arr, x => x.costo) */
export const sumBy = (arr, sel) => (arr || []).reduce((a, it) => a + Number(sel(it) || 0), 0);

/* Exponer como fallback global (por si otros módulos no importan utils explícitamente) */
try {
  if (!globalThis.money) globalThis.money = money;
  if (!globalThis.parseMoney) globalThis.parseMoney = parseMoney;
} catch { /* noop */ }

/* =========================
 * Toast (Bootstrap) o alert
 * ========================= */
export function warnToast(msg) {
  try {
    let host = $('#toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.style.position = 'fixed';
      host.style.right = '1rem';
      host.style.bottom = '1rem';
      host.style.zIndex = '1080';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-warning border-0';
    el.role = 'alert';
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    host.appendChild(el);
    const BS = window.bootstrap;
    const t = new BS.Toast(el, { delay: 2500 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  } catch {
    alert(msg);
  }
}

/* =========================
 * Cloudinary fill helper
 * ========================= */
export function cldFill(url, {
  ar = '4:5', w = 800, crop = 'fill', gravity = 'auto',
  fmt = 'f_auto', q = 'q_auto', dpr = 'dpr_auto'
} = {}) {
  try {
    if (!url || !url.includes('/upload/')) return url;
    const t = [`c_${crop}`, `ar_${ar}`, `g_${gravity}`, q, fmt, dpr, `w_${w}`]
      .filter(Boolean).join(',');
    return url.replace('/upload/', `/upload/${t}/`);
  } catch {
    return url;
  }
}

/* =========================
 * Validaciones y filtros de entrada
 * ========================= */

/** Regex reutilizables */
export const validators = {
  name20: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{1,20}$/,         // letras y espacios, máx 20
  phone10: /^\d{10}$/,                                // 10 dígitos
  alnum20: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{1,20}$/,     // alfanumérico + espacios, máx 20
  alnum50: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{1,50}$/,     // alfanumérico + espacios, máx 50
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,                // email básico
};

/** Dirección típica en Colombia: prefijo + numeración (ej: Calle 12 # 34-56) */
// Dirección típica en Colombia, validación flexible
export function coAddressLooksValid(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.length > 50) return false;

  // Vías, orientaciones y formatos admitidos
  const via = '(?:calle|cll|cl|c|carrera|cra|cr|kr|kra|avenida|av|ak|ac|transversal|transv|tv|diagonal|dg|circular|autopista|aut|km)';
  const orient = '(?:este|oeste|norte|sur|oriente|occidente|n|s|e|o|ne|no|se|so)';
  const num = '\\d+\\s*[a-z]?';                 // 12, 12a, 12 b
  const sepNo = '(?:#|n°|no\\.?|num\\.?|numero\\.?)'; // #, No, N°, Num

  const rx = new RegExp(
    '^' +
      via + '\\s*' +
      num + '(?:\\s*bis)?' +                    // primer número + opcional "bis"
      '(?:\\s*' + orient + ')?' +               // orientación opcional (ej: "este")
      '(?:\\s*(?:' + sepNo + '))?\\s*' +        // # / No / N° opcional
      num +                                     // segundo bloque numérico
      '(?:\\s*(?:-\\s*|\\s+)' + num + ')?' +    // tercer bloque con "-" o solo espacio
      '(?:\\s*' + orient + ')?' +               // orientación final opcional (ej: "sur")
    '$',
    'i'
  );
  return rx.test(s);
}


/** Limita longitud de un input/textarea */
export function limitLength(el, max) {
  if (!el) return;
  const m = (typeof max === 'number' && max >= 0) ? max : (typeof el.maxLength === 'number' && el.maxLength > 0 ? el.maxLength : undefined);
  if (m != null) el.value = String(el.value || '').slice(0, m);
}

/** Solo letras (ES) y espacios; longitud máxima configurable (default 20) */
export function onlyLettersInput(el, max = 20) {
  if (!el) return;
  el.value = String(el.value || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');
  limitLength(el, max);
}

/** Solo dígitos; longitud máxima configurable */
export function onlyDigitsInput(el, max) {
  if (!el) return;
  const lim = (typeof max === 'number' && max >= 0)
    ? max
    : ((typeof el.maxLength === 'number' && el.maxLength > 0) ? el.maxLength : 99);
  el.value = String(el.value || '').replace(/\D/g, '').slice(0, lim);
}

/** Alfanumérico + espacios; longitud máxima configurable */
export function onlyAlnumSpacesInput(el, max) {
  if (!el) return;
  el.value = String(el.value || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]/g, '');
  limitLength(el, max);
}

// Filtro para dirección: letras/números/espacios/#/-/./°/º ; máx 50
export function filterAddressInput(el, max = 50) {
  if (!el) return;
  el.value = String(el.value || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9#.\u00B0\u00BA\-\s]/g, '');
  limitLength(el, max);
}


/* =========================
 * Helpers de producto
 * ========================= */
/**
 * Devuelve únicamente las categorías con rol "atributo", normalizando los ítems.
 * Cada item: { id:number, label:string, recargo:number }
 */
export function getAttrCats(prod) {
  return (prod?.categorias || [])
    .filter(c => String(c?.rol || '').toLowerCase() === 'atributo')
    .map(c => ({
      ...c,
      items: (c.items || []).map(it => ({
        id: Number(it.id),
        label: (it.label != null ? it.label : (it.nombre != null ? it.nombre : String(it.id))),
        recargo: Number(
          (it.recargo != null ? it.recargo :
            (it.precio != null ? it.precio :
              (it.price != null ? it.price : 0)))
        )
      }))
    }));
}
