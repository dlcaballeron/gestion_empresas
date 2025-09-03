// backend/routes/negocios/principal.routes.js
const express = require('express');
const path = require('path');
const db = require('../../db');

const router = express.Router();

/**
 * Devuelve info básica del negocio por slug
 * GET /api/negocio/info/:slug
 */
router.get('/api/negocio/info/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    // Ajusta el campo real: si tienes columna slug, usa slug = ?
    const [rows] = await db.query(
      `SELECT id, razon_social, nit, logo, portada, url_publica, estado
         FROM negocios
        WHERE (slug = ? OR url_publica LIKE ?)`,
      [slug, `%${slug}%`]
    );

    if (!rows.length || Number(rows[0].estado) !== 1) {
      return res.status(404).json({ error: 'Negocio no encontrado o inactivo' });
    }

    const n = rows[0];
    res.json({
      id: n.id,
      razon_social: n.razon_social,
      nit: n.nit,
      // Si guardas rutas relativas, ajusta a /uploads; si es Cloudinary, ya es URL absoluta
      logo: n.logo && /^https?:\/\//.test(n.logo) ? n.logo : (n.logo ? `/uploads/${n.logo}` : ''),
      portada: n.portada && /^https?:\/\//.test(n.portada) ? n.portada : (n.portada ? `/uploads/${n.portada}` : ''),
      url_publica: n.url_publica,
    });
  } catch (e) {
    console.error('GET /api/negocio/info/:slug', e);
    res.status(500).json({ error: 'Error obteniendo info del negocio' });
  }
});

/**
 * Sirve el HTML del marketplace del negocio
 * GET /negocio/:slug/principal.html
 */
router.get('/negocio/:slug/principal.html', async (req, res) => {
  const { slug } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id FROM negocios
        WHERE (slug = ? OR url_publica LIKE ?) AND estado = 1
        LIMIT 1`,
      [slug, `%${slug}%`]
    );
    if (!rows.length) return res.status(404).send('Negocio no encontrado o inactivo');

    res.sendFile(path.join(__dirname, '../../..', 'frontend', 'negocio', 'principal.html'));
  } catch (e) {
    console.error('GET /negocio/:slug/principal.html', e);
    res.status(500).send('Error interno');
  }
});

module.exports = router;
