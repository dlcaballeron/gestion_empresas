const express = require('express');
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const db = require('../db');
const { v4: uuidv4 } = require('uuid'); // ✅ Importar UUID

const router = express.Router();

// Configuración de multer con Cloudinary
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Solo se permiten archivos JPG y PNG.'));
    }
    cb(null, true);
  }
});

// Función para generar URL pública única
function generarURLPublica(nombreNegocio) {
  const slug = nombreNegocio
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // elimina tildes
    .replace(/[^a-zA-Z0-9\s]/g, '')                   // caracteres especiales
    .replace(/\s+/g, '-')                             // espacios por guiones
    .toLowerCase();

  const uuid = uuidv4().split('-')[0]; // parte corta del UUID
  return `http://localhost:3000/negocio/${slug}~${uuid}`;
}

// Ruta: Crear negocio
router.post('/crear', upload.single('logo'), async (req, res) => {
  try {
    console.log("📥 req.body:", req.body);
    console.log("🖼️ req.file:", req.file);

    const {
      razon_social,
      nit,
      telefono,
      descripcion,
      recibe_pagos
    } = req.body;

    const logo = req.file ? req.file.path : null;

    // ✅ Nueva forma de generar la URL pública
    const url_publica = generarURLPublica(razon_social);

    const query = `
      INSERT INTO negocios (
        razon_social, nit, telefono, descripcion, logo, recibe_pagos, url_publica,
        fecha_creacion, fecha_actualizacion, estado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
    `;

    const values = [
      razon_social,
      nit,
      telefono,
      descripcion,
      logo,
      recibe_pagos ? 1 : 0,
      url_publica,
      1
    ];

    await db.query(query, values);

    res.status(200).json({
      mensaje: '✅ Negocio creado correctamente',
      url_publica
    });

  } catch (error) {
    console.error('❌ Error al guardar negocio:', error);
    res.status(500).json({ error: '❌ Error al guardar negocio' });
  }
});

module.exports = router;
