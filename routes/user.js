const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const pool = require('../db');
const fs = require("fs");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

// ✅ Obtener todos los usuarios
router.get("/", async (req, res) => {
  try {
    const { userId, limit = 5, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "El userId es requerido" });
    }

    // 🔹 Traer usuarios con los que no se ha reaccionado aún
    const query = `
      SELECT u.id, u.state, u.name, u.age, u.description, u.phone, u.photos, u.type
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
            'SELECT id, state, name, age, description, phone, photos, type FROM "users" WHERE id = $1',
            [id]
        );
        console.log(result)
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
    const { name, email, password, type = "USER" } = req.body;
    try {
        console.log(type);
        const result = await pool.query(
            'INSERT INTO "users" (name, email, password, type) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, password, type]
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
            [JSON.stringify([filePath]), userId]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const photos = result.rows[0].photos;
        if (photos.length > 6) {
            return res.status(400).json({ error: 'Máximo 6 fotos permitidas' });
        }

        res.json({ message: 'Foto agregada con éxito', photos, type: result.rows[0].type });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al subir la foto' });
    }
});

// ✅ Eliminar foto
router.delete("/delete/photos/:id", async (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;

  try {
    const relativePath = photo.replace("http://localhost:3000", "");
    const absolutePath = path.join(__dirname, "..", relativePath);

    const result = await pool.query(
      `
      UPDATE users
      SET photos = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(photos) elem
        WHERE elem <> $1::jsonb
      )
      WHERE id = $2
      RETURNING photos, type
      `,
      [JSON.stringify(relativePath), id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    fs.unlink(absolutePath, (err) => {
      if (err) {
        console.error("⚠️ Error eliminando archivo:", err.message);
      }
    });

    res.json({ message: "Foto eliminada con éxito", photos: result.rows[0].photos, type: result.rows[0].type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error eliminando foto" });
  }
});

// ✅ Actualizar un usuario
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, age, description, type } = req.body;
    try {
        const result = await pool.query(
            'UPDATE "users" SET name=$1, age=$2, description=$3, type=COALESCE($4, type) WHERE id=$5 RETURNING *',
            [name, age, description, type, id]
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

module.exports = router;
