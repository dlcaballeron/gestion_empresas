const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Configuración de Cloudinary con variables del entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de almacenamiento con multer-storage-cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const allowedFormats = ['image/jpeg', 'image/png'];

    // Validar tipo MIME
    if (!allowedFormats.includes(file.mimetype)) {
      throw new Error('Formato de imagen no permitido. Solo se permiten JPG y PNG.');
    }

    return {
      folder: 'negocios_logos',
      format: file.mimetype.split('/')[1], // 'jpeg' o 'png'
      public_id: `${Date.now()}-${file.originalname.replace(/\\s+/g, '-')}`
    };
  }
});

module.exports = { cloudinary, storage };
