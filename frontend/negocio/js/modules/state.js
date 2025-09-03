// Estado global centralizado
export const state = {
  // Fuente de datos normalizada que consume la UI del marketplace
  productos: [],

  // Filtros y orden
  filtro: {
    q: '',
    filtroCategoriaId: null,
    minPrice: null,
    maxPrice: null,
    inStock: false,
    minRating: 0,
    sortBy: 'relevance',

    // Opcional: si tu UI guarda selección global de ítems (categoria_items)
    // estos IDs se enviarán como ?items=... al endpoint /marketplace
    selectedItemIds: [],
  },

  // Categorías de rol='filtro' para las píldoras laterales
  filtroCategorias: [],

  // Paginación del grid
  pag: { size: 12, page: 1 },

  // Contexto de la vista/negocio
  slug: '',
  sesion: null,
  negocio: null,

  // Modo selección en la galería (para asignaciones masivas)
  gallery: { selectMode: false, selectedIds: new Set() },

  // Árbol de categorías (atributos e ítems) para render y ediciones
  categoriasTree: [],

  // Carrito simple en memoria (ajústalo a tu implementación)
  cart: [],

  // Preselección por tarjeta:
  // Map<productId, Map<catId, { itemId, itemLabel, catNombre }>>
  preselect: new Map(),
};
