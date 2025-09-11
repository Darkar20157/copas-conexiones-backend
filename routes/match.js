const express = require("express");
const router = express.Router();
const pool = require("../db"); // conexión a PostgreSQL

//Trae todos los matches visto o no vistos
router.get("/", async (req, res) => {
  try {
    const { page = 0, limit = 4, viewed } = req.query;
    const offset = parseInt(page) * parseInt(limit);

    let query = `
      SELECT 
        m.id,
        m.state,
        m.create_date,
        m.update_date,
        m.view_admin,

        -- Datos user1
        u1.id AS user1_id,
        u1.name AS user1_name,
        u1.phone AS user1_phone,
        u1.photos AS user1_photos,
        u1.birthdate AS user1_birthdate,

        -- Datos user2
        u2.id AS user2_id,
        u2.name AS user2_name,
        u2.phone AS user2_phone,
        u2.photos AS user2_photos,
        u2.birthdate AS user2_birthdate,

        -- Reacciones
        l1.reaction_type AS user1_reaction,
        l2.reaction_type AS user2_reaction

      FROM matches m
      INNER JOIN users u1 ON m.user1_id = u1.id
      INNER JOIN users u2 ON m.user2_id = u2.id
      LEFT JOIN likes l1 ON l1.sender_id = m.user1_id AND l1.receiver_id = m.user2_id
      LEFT JOIN likes l2 ON l2.sender_id = m.user2_id AND l2.receiver_id = m.user1_id
    `;

    const values = [];

    // filtro vistos/no vistos
    if (viewed === "true") {
      values.push(true);
      query += ` WHERE m.view_admin = $${values.length}`;
    } else if (viewed === "false") {
      values.push(false);
      query += ` WHERE m.view_admin = $${values.length}`;
    }

    // paginación
    values.push(limit);
    values.push(offset);

    query += ` ORDER BY m.create_date DESC LIMIT $${values.length - 1} OFFSET $${values.length}`;

    const result = await pool.query(query, values);

    res.json(
      {
        success: true,
        status: 200,
        message: 'Usuario encontrado',
        details: 'Usuario encontrado existosamente',
        content: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rowCount,
          data: result.rows
        },
      }
    );

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});



// Endpoint para reaccionar
router.post("/react", async (req, res) => {
  let { senderId, receiverId, reactionType } = req.body;

  senderId = parseInt(senderId, 10);
  receiverId = parseInt(receiverId, 10);

  if (!senderId || !receiverId || !reactionType) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    // Guardar o actualizar la reacción (UPSERT)
    const likeQuery = `
      INSERT INTO likes (sender_id, receiver_id, reaction_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (sender_id, receiver_id)
      DO UPDATE SET reaction_type = EXCLUDED.reaction_type, update_date = NOW()
      RETURNING *;
    `;

    const result = await pool.query(likeQuery, [senderId, receiverId, reactionType]);
    const newReaction = result.rows[0];

    // Verificar si existe reacción inversa (receiver → sender)
    const reverseQuery = `
      SELECT * FROM likes 
      WHERE sender_id = $1 AND receiver_id = $2 
        AND reaction_type IN ('LIKE', 'LOVE');
    `;
    const reverseLike = await pool.query(reverseQuery, [receiverId, senderId]);

    let match = null;

    if (reverseLike.rows.length > 0 && (reactionType === "LIKE" || reactionType === "LOVE")) {
      // Crear match si no existe aún
      const matchQuery = `
          INSERT INTO matches (user1_id, user2_id)
          VALUES (LEAST($1::int, $2::int), GREATEST($1::int, $2::int))
          ON CONFLICT (user1_id, user2_id) DO NOTHING
          RETURNING *;
      `;
      const matchResult = await pool.query(matchQuery, [senderId, receiverId]);
      match = matchResult.rows[0] || null;
    }

    res.json({
      message: "Reacción registrada",
      reaction: newReaction,
      match: match,
    });
  } catch (err) {
    console.error("Error al reaccionar:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
