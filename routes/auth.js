const express = require('express');
const pool = require('../db');
const { hashPassword, normalizePhone } = require('../utils/hash');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { phone, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: 'phone and password required' });
    }

    const norm = normalizePhone(phone);

    const result = await pool.query(
      `SELECT id, state, name, birthdate, description, phone, password, type, gender 
       FROM users 
       WHERE phone = $1 
       LIMIT 1`,
      [norm]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const hashed = hashPassword(password);

    if (hashed !== user.password) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // remove password before returning
    delete user.password;

    return res.status(201).json(
      {
        success: true,
        status: 201,
        message: 'El usuario ha sido registrado',
        details: 'Usuarios registrado existosamente',
        content: user
      }
    );
  } catch (err) {
    console.error('❌ Error in /login:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 * Body: { phone, password, name, birthdate, description?, photos?, type?, gender? }
 */
router.post('/register', async (req, res) => {
  try {
    const {
      phone,
      password,
      name,
      birthdate,
      description,
      gender = null,
      type = 'USER'
    } = req.body;
    if (!phone || !password || !name || !birthdate || !type || gender === null) {
      return res.status(400).json({ message: 'El celular, nombre, fecha de nacimiento y el genero son obligatorios' });
    }

    const norm = normalizePhone(phone);

    // Check if phone exists
    const exists = await pool.query(
      'SELECT id FROM users WHERE phone = $1 LIMIT 1',
      [norm]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: 'Este numero de celular ya esta registrado' });
    }

    // Insert user
    const insertQuery = `
      INSERT INTO users (state, name, birthdate, description, phone, password, type, gender)
      VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7)
      RETURNING id, state, name, birthdate, description, phone, type, gender, create_date, update_date
    `;

    const result = await pool.query(insertQuery, [
      name,
      birthdate,
      description ?? null,
      norm,
      hashPassword(password),
      type,
      gender
    ]);

    return res.status(201).json(
      {
        success: true,
        status: 201,
        message: 'El usuario ha sido registrado',
        details: 'Usuarios registrado existosamente',
        content: result.rows[0]
      }
    );
  } catch (err) {
    console.error('❌ Error in /register:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
