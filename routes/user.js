const express = require('express');
const sharp = require('sharp');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const pool = require('../db');
const fs = require("fs");

// Crear directorios necesarios al iniciar
const createDirectories = () => {
  const tempDir = path.join(__dirname, '..', 'temp');
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('📁 Directorio temp creado');
  }
  
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Directorio uploads creado');
  }
};

// Crear directorios al cargar el módulo
createDirectories();

// Configuración temporal de multer (archivos se procesan y eliminan)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp/"); // Carpeta temporal
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB límite temporal
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// Función para asegurar que existe la carpeta del usuario
const ensureUserDirectory = (userId) => {
  const userDir = path.join(__dirname, '..', 'uploads', userId.toString());
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
};

// Función segura para eliminar archivos
const safeUnlink = (filePath) => {
  return new Promise((resolve) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('⚠️ Error eliminando archivo:', err.message);
      }
      resolve(); // Siempre resolver, no importa si hay error
    });
  });
};

// Función para convertir imagen a WebP
const convertToWebP = async (inputPath, outputPath, quality = 80) => {
  try {
    await sharp(inputPath)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality })
      .toFile(outputPath);
    
    // Eliminar archivo original después de la conversión (de forma segura)
    await safeUnlink(inputPath);
    return true;
  } catch (error) {
    console.error('Error convirtiendo a WebP:', error);
    // Intentar limpiar archivo temporal si existe
    if (fs.existsSync(inputPath)) {
      await safeUnlink(inputPath);
    }
    return false;
  }
};

// ✅ Obtener usuarios disponibles para hacer match
// GET http://localhost:3000/api/users/available?userId=1&limit=10&offset=0
router.get("/available", async (req, res) => {
  try {
    const { userId, limit = 5, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "El userId es requerido" });
    }

    const query = `
      SELECT u.id, u.state, u.name, u.birthdate, u.description, u.phone, u.photos, u.gender, u.type
      FROM "users" u
      WHERE u.id != $1
        AND u.state = TRUE
        AND u.type = 'USER'
        -- No mostrar si ya reaccionó
        AND NOT EXISTS (
          SELECT 1 
          FROM likes l
          WHERE l.sender_id = $1 AND l.receiver_id = u.id
        )
      ORDER BY u.id ASC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.status(200).json({
      success: true,
      status: 200,
      message: "Usuarios disponibles encontrados",
      details: "Usuarios que aún no tienen reacción con este usuario",
      content: result.rows
    });
  } catch (err) {
    console.error("Error obteniendo usuarios disponibles:", err);
    res.status(500).json({ error: "Error obteniendo usuarios disponibles" });
  }
});

// ✅ Obtener todos los usuarios
router.get("/", async (req, res) => {
  try {
    const { userId, limit = 5, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "El userId es requerido" });
    }

    // 🔹 Traer usuarios con los que no se ha reaccionado aún
    const query = `
      SELECT u.id, u.state, u.name, u.birthdate, u.description, u.phone, u.photos, u.type
      FROM "users" u
      WHERE u.id != $1
        AND u.id NOT IN (
          SELECT 
            CASE
              WHEN m.user_match_1 = $1 THEN m.user_match_2
              ELSE m.user_match_1
            END AS other_user
          FROM matches m
          WHERE m.user_match_1 = $1 OR m.user_match_2 = $1
        )
      ORDER BY u.id ASC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error obteniendo usuarios:", err);
    res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});

// ✅ Obtener un usuario por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, state, name, birthdate, description, phone, photos, gender, type FROM "users" WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.status(200).json(
      {
        success: true,
        status: 200,
        message: 'Usuario encontrado',
        details: 'Usuario encontrado existosamente',
        content: result.rows[0]
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

// ✅ Crear un usuario
router.post('/', async (req, res) => {
  const { name, email, password, gender, birthdate, type = "USER" } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "users" (name, email, password, type, gender, birthdate) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, password, type, gender, birthdate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

// ✅ Subir foto de usuario (ACTUALIZADO CON WEBP)
router.post('/upload/photos/:id', upload.single('photo'), async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Verificar límite de fotos antes de procesar
    const currentUser = await pool.query('SELECT photos FROM users WHERE id = $1', [userId]);
    if (!currentUser.rows[0]) {
      // Eliminar archivo subido ya que no se va a usar
      if (fs.existsSync(req.file.path)) {
        await safeUnlink(req.file.path);
      }
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const currentPhotos = currentUser.rows[0].photos || [];
    if (currentPhotos.length >= 6) {
      // Eliminar archivo subido ya que no se va a usar
      if (fs.existsSync(req.file.path)) {
        await safeUnlink(req.file.path);
      }
      return res.status(400).json({ error: 'Máximo 6 fotos permitidas' });
    }

    // Crear directorio del usuario si no existe
    const userDir = ensureUserDirectory(userId);
    
    // Generar nombre único para el archivo WebP
    const timestamp = Date.now();
    const webpFileName = `${timestamp}.webp`;
    const webpPath = path.join(userDir, webpFileName);
    
    // Convertir a WebP
    const conversionSuccess = await convertToWebP(req.file.path, webpPath, 80);
    
    if (!conversionSuccess) {
      return res.status(500).json({ error: 'Error procesando la imagen' });
    }

    // Ruta relativa para almacenar en BD
    const relativePath = `/uploads/${userId}/${webpFileName}`;

    const result = await pool.query(
      `
      UPDATE users 
      SET photos = 
        CASE 
          WHEN jsonb_array_length(COALESCE(photos, '[]'::jsonb)) < 6 
          THEN COALESCE(photos, '[]'::jsonb) || $1::jsonb
          ELSE photos
        END
      WHERE id = $2
      RETURNING photos, type
      `,
      [JSON.stringify([relativePath]), userId]
    );

    if (!result.rows[0]) {
      // Si falla la BD, eliminar el archivo WebP creado
      if (fs.existsSync(webpPath)) {
        await safeUnlink(webpPath);
      }
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const photos = result.rows[0].photos;
    res.json({ 
      message: 'Foto agregada con éxito', 
      photos, 
      type: result.rows[0].type 
    });

  } catch (err) {
    console.error('Error subiendo foto:', err);
    
    // Limpiar archivos en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Error al subir la foto' });
  }
});

// ✅ Eliminar foto (ACTUALIZADO)
router.delete("/delete/photos/:id", async (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;

  try {
    // Normalizar ruta eliminando dominio
    const relativePath = photo
      .replace(/^https?:\/\/[^/]+/, "") // quita dominio
      .replace(/^\//, ""); // quita la barra inicial

    const absolutePath = path.join(__dirname, "..", relativePath);

    const result = await pool.query(
      `
      UPDATE users
      SET photos = COALESCE(
        (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(photos) elem
          WHERE elem <> $1::jsonb
        ),
        '[]'::jsonb
      )
      WHERE id = $2
      RETURNING photos, type
      `,
      [JSON.stringify("/" + relativePath), id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Eliminar archivo físico
    fs.unlink(absolutePath, (err) => {
      if (err) {
        console.error("⚠️ Error eliminando archivo:", err.message);
      } else {
        console.log("✅ Archivo eliminado:", absolutePath);
      }
    });

    res.json({
      message: "Foto eliminada con éxito",
      photos: result.rows[0].photos,
      type: result.rows[0].type
    });

  } catch (err) {
    console.error('Error eliminando foto:', err);
    res.status(500).json({ error: "Error eliminando foto" });
  }
});

// ✅ Actualizar un usuario
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, birthdate, description, type } = req.body;
  try {
    const result = await pool.query(
      'UPDATE "users" SET name=$1, birthdate=$2, description=$3, type=COALESCE($4, type) WHERE id=$5 RETURNING *',
      [name, birthdate, description, type, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

// ✅ Eliminar un usuario
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM "users" WHERE id=$1 RETURNING id, type',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado correctamente', type: result.rows[0].type });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

// ✅ Función utilitaria para limpiar carpetas vacías (opcional)
const cleanEmptyUserDirectories = () => {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  
  if (!fs.existsSync(uploadsDir)) return;
  
  try {
    const userDirs = fs.readdirSync(uploadsDir);
    
    userDirs.forEach(dir => {
      const userDirPath = path.join(uploadsDir, dir);
      const stat = fs.statSync(userDirPath);
      
      if (stat.isDirectory()) {
        const files = fs.readdirSync(userDirPath);
        if (files.length === 0) {
          fs.rmdirSync(userDirPath);
          console.log(`🗑️ Carpeta vacía eliminada: ${dir}`);
        }
      }
    });
  } catch (error) {
    console.error('Error limpiando directorios:', error);
  }
};

// Ejecutar limpieza cada hora (opcional)
setInterval(cleanEmptyUserDirectories, 60 * 60 * 1000);

module.exports = router;