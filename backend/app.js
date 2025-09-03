// backend/app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/* =========================================================
 * Log básico y utilidades
 * =======================================================*/
app.set('trust proxy', true); // necesario si usas reverse proxy (para cookies secure)

app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`📥 ${ts} | ${req.method} ${req.originalUrl}`);
  next();
});

// (Opcional) Mostrar config de DB si está definida en .env
if (process.env.DB_HOST || process.env.DB_USER || process.env.DB_NAME) {
  console.log('📡 MySQL config:');
  console.log(`   ➤ Host: ${process.env.DB_HOST || '(no definido)'}`);
  console.log(`   ➤ User: ${process.env.DB_USER || '(no definido)'}`);
  console.log(`   ➤ DB  : ${process.env.DB_NAME || '(no definido)'}`);
}

/* =========================================================
 * Middlewares base
 * =======================================================*/
// CORS (credenciales por si sirves el front en otro origen)
app.use(cors({
  origin: true,            // refleja el Origin que llega
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ⚙️ Sesiones (requerido si usas checkout/login con cookie)
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production', // true si sirves por HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7    // 7 días
  }
}));

/* =========================================================
 * Estáticos del proyecto
 * =======================================================*/
const FE_ROOT      = path.join(__dirname, '..', 'frontend');           // /frontend
const FE_NEGOCIO   = path.join(FE_ROOT, 'negocio');                    // /frontend/negocio
const FE_NEG_PARTS = path.join(FE_NEGOCIO, 'partials');                // /frontend/negocio/partials
const PROJECT_ROOT = path.join(__dirname, '..');                       // raíz del proyecto

// Admin (HTML/CSS/JS) -> /admin/*
app.use('/admin', express.static(path.join(FE_ROOT, 'admin')));

// Bloques comunes
app.use('/css',    express.static(path.join(FE_ROOT, 'css')));
app.use('/img',    express.static(path.join(FE_ROOT, 'img')));
app.use('/js',     express.static(path.join(FE_ROOT, 'js')));
app.use('/public', express.static(path.join(FE_ROOT, 'public')));

// JS de negocio -> /negocio/js/*
app.use('/negocio/js', express.static(path.join(FE_NEGOCIO, 'js')));

// Parciales de negocio
app.use('/negocio/partials', express.static(FE_NEG_PARTS));
app.use('/partials',         express.static(FE_NEG_PARTS));

// Imágenes subidas (Multer) en /uploads/*
app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')));

/* =========================================================
 * Rutas / APIs del backend
 * =======================================================*/
// 👇 Ajusta estos requires si moviste archivos
const usuariosRoutes         = require('./routes/usuarios.routes');
const negociosRoutes         = require('./routes/negocios.routes');
const negociosConsultaRoutes = require('./routes/negocios.consultar.routes');

const loginNegocioRoutes     = require('./routes/negocios/login.routes');
const principalNegocioRoutes = require('./routes/negocios/principal.routes');

const imagenesRoutes         = require('./routes/negocios/imagenes.routes');
const categoriasRoutes       = require('./routes/negocios/categorias.routes');
const checkoutRoutes         = require('./routes/negocios/checkout.routes');

// ✅ Productos (incluye CRUD + /api/negocios/:negocioId/marketplace)
const productosRoutes        = require('./routes/negocios/productos.routes');

/* -----------------------------
 * Endpoints de salud
 * ----------------------------*/
app.get('/health', (_req, res) => res.json({ ok: true }));

/* -----------------------------
 * APIs bajo /api/*
 * ----------------------------*/
app.use('/api/usuarios',           usuariosRoutes);
app.use('/api/negocios',           negociosRoutes);
app.use('/api/consultar-negocios', negociosConsultaRoutes);

/* Estas rutas ya incluyen su prefijo (/api/...) internamente */
app.use('/', imagenesRoutes);
app.use('/', categoriasRoutes);

/* Rutas públicas por slug (HTML + API info por slug) */
app.use('/', loginNegocioRoutes);
app.use('/', principalNegocioRoutes);

/* Checkout (prefill + creación de pedido) */
app.use('/', checkoutRoutes);

/* Productos (creación, recargos y feed marketplace) */
app.use('/', productosRoutes);

/* =========================================================
 * Home -> login administrador
 * =======================================================*/
app.get('/', (_req, res) => {
  console.log('🔄 Redirigiendo a /admin/login.html');
  res.redirect('/admin/login.html');
});

/* =========================================================
 * 404 y manejador de errores
 * =======================================================*/
app.use((req, res) => {
  console.warn(`⚠️  404: ${req.method} ${req.originalUrl}`);
  res.status(404).send('Página no encontrada');
});

app.use((err, _req, res, _next) => {
  console.error('💥 Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

/* =========================================================
 * Start
 * =======================================================*/
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
