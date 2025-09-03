const express = require('express');
const path = require('path');
const db = require('../../db');

const router = express.Router();

/**
 * GET /negocio/:slug/registro
 * Sirve la vista de registro para usuarios de un negocio.
 */
router.get('/negocio/:slug/registro', async (req, res) => {
  const { slug } = req.params;

  try {
    // Verificar que el negocio existe y está activo
    const [rows] = await db.query(
      'SELECT id FROM negocios WHERE url_publica LIKE ? AND estado = 1',
      [`%${slug}`]
    );

    if (!rows.length) {
      return res.status(404).send('Negocio no encontrado o inactivo');
    }

    // Servir el archivo registro.html
    res.sendFile(path.join(__dirname, '../../..', 'frontend/negocio/registro.html'));
  } catch (err) {
    console.error('❌ Error al servir registro del negocio:', err);
    res.status(500).send('Error interno del servidor');
  }
});

module.exports = router;
