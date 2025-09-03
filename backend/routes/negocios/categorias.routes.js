// backend/routes/negocios/categorias.routes.js
const express = require('express');
const router = express.Router();
const db = require('../../db');

// helpers
const toInt = (v, def = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* =====================================================================
 * GET /api/negocios/:negocioId/categorias
 * Lista categorías con sus ítems (activos e inactivos) + ROL
 * Soporta filtro por rol: ?rol=atributo|filtro
 * ===================================================================== */
router.get('/api/negocios/:negocioId/categorias', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const rol = (req.query.rol === 'atributo' || req.query.rol === 'filtro')
      ? req.query.rol
      : null;

    const params = [negocioId];
    let whereRol = '';
    if (rol) {
      whereRol = ' AND rol = ?';
      params.push(rol);
    }

    const [cats] = await db.query(
      `SELECT id, negocio_id, nombre, estado, orden, rol
       FROM categorias
       WHERE negocio_id = ?${whereRol}
       ORDER BY orden ASC, nombre ASC`,
      params
    );

    if (!cats.length) return res.json([]);

    // Para rol='filtro' no hay ítems; devolvemos vacío para ahorrar query.
    if (rol === 'filtro') {
      return res.json(cats.map(c => ({ ...c, items: [] })));
    }

    // Caso general (sin rol o rol='atributo'): traer ítems
    const catIds = cats.map(c => c.id);
    if (!catIds.length) return res.json([]);

    const [items] = await db.query(
      `SELECT id, categoria_id, label, valor, estado, orden
       FROM categoria_items
       WHERE categoria_id IN (?)
       ORDER BY orden ASC, label ASC`,
      [catIds]
    );

    const grouped = cats.map(c => ({
      ...c,
      // Nunca devolver ítems para categorías de rol 'filtro' (por si quedan residuos en BD)
      items: c.rol === 'filtro'
        ? []
        : items.filter(i => i.categoria_id === c.id)
    }));

    res.json(grouped);
  } catch (e) {
    console.error('❌ GET /categorias', e);
    res.status(500).json({ error: 'Error listando categorías' });
  }
});

/* =====================================================================
 * GET /api/negocios/:negocioId/categorias/tree
 * Árbol categoría → ítems (incluye rol).
 * Devuelve TODAS las categorías; las de rol='filtro' vendrán sin ítems.
 * ===================================================================== */
router.get('/api/negocios/:negocioId/categorias/tree', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const [rows] = await db.query(
      `SELECT c.id  AS cat_id, c.nombre AS cat_nombre, c.estado AS cat_estado,
              c.rol AS cat_rol, c.orden AS cat_orden,
              i.id  AS item_id, i.label AS item_label,
              i.valor AS item_valor, i.estado AS item_estado, i.orden AS item_orden
       FROM categorias c
       LEFT JOIN categoria_items i ON i.categoria_id = c.id
       WHERE c.negocio_id = ?
       ORDER BY c.orden, c.nombre, i.orden, i.label`,
      [negocioId]
    );

    if (!rows.length) return res.json([]);

    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.cat_id)) {
        map.set(r.cat_id, {
          id: r.cat_id,
          nombre: r.cat_nombre,
          estado: r.cat_estado,
          rol: r.cat_rol,
          orden: r.cat_orden,
          items: []
        });
      }
      // Si la categoría es de filtro, no agregamos ítems
      if (r.cat_rol === 'filtro') continue;

      if (r.item_id) {
        map.get(r.cat_id).items.push({
          id: r.item_id,
          label: r.item_label,
          valor: r.item_valor,
          estado: r.item_estado,
          orden: r.item_orden
        });
      }
    }

    res.json([...map.values()]);
  } catch (e) {
    console.error('❌ GET /categorias/tree', e);
    res.status(500).json({ error: 'Error listando categorías (árbol)' });
  }
});

/* =====================================================================
 * POST /api/negocios/:negocioId/categorias   { nombre, rol? }
 * Crea categoría (estado=1, rol='atributo' por defecto)
 * ===================================================================== */
router.post('/api/negocios/:negocioId/categorias', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const { nombre } = req.body || {};
    let { rol } = req.body || {};

    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'nombre es requerido' });
    }

    rol = (rol === 'filtro' || rol === 'atributo') ? rol : 'atributo';

    const [ins] = await db.query(
      'INSERT INTO categorias (negocio_id, nombre, estado, orden, rol) VALUES (?, ?, 1, 0, ?)',
      [negocioId, String(nombre).trim(), rol]
    );

    res.status(201).json({
      id: ins.insertId,
      negocio_id: negocioId,
      nombre: String(nombre).trim(),
      estado: 1,
      orden: 0,
      rol,
      items: []
    });
  } catch (e) {
    console.error('❌ POST /categorias', e);
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'La categoría ya existe' });
    }
    res.status(500).json({ error: 'Error creando categoría' });
  }
});

/* =====================================================================
 * POST /api/categorias/:categoriaId/items
 * Agrega ítems (bulk o unitario) con estado=1 por defecto
 * (Prohibido si la categoría es rol='filtro')
 * ===================================================================== */
router.post('/api/categorias/:categoriaId/items', async (req, res) => {
  try {
    const categoriaId = toInt(req.params.categoriaId);
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId inválido' });

    // ❗ No permitir ítems en categorías de rol 'filtro'
    const [[cat]] = await db.query('SELECT id, rol FROM categorias WHERE id = ?', [categoriaId]);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (cat.rol === 'filtro') {
      return res.status(400).json({ error: 'Las categorías con rol "filtro" no aceptan ítems.' });
    }

    const { items, label, valor } = req.body || {};
    let payload = [];

    if (Array.isArray(items) && items.length) {
      payload = items
        .map(x => String(x).trim())
        .filter(Boolean)
        .map(lbl => [categoriaId, lbl, null, 1, 0]);
    } else if (label) {
      payload = [[categoriaId, String(label).trim(), valor ? String(valor).trim() : null, 1, 0]];
    } else {
      return res.status(400).json({ error: 'Debe enviar items[] o label' });
    }

    const [ins] = await db.query(
      'INSERT INTO categoria_items (categoria_id, label, valor, estado, orden) VALUES ?',
      [payload]
    );

    const out = payload.map((p, idx) => ({
      id: ins.insertId + idx,
      categoria_id: p[0],
      label: p[1],
      valor: p[2],
      estado: p[3],
      orden: p[4],
    }));

    res.status(201).json({ ok: true, items: out });
  } catch (e) {
    console.error('❌ POST /categorias/:id/items', e);
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Alguno de los ítems ya existe en la categoría' });
    }
    res.status(500).json({ error: 'Error agregando ítems' });
  }
});

/* =====================================================================
 * PATCH /api/categorias/:categoriaId
 * { nombre?, estado?, orden?, rol? }
 * - Si estado pasa a 0 -> limpia relaciones
 * - Si rol pasa a 'filtro' -> borra ítems y relaciones de esa categoría
 * ===================================================================== */
router.patch('/api/categorias/:categoriaId', async (req, res) => {
  try {
    const categoriaId = toInt(req.params.categoriaId);
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId inválido' });

    // existencia + datos actuales
    const [rows] = await db.query(
      `SELECT id, negocio_id, estado, rol FROM categorias WHERE id = ?`,
      [categoriaId]
    );
    const cat = rows && rows[0];
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });

    const fields = [];
    const values = [];
    let estadoWasProvided = false;
    let newEstado = null;
    let rolWasProvided = false;
    let newRol = null;

    if (typeof req.body.nombre === 'string' && req.body.nombre.trim()) {
      fields.push('nombre = ?'); values.push(req.body.nombre.trim());
    }
    if (req.body.estado === 0 || req.body.estado === 1) {
      fields.push('estado = ?'); values.push(req.body.estado);
      estadoWasProvided = true;
      newEstado = Number(req.body.estado);
    }
    if (Number.isFinite(Number(req.body.orden))) {
      fields.push('orden = ?'); values.push(Number(req.body.orden));
    }
    if (req.body.rol === 'atributo' || req.body.rol === 'filtro') {
      fields.push('rol = ?'); values.push(req.body.rol);
      rolWasProvided = true;
      newRol = req.body.rol;
    }

    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(categoriaId);
    const [upd] = await db.query(`UPDATE categorias SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!upd.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });

    // Si la categoría se desactiva, borra TODAS sus relaciones con imágenes
    if (estadoWasProvided && newEstado === 0) {
      await db.query('DELETE ic FROM imagen_categoria ic WHERE ic.categoria_id = ?', [categoriaId]);

      const [its] = await db.query('SELECT id FROM categoria_items WHERE categoria_id = ?', [categoriaId]);
      if (its.length) {
        const itemIds = its.map(r => r.id);
        await db.query(
          `DELETE ii FROM imagen_item ii WHERE ii.item_id IN (${itemIds.map(() => '?').join(',')})`,
          itemIds
        );
      }
    }

    // Si se cambia a rol='filtro', los ítems no aplican: borra ítems y relaciones
    if (rolWasProvided && newRol === 'filtro') {
      const [its] = await db.query('SELECT id FROM categoria_items WHERE categoria_id = ?', [categoriaId]);
      if (its.length) {
        const itemIds = its.map(r => r.id);
        await db.query(
          `DELETE ii FROM imagen_item ii WHERE ii.item_id IN (${itemIds.map(() => '?').join(',')})`,
          itemIds
        );
      }
      await db.query('DELETE FROM categoria_items WHERE categoria_id = ?', [categoriaId]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ PATCH /categorias/:id', e);
    res.status(500).json({ error: 'Error actualizando categoría' });
  }
});

/* =====================================================================
 * PATCH /api/categorias/:categoriaId/items/:itemId
 * Actualiza y, si se desactiva (estado=0), limpia relaciones del ítem
 * (Bloquea updates si el padre es rol='filtro')
 * ===================================================================== */
router.patch('/api/categorias/:categoriaId/items/:itemId', async (req, res) => {
  try {
    const categoriaId = toInt(req.params.categoriaId);
    const itemId = toInt(req.params.itemId);
    if (!categoriaId || !itemId) return res.status(400).json({ error: 'Parámetros inválidos' });

    // ❗ Bloquear edición si la categoría es de rol 'filtro'
    const [[cat]] = await db.query('SELECT id, rol FROM categorias WHERE id = ?', [categoriaId]);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (cat.rol === 'filtro') {
      return res.status(400).json({ error: 'La categoría es de rol "filtro"; los ítems no aplican.' });
    }

    const fields = [];
    const values = [];
    let estadoWasProvided = false;
    let newEstado = null;

    if (typeof req.body.label === 'string' && req.body.label.trim()) {
      fields.push('label = ?'); values.push(req.body.label.trim());
    }
    if (typeof req.body.valor === 'string') {
      fields.push('valor = ?'); values.push(req.body.valor.trim());
    }
    if (req.body.estado === 0 || req.body.estado === 1) {
      fields.push('estado = ?'); values.push(req.body.estado);
      estadoWasProvided = true;
      newEstado = Number(req.body.estado);
    }
    if (Number.isFinite(Number(req.body.orden))) {
      fields.push('orden = ?'); values.push(Number(req.body.orden));
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(itemId, categoriaId);

    const [upd] = await db.query(
      `UPDATE categoria_items SET ${fields.join(', ')} WHERE id = ? AND categoria_id = ?`,
      values
    );
    if (!upd.affectedRows) return res.status(404).json({ error: 'Ítem no encontrado' });

    if (estadoWasProvided && newEstado === 0) {
      await db.query('DELETE ii FROM imagen_item ii WHERE ii.item_id = ?', [itemId]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ PATCH /categorias/:id/items/:itemId', e);
    res.status(500).json({ error: 'Error actualizando ítem' });
  }
});

/* =====================================================================
 * DELETE /api/categorias/:categoriaId
 * Elimina la categoría, sus ítems y todas las relaciones con imágenes
 * ===================================================================== */
router.delete('/api/categorias/:categoriaId', async (req, res) => {
  try {
    const categoriaId = toInt(req.params.categoriaId);
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId inválido' });

    await db.query('DELETE ic FROM imagen_categoria ic WHERE ic.categoria_id = ?', [categoriaId]);

    const [its] = await db.query('SELECT id FROM categoria_items WHERE categoria_id = ?', [categoriaId]);
    if (its.length) {
      const itemIds = its.map(r => r.id);
      await db.query(
        `DELETE ii FROM imagen_item ii WHERE ii.item_id IN (${itemIds.map(() => '?').join(',')})`,
        itemIds
      );
    }

    await db.query('DELETE FROM categoria_items WHERE categoria_id = ?', [categoriaId]);
    const [del] = await db.query('DELETE FROM categorias WHERE id = ?', [categoriaId]);
    if (!del.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ DELETE /categorias/:id', e);
    res.status(500).json({ error: 'Error eliminando categoría' });
  }
});

/* =====================================================================
 * DELETE /api/categorias/:categoriaId/items/:itemId
 * Elimina el ítem y sus relaciones con imágenes
 * ===================================================================== */
router.delete('/api/categorias/:categoriaId/items/:itemId', async (req, res) => {
  try {
    const categoriaId = toInt(req.params.categoriaId);
    const itemId = toInt(req.params.itemId);
    if (!categoriaId || !itemId) return res.status(400).json({ error: 'Parámetros inválidos' });

    await db.query('DELETE ii FROM imagen_item ii WHERE ii.item_id = ?', [itemId]);

    const [del] = await db.query(
      'DELETE FROM categoria_items WHERE id = ? AND categoria_id = ?',
      [itemId, categoriaId]
    );
    if (!del.affectedRows) return res.status(404).json({ error: 'Ítem no encontrado' });

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ DELETE /categorias/:id/items/:itemId', e);
    res.status(500).json({ error: 'Error eliminando ítem' });
  }
});

module.exports = router;
