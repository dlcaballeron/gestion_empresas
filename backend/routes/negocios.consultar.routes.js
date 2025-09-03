// 📁 negocios.consultar.routes.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// ✅ Ruta para consultar negocios con filtros dinámicos
router.get('/consultar', async (req, res) => {
  const { fecha_inicio, fecha_fin, razon_social, nit, estado } = req.query;

  let query = `SELECT * FROM negocios WHERE 1=1`;
  const params = [];

  // 📅 Filtro por rango de fechas
  if (fecha_inicio && fecha_fin) {
    query += ` AND DATE(fecha_creacion) BETWEEN ? AND ?`;
    params.push(fecha_inicio, fecha_fin);
  }

  // 🔤 Filtro por razón social (parcial)
  if (razon_social && razon_social.trim() !== '') {
    query += ` AND razon_social LIKE ?`;
    params.push(`%${razon_social.trim()}%`);
  }

  // 🔢 Filtro por NIT
  if (nit && nit.trim() !== '') {
    if (!isNaN(nit)) {
      // Si es numérico exacto
      query += ' AND nit = ?';
      params.push(nit.trim());
    } else {
      // Si incluye letras u otros, búsqueda parcial
      query += ' AND nit LIKE ?';
      params.push(`%${nit.trim()}%`);
    }
  }

  // ✅ Filtro por estado
  if (estado !== undefined && estado !== '') {
    query += ` AND estado = ?`;
    params.push(Number(estado));
  }

  // 🔃 Ordenar por fecha
  query += ` ORDER BY fecha_creacion DESC`;

  // 🧪 Debug
  console.log("🧪 SQL:", query);
  console.log("🧪 Params:", params);

  try {
    const [result] = await db.query(query, params);
    res.status(200).json(result);
  } catch (err) {
    console.error('❌ Error en GET /consultar:', err);
    res.status(500).json({ error: 'Error al obtener negocios' });
  }
});


// ✅ Ruta: Actualizar información de un negocio
router.put('/actualizar/:id', async (req, res) => {
  const { id } = req.params;
  const { razon_social, nit, telefono, descripcion, recibe_pagos } = req.body;

  try {
    await db.query(
      `UPDATE negocios 
       SET razon_social = ?, nit = ?, telefono = ?, descripcion = ?, recibe_pagos = ?, fecha_actualizacion = NOW()
       WHERE id = ?`,
      [razon_social, nit, telefono, descripcion, recibe_pagos, id]
    );

    res.status(200).json({ mensaje: "Negocio actualizado correctamente" });
  } catch (err) {
    console.error("❌ Error en PUT /actualizar:", err);
    res.status(500).json({ error: "Error al actualizar negocio" });
  }
});

// ✅ Ruta: Cambiar estado del negocio
router.put('/estado/:id', async (req, res) => {
  const { id } = req.params;
  const { nuevo_estado } = req.body;

  try {
    await db.query(
      'UPDATE negocios SET estado = ?, fecha_actualizacion = NOW() WHERE id = ?',
      [nuevo_estado, id]
    );

    res.status(200).json({ mensaje: "Estado actualizado correctamente" });
  } catch (err) {
    console.error("❌ Error en PUT /estado:", err);
    res.status(500).json({ error: "Error al cambiar estado" });
  }
});

module.exports = router;
