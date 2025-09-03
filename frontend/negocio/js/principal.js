// frontend/negocio/js/principal.js
console.log('[principal] módulo cargado');

import { state } from './modules/state.js';
// import { $ } from './modules/utils.js'; // ← ya no se usa

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
  // Nota: ya no llamamos directo a loadProductosActivos para el primer render,
  // pero lo dejamos importado por si otros módulos lo usan.
  loadProductosActivos,
} from './modules/api.js';

// -------------------------
// Carrito
// -------------------------
import {
  ensureCartUI,
  loadCartFromStorage,
  updateCartBadge,
  bindCartHeaderButton
} from './modules/cart.js';

// -------------------------
// Marketplace (UI + helpers)
// -------------------------
import {
  buildCategoryPills,
  applyFilters,
  wireFiltersAndControls,
  // refreshMarketplaceFromGaleria   // ❌ ya no usamos la galería para pintar el grid
  refreshMarketplaceFromProductos,   // ✅ feed de productos (con filtros/atributos) normalizado
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

    // Checkout (no bloquear si falla)
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

    /* =========================================================
     * 6) Panel administrador (offcanvas)
     * =======================================================*/
    await initAdminPanel(state.negocio);

    // Módulo de Productos (admin → CRUD)
    await initProductosAdmin(state.negocio, {
      onChange: async () => {
        // Si el admin crea/edita algo, refresca el marketplace desde productos
        await refreshMarketplaceFromProductos();
      }
    });

    // Galería (subir imágenes y asignar categorías/atributos)
    // Al cerrar, refrescamos SIEMPRE desde productos
    initGaleriaModal({
      negocio: state.negocio,
      refreshMarketplace: async () => {
        await refreshMarketplaceFromProductos();
      },
    });

    /* =========================================================
     * 7) Datos base de categorías (por si otros módulos los requieren)
     *    - Estas llamadas también las hace refreshMarketplaceFromProductos(),
     *      pero se mantienen para compatibilidad y porque son idempotentes.
     * =======================================================*/
    await preloadCategoriasTree();  // árbol completo (atributos + filtro)
    await loadFiltroCategorias();   // lista de categorías rol='filtro' para las pills

    /* =========================================================
     * 8) 🔴 PRIMER RENDER DEL MARKETPLACE
     *    Usar SIEMPRE el feed de PRODUCTOS (no la galería).
     *    Esta función:
     *      - precarga categorías si hace falta,
     *      - llama /api/negocios/:id/marketplace,
     *      - normaliza items → state.productos (con filtros + atributos),
     *      - arma las pills y hace applyFilters().
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
     * 10) (Opcional) Refresco manual simple:
     *      Si quieres conservar este flujo manual, lo dejamos como referencia.
     *      NOTA: refreshMarketplaceFromProductos() ya hizo todo esto.
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
