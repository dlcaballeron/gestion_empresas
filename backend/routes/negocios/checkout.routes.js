// backend/routes/negocios/checkout.routes.js
const express = require('express');
const router = express.Router();
const db = require('../../db');

/* =========================================================
 * Helpers
 * =======================================================*/
function direccionToText(d) {
  if (!d) return null;
  return [d.direccion1, d.direccion2, d.barrio, d.ciudad].filter(Boolean).join(', ');
}
const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const roundCOP = (n) => Math.round(toNum(n, 0));

/**
 * Normaliza items del body a un arreglo seguro
 * Cada item esperado:
 *  { producto_id?, imagen_id, nombre, precio (unit), cantidad, variante?, img_url? }
 */
function normalizeItems(itemsRaw) {
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  return items
    .map((it) => ({
      producto_id: it?.producto_id ?? null,
      imagen_id: it?.imagen_id ?? null,
      nombre: String(it?.nombre ?? 'Item'),
      precio: roundCOP(it?.precio),                      // unitario
      cantidad: Math.max(1, parseInt(it?.cantidad ?? 1, 10) || 1),
      variante: it?.variante ? JSON.stringify(it.variante) : null,
      img_url: it?.img_url ?? null,
    }))
    .filter((it) => it.imagen_id !== null && it.precio >= 0 && it.cantidad >= 1);
}

/** Suma subtotal a partir de items normalizados */
function computeSubtotal(itemsNorm) {
  return roundCOP(itemsNorm.reduce((acc, it) => acc + (toNum(it.precio) * toNum(it.cantidad)), 0));
}

/** Intenta leer costo de domicilio del negocio. Si falla/no existe, retorna 0. */
async function fetchCostoDomicilio(negocioId, cxOrDb = db) {
  try {
    // Intenta distintas columnas comunes. Toma la primera que exista.
    const [rows] = await cxOrDb.query(
      `SELECT
         COALESCE(
           NULLIF(TRY_CAST(costo_domicilio AS DECIMAL(18,2)), NULL),
           NULLIF(TRY_CAST(costo_envio AS DECIMAL(18,2)), NULL),
           NULLIF(TRY_CAST(envio_base AS DECIMAL(18,2)), NULL),
           0
         ) AS costo
       FROM negocios
       WHERE id = ?
       LIMIT 1`,
      [negocioId]
    );
    const c = rows?.[0]?.costo;
    return roundCOP(c ?? 0);
  } catch {
    // Si la consulta falla (tabla/columna no existe), usa 0.
    return 0;
  }
}

/* =========================================================
 * PREFILL
 * GET /api/checkout/prefill?negocioId=ID[&usuarioId=ID]
 * =======================================================*/
router.get('/api/checkout/prefill', async (req, res) => {
  try {
    const negocioId = Number(req.query.negocioId);
    const usuarioId = req.session?.usuario?.id || Number(req.query.usuarioId);

    if (!negocioId) return res.status(400).json({ ok: false, msg: 'negocioId requerido' });
    if (!usuarioId) return res.status(401).json({ ok: false, msg: 'No autenticado' });

    const [[u]] = await db.query(
      `SELECT id, nombre, apellido, email, telefono, negocio_id, estado
         FROM usuarios
        WHERE id = ? LIMIT 1`,
      [usuarioId]
    );
    if (!u || Number(u.estado) !== 1) {
      return res.status(401).json({ ok: false, msg: 'Usuario inválido' });
    }
    if (Number(u.negocio_id) !== negocioId) {
      return res.status(403).json({ ok: false, msg: 'Usuario no pertenece al negocio' });
    }

    // Dirección más reciente (si existe)
    const [[dir]] = await db.query(
      `SELECT id, etiqueta, direccion1, direccion2, barrio, ciudad, departamento, referencia, telefono
         FROM direcciones_usuario
        WHERE usuario_id = ?
        ORDER BY id DESC
        LIMIT 1`,
      [usuarioId]
    );

    const costoDomicilio = await fetchCostoDomicilio(negocioId, db);

    res.json({
      ok: true,
      usuario: {
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        telefono: u.telefono || null,
      },
      direccion: dir || null,
      costoDomicilio,
    });
  } catch (err) {
    console.error('❌ prefill error:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
});

/* =========================================================
 * CREAR PEDIDO
 * POST /api/checkout
 * body: {
 *   negocioId, usuarioId?, contacto{}, direccion{}, tipo_entrega, metodo_pago,
 *   costoDomicilio, notas, items[], subtotal?, total?
 * }
 * =======================================================*/
router.post('/api/checkout', async (req, res) => {
  const cx = await db.getConnection();
  try {
    const b = req.body || {};
    const negocioId = Number(b.negocioId);
    const usuarioId = req.session?.usuario?.id || Number(b.usuarioId);

    if (!negocioId) return res.status(400).json({ ok: false, msg: 'negocioId requerido' });
    if (!usuarioId) return res.status(401).json({ ok: false, msg: 'No autenticado' });

    // Validar usuario/negocio
    const [[u]] = await cx.query(
      `SELECT id, negocio_id, estado FROM usuarios WHERE id=? LIMIT 1`,
      [usuarioId]
    );
    if (!u || Number(u.estado) !== 1) {
      return res.status(401).json({ ok: false, msg: 'Usuario inválido' });
    }
    if (Number(u.negocio_id) !== negocioId) {
      return res.status(403).json({ ok: false, msg: 'Usuario/negocio no coincide' });
    }

    // Normalizar items y validar no vacío
    const items = normalizeItems(b.items);
    if (!items.length) {
      return res.status(400).json({ ok: false, msg: 'El pedido no contiene ítems válidos' });
    }

    // (Opcional, best-effort) Validar que cada imagen pertenezca al negocio
    try {
      for (const it of items) {
        const [[img]] = await cx.query(
          `SELECT id FROM imagenes WHERE id = ? AND negocio_id = ? LIMIT 1`,
          [it.imagen_id, negocioId]
        );
        if (!img) {
          return res.status(400).json({ ok: false, msg: `La imagen ${it.imagen_id} no pertenece al negocio` });
        }
      }
    } catch {
      // Si la tabla/columna no existe, continúa sin bloquear.
    }

    // Recalcular subtotal y total del lado servidor (no confiamos en el cliente)
    let subtotalSrv = computeSubtotal(items);
    if (subtotalSrv <= 0) {
      return res.status(400).json({ ok: false, msg: 'Subtotal inválido' });
    }

    // Costo de domicilio: usar el enviado (normalizado) o la configuración del negocio
    let costoDomicilio = roundCOP(b.costoDomicilio);
    if (!Number.isFinite(costoDomicilio) || costoDomicilio < 0) {
      costoDomicilio = await fetchCostoDomicilio(negocioId, cx);
    }

    const totalSrv = roundCOP(subtotalSrv + costoDomicilio);

    // Inicia transacción
    await cx.beginTransaction();

    // Inserta pedido
    const direccionTexto = direccionToText(b.direccion);
    const [rPed] = await cx.query(
      `INSERT INTO pedidos
        (negocio_id, usuario_id, direccion_id, estado,
          subtotal, costo_domicilio, total,
          metodo_pago, tipo_entrega, notas,
          contacto_nombre, contacto_apellido, contacto_email, contacto_telefono,
          direccion_texto)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,   // <-- 15 placeholders
      [
        negocioId,
        usuarioId,
        b.direccion?.id || null,
        'pendiente',
        Number(b.subtotal || 0),
        Number(b.costoDomicilio || 0),
        Number(b.total || 0),
        b.metodo_pago || 'efectivo',
        b.tipo_entrega || 'domicilio',
        b.notas || null,
        b.contacto?.nombre || null,
        b.contacto?.apellido || null,
        b.contacto?.email || null,
        b.contacto?.telefono || null,
        direccionTexto                           // <-- valor #15
      ]
    );
    const pedidoId = rPed.insertId;

    // Inserta items
    for (const it of items) {
      await cx.query(
        `INSERT INTO pedido_items
           (pedido_id, producto_id, imagen_id, nombre, precio_unit, cantidad, variante, img_url)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          pedidoId,
          it.producto_id || null,
          it.imagen_id || null,
          it.nombre || 'Item',
          toNum(it.precio, 0),
          toNum(it.cantidad, 1),
          it.variante || null,
          it.img_url || null,
        ]
      );
    }

    await cx.commit();

    res.json({
      ok: true,
      pedidoId,
      totals: {
        subtotal: subtotalSrv,
        costoDomicilio,
        total: totalSrv,
      },
    });
  } catch (err) {
    try { await cx.rollback(); } catch {}
    console.error('❌ crear pedido error:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  } finally {
    try { cx.release(); } catch {}
  }
});

module.exports = router;
