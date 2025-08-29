const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const pool = require('../db'); // tu conexión a la BD
const fs = require("fs");


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // carpeta donde se guardarán las fotos
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // nombre único
    },
});

const upload = multer({ storage });

// ✅ Obtener todos los usuarios
router.get('/', async (req, res) => {
    try {
        const { userId, limit = 5, offset = 0 } = req.query; // valores por defecto
        const result = await pool.query(
            'SELECT id, state, name, age, description, phone, photos FROM "users" WHERE id != $1 ORDER BY id ASC LIMIT $2 OFFSET $3',
            [userId, limit, offset]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

// ✅ Obtener un usuario por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, state, name, age, description, phone, photos FROM "users" WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error obteniendo usuario' });
    }
});

// ✅ Crear un usuario
router.post('/', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO "users" (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [name, email, password]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error creando usuario' });
    }
});

// ✅ Subir foto de usuario
router.post('/upload/photos/:id', upload.single('photo'), async (req, res) => {
    try {
        const userId = req.params.id;
        const filePath = `/uploads/${req.file.filename}`;

        // Consulta: agregar la nueva foto si no hay más de 6
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
      RETURNING photos
      `,
            [JSON.stringify([filePath]), userId]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Validar si alcanzó el límite
        const photos = result.rows[0].photos;
        if (photos.length > 6) {
            return res.status(400).json({ error: 'Máximo 6 fotos permitidas' });
        }

        res.json({ message: 'Foto agregada con éxito', photos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al subir la foto' });
    }
});

router.delete("/delete/photos/:id", async (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;

  try {
    // Sacar el path relativo (/uploads/12345.jpg)
    const relativePath = photo.replace("http://localhost:3000", "");
    const absolutePath = path.join(__dirname, "..", relativePath);

    // 1️⃣ Actualizar la BD (quitar la foto del array JSONB)
    const result = await pool.query(
      `
      UPDATE users
      SET photos = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(photos) elem
        WHERE elem <> $1::jsonb
      )
      WHERE id = $2
      RETURNING photos
      `,
      [JSON.stringify(relativePath), id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // 2️⃣ Eliminar físicamente el archivo
    fs.unlink(absolutePath, (err) => {
      if (err) {
        console.error("⚠️ Error eliminando archivo:", err.message);
        // No detenemos el flujo, porque ya quitamos la referencia en la BD
      }
    });

    res.json({ message: "Foto eliminada con éxito", photos: result.rows[0].photos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error eliminando foto" });
  }
});

// ✅ Actualizar un usuario
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, age, description } = req.body;
    try {
        const result = await pool.query(
            'UPDATE "users" SET name=$1, age=$2, description=$3 WHERE id=$4 RETURNING *',
            [name, age, description, id]
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
            'DELETE FROM "users" WHERE id=$1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error eliminando usuario' });
    }
});

module.exports = router;
