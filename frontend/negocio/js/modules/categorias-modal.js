import { state } from './state.js';
import { $ } from './utils.js';
import { loadFiltroCategorias, preloadCategoriasTree, loadGaleriaActiva } from './api.js';
import { buildCategoryPills, applyFilters } from './marketplace.js';


export function initCategoriasModal() {
  const modalEl = document.getElementById('categoriasModal');
  if (!modalEl) return;

  const subtitle = document.getElementById('categoriasSubtitulo');

  // A) ATRIBUTO
  const formCat  = document.getElementById('formNuevaCategoria');
  const catInput = document.getElementById('catNombreInput');
  const ulCats   = document.getElementById('listaCategoriasModal');

  const wrapAdd  = document.getElementById('wrapAddItems');
  const titleDet = document.getElementById('tituloDetalleCategoria');
  const taItems  = document.getElementById('itemsTextarea');
  const btnAdd   = document.getElementById('btnAgregarItems');
  const btnRen   = document.getElementById('btnRenombrarCategoria');
  const btnDel   = document.getElementById('btnEliminarCategoria');
  const ulItems  = document.getElementById('listaItemsModal');

  // B) FILTRO
  const formCatF  = document.getElementById('formNuevaCategoriaFiltro');
  const catFInput = document.getElementById('catFiltroNombreInput');
  const ulCatsF   = document.getElementById('listaCategoriasFiltro');

  let categoriasAttr = [];
  let categoriasFilt = [];
  let selCatId = null;
  const negocioId = state.negocio?.id;

  function resetDetalle() {
    selCatId = null;
    titleDet.textContent = 'Selecciona una categoría';
    wrapAdd.classList.add('d-none');
    ulItems.innerHTML = '';
  }
  const liCategoriaTpl = (c) => {
    const activa = Number(c.estado) === 1;
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <button class="btn btn-link p-0 text-decoration-none" data-cat="${c.id}">${c.nombre}</button>
        <span class="badge ${activa ? 'text-bg-success' : 'text-bg-secondary'}">${activa ? 'Activa' : 'Inactiva'}</span>
      </li>`;
  };
  const liItemTpl = (it) => {
    const activo = Number(it.estado) === 1;
    const btnClass = activo ? 'btn btn-success' : 'btn btn-outline-secondary';
    const title = activo ? 'Activo (clic para desactivar)' : 'Inactivo (clic para activar)';
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${it.label}</span>
        <div class="btn-group btn-group-sm">
          <button class="${btnClass}" data-action="toggle-item" data-id="${it.id}" data-estado="${activo ? 1 : 0}" title="${title}"><i class="bi bi-power"></i></button>
          <button class="btn btn-outline-danger" data-action="delete-item" data-id="${it.id}" title="Eliminar"><i class="bi bi-trash"></i></button>
        </div>
      </li>`;
  };
  const liFiltroTpl = (c) => {
    const activa = Number(c.estado) === 1;
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span class="text-truncate">${c.nombre}</span>
        <div class="btn-group btn-group-sm">
          <button class="btn ${activa ? 'btn-success' : 'btn-outline-secondary'} btn-f-toggle" data-id="${c.id}" title="Activar/Desactivar"><i class="bi bi-power"></i></button>
          <button class="btn btn-outline-secondary btn-f-rename" data-id="${c.id}" title="Renombrar"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-f-delete" data-id="${c.id}" title="Eliminar"><i class="bi bi-trash"></i></button>
        </div>
      </li>`;
  };

  async function fetchCategorias(rol) {
    const url = `/api/negocios/${negocioId}/categorias${rol ? `?rol=${encodeURIComponent(rol)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo obtener categorías');
    return res.json();
  }

  function paintCategoriasAttr() {
    if (!categoriasAttr.length) { ulCats.innerHTML = `<li class="list-group-item text-secondary">Sin categorías</li>`; resetDetalle(); return; }
    ulCats.innerHTML = categoriasAttr.map(liCategoriaTpl).join('');
  }
  function selectCategoria(id) {
    selCatId = id;
    const cat = categoriasAttr.find((c) => c.id === id);
    if (!cat) { resetDetalle(); return; }
    titleDet.textContent = `Ítems de: ${cat.nombre}`;
    wrapAdd.classList.remove('d-none');
    ulItems.innerHTML = (cat.items && cat.items.length) ? cat.items.map(liItemTpl).join('')
                     : `<li class="list-group-item text-secondary">Sin ítems</li>`;
  }
  function paintCategoriasFiltro() {
    if (!categoriasFilt.length) { ulCatsF.innerHTML = `<li class="list-group-item text-secondary">Sin categorías de filtro</li>`; return; }
    ulCatsF.innerHTML = categoriasFilt.map(liFiltroTpl).join('');
  }

  async function reloadCategorias() {
    const [attrs, filts] = await Promise.all([ fetchCategorias('atributo'), fetchCategorias('filtro') ]);
    categoriasAttr = attrs || []; categoriasFilt = filts || [];
    paintCategoriasAttr(); paintCategoriasFiltro();

    if (selCatId) { const exists = categoriasAttr.some((c) => c.id === selCatId); exists ? selectCategoria(selCatId) : resetDetalle(); }
    else { resetDetalle(); }

    // Refrescar pills/filtros + marketplace
    await loadFiltroCategorias(); buildCategoryPills(); applyFilters();
    await preloadCategoriasTree(); await loadGaleriaActiva(); state.pag.page = 1; applyFilters();
  }

  modalEl.addEventListener('show.bs.modal', async () => {
    if (subtitle) subtitle.textContent = `${state.negocio?.razon_social || '—'} · ID ${state.negocio?.id ?? '—'}`;
    await reloadCategorias();
  });

  // ATRIBUTO
  formCat?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = catInput?.value.trim(); if (!nombre) return;
    const res = await fetch(`/api/negocios/${negocioId}/categorias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rol: 'atributo' }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Error creando categoría'); return; }
    if (catInput) catInput.value = ''; await reloadCategorias();
  });

  ulCats?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]'); if (!btn) return;
    selectCategoria(Number(btn.getAttribute('data-cat')));
  });

  btnAdd?.addEventListener('click', async () => {
    if (!selCatId) return;
    const lines = (taItems?.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    const res = await fetch(`/api/categorias/${selCatId}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lines }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Error agregando ítems'); return; }
    if (taItems) taItems.value = ''; await reloadCategorias();
  });

  btnRen?.addEventListener('click', async () => {
    if (!selCatId) return;
    const cat = categoriasAttr.find((c) => c.id === selCatId);
    const nuevo = prompt('Nuevo nombre de la categoría:', cat?.nombre || ''); if (!nuevo || !nuevo.trim()) return;
    const res = await fetch(`/api/categorias/${selCatId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevo.trim() }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Error renombrando categoría'); return; }
    await reloadCategorias();
  });

  btnDel?.addEventListener('click', async () => {
    if (!selCatId) return;
    if (!confirm('¿Eliminar la categoría y todos sus ítems?')) return;
    const res = await fetch(`/api/categorias/${selCatId}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Error eliminando categoría'); return; }
    resetDetalle(); await reloadCategorias();
  });

  ulItems?.addEventListener('click', async (e) => {
    const btnToggle = e.target.closest('button[data-action="toggle-item"]');
    const btnDelete = e.target.closest('button[data-action="delete-item"]');

    if (btnToggle) {
      const id = Number(btnToggle.dataset.id);
      const cur = Number(btnToggle.dataset.estado) || 0;
      const nuevo = cur === 1 ? 0 : 1;
      const res = await fetch(`/api/categorias/${selCatId}/items/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: nuevo }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo cambiar el estado'); return; }
      await reloadCategorias();
    }

    if (btnDelete) {
      const id = Number(btnDelete.dataset.id);
      if (!confirm('¿Eliminar ítem?')) return;
      const res = await fetch(`/api/categorias/${selCatId}/items/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo eliminar'); return; }
      await reloadCategorias();
    }
  });

  // FILTRO
  formCatF?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = catFInput?.value.trim(); if (!nombre) return;
    const res = await fetch(`/api/negocios/${negocioId}/categorias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, rol: 'filtro' }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Error creando categoría de filtro'); return; }
    if (catFInput) catFInput.value = ''; await reloadCategorias();
  });

  ulCatsF?.addEventListener('click', async (e) => {
    const btnToggle = e.target.closest('.btn-f-toggle');
    const btnRename = e.target.closest('.btn-f-rename');
    const btnDelete = e.target.closest('.btn-f-delete');

    if (btnToggle) {
      const id = Number(btnToggle.dataset.id);
      const cat = categoriasFilt.find(c => c.id === id);
      const nuevo = Number(cat?.estado) === 1 ? 0 : 1;
      const r = await fetch(`/api/categorias/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: nuevo }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'No se pudo cambiar el estado'); return; }
      await reloadCategorias();
    }

    if (btnRename) {
      const id = Number(btnRename.dataset.id);
      const cat = categoriasFilt.find(c => c.id === id);
      const nuevo = prompt('Nuevo nombre del filtro:', cat?.nombre || ''); if (!nuevo || !nuevo.trim()) return;
      const r = await fetch(`/api/categorias/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevo.trim() }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'No se pudo renombrar'); return; }
      await reloadCategorias();
    }

    if (btnDelete) {
      const id = Number(btnDelete.dataset.id);
      if (!confirm('¿Eliminar esta categoría de filtro?')) return;
      const r = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'No se pudo eliminar'); return; }
      await reloadCategorias();
    }
  });
}
