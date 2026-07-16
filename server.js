// ============================================================
//  server.js – Conex SAC (Actualizado)
// ============================================================

const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;

// Clave secreta para firmar los tokens de sesión
const JWT_SECRET = 'conexsac_clave_secreta_2026';

// ── Middlewares ───────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Sirve los archivos de la carpeta "frontend" (html, css, js)
app.use(express.static(path.join(__dirname, 'frontend')));


// ── Conexión a la base de datos ──────────────────────────
const db = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'conexsac',
  port:     process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// ── Función para verificar el token de sesión ────────────
function verificarToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No has iniciado sesión' });

  try {
    const token = header.split(' ')[1];
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' });
  }
}

// ── Función para permitir solo al Administrador ──────────
function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  }
  next();
}


// ════════════════════════════════════════════════════════
//   LOGIN
// ════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Escribe tu usuario y contraseña' });
  }

  try {
    const [filas] = await db.query(
      `SELECT u.id, u.username, u.nombre, u.password, u.activo,
              r.nombre AS rol, s.nombre AS sede
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN sedes s ON s.id = u.sede_id
       WHERE u.username = ?`,
      [username]
    );

    const usuario = filas[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    if (!usuario.activo) {
      return res.status(401).json({ error: 'Tu usuario está bloqueado' });
    }
    if (usuario.password !== password) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: usuario.id, username: usuario.username, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id:       usuario.id,
        username: usuario.username,
        nombre:   usuario.nombre,
        rol:      usuario.rol,
        sede:     usuario.sede,
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});


// ════════════════════════════════════════════════════════
//   EQUIPOS (Inventario Interno)
// ════════════════════════════════════════════════════════

// Obtener todos los equipos (con filtros opcionales)
app.get('/api/equipos', verificarToken, async (req, res) => {
  try {
    let consulta = `
      SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.numero_serie,
             e.estado, e.observaciones,
             s.nombre AS sede,
             u.nombre AS responsable
      FROM equipos e
      LEFT JOIN sedes s    ON s.id = e.sede_id
      LEFT JOIN usuarios u ON u.id = e.responsable_id
      WHERE 1=1
    `;
    const valores = [];

    if (req.query.tipo) {
      consulta += ' AND e.tipo = ?';
      valores.push(req.query.tipo);
    }

    if (req.query.estado) {
      consulta += ' AND e.estado = ?';
      valores.push(req.query.estado);
    }

    if (req.query.buscar) {
      consulta += ' AND (e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR e.numero_serie LIKE ?)';
      const texto = `%${req.query.buscar}%`;
      valores.push(texto, texto, texto, texto);
    }

    consulta += ' ORDER BY e.id DESC';

    const [equipos] = await db.query(consulta, valores);
    res.json(equipos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los equipos' });
  }
});

// Registrar un nuevo equipo (de sedes internas o desde clientes externos)
app.post('/api/equipos', verificarToken, async (req, res) => {
  const { tipo, marca, modelo, numero_serie, sede_id, responsable_id, estado, observaciones } = req.body;

  // Validar solo campos esenciales. Sede es opcional (puede venir de cliente externo)
  if (!tipo || !marca || !modelo || !numero_serie) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: tipo, marca, modelo y número de serie.' });
  }

  try {
    const [ultimo] = await db.query('SELECT codigo FROM equipos ORDER BY id DESC LIMIT 1');
    let numero = 1;
    if (ultimo[0]) {
      numero = parseInt(ultimo[0].codigo.replace('EQ-', ''), 10) + 1;
    }
    const codigo = 'EQ-' + String(numero).padStart(3, '0');

    const [resultado] = await db.query(
      `INSERT INTO equipos (codigo, tipo, marca, modelo, numero_serie, sede_id, responsable_id, estado, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo, tipo, marca, modelo, numero_serie, sede_id || null, responsable_id || null, estado || 'activo', observaciones || null]
    );

    res.status(201).json({ id: resultado.insertId, codigo, mensaje: 'Equipo registrado en la sede correctamente.' });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese número de serie ya existe' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el equipo' });
  }
});

// Editar un equipo existente
app.put('/api/equipos/:id', verificarToken, async (req, res) => {
  const { tipo, marca, modelo, numero_serie, sede_id, responsable_id, estado, observaciones } = req.body;

  try {
    await db.query(
      `UPDATE equipos SET tipo=?, marca=?, modelo=?, numero_serie=?, sede_id=?, responsable_id=?, estado=?, observaciones=?
       WHERE id=?`,
      [tipo, marca, modelo, numero_serie, sede_id, responsable_id, estado, observaciones, req.params.id]
    );
    res.json({ mensaje: 'Equipo actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el equipo' });
  }
});

// Eliminar un equipo (solo admin)
app.delete('/api/equipos/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    // Primero verificar si tiene movimientos asociados
    const [movimientos] = await db.query(
      'SELECT COUNT(*) as count FROM movimientos WHERE equipo_id = ?',
      [req.params.id]
    );

    if (movimientos[0].count > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar este equipo porque tiene ${movimientos[0].count} movimiento(s) registrado(s). Elimina primero los movimientos asociados.` 
      });
    }

    await db.query('DELETE FROM equipos WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Equipo eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el equipo: ' + error.message });
  }
});


// ════════════════════════════════════════════════════════
//   AUDITORÍA - Todos los movimientos (solo admin)
// ════════════════════════════════════════════════════════

app.get('/api/movimientos-admin', verificarToken, soloAdmin, async (req, res) => {
  try {
    let consulta = `
      SELECT m.id, m.tipo, m.cliente, m.fecha, m.observaciones,
             e.codigo AS equipo_codigo, e.marca, e.modelo,
             s.nombre AS sede,
             u.nombre AS usuario_nombre
      FROM movimientos m
      JOIN equipos e        ON e.id = m.equipo_id
      LEFT JOIN sedes s     ON s.id = m.sede_id
      JOIN usuarios u       ON u.id = m.usuario_id
      WHERE 1=1
    `;
    const valores = [];

    if (req.query.tipo) {
      consulta += ' AND m.tipo = ?';
      valores.push(req.query.tipo);
    }

    if (req.query.buscar) {
      consulta += ' AND (e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ?)';
      const texto = `%${req.query.buscar}%`;
      valores.push(texto, texto, texto);
    }

    consulta += ' ORDER BY m.fecha DESC';

    const [movimientos] = await db.query(consulta, valores);
    res.json(movimientos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ════════════════════════════════════════════════════════
//   MOVIMIENTOS (Entradas y salidas estrictas con Clientes Externos)
// ════════════════════════════════════════════════════════

app.get('/api/movimientos', verificarToken, async (req, res) => {
  try {
    let consulta = `
      SELECT m.id, m.tipo, m.cliente, m.fecha, m.observaciones,
             e.codigo AS equipo_codigo, e.marca, e.modelo,
             s.nombre AS sede,
             u.nombre AS responsable
      FROM movimientos m
      JOIN equipos e        ON e.id = m.equipo_id
      LEFT JOIN sedes s     ON s.id = m.sede_id
      JOIN usuarios u       ON u.id = m.usuario_id
      WHERE 1=1
    `;
    const valores = [];

    // Si el usuario es logística (no admin), filtra solo sus movimientos
    if (req.usuario.rol !== 'Administrador') {
      consulta += ' AND m.usuario_id = ?';
      valores.push(req.usuario.id);
    }

    if (req.query.tipo) {
      consulta += ' AND m.tipo = ?';
      valores.push(req.query.tipo);
    }

    if (req.query.buscar) {
      consulta += ' AND (e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ?)';
      const texto = `%${req.query.buscar}%`;
      valores.push(texto, texto, texto);
    }

    consulta += ' ORDER BY m.fecha DESC';

    const [movimientos] = await db.query(consulta, valores);
    res.json(movimientos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los movimientos' });
  }
});

// Registrar un nuevo movimiento (Flujo Externo)
app.post('/api/movimientos', verificarToken, async (req, res) => {
  const { equipo_id, tipo, cliente, observaciones } = req.body;

  // Validar datos básicos
  if (!equipo_id || !tipo) {
    return res.status(400).json({ error: 'Faltan datos. El equipo y tipo de movimiento son requeridos.' });
  }

  // Para entrada, cliente es obligatorio (viene de cliente externo)
  // Para salida, cliente es obligatorio (va hacia cliente)
  if (!cliente) {
    return res.status(400).json({ error: 'El cliente es obligatorio en todos los movimientos.' });
  }

  try {
    const [resultado] = await db.query(
      `INSERT INTO movimientos (equipo_id, tipo, cliente, usuario_id, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [equipo_id, tipo, cliente, req.usuario.id, observaciones || null]
    );

    res.status(201).json({ id: resultado.insertId, mensaje: `Movimiento de ${tipo} registrado exitosamente.` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el movimiento' });
  }
});


// ════════════════════════════════════════════════════════
//   USUARIOS (solo Administrador)
// ════════════════════════════════════════════════════════

app.get('/api/usuarios', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [usuarios] = await db.query(
      `SELECT u.id, u.username, u.nombre, u.email, u.activo,
              r.nombre AS rol, s.nombre AS sede
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN sedes s ON s.id = u.sede_id
       ORDER BY u.id`
    );
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
});

app.post('/api/usuarios', verificarToken, soloAdmin, async (req, res) => {
  const { username, nombre, email, password, rol_id, sede_id } = req.body;

  if (!username || !nombre || !email || !password || !rol_id) {
    return res.status(400).json({ error: 'Faltan datos del usuario' });
  }

  try {
    const [resultado] = await db.query(
      `INSERT INTO usuarios (username, nombre, email, password, rol_id, sede_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, nombre, email, password, rol_id, sede_id || null]
    );
    res.status(201).json({ id: resultado.insertId, mensaje: 'Usuario creado correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese usuario o correo ya existe' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

// Editar usuario (username, email, password)
app.put('/api/usuarios/:id', verificarToken, soloAdmin, async (req, res) => {
  const { username, email, password } = req.body;

  try {
    let query = 'UPDATE usuarios SET';
    let params = [];
    let updates = [];

    if (username) {
      updates.push('username = ?');
      params.push(username);
    }
    if (email) {
      updates.push('email = ?');
      params.push(email);
    }
    if (password) {
      updates.push('password = ?');
      params.push(password);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    query += ' ' + updates.join(', ') + ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(query, params);
    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El username o email ya está en uso' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

app.put('/api/usuarios/:id/bloquear', verificarToken, soloAdmin, async (req, res) => {
  try {
    await db.query('UPDATE usuarios SET activo = NOT activo WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Estado del usuario actualizado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

app.delete('/api/usuarios/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});


// ════════════════════════════════════════════════════════
//   CATÁLOGOS (sedes y roles)
// ════════════════════════════════════════════════════════

app.get('/api/sedes', verificarToken, async (req, res) => {
  const [sedes] = await db.query('SELECT * FROM sedes');
  res.json(sedes);
});

app.get('/api/roles', verificarToken, async (req, res) => {
  const [roles] = await db.query('SELECT * FROM roles');
  res.json(roles);
});


// ════════════════════════════════════════════════════════
//   PANEL PRINCIPAL (Resumen)
// ════════════════════════════════════════════════════════

app.get('/api/resumen', verificarToken, async (req, res) => {
  try {
    const [[totales]] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(estado='activo') AS activos,
              SUM(estado='reparacion') AS reparacion,
              SUM(estado='baja') AS bajas
       FROM equipos`
    );

    const [[hoy]] = await db.query(
      `SELECT SUM(tipo='entrada') AS entradas, SUM(tipo='salida') AS salidas
       FROM movimientos WHERE DATE(fecha) = CURDATE()`
    );

    const [ultimos] = await db.query(
      `SELECT m.tipo, m.fecha, e.codigo, e.marca, e.modelo, u.nombre AS responsable
       FROM movimientos m
       JOIN equipos e ON e.id = m.equipo_id
       JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY m.fecha DESC LIMIT 5`
    );

    res.json({ totales, hoy, ultimos });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el resumen' });
  }
});


// Editar movimiento (solo observaciones)
app.put('/api/movimientos/:id', verificarToken, async (req, res) => {
  const { observaciones } = req.body;

  try {
    await db.query('UPDATE movimientos SET observaciones = ? WHERE id = ?', 
      [observaciones || null, req.params.id]);
    res.json({ mensaje: 'Movimiento actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el movimiento' });
  }
});

// Eliminar movimiento (solo admin)
app.delete('/api/movimientos/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM movimientos WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Movimiento eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el movimiento' });
  }
});


// ── Iniciar el servidor ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Conex SAC corriendo en http://localhost:${PORT}`);
  console.log(`   Base de datos: conexsac @ localhost`);
  console.log(`   Presiona Ctrl+C para detener\n`);
});