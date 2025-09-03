// frontend/negocio/js/modules/api.js
import { state } from './state.js';
import { buildVisibilityRules, imagenCumpleReglas } from './visibility.js';

/* =========================================================
 * Utils locales
 * =======================================================*/
async function jsonOrNull(res) {
  try { return await res.json(); } catch { return null; }
}
function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
const coerceArr = (v) => (Array.isArray(v) ? v : []);

/* =========================================================
 * NEGOCIO
 * =======================================================*/
export async function loadNegocio() {
  try {
    const res = await fetch(`/api/negocio/info/${encodeURIComponent(state.slug)}`);
    if (!res.ok) throw new Error('Negocio not found');
    const negocio = await res.json();

    // Validar que el usuario logueado pertenece a este negocio
    if (Number(state.sesion?.negocio_id) !== Number(negocio.id)) {
      localStorage.removeItem('usuarioNegocio');
      location.href = `/negocio/${encodeURIComponent(state.slug)}`;
      return null;
    }
    return negocio;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* =========================================================
 * CATEGORÍAS
 * =======================================================*/
export async function preloadCategoriasTree() {
  const negocioId = state.negocio?.id;
  try {
    const res = await fetch(`/api/negocios/${negocioId}/categorias/tree`);
    if (!res.ok) throw new Error('No se pudo obtener categorías (árbol)');
    const tree = await res.json();
    state.categoriasTree = Array.isArray(tree) ? tree : [];
  } catch (e) {
    console.error('[preloadCategoriasTree] error', e);
    state.categoriasTree = [];
  }
}

export async function loadFiltroCategorias() {
  try {
    const negocioId = state.negocio?.id;
    const res = await fetch(`/api/negocios/${negocioId}/categorias?rol=filtro`);
    if (!res.ok) throw new Error('No se pudo obtener categorías de filtro');
    const data = await res.json();
    const cats = (Array.isArray(data) ? data : []).filter(c => Number(c.estado) === 1);
    state.filtroCategorias = cats.map(c => ({ id: c.id, nombre: c.nombre }));
  } catch (e) {
    console.error('[loadFiltroCategorias] error', e);
    state.filtroCategorias = [];
  }
}

/* =========================================================
 * GALERÍA ACTIVA → state.productos (modo “imágenes como productos”)
 * =======================================================*/
export async function loadGaleriaActiva() {
  const negocioId = state.negocio?.id;
  try {
    const reglas = buildVisibilityRules();
    const res = await fetch(`/api/negocios/${negocioId}/imagenes?estado=1`);
    if (!res.ok) {
      const text = await res.text().catch(() => '(sin body)');
      console.error('[loadGaleriaActiva] HTTP', res.status, text);
      throw new Error('No se pudo obtener la galería activa');
    }

    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];

    const visibles = arr
      .map(img => {
        const cats = Array.isArray(img.categorias) ? img.categorias : [];
        const enhanced = cats.map(c => ({
          ...c,
          // Propagar rol si viene nulo, usando las reglas precargadas
          rol: c.rol ?? reglas.rolByCatId.get(Number(c.id)) ?? ''
        }));
        return { ...img, categorias: enhanced };
      })
      .filter(img => imagenCumpleReglas(img, reglas));

    // Normalización compatible con marketplace
    state.productos = visibles.map((img) => ({
      id: img.id,
      imagen_id: img.id,
      producto_id: null,
      nombre: (img.titulo && String(img.titulo).trim()) || `Imagen ${img.id}`,
      categoria: 'galeria',
      precio: 0,
      imagen: img.url || '',
      img_url: img.url || '',
      rating: 5,
      stock: true,
      promo: false,
      descripcion: img.alt_text || '',
      categorias: Array.isArray(img.categorias) ? img.categorias : [],
    }));

    console.log('[loadGaleriaActiva] visibles:', state.productos.length, 'de', arr.length);
  } catch (e) {
    console.error('[loadGaleriaActiva] error', e);
    state.productos = [];
  }
}

/* =========================================================
 * PRODUCTOS (BD) – LISTA / DETALLE / OPCIONES / PRECIO
 * =======================================================*/

/**
 * Lista “clásica” de productos (para panel admin u otros usos).
 * Devuelve { items: [...] } siempre.
 */
export async function listProductos(params = {}) {
  const {
    negocioId = state?.negocio?.id,
    q = '',
    categoriaId = '',
    minPrice = '',
    maxPrice = '',
    inStock = 0,
    sortBy = 'relevance',
    page = 1,
    size = 12,
  } = params;

  const usp = new URLSearchParams();
  if (q) usp.set('q', q);
  if (categoriaId) usp.set('categoriaId', categoriaId);
  if (minPrice !== '' && minPrice != null) usp.set('minPrice', String(minPrice));
  if (maxPrice !== '' && maxPrice != null) usp.set('maxPrice', String(maxPrice));
  if (inStock) usp.set('inStock', '1');
  if (sortBy) usp.set('sortBy', sortBy);
  usp.set('page', String(page));
  usp.set('size', String(size));

  try {
    const url = `/api/negocios/${encodeURIComponent(negocioId)}/productos?${usp.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[listProductos] HTTP', res.status, t);
      return { items: [] };
    }
    const data = await jsonOrNull(res);
    return Array.isArray(data) ? { items: data } : (data || { items: [] });
  } catch (e) {
    console.error('[listProductos] error', e);
    return { items: [] };
  }
}

/**
 * Feed del marketplace (recomendado para pintar el grid).
 * Devuelve { items, total, page, size } o { items: [] } si falla.
 */
async function fetchMarketplaceFeed({ q = '', categoriaId = null, page = 1, size = 200 } = {}) {
  const negocioId = state.negocio?.id;
  if (!negocioId) return { items: [], total: 0, page, size };

  const usp = new URLSearchParams();
  if (q) usp.set('q', q);
  if (categoriaId != null) usp.set('categoriaId', String(categoriaId));
  usp.set('page', String(page));
  usp.set('size', String(size));

  try {
    const r = await fetch(`/api/negocios/${negocioId}/marketplace?` + usp.toString());
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[fetchMarketplaceFeed] HTTP', r.status, t);
      return { items: [], total: 0, page, size };
    }
    const data = await jsonOrNull(r);
    // Se admite tanto { items: [...] } como [...]
    if (Array.isArray(data)) return { items: data, total: data.length, page, size };
    if (data && Array.isArray(data.items)) return data;
    return { items: [], total: 0, page, size };
  } catch (e) {
    console.error('[fetchMarketplaceFeed] error', e);
    return { items: [], total: 0, page, size };
  }
}

/* ---------- Normalización productos → formato marketplace ---------- */
/*
 * Devuelve:
 * {
 *   id, nombre, precio, imagen, rating, stock, descripcion,
 *   categorias: [
 *     { id, nombre, rol:'filtro' },
 *     { id, nombre, rol:'atributo', items:[{id,label}] }
 *   ]
 * }
 */
function normalizeProducto(p) {
  // Si ya viene normalizado con categorias array y roles, úsalo directo
  if (Array.isArray(p?.categorias) && p.categorias.some(c => c.rol)) {
    const img = p.imagen_url || p.imagen || p.thumbnail || p.img_url || p.url || '';
    return {
      id: toInt(p.id),
      nombre: p.nombre ?? `Producto ${p.id}`,
      precio: Number(p.precio ?? p.base_precio ?? 0),
      imagen: img,
      rating: Number(p.rating ?? 5),
      stock: Boolean(p.in_stock ?? p.stock ?? true),
      descripcion: p.descripcion || '',
      categorias: p.categorias,
    };
  }

  const precio = Number(p.precio ?? p.base_precio ?? 0);
  const imagen = p.imagen_url || p.imagen || p.thumbnail || p.img_url || p.url || '';
  const stock  = Boolean(p.in_stock ?? p.stock ?? true);

  // Posibles ubicaciones de filtros/atributos
  const filtrosRaw   = coerceArr(p.categorias?.filtro).length ? p.categorias.filtro
                    : coerceArr(p.filtros).length ? p.filtros
                    : coerceArr(p.categorias_filtro);
  const attrsRaw     = coerceArr(p.categorias?.atributos).length ? p.categorias.atributos
                    : coerceArr(p.atributos).length ? p.atributos
                    : coerceArr(p.opciones);

  // Normalizar filtros
  const filtros = coerceArr(filtrosRaw).map(c => ({
    id: toInt(c.id),
    nombre: c.nombre ?? c.label ?? `Cat ${c.id}`,
    rol: 'filtro',
  }));

  // Normalizar atributos (pueden venir agrupados o planos)
  const atributos = groupAttrs(attrsRaw);

  return {
    id: toInt(p.id),
    nombre: p.nombre ?? `Producto ${p.id}`,
    precio,
    imagen,
    rating: Number(p.rating ?? 5),
    stock,
    descripcion: p.descripcion || '',
    categorias: [...filtros, ...atributos],
  };
}

// Agrupa atributos si vienen planos o respeta si vienen agrupados
function groupAttrs(op) {
  if (!Array.isArray(op) || op.length === 0) return [];

  // Si ya vienen agrupados: [{categoria_id, categoria_nombre, items:[{id,nombre/label}]}]
  if (op[0]?.items) {
    return op.map(c => ({
      id: toInt(c.categoria_id ?? c.id),
      nombre: c.categoria_nombre ?? c.nombre ?? `Cat ${c.categoria_id ?? c.id}`,
      rol: 'atributo',
      items: coerceArr(c.items).map(i => ({
        id: toInt(i.id ?? i.item_id),
        label: i.label ?? i.nombre ?? `Item ${i.id ?? i.item_id}`,
      })),
    }));
  }

  // Formato plano: [{categoria_id, categoria_nombre, item_id, item_nombre}, ...]
  const by = new Map();
  op.forEach(r => {
    const cid = toInt(r.categoria_id ?? r.id);
    if (!by.has(cid)) {
      by.set(cid, {
        id: cid,
        nombre: r.categoria_nombre ?? r.nombre ?? `Cat ${cid}`,
        rol: 'atributo',
        items: [],
      });
    }
    by.get(cid).items.push({
      id: toInt(r.item_id ?? r.id),
      label: r.item_nombre ?? r.nombre ?? `Item ${r.item_id ?? r.id}`,
    });
  });
  return [...by.values()];
}

/**
 * Carga productos activos desde BD y los deja en state.productos
 * con el formato que usa el marketplace (applyFilters/renderGrid/getAttrCats).
 * Prioriza el feed del marketplace; si falla, usa listProductos() y normaliza.
 */
export async function loadProductosActivos({ q = '', categoriaId = null, page = 1, size = 200 } = {}) {
  const negocioId = state.negocio?.id;
  if (!negocioId) { state.productos = []; return; }

  try {
    // 1) Intentar feed marketplace
    const feed = await fetchMarketplaceFeed({ q, categoriaId, page, size });
    let items  = coerceArr(feed.items);

    // 2) Fallback a lista clásica, si viene vacío
    if (!items.length) {
      const resp = await listProductos({ negocioId, q, categoriaId, page, size });
      items = coerceArr(resp?.items);
    }

    state.productos = items.map(normalizeProducto);
  } catch (e) {
    console.error('[loadProductosActivos]', e);
    state.productos = [];
  }
}

// (Opcional) detalle y opciones — útiles para modal/checkout/product-config
export async function getProductoDetalle(productId) {
  try {
    const res = await fetch(`/api/productos/${encodeURIComponent(productId)}`);
    if (!res.ok) return null;
    return await jsonOrNull(res);
  } catch {
    return null;
  }
}

export async function getProductoOpciones(negocioId, productoId) {
  try {
    const r = await fetch(`/api/negocios/${negocioId}/productos/${productoId}/opciones`);
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

// Guardar (upsert) opciones de precio por producto
export async function saveProductoOpciones(negocioId, productoId, opciones) {
  try {
    const r = await fetch(`/api/negocios/${negocioId}/productos/${productoId}/opciones`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opciones }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * (Opcional) Calcula precio final en backend dada la selección.
 * Si el endpoint no existe, devuelve null y el front hará el cálculo local.
 */
export async function computePrecioFinalAPI(productId, itemIds = []) {
  try {
    const res = await fetch(`/api/productos/${encodeURIComponent(productId)}/precio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemIds }),
    });
    if (!res.ok) return null;
    return await jsonOrNull(res); // { precio: number }
  } catch {
    return null;
  }
}

/* =========================================================
 * CHECKOUT API
 * =======================================================*/
export async function getCheckoutPrefill(negocioId) {
  const uid = state?.sesion?.id;
  const url =
    `/api/checkout/prefill?negocioId=${encodeURIComponent(negocioId)}` +
    (uid ? `&usuarioId=${encodeURIComponent(uid)}` : '');

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return { ok: false };
  return res.json();
}

export async function createPedido(payload) {
  // Fallback para cuando aún no haya sesión de backend:
  const finalPayload = {
    ...payload,
    usuarioId: state?.sesion?.id ?? payload.usuarioId ?? null,
  };

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(finalPayload),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    return { ok: false, msg: msg || 'HTTP ' + res.status };
  }
  return res.json();
}
