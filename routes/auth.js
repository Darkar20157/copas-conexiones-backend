const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const { hashPassword, normalizePhone } = require('../utils/hash');

const router = express.Router();

// POST /api/auth/login -> { phone, password }
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ message: 'phone and password required' });

    const norm = normalizePhone(phone);

    const result = await pool.query(
      'SELECT id, state, name, age, description, phone, password FROM users WHERE phone = $1 LIMIT 1',
      [norm]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    const user = result.rows[0];
    const hashed = hashPassword(password);
    if (hashed !== user.password) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // No devolver la contraseña
    delete user.password;

    return res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Error en /login:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/register -> { phone, password, nombre, edad, description, photos? }
router.post('/register', async (req, res) => {
  try {
    const { phone, password, name, age, description } = req.body;
    if (!phone || !password || !name || !age)
      return res
        .status(400)
        .json({ message: 'phone, password and nombre required' });

    const norm = normalizePhone(phone);

    // Verificar si existe
    const exists = await pool.query(
      'SELECT id FROM users WHERE phone = $1 LIMIT 1',
      [norm]
    );
    if (exists.rows.length > 0)
      return res.status(409).json({ message: 'Teléfono ya registrado' });

    const newUser = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      state: 'active',
      name,
      age: age ?? null,
      description: description ?? '',
      phone: norm,
      password: hashPassword(password),
    };

    // Insertar en DB
    const insertQuery = `
      INSERT INTO users (id, state, name, age, description, phone, password)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, state, name, age, description, phone
    `;

    const result = await pool.query(insertQuery, [
      newUser.id,
      newUser.state,
      newUser.name,
      newUser.age,
      newUser.description,
      newUser.phone,
      newUser.password,
    ]);

    return res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('❌ Error en /register:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
