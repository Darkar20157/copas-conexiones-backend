const express = require('express');
const pool = require('../db');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // carpeta donde se guardarán las fotos
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // nombre único
  }
});

const upload = multer({ storage });
