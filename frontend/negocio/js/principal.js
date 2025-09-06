// frontend/negocio/js/principal.js
console.log('[principal] módulo cargado');

import { state } from './modules/state.js';

// -------------------------
// Módulo de productos (admin)
// -------------------------
import { initProductosAdmin } from './modules/products.js';

// -------------------------
// APIs usadas aquí
// -------------------------
import {
  loadNegocio,
  preloadCategoriasTree,
  loadFiltroCategorias,
  // Dejado disponible para otros módulos si lo necesitan
  loadProductosActivos,
} from './modules/api.js';

// -------------------------
// Carrito
// -------------------------
import {
  ensureCartUI,
  loadCartFromStorage,
  updateCartBadge,
  bindCartHeaderButton,
} from './modules/cart.js';

// -------------------------
// Marketplace (UI + helpers)
// -------------------------
import {
  buildCategoryPills,
  applyFilters,
  wireFiltersAndControls,
  refreshMarketplaceFromProductos,   // feed de productos (con filtros/atributos) normalizado
  rebuildPillsAndRefresh,
} from './modules/marketplace.js';

// -------------------------
// Categorías (modal de gestión)
// -------------------------
import { initCategoriasModal } from './modules/categorias-modal.js';

// -------------------------
// Header (UI)
// -------------------------
import { bindHeaderEvents, paintHeader } from './modules/header.js';

// -------------------------
// Checkout
// -------------------------
import { initCheckout } from './modules/checkout.js';

// -------------------------
// Layout + Admin panel + Galería
// -------------------------
import { loadLayout } from './includes.js';
import { initAdminPanel } from './admin-panel.js';
import { initGaleriaModal } from './galeria.js';

async function bootstrap() {
  try {
    /* =========================================================
     * 1) Cargar layout (header/footer)
     * =======================================================*/
    try {
      await loadLayout();
    } catch (err) {
      console.error('[principal] loadLayout() falló:', err);
    }

    /* =========================================================
     * 2) Obtener slug desde /negocio/:slug/principal.html
     * =======================================================*/
    const m = window.location.pathname.match(/^\/negocio\/([^/]+)\/principal\.html$/);
    state.slug = m ? m[1] : '';

    /* =========================================================
     * 3) Validar sesión requerida (usuarioNegocio)
     * =======================================================*/
    state.sesion = JSON.parse(localStorage.getItem('usuarioNegocio') || 'null');
    if (!state.sesion) {
      location.href = `/negocio/${encodeURIComponent(state.slug)}`;
      return;
    }

    /* =========================================================
     * 4) Carrito (UI + storage) y header
     * =======================================================*/
    ensureCartUI();
    loadCartFromStorage();
    updateCartBadge();
    bindCartHeaderButton();

    // Header (eventos)
    bindHeaderEvents();

    // Checkout (no bloquear si falla). El módulo se encargará de:
    // - escuchar #btnCartContinue
    // - escuchar cart:changed
    // - pintar el modal de checkout
    try {
      initCheckout();
    } catch (e) {
      console.warn('[principal] initCheckout no disponible:', e);
    }

    /* =========================================================
     * 5) Cargar negocio por slug y pintar header
     * =======================================================*/
    const negocio = await loadNegocio();
    if (!negocio) return;
    state.negocio = negocio;

    try {
      paintHeader(state.negocio, state.sesion);
    } catch (e) {
      console.error('[principal] paintHeader() lanzó error:', e);
    }

    // Emitimos contexto para que checkout.js pueda preconfigurar (opcional)
    try {
      document.dispatchEvent(new CustomEvent('checkout:context', {
        detail: { negocio: state.negocio, sesion: state.sesion }
      }));
    } catch (e) {
      console.debug('[principal] checkout:context event no crítico:', e);
    }

    /* =========================================================
     * 6) Panel administrador (offcanvas)
     *    Aquí se inicializan los listeners que abren/cargan
     *    el modal de “Productos” (admin-panel.js se encarga).
     * =======================================================*/
    await initAdminPanel(state.negocio);

    // (Opcional) Pre-montaje: si el partial del modal ya está inyectado
    // y existe #productosAdminMount, montar de una vez el módulo.
    // Si no existe aún, no pasa nada (admin-panel hará lazy-init al abrir).
    try {
      await tryPreMountProductosAdminModal();
    } catch (e) {
      console.debug('[principal] pre-mount productos opcional falló:', e?.message || e);
    }

    // Galería (subir imágenes y asignar categorías/atributos)
    // Al cerrar, refrescamos SIEMPRE desde productos
    initGaleriaModal({
      negocio: state.negocio,
      refreshMarketplace: async () => {
        await refreshMarketplaceFromProductos();
      },
    });

    /* =========================================================
     * 7) Datos base de categorías (idempotentes)
     * =======================================================*/
    await preloadCategoriasTree();  // árbol completo (atributos + filtro)
    await loadFiltroCategorias();   // lista de categorías rol='filtro' para las pills

    /* =========================================================
     * 8) 🔴 PRIMER RENDER DEL MARKETPLACE
     *    Usa SIEMPRE el feed de PRODUCTOS (no la galería).
     * =======================================================*/
    await refreshMarketplaceFromProductos();

    // Asegurar primera página y wire de controles (buscar/ordenar/aplicar/limpiar/cargar más)
    state.pag.page = 1;
    wireFiltersAndControls();

    // (Opcional) reconstruir pills tras editar categorías desde otro módulo:
    window.__rebuildPillsAndRefresh = rebuildPillsAndRefresh;

    /* =========================================================
     * 9) Modal de categorías (gestión)
     * =======================================================*/
    initCategoriasModal();

    /* =========================================================
     * 10) (Referencia) Flujo manual antiguo
     * =======================================================*/
    // await loadProductosActivos({
    //   q: state.filtro.q || '',
    //   categoriaId: state.filtro.filtroCategoriaId ?? null,
    //   page: 1,
    //   size: 200,
    // });
    // buildCategoryPills();
    // applyFilters();

  } catch (e) {
    console.error('[principal] bootstrap() error fatal:', e);
    const grid = document.querySelector('#grid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">
            Ocurrió un error cargando la página. Revisa la consola del navegador.
          </div>
        </div>`;
    }
  }
}

bootstrap();

/* =========================================================
 * Helper opcional para pre-montar productos en el modal
 * (solo si ya existe el partial con #productosAdminMount).
 * Evita duplicar gracias a la verificación interna de products.js.
 * =======================================================*/
async function tryPreMountProductosAdminModal() {
  const mount = document.querySelector('#productosAdminMount');
  if (!mount) return; // el admin-panel hará lazy-init cuando abras el modal
  // Montamos con onChange para refrescar el marketplace al guardar cambios
  await initProductosAdmin(state.negocio, {
    mountSelector: '#productosAdminMount',
    onChange: async () => {
      await refreshMarketplaceFromProductos();
    },
  });
}
