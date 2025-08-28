// utils/hash.js
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

// Normaliza el teléfono devolviendo los últimos 10 dígitos (número nacional).
// Ej: "+57 3101234567" -> "3101234567"
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  // devolver últimos 10 dígitos (número móvil en Colombia)
  return digits.slice(-10);
}

module.exports = { hashPassword, normalizePhone };
