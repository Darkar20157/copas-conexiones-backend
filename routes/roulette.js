const express = require('express');
const pool = require('../db');

const router = express.Router();

// ✅ Crear opción de ruleta
router.post("/", async (req, res) => {
  const { name, description, state = true } = req.body;
  try {
    const query = `
      INSERT INTO roulette (name, description, state)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(query, [name, description, state]);
    res.json({
      success: true,
      status: 201,
      message: "Opción creada con éxito",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error al crear opción:", err);
    res.status(500).json({ success: false, status: 500, message: "Error en el servidor" });
  }
});

// ✅ Obtener todas las opciones (con paginación)
router.get("/", async (req, res) => {
  const { page = 0, limit = 10 } = req.query;
  const offset = parseInt(page) * parseInt(limit);
  try { 
    const query = `
      SELECT * FROM roulette
      ORDER BY create_date DESC
      LIMIT $1 OFFSET $2;
    `;
    const result = await pool.query(query, [parseInt(limit), offset]);

    res.json({
      success: true,
      status: 200,
      message: "Opciones obtenidas con éxito",
      content: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rowCount,
        data: result.rows,
      },
    });
  } catch (err) {
    console.error("Error al obtener opciones:", err);
    res.status(500).json({ success: false, status: 500, message: "Error en el servidor" });
  }
});

// ✅ Obtener una opción por ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `SELECT * FROM roulette WHERE id = $1;`;
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, status: 404, message: "Opción no encontrada" });
    }

    res.json({
      success: true,
      status: 200,
      message: "Opción obtenida con éxito",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error al obtener opción:", err);
    res.status(500).json({ success: false, status: 500, message: "Error en el servidor" });
  }
});

// ✅ Actualizar opción
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, state = true } = req.body;
  try {
    const query = `
      UPDATE roulette
      SET name = $1,
          description = $2,
          state = $3,
          update_date = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const result = await pool.query(query, [name, description, state, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, status: 404, message: "Opción no encontrada" });
    }

    res.json({
      success: true,
      status: 200,
      message: "Opción actualizada con éxito",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error al actualizar opción:", err);
    res.status(500).json({ success: false, status: 500, message: "Error en el servidor" });
  }
});

// ✅ Eliminar opción
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `DELETE FROM roulette WHERE id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, status: 404, message: "Opción no encontrada" });
    }

    res.json({
      success: true,
      status: 200,
      message: "Opción eliminada con éxito",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error al eliminar opción:", err);
    res.status(500).json({ success: false, status: 500, message: "Error en el servidor" });
  }
});

module.exports = router;
