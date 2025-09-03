// backend/routes/negocios/login.routes.js
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../../db');

const router = express.Router();

/* ----------------------------------------
   Helper: buscar negocio por slug
   La columna url_publica guarda algo como:
   http://localhost:3000/negocio/<slug>
-----------------------------------------*/
async function findBusinessBySlug(slug) {
  const sql = `
    SELECT id, razon_social, logo, url_publica, estado
    FROM negocios
    WHERE url_publica LIKE ? AND estado = 1
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [`%${slug}%`]);
  return rows[0] || null;
}

/* ----------------------------------------
   Middlewares / helpers sesión
-----------------------------------------*/
function requireAuth(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ ok: false, msg: 'No autenticado' });
  }
  next();
}

/* ----------------------------------------
   Páginas públicas por slug
-----------------------------------------*/

// Login negocio
router.get('/negocio/:slug', async (req, res) => {
  try {
    const negocio = await findBusinessBySlug(req.params.slug);
    if (!negocio) return res.status(404).send('Negocio no encontrado o inactivo');
    res.sendFile(path.resolve(__dirname, '../../../frontend/negocio/login.html'));
  } catch (err) {
    console.error('❌ Error al servir login de negocio:', err);
    res.status(500).send('Error interno del servidor');
  }
});

// Registro negocio (crear usuario del negocio)
router.get('/negocio/:slug/registro', async (req, res) => {
  try {
    const negocio = await findBusinessBySlug(req.params.slug);
    if (!negocio) return res.status(404).send('Negocio no encontrado o inactivo');
    res.sendFile(path.resolve(__dirname, '../../../frontend/negocio/registro.html'));
  } catch (err) {
    console.error('❌ Error al servir registro de negocio:', err);
    res.status(500).send('Error interno del servidor');
  }
});

// Principal (marketplace del negocio)
router.get('/negocio/:slug/principal.html', async (req, res) => {
  try {
    const negocio = await findBusinessBySlug(req.params.slug);
    if (!negocio) return res.status(404).send('Negocio no encontrado o inactivo');
    res.sendFile(path.resolve(__dirname, '../../../frontend/negocio/principal.html'));
  } catch (err) {
    console.error('❌ Error al servir principal del negocio:', err);
    res.status(500).send('Error interno del servidor');
  }
});

/* ----------------------------------------
   API pública: Info del negocio por slug
   (Se usa para pintar logo/razón social)
-----------------------------------------*/
router.get('/api/negocio/info/:slug', async (req, res) => {
  try {
    const negocio = await findBusinessBySlug(req.params.slug);
    if (!negocio) {
      return res.status(404).json({ error: 'Negocio no encontrado o inactivo' });
    }
    return res.json({
      id: negocio.id,
      razon_social: negocio.razon_social,
      logo: negocio.logo,           // URL absoluta almacenada en BD (Cloudinary, etc.)
      url_publica: negocio.url_publica,
      slug: req.params.slug
    });
  } catch (err) {
    console.error('❌ Error al obtener datos del negocio:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/* ----------------------------------------
   API: Login / Sesión / Logout
-----------------------------------------*/

/**
 * POST /api/negocio/:slug/login
 * body: { email, password }
 * - Valida usuario (tabla usuarios) para el negocio del slug
 * - Crea req.session.usuario
 */
router.post('/api/negocio/:slug/login', async (req, res) => {
  try {
    const { slug } = req.params;
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: 'Email y contraseña son requeridos' });
    }

    const negocio = await findBusinessBySlug(slug);
    if (!negocio) {
      return res.status(404).json({ ok: false, msg: 'Negocio no encontrado o inactivo' });
    }

    const [[user]] = await db.query(
      `SELECT id, nombre, apellido, email, password, negocio_id, estado, telefono
         FROM usuarios
        WHERE email = ? AND negocio_id = ?
        LIMIT 1`,
      [email, negocio.id]
    );

    if (!user || Number(user.estado) !== 1) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    const okPass = await bcrypt.compare(String(password), String(user.password));
    if (!okPass) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    // Guarda lo necesario en sesión
    req.session.usuario = {
      id: user.id,
      negocio_id: user.negocio_id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono || null
    };

    return res.json({
      ok: true,
      usuario: req.session.usuario,
      negocio: { id: negocio.id, razon_social: negocio.razon_social, logo: negocio.logo, slug }
    });
  } catch (err) {
    console.error('❌ Error en login de negocio:', err);
    res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
  }
});

/**
 * GET /api/sesion
 * Devuelve el estado de la sesión actual
 */
router.get('/api/sesion', (req, res) => {
  const u = req.session?.usuario || null;
  res.json({ ok: !!u, usuario: u });
});

/**
 * POST /api/logout
 * Destruye la sesión
 */
router.post('/api/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((_) => res.json({ ok: true }));
});

module.exports = router;
