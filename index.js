// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');

const app = express();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.use(cors());
app.use(express.json());

// Rutas de API
app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
