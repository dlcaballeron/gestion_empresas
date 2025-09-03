// backend/routes/negocios/checkout.routes.js
const express = require('express');
const router = express.Router();
const db = require('../../db');

/** Helper para armar texto de dirección */
function direccionToText(d) {
  if (!d) return null;
  return [d.direccion1, d.direccion2, d.barrio, d.ciudad].filter(Boolean).join(', ');
}

/* ======================= PREFILL ======================= */
/**
 * GET /api/checkout/prefill?negocioId=ID[&usuarioId=ID]
 * - Usa sesión si existe; si no, usa usuarioId (fallback).
 */
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

    // Si tienes costo por negocio, léelo aquí; por ahora 0
    const costoDomicilio = 0;

    res.json({
      ok: true,
      usuario: {
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        telefono: u.telefono || null
      },
      direccion: dir || null,
      costoDomicilio
    });
  } catch (err) {
    console.error('❌ prefill error:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
});

/* ======================= CREAR PEDIDO ======================= */
/**
 * POST /api/checkout
 * body: {
 *   negocioId, usuarioId?, contacto{}, direccion{}, tipo_entrega, metodo_pago,
 *   costoDomicilio, notas, items[], subtotal, total
 * }
 */
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
    if (!u || Number(u.estado) !== 1) return res.status(401).json({ ok: false, msg: 'Usuario inválido' });
    if (Number(u.negocio_id) !== negocioId) return res.status(403).json({ ok: false, msg: 'Usuario/negocio no coincide' });

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
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        negocioId, usuarioId, b.direccion?.id || null, 'pendiente',
        Number(b.subtotal || 0), Number(b.costoDomicilio || 0), Number(b.total || 0),
        b.metodo_pago || 'efectivo', b.tipo_entrega || 'domicilio', b.notas || null,
        b.contacto?.nombre || null, b.contacto?.apellido || null, b.contacto?.email || null, b.contacto?.telefono || null,
        direccionTexto
      ]
    );
    const pedidoId = rPed.insertId;

    // Inserta items
    const items = Array.isArray(b.items) ? b.items : [];
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
          Number(it.precio || 0),
          Number(it.cantidad || 1),
          it.variante ? JSON.stringify(it.variante) : null,
          it.img_url || null
        ]
      );
    }

    await cx.commit();
    res.json({ ok: true, pedidoId });
  } catch (err) {
    try { await cx.rollback(); } catch {}
    console.error('❌ crear pedido error:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  } finally {
    try { cx.release(); } catch {}
  }
});

module.exports = router;
