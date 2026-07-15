// =====================================================
//  app.js – Conex SAC (Final)
//  Entrada: crea equipo automático
//  Salida: busca equipo existente
// ======================================================

const catalogoEquipos = {
  Router: {
    'Cisco': ['ISR 4321', 'ISR 4331', 'ISR 4351', 'ISR 4431', 'ISR 4451-X'],
    'MikroTik': ['RB4011', 'CCR1009', 'CCR2004']
  },
  Switch: {
    'Cisco': ['Catalyst 2960X-24PS-L', 'Catalyst 9200L-24P-4G', 'Catalyst 9300-24P'],
    'Ubiquiti': ['UniFi Switch 8 PoE', 'UniFi Switch 24 PoE', 'UniFi Switch Enterprise 24 PoE']
  },
  Firewall: {
    'Sophos': ['XGS 87', 'XGS 107', 'XGS 136'],
    'Fortinet': ['FortiGate 40F', 'FortiGate 60F', 'FortiGate 100F'],
    'Palo Alto': ['PA-220', 'PA-440', 'PA-820']
  },
  'Access Point': {
    'Cisco': ['Catalyst 9115AXI', 'Catalyst 9120AXI', 'Catalyst 9130AXI'],
    'Ubiquiti': ['UniFi U6 Lite', 'UniFi U6 Pro', 'UniFi U6 Enterprise']
  },
  UPS: {
    'APC': ['Smart-UPS 1000VA', 'Smart-UPS 1500VA', 'Smart-UPS 2200VA'],
    'Eaton': ['5E 1500VA', '5PX 1500VA', '9SX 2000VA']
  }
};

let rolActual    = 'admin';
let secActual    = 'panel';
let listaEquipos = [];
let listaSedes   = [];
let listaUsuarios = [];

const titulos = {
  panel:       'Panel principal',
  inventario:  'Inventario',
  movimientos: 'Movimientos',
  usuarios:    'Usuarios',
  reportes:    'Reportes',
  auditoria:   'Auditoría'
};

async function api(ruta, metodo = 'GET', datos = null) {
  const opciones = {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionStorage.getItem('token')
    }
  };
  if (datos) opciones.body = JSON.stringify(datos);
  const respuesta = await fetch('/api/' + ruta, opciones);
  const json = await respuesta.json();
  if (!respuesta.ok) throw new Error(json.error || 'Error en el servidor');
  return json;
}

// ────────────────────────────────────────────────────
//  VERIFICAR SESIÓN AL CARGAR LA PÁGINA
// ────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async function() {
  const token = sessionStorage.getItem('token');
  
  // Si hay token guardado, intenta mantener la sesión activa
  if (token) {
    try {
      // Decodificar el token para obtener info del usuario
      const partes = token.split('.');
      const payload = JSON.parse(atob(partes[1]));
      
      // Si el token aún es válido, loguea automáticamente
      rolActual = payload.rol === 'Administrador' ? 'admin' : 'logistica';
      
      document.getElementById('u-nombre').textContent = payload.username;
      document.getElementById('u-avatar').textContent = payload.username.substring(0, 2).toUpperCase();
      document.getElementById('u-rol').textContent    = payload.rol;
      
      document.querySelectorAll('.solo-admin').forEach(el =>
        el.style.display = rolActual === 'admin' ? 'flex' : 'none'
      );
      
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display   = 'flex';
      
      // Cargar datos
      await cargarCatalogos();
      await cargarPanel();
      await cargarEquipos();
      await cargarMovimientos();
      
    } catch (err) {
      // Token inválido o expirado, limpiar
      sessionStorage.removeItem('token');
      document.getElementById('login').style.display = 'flex';
      document.getElementById('app').style.display    = 'none';
    }
  }
});

// ────────────────────────────────────────────────────
//  LOGIN
// ────────────────────────────────────────────────────

function verClave() {
  const input = document.getElementById('clave');
  const btn   = document.querySelector('.ver-pass');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Ocultar';
  } else {
    input.type = 'password';
    btn.textContent = 'Ver';
  }
}

async function ingresar() {
  const usuario = document.getElementById('usuario').value.trim();
  const clave   = document.getElementById('clave').value;
  const error   = document.getElementById('login-error');
  error.style.display = 'none';
  if (!usuario || !clave) {
    error.textContent   = 'Completa usuario y contraseña.';
    error.style.display = 'block';
    return;
  }
  try {
    const datos = await api('login', 'POST', { username: usuario, password: clave });
    sessionStorage.setItem('token', datos.token);
    sessionStorage.setItem('usuario_id', datos.usuario.id);
    rolActual = datos.usuario.rol === 'Administrador' ? 'admin' : 'logistica';
    document.getElementById('u-nombre').textContent = datos.usuario.nombre;
    document.getElementById('u-avatar').textContent = datos.usuario.username.substring(0, 2).toUpperCase();
    document.getElementById('u-rol').textContent    = datos.usuario.rol;
    document.querySelectorAll('.solo-admin').forEach(el =>
      el.style.display = rolActual === 'admin' ? 'flex' : 'none'
    );
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display   = 'flex';
    await cargarCatalogos();
    await cargarPanel();
    await cargarEquipos();
    await cargarMovimientos();
  } catch (err) {
    error.textContent   = err.message;
    error.style.display = 'block';
  }
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && document.getElementById('login').style.display !== 'none') {
    ingresar();
  }
});

function salir() {
  sessionStorage.removeItem('token');
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display    = 'none';
  document.getElementById('usuario').value = '';
  document.getElementById('clave').value   = '';
}

// ────────────────────────────────────────────────────
//  NAVEGACIÓN
// ────────────────────────────────────────────────────

function irA(nombre, itemMenu) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  document.getElementById('sec-' + nombre).classList.add('activa');
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('activo'));
  if (itemMenu) itemMenu.classList.add('activo');
  document.getElementById('titulo-seccion').textContent = titulos[nombre];
  secActual = nombre;
  const btn   = document.getElementById('btn-accion');
  const texto = document.getElementById('btn-accion-texto');
  if (nombre === 'inventario') {
    btn.classList.remove('oculto');
    texto.textContent = 'Nuevo equipo';
  } else if (nombre === 'movimientos') {
    btn.classList.remove('oculto');
    texto.textContent = 'Registrar movimiento';
  } else {
    btn.classList.add('oculto');
  }
  if (nombre === 'usuarios')    cargarUsuarios();
  if (nombre === 'inventario')  cargarEquipos();
  if (nombre === 'movimientos') {
    cargarEquipos();
    cargarMovimientos();
  }
  if (nombre === 'reportes') { cargarReportes(); cargarUsuariosEnReportes(); }
  cerrarMenu();
}

function toggleMenu() {
  document.getElementById('menu').classList.toggle('abierto');
  document.getElementById('menu-capa').classList.toggle('abierto');
}

function cerrarMenu() {
  document.getElementById('menu').classList.remove('abierto');
  document.getElementById('menu-capa').classList.remove('abierto');
}

// ────────────────────────────────────────────────────
//  CATÁLOGOS
// ────────────────────────────────────────────────────

async function cargarCatalogos() {
  try {
    listaSedes    = await api('sedes');
    listaUsuarios = await api('usuarios').catch(() => []);
    
    // Cargar sedes en el select de inventario
    const selectSede = document.getElementById('eq-sede');
    if (selectSede) {
      selectSede.innerHTML = '<option value="">Selecciona la sede...</option>' + 
        listaSedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    }
  } catch (err) {
    console.error('Error al cargar catálogos:', err.message);
  }
}

function actualizarMarcas() {
  const tipo = document.getElementById('eq-tipo').value;
  const selectMarca = document.getElementById('eq-marca');
  if (!tipo) {
    selectMarca.innerHTML = '<option value="">Selecciona el tipo primero</option>';
  } else {
    const marcas = Object.keys(catalogoEquipos[tipo]);
    selectMarca.innerHTML = '<option value="">Selecciona...</option>' +
      marcas.map(m => `<option value="${m}">${m}</option>`).join('');
  }
  document.getElementById('eq-modelo').innerHTML = '<option value="">Selecciona la marca primero</option>';
}

function actualizarModelos() {
  const tipo  = document.getElementById('eq-tipo').value;
  const marca = document.getElementById('eq-marca').value;
  const selectModelo = document.getElementById('eq-modelo');
  if (!marca) {
    selectModelo.innerHTML = '<option value="">Selecciona la marca primero</option>';
  } else {
    const modelos = catalogoEquipos[tipo][marca];
    selectModelo.innerHTML = '<option value="">Selecciona...</option>' +
      modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

function actualizarMarcasMovimiento() {
  const tipo = document.getElementById('mov-tipo-equipo').value;
  const selectMarca = document.getElementById('mov-marca');
  if (!tipo) {
    selectMarca.innerHTML = '<option value="">Selecciona el tipo primero</option>';
  } else {
    const marcas = Object.keys(catalogoEquipos[tipo]);
    selectMarca.innerHTML = '<option value="">Selecciona...</option>' +
      marcas.map(m => `<option value="${m}">${m}</option>`).join('');
  }
  document.getElementById('mov-modelo').innerHTML = '<option value="">Selecciona la marca primero</option>';
}

function actualizarModelosMovimiento() {
  const tipo  = document.getElementById('mov-tipo-equipo').value;
  const marca = document.getElementById('mov-marca').value;
  const selectModelo = document.getElementById('mov-modelo');
  if (!marca) {
    selectModelo.innerHTML = '<option value="">Selecciona la marca primero</option>';
  } else {
    const modelos = catalogoEquipos[tipo][marca];
    selectModelo.innerHTML = '<option value="">Selecciona...</option>' +
      modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

// ── Para Movimientos SALIDA ──
function actualizarMarcasMovimientoSalida() {
  const tipo = document.getElementById('mov-tipo-equipo-salida').value;
  const selectMarca = document.getElementById('mov-marca-salida');
  if (!tipo) {
    selectMarca.innerHTML = '<option value="">Selecciona el tipo primero</option>';
  } else {
    const marcas = Object.keys(catalogoEquipos[tipo]);
    selectMarca.innerHTML = '<option value="">Selecciona...</option>' +
      marcas.map(m => `<option value="${m}">${m}</option>`).join('');
  }
  document.getElementById('mov-modelo-salida').innerHTML = '<option value="">Selecciona la marca primero</option>';
}

function actualizarModelosMovimientoSalida() {
  const tipo  = document.getElementById('mov-tipo-equipo-salida').value;
  const marca = document.getElementById('mov-marca-salida').value;
  const selectModelo = document.getElementById('mov-modelo-salida');
  if (!marca) {
    selectModelo.innerHTML = '<option value="">Selecciona la marca primero</option>';
  } else {
    const modelos = catalogoEquipos[tipo][marca];
    selectModelo.innerHTML = '<option value="">Selecciona...</option>' +
      modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

// ────────────────────────────────────────────────────
//  PANEL PRINCIPAL
// ────────────────────────────────────────────────────

async function cargarPanel() {
  try {
    const datos = await api('resumen');
    document.getElementById('stat-total').textContent      = datos.totales.total || 0;
    document.getElementById('stat-activos').textContent    = datos.totales.activos || 0;
    document.getElementById('stat-reparacion').textContent = datos.totales.reparacion || 0;
    document.getElementById('stat-bajas').textContent      = datos.totales.bajas || 0;
    document.getElementById('stat-entradas').textContent   = datos.hoy.entradas || 0;
    document.getElementById('stat-salidas').textContent    = datos.hoy.salidas || 0;
    const cuerpo = document.getElementById('panel-movimientos');
    if (!datos.ultimos.length) {
      cuerpo.innerHTML = '<tr><td colspan="4" class="vacio">Aún no hay movimientos</td></tr>';
    } else {
      cuerpo.innerHTML = datos.ultimos.map(m => `
        <tr>
          <td>${m.codigo} – ${m.marca} ${m.modelo}</td>
          <td><span class="badge b-${m.tipo}">${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</span></td>
          <td>${m.responsable}</td>
          <td>${new Date(m.fecha).toLocaleString()}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error al cargar el panel:', err.message);
  }
}

// ────────────────────────────────────────────────────
//  INVENTARIO
// ────────────────────────────────────────────────────

async function cargarEquipos() {
  try {
    const buscar = document.getElementById('inv-buscar').value;
    const tipo   = document.getElementById('inv-tipo').value;
    const estado = document.getElementById('inv-estado').value;
    const params = new URLSearchParams();
    if (buscar) params.append('buscar', buscar);
    if (tipo)   params.append('tipo', tipo);
    if (estado) params.append('estado', estado);
    listaEquipos = await api('equipos?' + params.toString());
    const cuerpo = document.getElementById('inv-tabla');
    if (!listaEquipos.length) {
      cuerpo.innerHTML = '<tr><td colspan="8" class="vacio">No hay equipos registrados</td></tr>';
      return;
    }
    cuerpo.innerHTML = listaEquipos.map(e => `
      <tr>
        <td>${e.codigo}</td>
        <td>${e.tipo}</td>
        <td>${e.marca} ${e.modelo}</td>
        <td style="font-family:monospace">${e.numero_serie}</td>
        <td>${e.sede || '—'}</td>
        <td>${e.responsable || '—'}</td>
        <td><span class="badge b-${e.estado}">${e.estado === 'reparacion' ? 'En reparación' : e.estado.charAt(0).toUpperCase() + e.estado.slice(1)}</span></td>
        <td>
          <button class="btn-ico rojo" onclick="eliminarEquipo(${e.id})"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar equipos:', err.message);
  }
}

async function eliminarEquipo(id) {
  if (!confirm('¿Seguro que quieres eliminar este equipo?')) return;
  try {
    await api('equipos/' + id, 'DELETE');
    alert('✅ Equipo eliminado correctamente');
    cargarEquipos();
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ────────────────────────────────────────────────────
//  MOVIMIENTOS
// ────────────────────────────────────────────────────

async function cargarMovimientos() {
  try {
    const buscar = document.getElementById('mov-buscar').value;
    const tipo   = document.getElementById('mov-filtro').value;
    const params = new URLSearchParams();
    if (buscar) params.append('buscar', buscar);
    if (tipo)   params.append('tipo', tipo);
    
    const movimientos = await api('movimientos?' + params.toString());
    const cuerpo = document.getElementById('mov-tabla');
    if (!movimientos.length) {
      cuerpo.innerHTML = '<tr><td colspan="7" class="vacio">No hay movimientos registrados</td></tr>';
      return;
    }
    cuerpo.innerHTML = movimientos.map(m => `
      <tr>
        <td>${m.equipo_codigo} – ${m.marca} ${m.modelo}</td>
        <td><span class="badge b-${m.tipo}">${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</span></td>
        <td>${m.sede || '—'}</td>
        <td>${m.cliente || '—'}</td>
        <td>${m.responsable}</td>
        <td>${new Date(m.fecha).toLocaleString()}</td>
        <td>${m.observaciones || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar movimientos:', err.message);
  }
}

// ────────────────────────────────────────────────────
//  AUDITORÍA (Solo Admin - ve TODOS los movimientos)
// ────────────────────────────────────────────────────


// ────────────────────────────────────────────────────
//  USUARIOS
// ────────────────────────────────────────────────────

async function cargarUsuarios() {
  try {
    const usuarios = await api('usuarios');
    const cuerpo = document.getElementById('usr-tabla');
    cuerpo.innerHTML = usuarios.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.nombre}</td>
        <td><span class="badge ${u.rol === 'Administrador' ? 'b-admin' : 'b-logistica'}">${u.rol}</span></td>
        <td>${u.sede || '—'}</td>
        <td><span class="badge ${u.activo ? 'b-activo' : 'b-baja'}">${u.activo ? 'Activo' : 'Bloqueado'}</span></td>
        <td>
          <button class="btn-ico" onclick="abrirEditarUsuario(${u.id}, '${u.email}')" title="Editar contraseña y correo">
            <i class="fa-solid fa-edit"></i>
          </button>
          <button class="btn-ico" onclick="bloquearUsuario(${u.id})" title="Bloquear/Desbloquear">
            <i class="fa-solid fa-lock"></i>
          </button>
          <button class="btn-ico rojo" onclick="eliminarUsuario(${u.id})" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar usuarios:', err.message);
  }
}

async function bloquearUsuario(id) {
  try {
    await api('usuarios/' + id + '/bloquear', 'PUT');
    cargarUsuarios();
  } catch (err) {
    alert(err.message);
  }
}

async function eliminarUsuario(id) {
  if (!confirm('¿Seguro que quieres eliminar este usuario?')) return;
  try {
    await api('usuarios/' + id, 'DELETE');
    cargarUsuarios();
  } catch (err) {
    alert(err.message);
  }
}

// ────────────────────────────────────────────────────
//  MODAL
// ────────────────────────────────────────────────────

function abrirModal() {
  const esMovimiento = secActual === 'movimientos';
  document.getElementById('modal-titulo').textContent =
    esMovimiento ? 'Registrar movimiento' : 'Registrar nuevo equipo';
  document.getElementById('form-equipo').style.display     = esMovimiento ? 'none'  : 'block';
  document.getElementById('form-movimiento').style.display = esMovimiento ? 'block' : 'none';
  document.getElementById('form-usuario').style.display    = 'none';
  document.getElementById('form-editar-usuario').style.display = 'none';
  document.getElementById('modal-fondo').classList.add('abierto');
}

function cerrarModal() {
  document.getElementById('modal-fondo').classList.remove('abierto');
}

function cerrarModalFondo(e) {
  if (e.target === document.getElementById('modal-fondo')) cerrarModal();
}

function camposMov() {
  const tipo = document.getElementById('mov-tipo').value;
  document.getElementById('campo-entrada').style.display  = tipo === 'entrada' ? 'block' : 'none';
  document.getElementById('campo-salida').style.display   = tipo === 'salida'  ? 'block' : 'none';
}

// ────────────────────────────────────────────────────
//  GUARDAR (Equipo o Movimiento)
// ────────────────────────────────────────────────────

async function guardar() {
  const esMovimiento = secActual === 'movimientos';
  const esUsuario = document.getElementById('form-usuario').style.display !== 'none';
  const esEditarUsuario = document.getElementById('form-editar-usuario').style.display !== 'none';

  if (esEditarUsuario) {
    await guardarEditarUsuario();
    return;
  }

  if (esUsuario) {
    await crearUsuario();
    return;
  }

  try {
    if (esMovimiento) {
      // ════════════════════════════════════════
      //  GUARDAR MOVIMIENTO
      // ════════════════════════════════════════
      const tipo = document.getElementById('mov-tipo').value;

      if (tipo === 'entrada') {
        // ── ENTRADA: Crear equipo nuevo automáticamente ──
        const tipoEq = document.getElementById('mov-tipo-equipo').value.trim();
        const marca = document.getElementById('mov-marca').value.trim();
        const modelo = document.getElementById('mov-modelo').value.trim();
        const serie = document.getElementById('mov-serie-entrada').value.trim();
        const clienteOrigen = document.getElementById('mov-cliente-origen').value.trim();
        const obs = document.getElementById('mov-obs').value.trim();

        if (!tipoEq || !marca || !modelo || !serie || !clienteOrigen) {
          throw new Error('Completa todos los campos: tipo, marca, modelo, serie y origen del equipo (cliente/reparación/almacén/etc.)');
        }

        // ⚠️ VALIDAR: ¿Existe ya esta serie en inventario?
        const equipoExistente = listaEquipos.find(e => e.numero_serie === serie);
        if (equipoExistente) {
          alert(`⚠️ ALERTA: Ya existe un equipo con serie ${serie} en el inventario.\n\nCódigo: ${equipoExistente.codigo}\nTipo: ${equipoExistente.tipo}\n\n¿Estás seguro de crear otro con la misma serie?`);
          return;
        }

        // Crear el equipo primero
        const equipoCreado = await api('equipos', 'POST', {
          tipo: tipoEq,
          marca: marca,
          modelo: modelo,
          numero_serie: serie,
          sede_id: null,
          responsable_id: parseInt(sessionStorage.getItem('usuario_id')),
          estado: 'activo',
          observaciones: 'Recibido desde cliente: ' + clienteOrigen
        });

        // Luego registrar el movimiento
        await api('movimientos', 'POST', {
          equipo_id: equipoCreado.id,
          tipo: 'entrada',
          cliente: clienteOrigen,
          observaciones: obs
        });

        alert('✅ Equipo creado y entrada registrada exitosamente');

      } else {
        // ── SALIDA: Buscar equipo existente con catálogo ──
        const tipoEq = document.getElementById('mov-tipo-equipo-salida').value.trim();
        const marcaSalida = document.getElementById('mov-marca-salida').value.trim();
        const modeloSalida = document.getElementById('mov-modelo-salida').value.trim();
        const buscarSerie = document.getElementById('mov-serie-salida').value.trim();
        const clienteDestino = document.getElementById('mov-cliente-destino').value.trim();
        const obs = document.getElementById('mov-obs').value.trim();

        if (!tipoEq || !marcaSalida || !modeloSalida || !buscarSerie || !clienteDestino) {
          throw new Error('Completa todos los campos: tipo, marca, modelo, serie y cliente destino');
        }

        // Buscar el equipo por serie EN EL INVENTARIO
        const equipoEncontrado = listaEquipos.find(e => 
          e.numero_serie === buscarSerie && 
          e.tipo === tipoEq && 
          e.marca === marcaSalida && 
          e.modelo === modeloSalida
        );

        if (!equipoEncontrado) {
          throw new Error(`Equipo no encontrado en inventario.\n\nVerifica:\n- Serie: ${buscarSerie}\n- Tipo: ${tipoEq}\n- Marca: ${marcaSalida}\n- Modelo: ${modeloSalida}`);
        }

        // Registrar el movimiento de salida
        await api('movimientos', 'POST', {
          equipo_id: equipoEncontrado.id,
          tipo: 'salida',
          cliente: clienteDestino,
          observaciones: obs
        });

        alert('✅ Salida registrada exitosamente');
      }

      // Limpiar formulario
      document.getElementById('mov-tipo-equipo').value = '';
      document.getElementById('mov-marca').innerHTML = '<option value="">Selecciona el tipo primero</option>';
      document.getElementById('mov-modelo').innerHTML = '<option value="">Selecciona la marca primero</option>';
      document.getElementById('mov-serie-entrada').value = '';
      document.getElementById('mov-tipo-equipo-salida').value = '';
      document.getElementById('mov-marca-salida').innerHTML = '<option value="">Selecciona el tipo primero</option>';
      document.getElementById('mov-modelo-salida').innerHTML = '<option value="">Selecciona la marca primero</option>';
      document.getElementById('mov-serie-salida').value = '';
      document.getElementById('mov-cliente-origen').value = '';
      document.getElementById('mov-cliente-destino').value = '';
      document.getElementById('mov-obs').value = '';

      cargarMovimientos();
      cargarPanel();
      cargarEquipos();

    } else {
      // ════════════════════════════════════════
      //  GUARDAR EQUIPO (Inventario)
      // ════════════════════════════════════════
      const tipo = document.getElementById('eq-tipo').value.trim();
      const marca = document.getElementById('eq-marca').value.trim();
      const modelo = document.getElementById('eq-modelo').value.trim();
      const serie = document.getElementById('eq-serie').value.trim();
      const sede = document.getElementById('eq-sede').value || null;

      if (!tipo || !marca || !modelo || !serie) {
        throw new Error('Completa todos los campos: tipo, marca, modelo y serie');
      }

      // ⚠️ VALIDAR: ¿Existe ya esta serie?
      const duplicado = listaEquipos.find(e => e.numero_serie === serie);
      if (duplicado) {
        alert(`⚠️ ALERTA: Ya existe un equipo con serie ${serie}\n\nCódigo: ${duplicado.codigo}\nTipo: ${duplicado.tipo} ${duplicado.marca} ${duplicado.modelo}`);
        return;
      }

      await api('equipos', 'POST', {
        tipo: tipo,
        marca: marca,
        modelo: modelo,
        numero_serie: serie,
        sede_id: sede,
        responsable_id: parseInt(sessionStorage.getItem('usuario_id')),
        estado: document.getElementById('eq-estado').value,
        observaciones: document.getElementById('eq-procedencia').value + ' | ' + document.getElementById('eq-obs').value
      });

      alert('✅ Equipo registrado exitosamente');

      // Limpiar
      document.getElementById('eq-tipo').value = '';
      document.getElementById('eq-sede').value = '';
      document.getElementById('eq-estado').value = 'activo';
      document.getElementById('eq-marca').innerHTML = '<option value="">Selecciona el tipo primero</option>';
      document.getElementById('eq-modelo').innerHTML = '<option value="">Selecciona la marca primero</option>';
      document.getElementById('eq-serie').value = '';
      document.getElementById('eq-procedencia').value = '';
      document.getElementById('eq-obs').value = '';

      cargarEquipos();
      cargarPanel();
    }

    cerrarModal();

  } catch (err) {
    alert('Error: ' + err.message);
  }
}// ────────────────────────────────────────────────────
//  MODAL USUARIO - Crear nuevo usuario
// ────────────────────────────────────────────────────

function abrirModalUsuario() {
  document.getElementById('modal-titulo').textContent = 'Crear nuevo usuario';
  document.getElementById('form-equipo').style.display = 'none';
  document.getElementById('form-movimiento').style.display = 'none';
  document.getElementById('form-editar-usuario').style.display = 'none';
  document.getElementById('form-usuario').style.display = 'block';
  
  // Cambiar texto del botón
  document.getElementById('btn-accion-texto').textContent = 'Crear usuario';
  
  // Cargar opciones de sede
  const selectSede = document.getElementById('usr-sede');
  selectSede.innerHTML = listaSedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  
  document.getElementById('modal-fondo').classList.add('abierto');
}

// ────────────────────────────────────────────────────
//  CREAR USUARIO
// ────────────────────────────────────────────────────

async function crearUsuario() {
  const username = document.getElementById('usr-username').value.trim();
  const nombre = document.getElementById('usr-nombre').value.trim();
  const email = document.getElementById('usr-email').value.trim();
  const rol_id = document.getElementById('usr-rol').value;
  const sede_id = document.getElementById('usr-sede').value;
  const password = document.getElementById('usr-password').value;

  if (!username || !nombre || !email || !password) {
    alert('Completa todos los campos');
    return;
  }

  try {
    await api('usuarios', 'POST', {
      username: username,
      nombre: nombre,
      email: email,
      password: password,
      rol_id: rol_id,
      sede_id: sede_id,
      activo: 1
    });

    alert('✅ Usuario creado exitosamente');
    
    // Limpiar
    document.getElementById('usr-username').value = '';
    document.getElementById('usr-nombre').value = '';
    document.getElementById('usr-email').value = '';
    document.getElementById('usr-password').value = '';
    
    cerrarModal();
    cargarUsuarios();
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ────────────────────────────────────────────────────
//  REPORTES (reemplaza Auditoría)
// ────────────────────────────────────────────────────

async function cargarReportes() {
  try {
    const buscar = document.getElementById('rep-buscar').value;
    const usuario = document.getElementById('rep-usuario').value;
    const tipo = document.getElementById('rep-tipo').value;
    
    const params = new URLSearchParams();
    if (buscar) params.append('buscar', buscar);
    if (tipo) params.append('tipo', tipo);
    
    // Hacemos un fetch directo SIN filtro de usuario (admin ve todo)
    const opciones = {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + sessionStorage.getItem('token')
      }
    };
    
    const respuesta = await fetch('/api/movimientos-admin?' + params.toString(), opciones);
    const movimientos = await respuesta.json();
    
    // Filtrar por usuario en el cliente si está seleccionado
    const movimientosFiltrados = usuario 
      ? movimientos.filter(m => m.usuario_nombre === usuario)
      : movimientos;
    
    // Guardar en variable global para exportación
    window.reporteActual = movimientosFiltrados;
    
    const cuerpo = document.getElementById('rep-tabla');
    if (!movimientosFiltrados.length) {
      cuerpo.innerHTML = '<tr><td colspan="7" class="vacio">No hay registros</td></tr>';
      return;
    }
    
    cuerpo.innerHTML = movimientosFiltrados.map(m => `
      <tr>
        <td>${m.usuario_nombre}</td>
        <td>${m.equipo_codigo} – ${m.marca} ${m.modelo}</td>
        <td><span class="badge b-${m.tipo}">${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</span></td>
        <td>${m.cliente || '—'}</td>
        <td>${new Date(m.fecha).toLocaleString()}</td>
        <td>${m.observaciones || '—'}</td>
        <td>
          <button class="btn-ico rojo" onclick="eliminarMovimiento(${m.id})" title="Eliminar movimiento">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar reportes:', err.message);
  }
}

// Cargar lista de usuarios en el select de filtro de reportes
async function cargarUsuariosEnReportes() {
  try {
    const usuarios = await api('usuarios');
    const selectUsuario = document.getElementById('rep-usuario');
    const opcionesHTML = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    const htmlActual = selectUsuario.innerHTML;
    selectUsuario.innerHTML = `<option value="">Todos los usuarios</option>${opcionesHTML}`;
  } catch (err) {
    console.error('Error al cargar usuarios:', err.message);
  }
}

// ────────────────────────────────────────────────────
//  EXPORTACIÓN A EXCEL
// ────────────────────────────────────────────────────

function exportarExcel() {
  if (!window.reporteActual || !window.reporteActual.length) {
    alert('No hay datos para exportar');
    return;
  }

  let csv = 'Usuario,Equipo,Tipo,Cliente,Fecha,Observaciones\n';
  window.reporteActual.forEach(m => {
    const equipo = `${m.equipo_codigo} - ${m.marca} ${m.modelo}`;
    const tipo = m.tipo === 'entrada' ? 'Entrada' : 'Salida';
    const fecha = new Date(m.fecha).toLocaleString();
    const obs = (m.observaciones || '-').replace(/,/g, ';');
    csv += `"${m.usuario_nombre}","${equipo}","${tipo}","${m.cliente || '-'}","${fecha}","${obs}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `reporte-movimientos-${new Date().toISOString().split('T')[0]}.csv`);
  link.click();
}

// ────────────────────────────────────────────────────
//  EXPORTACIÓN A PDF
// ────────────────────────────────────────────────────

function exportarPDF() {
  if (!window.reporteActual || !window.reporteActual.length) {
    alert('No hay datos para exportar');
    return;
  }

  let html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte de Movimientos</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { text-align: center; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #0066cc; color: white; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
      </style>
    </head>
    <body>
      <h1>Reporte de Movimientos de Equipos</h1>
      <p><strong>Fecha de generación:</strong> ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Equipo</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
  `;

  window.reporteActual.forEach(m => {
    const tipo = m.tipo === 'entrada' ? 'Entrada' : 'Salida';
    const fecha = new Date(m.fecha).toLocaleString();
    html += `
      <tr>
        <td>${m.usuario_nombre}</td>
        <td>${m.equipo_codigo} – ${m.marca} ${m.modelo}</td>
        <td>${tipo}</td>
        <td>${m.cliente || '-'}</td>
        <td>${fecha}</td>
        <td>${m.observaciones || '-'}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte-movimientos-${new Date().toISOString().split('T')[0]}.html`;
  link.click();
}

// ────────────────────────────────────────────────────
//  IMPRIMIR REPORTE
// ────────────────────────────────────────────────────

function imprimirReporte() {
  if (!window.reporteActual || !window.reporteActual.length) {
    alert('No hay datos para imprimir');
    return;
  }

  let html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte de Movimientos</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { text-align: center; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #0066cc; color: white; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <h1>Reporte de Movimientos de Equipos</h1>
      <p><strong>Fecha de generación:</strong> ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Equipo</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
  `;

  window.reporteActual.forEach(m => {
    const tipo = m.tipo === 'entrada' ? 'Entrada' : 'Salida';
    const fecha = new Date(m.fecha).toLocaleString();
    html += `
      <tr>
        <td>${m.usuario_nombre}</td>
        <td>${m.equipo_codigo} – ${m.marca} ${m.modelo}</td>
        <td>${tipo}</td>
        <td>${m.cliente || '-'}</td>
        <td>${fecha}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const ventana = window.open('', 'PRINT', 'height=600,width=800');
  ventana.document.write(html);
  ventana.document.close();
  ventana.print();
}

// ────────────────────────────────────────────────────
//  EDITAR USUARIO
// ────────────────────────────────────────────────────

function abrirEditarUsuario(id, emailActual) {
  window.usuarioEditarId = id;
  document.getElementById('modal-titulo').textContent = 'Editar usuario';
  document.getElementById('form-equipo').style.display = 'none';
  document.getElementById('form-movimiento').style.display = 'none';
  document.getElementById('form-usuario').style.display = 'none';
  
  // Mostrar formulario de edición
  document.getElementById('form-editar-usuario').style.display = 'block';
  document.getElementById('editar-email').value = emailActual;
  document.getElementById('editar-password').value = '';
  
  // Cambiar texto del botón
  document.getElementById('btn-accion-texto').textContent = 'Guardar cambios';
  
  document.getElementById('modal-fondo').classList.add('abierto');
}

async function guardarEditarUsuario() {
  const id = window.usuarioEditarId;
  const username = document.getElementById('editar-username').value.trim();
  const email = document.getElementById('editar-email').value.trim();
  const password = document.getElementById('editar-password').value;

  if (!username || !email) {
    alert('Completa usuario y correo');
    return;
  }

  try {
    const datos = { username: username, email: email };
    if (password) datos.password = password;
    
    await api('usuarios/' + id, 'PUT', datos);
    alert('✅ Usuario actualizado');
    cerrarModal();
    cargarUsuarios();
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ────────────────────────────────────────────────────
//  ELIMINAR MOVIMIENTOS
// ────────────────────────────────────────────────────

function eliminarMovimiento(id) {
  if (!confirm('¿Seguro que quieres eliminar este movimiento?')) return;
  
  const token = sessionStorage.getItem('token');
  fetch('/api/movimientos/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => r.json())
  .then(data => {
    alert('✅ Movimiento eliminado');
    cargarReportes();
  })
  .catch(err => alert('❌ Error: ' + err.message));
}