// modules/utils.js

// Atajos DOM
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => r.querySelectorAll(s);

// Formateo de dinero y parsing
export const money = (n, curr = 'COP') =>
  Number(n || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: curr,
    maximumFractionDigits: 0
  });

export const parseMoney = (t) => Number(String(t ?? '').replace(/[^\d]/g, ''));

// Toast (Bootstrap) o alert fallback
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

// Cloudinary fill helper
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

// Helpers de producto: obtiene solo categorías de atributo con ítems
export function getAttrCats(prod) {
  return (prod?.categorias || [])
    .filter(c => String(c?.rol || '').toLowerCase() === 'atributo')
    .map(c => ({
      ...c,
      items: (c.items || []).map(it => ({
        id: Number(it.id),
        label: it.label ?? it.nombre ?? String(it.id),
        recargo: Number(it.recargo ?? it.precio ?? it.price ?? 0)
      }))
    }));
}