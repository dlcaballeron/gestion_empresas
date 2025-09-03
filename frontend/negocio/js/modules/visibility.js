import { state } from './state.js';

export function buildVisibilityRules() {
  const tree = state.categoriasTree || [];

  const filtroActivos = new Set(
    tree.filter(c => Number(c.estado) === 1 && String(c.rol) === 'filtro')
        .map(c => Number(c.id))
  );

  const attrActivos = tree
    .filter(c => Number(c.estado) === 1 && String(c.rol) !== 'filtro')
    .map(c => ({
      catId: Number(c.id),
      catNombre: c.nombre,
      itemIds: new Set((c.items || [])
        .filter(i => Number(i.estado) === 1)
        .map(i => Number(i.id)))
    }));

  const rolByCatId = new Map();
  tree.forEach(c => rolByCatId.set(Number(c.id), String(c.rol || '')));

  return { filtroActivos, attrActivos, rolByCatId };
}

export function imagenCumpleReglas(img, reglas) {
  const { filtroActivos, attrActivos } = reglas;
  const categoriasImg = Array.isArray(img.categorias) ? img.categorias : [];

  if (filtroActivos.size > 0) {
    const tieneAlgunaFiltro = categoriasImg.some(c => filtroActivos.has(Number(c.id)));
    if (!tieneAlgunaFiltro) return false;
  }

  for (const cat of attrActivos) {
    if (cat.itemIds.size === 0) continue;
    const pack = categoriasImg.find(ci => Number(ci.id) === cat.catId);
    const tieneItem = !!pack && Array.isArray(pack.items) &&
      pack.items.some(it => cat.itemIds.has(Number(it.id)));
    if (!tieneItem) return false;
  }

  return true;
}
