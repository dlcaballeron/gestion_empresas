// backend/routes/negocios/imagenes.routes.js
const express = require('express');
const multer = require('multer');
const db = require('../../db');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();

/* ------------------------------------------------------------------ *
 * Cloudinary config (toma credenciales de variables de entorno)
 * ------------------------------------------------------------------ */
try {
  const cur = cloudinary.config(); // getter
  if (!cur.cloud_name && process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
} catch {
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Multer en memoria (subimos a Cloudinary) + validaciones
 * ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB por archivo
    files: 10,                   // hasta 10 imágenes por request
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Solo se permiten archivos de imagen.'));
    }
    cb(null, true);
  },
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const toInt = (v, def = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function bufferToDataURI(file) {
  const base64 = file.buffer.toString('base64');
  const mime = file.mimetype || 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

function cloudFolder(razon_social, nit, negocioId) {
  const safeName = String(razon_social || `negocio_${negocioId}`)
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const safeNit = String(nit ?? negocioId).trim().replace(/\s+/g, '');
  return `marketplace/${safeName}-NIT_${safeNit}`;
}

function filenameToTitle(filename = '') {
  try {
    const base = String(filename).split('/').pop().split('\\').pop(); // por si viniera con ruta
    const name = base.replace(/\.[^.]+$/, ''); // sin extensión
    // normaliza: quita espacios extremos, colapsa espacios, limita a 30
    return name.trim().replace(/\s+/g, ' ').slice(0, 30);
  } catch {
    return '';
  }
}

/* ======================================================================
 * Helpers de validación/ownership para asignaciones
 * ====================================================================== */
async function assertImagenesDelNegocio(negocioId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const [rows] = await db.query(
    `SELECT id FROM imagenes WHERE negocio_id = ? AND id IN (${ids.map(()=>'?').join(',')})`,
    [negocioId, ...ids]
  );
  const ok = rows.map(r => r.id);
  if (ok.length !== ids.length) {
    const enviados = new Set(ids);
    ok.forEach(id => enviados.delete(id));
    throw new Error(`Imágenes inválidas/no pertenecen: [${[...enviados].join(', ')}]`);
  }
  return ok;
}

async function assertCategoriasDelNegocio(negocioId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const [rows] = await db.query(
    `SELECT id FROM categorias
     WHERE negocio_id = ? AND estado = 1 AND id IN (${ids.map(()=>'?').join(',')})`,
    [negocioId, ...ids]
  );
  const ok = rows.map(r => r.id);
  if (ok.length !== ids.length) {
    const enviados = new Set(ids);
    ok.forEach(id => enviados.delete(id));
    throw new Error(`Categorías inválidas/inactivas: [${[...enviados].join(', ')}]`);
  }
  return ok;
}

async function assertItemsDelNegocio(negocioId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const [rows] = await db.query(
    `SELECT ci.id
       FROM categoria_items ci
       JOIN categorias c ON c.id = ci.categoria_id
      WHERE c.negocio_id = ?
        AND ci.estado = 1
        AND c.estado = 1
        AND c.rol <> 'filtro'              -- ❗ Ítems de categorías 'filtro' NO son válidos
        AND ci.id IN (${ids.map(()=>'?').join(',')})`,
    [negocioId, ...ids]
  );
  const ok = rows.map(r => r.id);
  if (ok.length !== ids.length) {
    const enviados = new Set(ids);
    ok.forEach(id => enviados.delete(id));
    throw new Error(`Ítems inválidos/inactivos: [${[...enviados].join(', ')}]`);
  }
  return ok;
}

/* ======================================================================
 * GET /api/negocios/:negocioId/imagenes
 * Lista imágenes con sus categorías e ítems (filtra inactivos y evita ítems de filtros)
 * ?estado=0|1 opcional
 * ====================================================================== */
router.get('/api/negocios/:negocioId/imagenes', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const estadoQ = req.query.estado; // "0" | "1" | undefined
    const params = [negocioId];
    let where = 'i.negocio_id = ?';
    if (estadoQ === '0' || estadoQ === '1') {
      where += ' AND i.estado = ?';
      params.push(Number(estadoQ));
    }

    await db.query('SET SESSION group_concat_max_len = 1000000');

    const sql = `
      SELECT
        i.id, i.negocio_id, i.url, i.public_id, i.ancho, i.alto, i.formato, i.bytes,
        i.estado, i.fecha_cargue, i.titulo, i.alt_text,

        COALESCE(
          CONCAT(
            '[',
            GROUP_CONCAT(DISTINCT
              JSON_OBJECT(
                'id', c.id,
                'nombre', c.nombre,
                'rol', c.rol
              )
            ),
            ']'
          ),
          '[]'
        ) AS categorias_json,

        COALESCE(
          CONCAT(
            '[',
            GROUP_CONCAT(DISTINCT
              IF(c2.id IS NOT NULL,
                JSON_OBJECT(
                  'id', ci.id,
                  'label', ci.label,
                  'categoria_id', ci.categoria_id
                ),
                NULL
              )
            ),
            ']'
          ),
          '[]'
        ) AS items_json

      FROM imagenes i
      LEFT JOIN imagen_categoria ic ON ic.imagen_id = i.id
      LEFT JOIN categorias c        ON c.id = ic.categoria_id AND c.estado = 1

      LEFT JOIN imagen_item ii      ON ii.imagen_id = i.id
      LEFT JOIN categoria_items ci  ON ci.id = ii.item_id AND ci.estado = 1
      LEFT JOIN categorias c2       ON c2.id = ci.categoria_id AND c2.estado = 1 AND c2.rol <> 'filtro'

      WHERE ${where}
      GROUP BY i.id
      ORDER BY i.id DESC
    `;

    const [rows] = await db.query(sql, params);

    const result = rows.map(r => {
      let categorias = [];
      let items = [];
      try { categorias = JSON.parse(r.categorias_json || '[]').filter(x => x && x.id); } catch {}
      try { items      = JSON.parse(r.items_json || '[]').filter(x => x && x.id); } catch {}

      // Mapa de categorías asociadas a la imagen (con rol)
      const catMap = new Map();
      categorias.forEach(c => catMap.set(c.id, { ...c, items: [] }));

      // ➜ Solo agregamos ítems si la categoría ya está asociada y NO es 'filtro'
      items.forEach(it => {
        const cat = catMap.get(it.categoria_id);
        if (cat && cat.rol !== 'filtro') {
          cat.items.push({ id: it.id, label: it.label, categoria_id: it.categoria_id });
        }
      });

      return {
        id: r.id,
        negocio_id: r.negocio_id,
        url: r.url,
        public_id: r.public_id,
        ancho: r.ancho,
        alto: r.alto,
        formato: r.formato,
        bytes: r.bytes,
        estado: r.estado,
        fecha_cargue: r.fecha_cargue,
        titulo: r.titulo,
        alt_text: r.alt_text,
        categorias: Array.from(catMap.values())
      };
    });

    res.json(result);
  } catch (e) {
    console.error('❌ GET /imagenes:', e);
    res.status(500).json({ error: 'Error listando imágenes' });
  }
});

/* ======================================================================
 * GET /api/negocios/:negocioId/imagenes/:id
 * Detalle de una imagen (incluye categorías/ítems agrupados)
 * ====================================================================== */
router.get('/api/negocios/:negocioId/imagenes/:id', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({});

    await db.query('SET SESSION group_concat_max_len = 1000000');

    const sql = `
      SELECT
        i.id, i.negocio_id, i.url, i.public_id, i.ancho, i.alto, i.formato, i.bytes,
        i.estado, i.fecha_cargue, i.titulo, i.alt_text,

        COALESCE(
          CONCAT(
            '[',
            GROUP_CONCAT(DISTINCT
              JSON_OBJECT(
                'id', c.id,
                'nombre', c.nombre,
                'rol', c.rol
              )
            ),
            ']'
          ),
          '[]'
        ) AS categorias_json,

        COALESCE(
          CONCAT(
            '[',
            GROUP_CONCAT(DISTINCT
              IF(c2.id IS NOT NULL,
                JSON_OBJECT(
                  'id', ci.id,
                  'label', ci.label,
                  'categoria_id', ci.categoria_id
                ),
                NULL
              )
            ),
            ']'
          ),
          '[]'
        ) AS items_json

      FROM imagenes i
      LEFT JOIN imagen_categoria ic ON ic.imagen_id = i.id
      LEFT JOIN categorias c        ON c.id = ic.categoria_id AND c.estado = 1

      LEFT JOIN imagen_item ii      ON ii.imagen_id = i.id
      LEFT JOIN categoria_items ci  ON ci.id = ii.item_id AND ci.estado = 1
      LEFT JOIN categorias c2       ON c2.id = ci.categoria_id AND c2.estado = 1 AND c2.rol <> 'filtro'

      WHERE i.negocio_id = ? AND i.id = ?
      GROUP BY i.id
      LIMIT 1
    `;

    const [rows] = await db.query(sql, [negocioId, id]);
    const r = rows?.[0];
    if (!r) return res.status(200).json({});

    let categorias = [];
    let items = [];
    try { categorias = JSON.parse(r.categorias_json || '[]').filter(x => x && x.id); } catch {}
    try { items      = JSON.parse(r.items_json || '[]').filter(x => x && x.id); } catch {}

    const catMap = new Map();
    categorias.forEach(c => catMap.set(c.id, { ...c, items: [] }));
    items.forEach(it => {
      const cat = catMap.get(it.categoria_id);
      if (cat && cat.rol !== 'filtro') {
        cat.items.push({ id: it.id, label: it.label, categoria_id: it.categoria_id });
      }
    });

    res.json({
      id: r.id,
      negocio_id: r.negocio_id,
      url: r.url,
      public_id: r.public_id,
      ancho: r.ancho,
      alto: r.alto,
      formato: r.formato,
      bytes: r.bytes,
      estado: r.estado,
      fecha_cargue: r.fecha_cargue,
      titulo: r.titulo,
      alt_text: r.alt_text,
      categorias: Array.from(catMap.values())
    });
  } catch (e) {
    console.error('❌ GET /imagenes/:id:', e);
    res.status(200).json({});
  }
});

/* ================================================================== *
 * POST: Subir imágenes (Cloudinary) y registrar en BD
 * POST /api/negocios/:negocioId/imagenes
 * Body: FormData con campo "files" (múltiple)
 * ================================================================== */
router.post(
  '/api/negocios/:negocioId/imagenes',
  upload.array('files', 10),
  async (req, res) => {
    const negocioId = toInt(req.params.negocioId);
    try {
      if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

      // Validar negocio activo
      const [[neg]] = await db.query(
        'SELECT razon_social, nit FROM negocios WHERE id = ? AND estado = 1',
        [negocioId]
      );
      if (!neg) return res.status(404).json({ error: 'Negocio no existe o inactivo' });

      if (!req.files || !req.files.length) {
        return res.status(400).json({ error: 'No se enviaron imágenes' });
      }

      const folder = cloudFolder(neg.razon_social, neg.nit, negocioId);

      const results = await Promise.all(
        req.files.map(async (f) => {
          const dataUri = bufferToDataURI(f);
          const uploaded = await cloudinary.uploader.upload(dataUri, {
            folder,
            resource_type: 'image',
            overwrite: false,
            unique_filename: true,
            use_filename: true,
            context: {
              business_name: neg.razon_social || '',
              nit: String(neg.nit || ''),
              negocio_id: String(negocioId),
              original_name: f.originalname || '',
            },
          });

          // ➜ título desde el nombre del archivo (máx 30 chars)
          const titulo = filenameToTitle(f.originalname || uploaded.original_filename || '');

          // Guarda en BD (por defecto activa: estado = 1)
          const [ins] = await db.query(
            `INSERT INTO imagenes
             (negocio_id, url, public_id, ancho, alto, formato, bytes, estado, titulo)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              negocioId,
              uploaded.secure_url,
              uploaded.public_id,
              uploaded.width,
              uploaded.height,
              uploaded.format,
              uploaded.bytes,
              titulo
            ]
          );

          return {
            id: ins.insertId,
            negocio_id: negocioId,
            url: uploaded.secure_url,
            public_id: uploaded.public_id,
            ancho: uploaded.width,
            alto: uploaded.height,
            formato: uploaded.format,
            bytes: uploaded.bytes,
            estado: 1,
            titulo
          };
        })
      );

      res.status(201).json({ ok: true, items: results });
    } catch (e) {
      console.error('❌ POST /imagenes:', e);
      res.status(500).json({ error: 'Error subiendo imágenes' });
    }
  }
);

/* ================================================================== *
 * PATCH: Cambiar estado (activar/desactivar)
 * PATCH /api/negocios/:negocioId/imagenes/:id/estado
 * Body JSON: { estado: 0|1 }
 * ================================================================== */
router.patch('/api/negocios/:negocioId/imagenes/:id/estado', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id = toInt(req.params.id);
    let { estado } = req.body;

    if (!negocioId || !id) return res.status(400).json({ error: 'Parámetros inválidos' });

    estado = toInt(estado);
    if (!(estado === 0 || estado === 1)) {
      return res.status(400).json({ error: 'Estado inválido (use 0 o 1)' });
    }

    const [upd] = await db.query(
      'UPDATE imagenes SET estado = ? WHERE id = ? AND negocio_id = ?',
      [estado, id, negocioId]
    );
    if (!upd.affectedRows) return res.status(404).json({ error: 'Imagen no encontrada' });

    res.json({ ok: true, id, estado });
  } catch (e) {
    console.error('❌ PATCH /imagenes/:id/estado:', e);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

/* ================================================================== *
 * DELETE: Eliminar imagen (Cloudinary + BD)
 * DELETE /api/negocios/:negocioId/imagenes/:id
 * ================================================================== */
router.delete('/api/negocios/:negocioId/imagenes/:id', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    const id = toInt(req.params.id);
    if (!negocioId || !id) return res.status(400).json({ error: 'Parámetros inválidos' });

    const [[img]] = await db.query(
      'SELECT public_id FROM imagenes WHERE id = ? AND negocio_id = ?',
      [id, negocioId]
    );
    if (!img) return res.status(404).json({ error: 'Imagen no existe' });

    // Borra en Cloudinary
    await cloudinary.uploader.destroy(img.public_id, { resource_type: 'image' });

    // Borra relaciones para evitar huérfanos
    await db.query('DELETE FROM imagen_categoria WHERE imagen_id = ?', [id]);
    await db.query('DELETE FROM imagen_item      WHERE imagen_id = ?', [id]);

    // Borra en BD
    const [del] = await db.query('DELETE FROM imagenes WHERE id = ? AND negocio_id = ?', [
      id,
      negocioId,
    ]);
    if (!del.affectedRows) return res.status(404).json({ error: 'Imagen no encontrada' });

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ DELETE /imagenes/:id:', e);
    res.status(500).json({ error: 'Error eliminando imagen' });
  }
});

/* ================================================================== *
 * BULK: Asignar categorías e ítems a VARIAS imágenes
 * (modo 'add' o 'replace')
 * POST /api/negocios/:negocioId/imagenes/asignaciones
 * Body: { imagen_ids:number[], categoria_ids?:number[], item_ids?:number[], mode?: 'add'|'replace' }
 * ================================================================== */
router.post('/api/negocios/:negocioId/imagenes/asignaciones', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const {
      imagen_ids = [],
      categoria_ids = [],
      item_ids = [],
      mode = 'add',
    } = req.body || {};

    if (!Array.isArray(imagen_ids) || imagen_ids.length === 0) {
      return res.status(400).json({ error: 'imagen_ids requerido (array no vacío)' });
    }

    const imgOK = await assertImagenesDelNegocio(negocioId, imagen_ids);
    const catOK = await assertCategoriasDelNegocio(negocioId, categoria_ids);
    const itOK  = await assertItemsDelNegocio(negocioId, item_ids);

    await conn.beginTransaction();

    if (mode === 'replace') {
      const idsPlace = imgOK.map(()=>'?').join(',');
      await conn.query(`DELETE ic FROM imagen_categoria ic WHERE ic.imagen_id IN (${idsPlace})`, imgOK);
      await conn.query(`DELETE ii FROM imagen_item ii      WHERE ii.imagen_id IN (${idsPlace})`, imgOK);
    }

    if (catOK.length) {
      const values = [];
      imgOK.forEach(img => catOK.forEach(cat => values.push([img, cat])));
      await conn.query(
        `INSERT IGNORE INTO imagen_categoria (imagen_id, categoria_id) VALUES ${values.map(()=>'(?,?)').join(',')}`,
        values.flat()
      );
    }

    if (itOK.length) {
      const values = [];
      imgOK.forEach(img => itOK.forEach(item => values.push([img, item])));
      await conn.query(
        `INSERT IGNORE INTO imagen_item (imagen_id, item_id) VALUES ${values.map(()=>'(?,?)').join(',')}`,
        values.flat()
      );
    }

    await conn.commit();
    res.json({ ok: true, applied_to: imgOK.length, mode, categorias: catOK.length, items: itOK.length });
  } catch (e) {
    await (conn.rollback?.() || Promise.resolve());
    console.error('❌ POST /imagenes/asignaciones:', e);
    res.status(500).json({ error: e.message || 'Error aplicando asignaciones' });
  } finally {
    conn.release();
  }
});

/* ================================================================== *
 * BULK: Limpiar asignaciones (categorías e ítems) de VARIAS imágenes
 * POST /api/negocios/:negocioId/imagenes/asignaciones/clear
 * Body: { imagen_ids:number[], categorias?:boolean, items?:boolean }
 * ================================================================== */
router.post('/api/negocios/:negocioId/imagenes/asignaciones/clear', async (req, res) => {
  try {
    const negocioId = toInt(req.params.negocioId);
    if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

    const { imagen_ids = [], categorias = true, items = true } = req.body || {};
    const imgOK = await assertImagenesDelNegocio(negocioId, imagen_ids);
    if (!imgOK.length) return res.json({ ok: true, cleared: 0 });

    const idsPlace = imgOK.map(()=>'?').join(',');
    let cleared = 0;

    if (categorias) {
      const [r] = await db.query(`DELETE ic FROM imagen_categoria ic WHERE ic.imagen_id IN (${idsPlace})`, imgOK);
      cleared += r.affectedRows || 0;
    }
    if (items) {
      const [r] = await db.query(`DELETE ii FROM imagen_item ii WHERE ii.imagen_id IN (${idsPlace})`, imgOK);
      cleared += r.affectedRows || 0;
    }

    res.json({ ok: true, cleared });
  } catch (e) {
    console.error('❌ POST /imagenes/asignaciones/clear:', e);
    res.status(500).json({ error: e.message || 'Error limpiando asignaciones' });
  }
});

/* ================================================================== *
 * Rutas de compatibilidad con tu versión previa (/configuracion)
 * ================================================================== */
router.post('/api/negocios/:negocioId/imagenes/configuracion', async (req, res) => {
  const negocioId = toInt(req.params.negocioId);
  if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

  const imagenIds    = Array.isArray(req.body.imagenIds)    ? req.body.imagenIds.map(toInt).filter(Boolean) : [];
  const categoriaIds = Array.isArray(req.body.categoriaIds) ? req.body.categoriaIds.map(toInt).filter(Boolean) : [];
  const itemIds      = Array.isArray(req.body.itemIds)      ? req.body.itemIds.map(toInt).filter(Boolean) : [];
  const mode = (req.body.mode === 'append') ? 'add' : 'replace';

  req.body = { imagen_ids: imagenIds, categoria_ids: categoriaIds, item_ids: itemIds, mode };
  return router.handle({ ...req, url: `/api/negocios/${negocioId}/imagenes/asignaciones`, method: 'POST' }, res);
});

router.delete('/api/negocios/:negocioId/imagenes/configuracion', async (req, res) => {
  const negocioId = toInt(req.params.negocioId);
  if (!negocioId) return res.status(400).json({ error: 'negocioId inválido' });

  const imagenIds = Array.isArray(req.body?.imagenIds) ? req.body.imagenIds.map(toInt).filter(Boolean) : [];
  req.body = { imagen_ids: imagenIds, categorias: true, items: true };
  return router.handle({ ...req, url: `/api/negocios/${negocioId}/imagenes/asignaciones/clear`, method: 'POST' }, res);
});

module.exports = router;
