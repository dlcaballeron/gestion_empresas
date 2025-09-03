// Estado global centralizado
export const state = {
  productos: [],
  filtro: {
    q: '',
    filtroCategoriaId: null,
    minPrice: null,
    maxPrice: null,
    inStock: false,
    minRating: 0,
    sortBy: 'relevance',
  },
  filtroCategorias: [],
  pag: { size: 9, page: 1 },
  slug: '',
  sesion: null,
  negocio: null,
  gallery: { selectMode: false, selectedIds: new Set() },
  categoriasTree: [],
  cart: [],
  // Preselección por tarjeta (pid -> Map(catId -> {itemId, itemLabel, catNombre}))
  preselect: new Map(),
};
