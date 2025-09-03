// frontend/negocio/js/galeria.js
// Módulo de galería para el marketplace (modal #galeriaModal)

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

async function apiJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    ...opts
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiFORM(url, formData, opts = {}) {
  const res = await fetch(url, { method: 'POST', body: formData, ...(opts||{}) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Inicializa el modal de galería.
 * ctx = { negocio: {id}, refreshMarketplace: fn }
 */
export function initGaleriaModal(ctx) {
  const negocioId = ctx?.negocio?.id;
  if (!negocioId) return;

  // Refs UI (galería)
  const modal       = $('#galeriaModal');
  const grid        = $('#gridGaleriaModal');
  const inputFiles  = $('#filesGaleriaModal');
  const btnSubir    = $('#btnSubirGaleriaModal');
  const switchSel   = $('#switchSeleccionar');
  const selCountLbl = $('#selCountLabel');
  const btnOpenAsig = $('#btnOpenAsignar');
  const btnClearCfg = $('#btnClearAsignaciones');
  const subTitle    = $('#galeriaSubtitulo');

  // Refs UI (asignar categorías/atributos)
  const asignarModal   = $('#asignarModal');
  const assignTreeHost = $('#assignTree');
  const assignCountLbl = $('#assignCount');
  const btnAssignApply = $('#btnAssignApply');
  const btnAssignClear = $('#btnAssignClear');

  let seleccionActiva = false;
  let selectedIds = new Set();
  let cacheImagenes = [];

  // -----------------------------------------
  // Helpers selección
  // -----------------------------------------
  async function setSeleccionActiva(on) {
    seleccionActiva = !!on;
    if (switchSel) switchSel.checked = seleccionActiva;
    grid.classList.toggle('is-selecting', seleccionActiva);
    selectedIds.clear();
    updateToolbarFromSelection();
    await renderImagenes(); // re-pinta tarjetas con/ sin checkboxes
  }

  function toggleSelect(id) {
    if (!seleccionActiva) return;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateToolbarFromSelection();
    const card = grid.querySelector(`[data-id="${id}"] .card`);
    if (card) card.classList.toggle('border-primary', selectedIds.has(id));
  }

  function updateToolbarFromSelection() {
    if (selCountLbl) selCountLbl.textContent = `${selectedIds.size} seleccionadas`;
    if (btnOpenAsig) btnOpenAsig.disabled = selectedIds.size === 0;
    if (btnClearCfg) btnClearCfg.disabled = selectedIds.size === 0;
  }

  // -----------------------------------------
  // Tarjeta de imagen
  // -----------------------------------------
  function cardTpl(img) {
    const activo = Number(img.estado) === 1;

    // Separar Filtros (rol='filtro') de Atributos (resto)
    const cats = Array.isArray(img.categorias) ? img.categorias : [];
    const filtros   = cats.filter(c => String(c.rol) === 'filtro');
    const atributos = cats.filter(c => String(c.rol) !== 'filtro');

    const filtrosHTML = filtros.length
      ? `<div class="mb-1">
           ${filtros.map(c => `<span class="badge bg-secondary me-1 mb-1">${c.nombre || '—'}</span>`).join('')}
         </div>`
      : '';

    const atributosHTML = atributos
      .map(c => {
        const its = (c.items||[])
          .map(i => `<span class="badge bg-info text-dark me-1 mb-1">${i.label}</span>`)
          .join('');
        // Para atributos sí mostramos "Sin ítems" si corresponde
        return its
          ? `<div class="mb-1"><strong>${c.nombre || '—'}:</strong> ${its}</div>`
          : `<div class="mb-1 text-secondary small"><strong>${c.nombre || '—'}:</strong> Sin ítems</div>`;
      })
      .join('');

    const catsHTML = `${filtrosHTML}${atributosHTML}`;

    return `
      <div class="col">
        <div class="card shadow-sm h-100" data-id="${img.id}">
          <div class="position-relative">
            <img src="${img.url}" class="card-img-top" style="aspect-ratio:4/5;object-fit:cover" alt="">
            <!-- Badge dentro de la imagen (toggle estado) -->
            <span
              class="badge ${activo ? 'text-bg-success' : 'text-bg-secondary'} position-absolute top-0 start-0 m-2 btn-toggle"
              data-id="${img.id}"
              title="Cambiar estado"
              style="cursor:pointer;"
            >
              ${activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small text-truncate">${img.titulo || 'Sin título'}</span>
              ${seleccionActiva
                ? `<div class="form-check">
                     <input class="form-check-input sel-chk" type="checkbox" data-id="${img.id}" ${selectedIds.has(img.id) ? 'checked' : ''}>
                   </div>`
                : ''
              }
            </div>
            ${catsHTML || '<div class="small text-secondary">Sin categorías/atributos</div>'}
          </div>

          <div class="card-footer bg-white d-flex justify-content-between gap-1">
            <button class="btn btn-sm btn-outline-secondary btn-toggle" data-id="${img.id}" title="Activar/Desactivar">
              <i class="bi bi-power"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-del" data-id="${img.id}" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async function fetchImagenes() {
    const data = await apiJSON(`/api/negocios/${negocioId}/imagenes`);
    cacheImagenes = Array.isArray(data) ? data : [];
    return cacheImagenes;
  }

  async function renderImagenes() {
    grid.innerHTML = `<div class="col-12 text-center text-secondary py-4">Cargando…</div>`;
    const data = await fetchImagenes();
    if (!data.length) {
      grid.innerHTML = `<div class="col-12 text-center text-secondary py-4">Sin imágenes</div>`;
      return;
    }
    grid.innerHTML = data.map(cardTpl).join('');

    // checkboxes (solo modo selección)
    $$('.sel-chk', grid).forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(chk.getAttribute('data-id'));
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateToolbarFromSelection();
        const card = grid.querySelector(`[data-id="${id}"] .card`);
        if (card) card.classList.toggle('border-primary', selectedIds.has(id));
      });
    });

    // toggle estado (badge ó botón)
    $$('.btn-toggle', grid).forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const cur = cacheImagenes.find(x => x.id === id)?.estado ? 1 : 0;
        const nuevo = cur === 1 ? 0 : 1;
        await apiJSON(`/api/negocios/${negocioId}/imagenes/${id}/estado`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: nuevo })
        });
        await renderImagenes();
        await ctx.refreshMarketplace?.();
      });
    });

    // delete
    $$('.btn-del', grid).forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        if (!confirm('¿Eliminar imagen?')) return;
        await apiJSON(`/api/negocios/${negocioId}/imagenes/${id}`, { method: 'DELETE' });
        await renderImagenes();
        await ctx.refreshMarketplace?.();
      });
    });
  }

  // -----------------------------------------
  // Asignaciones  (árbol separado por rol)
  // -----------------------------------------

  /**
   * Construye el árbol en dos bloques:
   *  - Categorías (para filtrar)  -> SOLO categorías con rol='filtro' (sin ítems)
   *  - Atributos                  -> categorías con rol='atributo' y sus ítems activos
   */
  function renderAssignTree(tree, preset = null) {
    const catsFiltro = tree.filter(c => Number(c.estado) === 1 && String(c.rol) === 'filtro');
    const catsAttr   = tree.filter(c => Number(c.estado) === 1 && String(c.rol) !== 'filtro');

    // Bloque: Categorías (para filtrar)
    const htmlFiltro = `
      <div class="mb-3">
        <div class="fw-semibold mb-2">Categorías (para filtrar)</div>
        ${
          catsFiltro.length
            ? catsFiltro.map(c => `
                <label class="form-check d-block">
                  <input class="form-check-input chk-cat" type="checkbox" value="${c.id}">
                  <span class="form-check-label">${c.nombre}</span>
                </label>
              `).join('')
            : `<div class="text-secondary small">No hay categorías creadas.</div>`
        }
      </div>
    `;

    // Bloque: Atributos (con ítems)
    const htmlAtributos = `
      <div class="mb-2">
        <div class="fw-semibold mb-2">Atributos</div>
        ${
          catsAttr.length
            ? catsAttr.map(c => `
                <div class="mb-2">
                  <div class="mb-1">${c.nombre}</div>
                  <div class="ms-3">
                    ${
                      (c.items || [])
                        .filter(i => Number(i.estado) === 1)
                        .map(i => `
                          <label class="form-check d-inline-block me-3 mb-1">
                            <!-- 🔧 IMPORTANTE: usar el id de la CATEGORÍA PADRE -->
                            <input class="form-check-input chk-item" type="checkbox" value="${i.id}" data-cat="${c.id}">
                            <span class="form-check-label">${i.label}</span>
                          </label>
                        `).join('') || `<span class="text-secondary small">Sin ítems</span>`
                    }
                  </div>
                </div>
              `).join('')
            : `<div class="text-secondary small">No hay atributos creados.</div>`
        }
      </div>
    `;

    assignTreeHost.innerHTML = htmlFiltro + htmlAtributos;

    // ➜ Si marco un ítem manualmente, marcar también su categoría padre
    $$('.chk-item', assignTreeHost).forEach(chk => {
      chk.addEventListener('change', () => {
        if (!chk.checked) return;
        const cid = Number(chk.getAttribute('data-cat'));
        const catChk = $(`.chk-cat[value="${cid}"]`, assignTreeHost);
        if (catChk) catChk.checked = true;
      });
    });

    // Preselección si corresponde (cuando se edita una sola imagen)
    if (preset) {
      if (preset.catIds?.size) {
        $$('.chk-cat', assignTreeHost).forEach(chk => {
          const cid = Number(chk.value);
          if (preset.catIds.has(cid)) chk.checked = true;
        });
      }
      if (preset.itemIds?.size) {
        $$('.chk-item', assignTreeHost).forEach(chk => {
          const iid = Number(chk.value);
          if (preset.itemIds.has(iid)) chk.checked = true;
        });
        // Marca la categoría padre si hay ítems marcados
        $$('.chk-item:checked', assignTreeHost).forEach(it => {
          const cid = Number(it.getAttribute('data-cat'));
          const catChk = $(`.chk-cat[value="${cid}"]`, assignTreeHost);
          if (catChk) catChk.checked = true;
        });
      }
    }
  }

  /**
   * Renderiza el árbol y PRE-SELECCIONA cuando corresponde
   * preset = { catIds:Set, itemIds:Set }  (opcional)
   */
  async function loadAssignTree(preset = null) {
    assignTreeHost.innerHTML = `<div class="text-secondary small">Cargando categorías…</div>`;
    // Este endpoint incluye "rol" en cada categoría
    const tree = await apiJSON(`/api/negocios/${negocioId}/categorias/tree`);
    renderAssignTree(Array.isArray(tree) ? tree : [], preset);
  }

  async function applyAssignments({ mode = 'add' } = {}) {
    if (!selectedIds.size) return;

    const catIdsChecked  = new Set($$('.chk-cat:checked', assignTreeHost).map(x => Number(x.value)));
    const itemIds        = $$('.chk-item:checked', assignTreeHost).map(x => Number(x.value));

    // ➜ Garantiza que las categorías padre de los ítems vayan incluidas
    $$('.chk-item:checked', assignTreeHost).forEach(chk => {
      const cid = Number(chk.getAttribute('data-cat'));
      if (cid) catIdsChecked.add(cid);
    });

    if (catIdsChecked.size === 0 && itemIds.length === 0) {
      alert('Selecciona al menos una categoría o ítem.');
      return;
    }

    await apiJSON(`/api/negocios/${negocioId}/imagenes/asignaciones`, {
      method: 'POST',
      body: JSON.stringify({
        imagen_ids: [...selectedIds],
        categoria_ids: [...catIdsChecked],
        item_ids: itemIds,
        mode
      })
    });

    bootstrap.Modal.getInstance(asignarModal)?.hide();
    await renderImagenes();
    await ctx.refreshMarketplace?.();
  }

  async function clearAssignments() {
    if (!selectedIds.size) return;
    if (!confirm('¿Quitar TODA la configuración (categorías e ítems) de las imágenes seleccionadas?')) return;

    await apiJSON(`/api/negocios/${negocioId}/imagenes/asignaciones/clear`, {
      method: 'POST',
      body: JSON.stringify({ imagen_ids: [...selectedIds] })
    });
    await renderImagenes();
    await ctx.refreshMarketplace?.();
  }

  // -----------------------------------------
  // Subida
  // -----------------------------------------
  btnSubir?.addEventListener('click', async () => {
    const files = inputFiles.files;
    if (!files || !files.length) { alert('Selecciona imágenes primero.'); return; }
    btnSubir.disabled = true;
    try {
      const fd = new FormData();
      [...files].forEach(f => fd.append('files', f));
      await apiFORM(`/api/negocios/${negocioId}/imagenes`, fd);
      inputFiles.value = '';
      await renderImagenes();
      await ctx.refreshMarketplace?.();
    } catch (e) {
      alert(`Error subiendo: ${e.message}`);
    } finally {
      btnSubir.disabled = false;
    }
  });

  // -----------------------------------------
  // Toolbar de selección
  // -----------------------------------------
  switchSel?.addEventListener('change', () => setSeleccionActiva(switchSel.checked));

  // Permite seleccionar por click en cualquier parte de la tarjeta (si la selección está activa)
  grid.addEventListener('click', (e) => {
    if (!seleccionActiva) return;
    if (e.target.closest('.btn-toggle, .btn-del, .sel-chk')) return;
    const card = e.target.closest('.card');
    if (!card) return;
    const id = Number(card.getAttribute('data-id'));
    if (!id) return;
    toggleSelect(id);
    const chk = card.querySelector('.sel-chk');
    if (chk) chk.checked = selectedIds.has(id);
    card.classList.toggle('border-primary', selectedIds.has(id));
  });

  btnOpenAsig?.addEventListener('click', async () => {
    if (!selectedIds.size) return;

    if (assignCountLbl) assignCountLbl.textContent = selectedIds.size;

    // Si hay una sola imagen seleccionada, preparamos sus selecciones
    let preset = null;
    if (selectedIds.size === 1) {
      const selId = [...selectedIds][0];
      const img = cacheImagenes.find(x => x.id === selId);
      if (img) {
        const catIds  = new Set();
        const itemIds = new Set();
        (img.categorias || []).forEach(c => {
          if (c && Number.isFinite(c.id)) catIds.add(Number(c.id));
          (c.items || []).forEach(i => {
            if (i && Number.isFinite(i.id)) itemIds.add(Number(i.id));
          });
        });
        preset = { catIds, itemIds };
      }
    }

    await loadAssignTree(preset);
    new bootstrap.Modal(asignarModal).show();
  });

  btnClearCfg?.addEventListener('click', clearAssignments);

  btnAssignApply?.addEventListener('click', async () => {
    const mode = ($('#rbAssignReplace')?.checked) ? 'replace' : 'add';
    await applyAssignments({ mode });
  });
  btnAssignClear?.addEventListener('click', clearAssignments);

  // -----------------------------------------
  // Lifecycle modal
  // -----------------------------------------
  let loaded = false;
  modal?.addEventListener('show.bs.modal', async () => {
    if (subTitle) subTitle.textContent = `${ctx.negocio?.razon_social || '—'} · ID ${negocioId}`;
    if (!loaded) {
      await renderImagenes();
      loaded = true;
    } else {
      await renderImagenes();
    }
    setSeleccionActiva(false);
  });

  modal?.addEventListener('hidden.bs.modal', () => {
    inputFiles.value = '';
    setSeleccionActiva(false);
  });
}
