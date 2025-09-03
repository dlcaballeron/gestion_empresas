// backend/routes/usuarios.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

// ======== Validaciones (mismas del front) ========
const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñ ]{1,20}$/;               // solo letras y espacios, 1-20
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|co)$/; // solo .com o .co
const PASS_REGEX  = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/; // 10+, letra, número y especial

// ==================================================
// POST /api/usuarios/registro
// Crea admin (rol=0) o usuario de negocio (rol=1) según venga negocio_id
// ==================================================
router.post('/registro', async (req, res) => {
  const { nombre, apellido, email, password, negocio_id } = req.body;

  console.log('🔄 Intentando registrar usuario:', req.body);

  // Validaciones básicas
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }
  if (!NAME_REGEX.test(nombre)) {
    return res.status(400).json({ error: 'Nombre inválido (solo letras y espacios, máx. 20).' });
  }
  if (!NAME_REGEX.test(apellido)) {
    return res.status(400).json({ error: 'Apellido inválido (solo letras y espacios, máx. 20).' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Correo inválido (debe terminar en .com o .co).' });
  }
  if (!PASS_REGEX.test(password)) {
    return res.status(400).json({ error: 'Contraseña inválida: mínimo 10 caracteres, con letras, números y al menos un carácter especial.' });
  }

  try {
    // Email único
    const [exists] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (exists.length) {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const rol = negocio_id ? 1 : 0;              // 1 = usuario de negocio, 0 = admin/sin negocio
    const negocioId = negocio_id || null;

    const sql = `
      INSERT INTO usuarios
        (nombre, apellido, email, password, rol, negocio_id, estado, fecha_creacion)
      VALUES
        (?, ?, ?, ?, ?, ?, 1, NOW())
    `;
    const params = [nombre, apellido, email, hash, rol, negocioId];

    const [result] = await db.query(sql, params);

    console.log('✅ Usuario registrado:', { id: result.insertId, email, rol, negocio_id: negocioId });

    // 🔁 Devolver en formato listo para guardar sesión en el front
    return res.json({
      mensaje: 'Usuario registrado correctamente.',
      usuario: {
        id: result.insertId,
        nombre,
        apellido,
        email,
        rol,
        negocio_id: negocioId
      }
    });
  } catch (err) {
    console.error('❌ Error registro usuario:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }
    return res.status(500).json({ error: 'Error interno al registrar.' });
  }
});

// ==================================================
// POST /api/usuarios/login
// Si llega negocio_id, valida que el usuario pertenezca a ese negocio (rol=1)
// ==================================================
router.post('/login', async (req, res) => {
  const { email, password, negocio_id } = req.body;
  console.log('🔐 Intentando login con:', { email, negocio_id });

  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan correo o contraseña.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, nombre, apellido, email, password, rol, negocio_id, estado FROM usuarios WHERE email = ? AND estado = 1',
      [email]
    );

    if (!rows.length) {
      console.log('❌ Usuario no encontrado o inactivo');
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const usuario = rows[0];

    // Si se está logueando en un negocio, debe pertenecer a él y ser rol 1
    if (negocio_id) {
      if (usuario.rol !== 1 || usuario.negocio_id !== Number(negocio_id)) {
        console.log('⛔ Usuario no pertenece al negocio o no es rol de negocio');
        return res.status(403).json({ error: 'No autorizado para este negocio.' });
      }
    }

    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) {
      console.log('❌ Contraseña incorrecta');
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    console.log('🎉 Login exitoso para:', usuario.email);
    return res.json({
      mensaje: 'Login exitoso.',
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rol: usuario.rol,
        negocio_id: usuario.negocio_id
      }
      // Aquí podrías emitir un JWT si luego lo necesitas
    });
  } catch (err) {
    console.error('❌ Error en login:', err);
    return res.status(500).json({ error: 'Error en el servidor.' });
  }
});

module.exports = router;
