// backend/routes/negocios/productos.routes.js
// Productos basados en imágenes + recargos por ítems (atributos) y feed para el marketplace.

const express = require('express');
const router = express.Router();
const db = require('../../db');

/* --------------------------- Helpers --------------------------- */
// --- pon esto una sola vez, cerca de los imports ---
const PRICE_MODE = process.env.PRICE_MODE || 'global'; // 'global' | 'product' | 'product_over_global'


const toInt = (v, def = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const toMoney = (v, def = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const trimOrNull = (s) => {
  const v = (s ?? '').toString().trim();
  return v.length ? v : null;
};

async function getOne(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows?.[0] || null;
}

async function assertImagenOwnership(negocioId, imagenId) {
  return await getOne(
    `SELECT id, negocio_id, url, titulo, estado
       FROM imagenes
      WHERE id = ? AND negocio_id = ?`,
    [imagenId, negocioId]
  );
}

/* ============================= LISTAR ============================= */
// GET /api/negocios/:negocioId/productos
router.get('/api/negocios/:negocioId/productos', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const [rows] = await db.query(
      `SELECT
         p.id, p.negocio_id, p.imagen_id,
         p.nombre, p.descripcion,
         p.base_precio, p.estado,
         i.url AS imagen_url, i.titulo AS imagen_titulo, i.estado AS imagen_estado
       FROM productos p
       JOIN imagenes i ON i.id = p.imagen_id
      WHERE p.negocio_id = ?
      ORDER BY p.id DESC`,
      [negocioId]
    );

    res.json(rows);
  } catch (e) {
    console.error('[productos.list]', e);
    res.status(500).json({ error: 'Error listando productos' });
  }
});

/* ============================== CREAR ============================= */
// POST /api/negocios/:negocioId/productos
router.post('/api/negocios/:negocioId/productos', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const imagen_id   = toInt(req.body?.imagen_id);
    const base_precio = toMoney(req.body?.base_precio, 0);
    const nombre      = trimOrNull(req.body?.nombre);
    const descripcion = trimOrNull(req.body?.descripcion);
    const estado      = Number(req.body?.estado) ? 1 : 0;

    if (!imagen_id) return res.status(400).json({ error: 'imagen_id es requerido' });

    const img = await assertImagenOwnership(negocioId, imagen_id);
    if (!img) return res.status(404).json({ error: 'La imagen no existe o no pertenece al negocio' });

    const dup = await getOne(
      `SELECT id FROM productos WHERE negocio_id = ? AND imagen_id = ?`,
      [negocioId, imagen_id]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe un producto para esa imagen', id: dup.id });

    const [r] = await db.query(
      `INSERT INTO productos (negocio_id, imagen_id, nombre, descripcion, base_precio, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [negocioId, imagen_id, nombre, descripcion, base_precio, estado]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    console.error('[productos.create]', e);
    res.status(500).json({ error: 'Error creando producto' });
  }
});

/* ======================= REEMPLAZO TOTAL ======================= */
// PUT /api/negocios/:negocioId/productos/:id
router.put('/api/negocios/:negocioId/productos/:id', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'parámetros inválidos' });

    const imagen_id   = toInt(req.body?.imagen_id);
    const base_precio = toMoney(req.body?.base_precio, 0);
    const nombre      = trimOrNull(req.body?.nombre);
    const descripcion = trimOrNull(req.body?.descripcion);
    const estado      = Number(req.body?.estado) ? 1 : 0;

    if (!imagen_id) return res.status(400).json({ error: 'imagen_id es requerido' });

    const img = await assertImagenOwnership(negocioId, imagen_id);
    if (!img) return res.status(404).json({ error: 'La imagen no existe o no pertenece al negocio' });

    const dup = await getOne(
      `SELECT id FROM productos WHERE negocio_id = ? AND imagen_id = ? AND id <> ?`,
      [negocioId, imagen_id, id]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe otro producto con esa imagen' });

    const [r] = await db.query(
      `UPDATE productos
          SET imagen_id=?, nombre=?, descripcion=?, base_precio=?, estado=?
        WHERE id=? AND negocio_id=?`,
      [imagen_id, nombre, descripcion, base_precio, estado, id, negocioId]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[productos.put]', e);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

/* =================== ACTUALIZACIÓN PARCIAL =================== */
// PATCH /api/negocios/:negocioId/productos/:id
router.patch('/api/negocios/:negocioId/productos/:id', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'parámetros inválidos' });

    const fields = [];
    const params = [];

    if ('imagen_id' in req.body) {
      const imagen_id = toInt(req.body.imagen_id);
      if (!imagen_id) return res.status(400).json({ error: 'imagen_id inválido' });
      const img = await assertImagenOwnership(negocioId, imagen_id);
      if (!img) return res.status(404).json({ error: 'La imagen no existe o no pertenece al negocio' });

      const dup = await getOne(
        `SELECT id FROM productos WHERE negocio_id = ? AND imagen_id = ? AND id <> ?`,
        [negocioId, imagen_id, id]
      );
      if (dup) return res.status(409).json({ error: 'Ya existe otro producto con esa imagen' });

      fields.push('imagen_id=?'); params.push(imagen_id);
    }
    if ('nombre' in req.body)      { fields.push('nombre=?');      params.push(trimOrNull(req.body.nombre)); }
    if ('descripcion' in req.body) { fields.push('descripcion=?'); params.push(trimOrNull(req.body.descripcion)); }
    if ('base_precio' in req.body) { fields.push('base_precio=?'); params.push(toMoney(req.body.base_precio, 0)); }
    if ('estado' in req.body)      { fields.push('estado=?');      params.push(Number(req.body.estado) ? 1 : 0); }

    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' });

    params.push(id, negocioId);
    const [r] = await db.query(
      `UPDATE productos SET ${fields.join(', ')} WHERE id=? AND negocio_id=?`,
      params
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[productos.patch]', e);
    res.status(500).json({ error: 'Error en actualización parcial' });
  }
});

/* ======================= CAMBIO DE ESTADO ======================= */
// PATCH /api/negocios/:negocioId/productos/:id/estado
router.patch('/api/negocios/:negocioId/productos/:id/estado', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'parámetros inválidos' });

    const estado = Number(req.body?.estado) ? 1 : 0;
    const [r] = await db.query(
      `UPDATE productos SET estado=? WHERE id=? AND negocio_id=?`,
      [estado, id, negocioId]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[productos.estado]', e);
    res.status(500).json({ error: 'Error cambiando estado' });
  }
});

/* ============================== BORRAR ============================== */
// DELETE /api/negocios/:negocioId/productos/:id
router.delete('/api/negocios/:negocioId/productos/:id', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'parámetros inválidos' });

    await db.query(`DELETE FROM producto_opcion_precio WHERE product_id=?`, [id]);
    const [r] = await db.query(`DELETE FROM productos WHERE id=? AND negocio_id=?`, [id, negocioId]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });

    res.json({ ok: true });
  } catch (e) {
    console.error('[productos.delete]', e);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

/* =================== OPCIONES (RECARGOS POR ÍTEM) ================== */
// GET /api/negocios/:negocioId/productos/:id/opciones
router.get('/api/negocios/:negocioId/productos/:id/opciones', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'parámetros inválidos' });

    const prod = await getOne(`SELECT id FROM productos WHERE id=? AND negocio_id=?`, [id, negocioId]);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const [rows] = await db.query(
      `SELECT categoria_id, item_id, precio
         FROM producto_opcion_precio
        WHERE product_id = ?`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    console.error('[productos.opciones.get]', e);
    res.status(500).json({ error: 'Error obteniendo opciones' });
  }
});

// PUT /api/negocios/:negocioId/productos/:id/opciones
// Body: { opciones: [{categoria_id,item_id,precio}, ...] }
router.put('/api/negocios/:negocioId/productos/:id/opciones', async (req, res) => {
  const conn = typeof db.getConnection === 'function' ? await db.getConnection() : null;
  const cx   = conn || db;

  try {
    const negocioId = toInt(req.params.negocioId);
    const id        = toInt(req.params.id);
    if (!negocioId || !id) {
      if (conn) conn.release?.();
      return res.status(400).json({ error: 'parámetros inválidos' });
    }

    const prod = await getOne(`SELECT id FROM productos WHERE id=? AND negocio_id=?`, [id, negocioId]);
    if (!prod) {
      if (conn) conn.release?.();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const opciones = Array.isArray(req.body?.opciones) ? req.body.opciones : [];

    if (conn) await conn.beginTransaction();

    await cx.query(`DELETE FROM producto_opcion_precio WHERE product_id=?`, [id]);

    const values = [];
    for (const o of opciones) {
      const catId  = toInt(o?.categoria_id);
      const itemId = toInt(o?.item_id);
      const precio = toMoney(o?.precio, 0);
      if (catId && itemId && precio >= 0) {
        values.push([id, catId, itemId, precio]);
      }
    }

    if (values.length) {
      // Si existe índice único (product_id, categoria_id, item_id) esto no duplica
      await cx.query(
        `INSERT INTO producto_opcion_precio (product_id, categoria_id, item_id, precio)
         VALUES ?`,
        [values]
      );
    }

    if (conn) await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    console.error('[productos.opciones.put]', e);
    res.status(500).json({ error: 'Error guardando opciones' });
  } finally {
    if (conn) conn.release?.();
  }
});

/* ================================================================
 * 🎯 PRECIOS GLOBALES DE ATRIBUTOS (por negocio)
 *     GET/PUT /api/negocios/:negocioId/atributos/precios
 *     (se usan en el marketplace: tabla negocio_item_precio)
 * ================================================================*/
router.get('/api/negocios/:negocioId/atributos/precios', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const [rows] = await db.query(
      `SELECT categoria_id, item_id, precio
         FROM negocio_item_precio
        WHERE negocio_id = ?`,
      [negocioId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[atributos.precios.get]', e);
    res.status(500).json({ error: 'Error obteniendo precios de atributos' });
  }
});

/**
 * PUT /api/negocios/:negocioId/atributos/precios
 * Body: { precios: [{categoria_id,item_id,precio}, ...] }
 * Reemplaza TODO el set de precios globales del negocio.
 */
router.put('/api/negocios/:negocioId/atributos/precios', async (req, res) => {
  const conn = typeof db.getConnection === 'function' ? await db.getConnection() : null;
  const cx   = conn || db;
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) {
      if (conn) conn.release?.();
      return res.status(400).json({ error: 'negocioId inválido' });
    }

    const precios = Array.isArray(req.body?.precios) ? req.body.precios : [];

    if (conn) await conn.beginTransaction();
    await cx.query(`DELETE FROM negocio_item_precio WHERE negocio_id=?`, [negocioId]);

    const values = [];
    for (const o of precios) {
      const catId  = toInt(o?.categoria_id);
      const itemId = toInt(o?.item_id);
      const precio = toMoney(o?.precio, 0);
      if (negocioId && catId && itemId && precio >= 0) {
        values.push([negocioId, catId, itemId, precio]);
      }
    }
    if (values.length) {
      await cx.query(
        `INSERT INTO negocio_item_precio (negocio_id, categoria_id, item_id, precio)
         VALUES ?`,
        [values]
      );
    }

    if (conn) await conn.commit();
    res.json({ ok: true, count: values.length });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    console.error('[atributos.precios.put]', e);
    res.status(500).json({ error: 'Error guardando precios de atributos' });
  } finally {
    if (conn) conn.release?.();
  }
});

/* ======================== MARKETPLACE FEED ======================== */
/**
 * GET /api/negocios/:negocioId/marketplace
 * Params: q?, categoriaId?, page?, size?
 *
 * Devuelve:
 *  - filtros (rol='filtro')
 *  - atributos (rol='atributo') con items [{id,label,recargo}]
 *  - recargo = COALESCE(pop.precio, 0) + COALESCE(nip.precio, 0)
 *              (precio específico por producto + precio global por negocio)
 */

// ======================== MARKETPLACE FEED ========================
// GET /api/negocios/:negocioId/marketplace
// Config de modo de precios para el marketplace
// Valores: 'global' | 'product' | 'product_over_global'


// ======================== MARKETPLACE FEED ========================
// GET /api/negocios/:negocioId/marketplace
router.get('/api/negocios/:negocioId/marketplace', async (req, res) => {
  try {
    const negocioId  = Number(req.params.negocioId) || null;
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const q           = (req.query.q || '').toString().trim();
    const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : null; // rol=filtro
    const page        = Math.max(1, Number(req.query.page) || 1);
    const size        = Math.min(200, Math.max(1, Number(req.query.size) || 20));
    const offset      = (page - 1) * size;

    // Evita truncado de GROUP_CONCAT
    await db.query('SET SESSION group_concat_max_len = 1000000');

    // WHERE base + params
    const baseWhere = ['p.negocio_id = ?', 'p.estado = 1', 'i.estado = 1'];
    const params = [negocioId];

    if (q) {
      baseWhere.push('(p.nombre LIKE ? OR p.descripcion LIKE ? OR i.titulo LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (categoriaId) {
      baseWhere.push(`EXISTS (
        SELECT 1
          FROM imagen_categoria fc2
          JOIN categorias c2 ON c2.id = fc2.categoria_id
         WHERE fc2.imagen_id = i.id
           AND c2.rol = 'filtro' AND c2.estado = 1
           AND fc2.categoria_id = ?
      )`);
      params.push(categoriaId);
    }

    // -------- 1) TOTAL ----------
    const cntSql = `
      SELECT COUNT(DISTINCT p.id) AS total
        FROM productos p
        JOIN imagenes i ON i.id = p.imagen_id
       WHERE ${baseWhere.join(' AND ')}`;
    const [cntRows] = await db.query(cntSql, params);
    const total = Number(cntRows?.[0]?.total || 0);

    // -------- 2) ITEMS ----------
    // Modo de precios (qué recargo enviar en attrs_raw)
    const priceJoinPOP = (PRICE_MODE === 'global') ? '' : `
      LEFT JOIN producto_opcion_precio pop
             ON pop.product_id   = p.id
            AND pop.categoria_id = ca.id
            AND pop.item_id      = ci.id`;

    const priceExpr =
      PRICE_MODE === 'global'
        ? 'ROUND(COALESCE(nip.precio, 0), 0)'
        : PRICE_MODE === 'product'
          ? 'ROUND(COALESCE(pop.precio, 0), 0)'
          : 'ROUND(COALESCE(pop.precio, nip.precio, 0), 0)'; // product_over_global

    const sql = `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.base_precio,
        p.imagen_id,
        i.url     AS imagen_url,
        i.titulo  AS imagen_titulo,

        -- Filtros (rol='filtro')
        GROUP_CONCAT(DISTINCT CONCAT_WS('|', cf.id, cf.nombre) SEPARATOR ';;') AS filtros_raw,

        -- Atributos (rol='atributo') con recargo según PRICE_MODE
        GROUP_CONCAT(DISTINCT CONCAT_WS('|',
          ca.id, ca.nombre,                         -- categoría
          ci.id,
          COALESCE(NULLIF(ci.label,''), CONCAT('Item ', ci.id)), -- etiqueta del ítem
          ${priceExpr}                               -- recargo
        ) SEPARATOR ';;') AS attrs_raw

      FROM productos p
      JOIN imagenes i ON i.id = p.imagen_id

      -- Filtros
      LEFT JOIN imagen_categoria fc ON fc.imagen_id = i.id
      LEFT JOIN categorias cf ON cf.id = fc.categoria_id
            AND cf.rol = 'filtro' AND cf.estado = 1

      -- Atributos
      LEFT JOIN imagen_item     ii ON ii.imagen_id = i.id
      LEFT JOIN categoria_items ci ON ci.id = ii.item_id
      LEFT JOIN categorias      ca ON ca.id = ci.categoria_id
            AND ca.rol = 'atributo' AND ca.estado = 1

      -- Precio GLOBAL por negocio
      LEFT JOIN negocio_item_precio nip
             ON nip.negocio_id   = p.negocio_id
            AND nip.categoria_id = ca.id
            AND nip.item_id      = ci.id

      ${priceJoinPOP}  -- si PRICE_MODE !== 'global', se inyecta el JOIN a pop

      WHERE ${baseWhere.join(' AND ')}
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?`;

    const [rows] = await db.query(sql, [...params, size, offset]);

    // Parseo
    const items = rows.map(r => {
      const filtros = (r.filtros_raw || '')
        .split(';;').filter(Boolean)
        .map(s => {
          const [id, nombre] = s.split('|');
          return { id: Number(id), nombre };
        });

      const atributos = (r.attrs_raw || '')
        .split(';;').filter(Boolean)
        .map(s => {
          const [catId, catNombre, itemId, itemLabel, recargo] = s.split('|');
          return {
            categoria: { id: Number(catId), nombre: catNombre },
            item:      { id: Number(itemId), label: itemLabel },
            recargo:   Number(recargo || 0)
          };
        });

      return {
        id: r.id,
        nombre: r.nombre || r.imagen_titulo || `Producto ${r.id}`,
        descripcion: r.descripcion || '',
        base_precio: Number(r.base_precio || 0),
        imagen_id: r.imagen_id,
        imagen_url: r.imagen_url,
        imagen_titulo: r.imagen_titulo,
        filtros,
        atributos
      };
    });

    return res.json({ total, page, size, items });
  } catch (e) {
    console.error('[marketplace.list] ERROR:', e && (e.sqlMessage || e.message), e);
    return res.status(500).json({ error: 'Error listando marketplace' });
  }
});





module.exports = router;
