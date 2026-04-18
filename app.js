/* ============================================================
   TAZOS DORADOS · app.js v3
   NUEVO en esta versión:
   - Módulo completo de Juegos (CRUD)
   - Detalle de juego con scoreboard
   - Capturar resultado con preview W/L/T
   - Duplicar juego (para equipos recurrentes)
   - FAB también funciona en pantalla Calendario
   - Home ahora navega al detalle del próximo juego al tocarlo
   ============================================================ */

const { createClient } = window.supabase;
const db = createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabasePublishableKey,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const state = { user: null, isTesorero: false, currentScreen: 'home' };

const POSICIONES = [
  { code: 'P', name: 'Pitcher' }, { code: 'C', name: 'Catcher' },
  { code: '1B', name: '1ª Base' }, { code: '2B', name: '2ª Base' },
  { code: '3B', name: '3ª Base' }, { code: 'SS', name: 'Shortstop' },
  { code: 'LF', name: 'Jardín Izq.' }, { code: 'CF', name: 'Jardín Cen.' },
  { code: 'RF', name: 'Jardín Der.' }, { code: 'DH', name: 'Bat. Des.' },
  { code: 'Utility', name: 'Utility' }
];

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function formatDateShort(dateStr) {
  if (!dateStr) return { day: '??', month: '???' };
  const d = new Date(dateStr + 'T12:00:00');
  const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  return { day: String(d.getDate()).padStart(2, '0'), month: meses[d.getMonth()] };
}

function formatDateLong(dateStr, hora) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const dias = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
  const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  let result = `${dias[d.getDay()]} · ${d.getDate()} ${meses[d.getMonth()]}`;
  if (hora) {
    const [h, m] = hora.split(':');
    const hNum = parseInt(h);
    const ampm = hNum >= 12 ? 'PM' : 'AM';
    const h12 = hNum > 12 ? hNum - 12 : (hNum === 0 ? 12 : hNum);
    result += ` · ${h12}:${m} ${ampm}`;
  }
  return result;
}

function formatHour(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':');
  const hNum = parseInt(h);
  const ampm = hNum >= 12 ? 'PM' : 'AM';
  const h12 = hNum > 12 ? hNum - 12 : (hNum === 0 ? 12 : hNum);
  return `${h12}:${m} ${ampm}`;
}

function getInitials(nombre) {
  if (!nombre) return '??';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function errorBox(msg, detail) {
  return `<div class="error-state"><strong>⚠ No se pudo cargar</strong>${escapeHtml(msg)}${detail ? `<div style="margin-top:6px; font-size:11px; opacity:0.7; font-family: monospace;">${escapeHtml(detail)}</div>` : ''}</div>`;
}

function calcAge(fechaNac) {
  if (!fechaNac) return null;
  const nac = new Date(fechaNac);
  const hoy = new Date();
  let age = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) age--;
  return age;
}

// Calcula resultado W/L/T a partir de marcador
function calcResult(tazos, rival) {
  const t = Number(tazos), r = Number(rival);
  if (t > r) return 'W';
  if (t < r) return 'L';
  return 'T';
}

// ============================================================
// MODAL SYSTEM
// ============================================================
const modalBackdrop = document.getElementById('modalBackdrop');
const modalContent = document.getElementById('modalContent');

function openModal(html) {
  modalContent.innerHTML = html;
  modalBackdrop.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalBackdrop.classList.remove('show');
  document.body.style.overflow = '';
}

modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// ============================================================
// AUTH
// ============================================================
async function checkAuthStatus() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    state.user = session.user;
    const { data: tesorero } = await db.from('tesoreros').select('*').eq('user_id', session.user.id).maybeSingle();
    if (tesorero) {
      state.isTesorero = true;
      enableTesoreroMode(tesorero.nombre);
    }
  }
}

function enableTesoreroMode(nombre) {
  document.body.classList.add('tesorero-mode');
  const btn = document.getElementById('adminBtn');
  btn.innerHTML = '<span class="crown-badge">👑</span>';
  btn.classList.add('active');
  btn.title = `Tesorero: ${nombre}`;
  document.getElementById('header-subtitle').textContent = `TESORERO · ${(nombre || '').toUpperCase()}`;
}

function disableTesoreroMode() {
  document.body.classList.remove('tesorero-mode');
  const btn = document.getElementById('adminBtn');
  btn.innerHTML = '🔒';
  btn.classList.remove('active');
  btn.title = 'Modo tesorero';
  document.getElementById('header-subtitle').textContent = 'LIGA VETERANOS 40+ · 2026';
  state.user = null;
  state.isTesorero = false;
}

function showLoginModal() {
  openModal(`
    <div class="modal-header">
      <h2>ACCESO TESORERO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="login-intro">
        <div class="crown">👑</div>
        <div class="title">"TE GANASTE LA BECA"</div>
        <div class="quote">Coqueto, necesito tus datos</div>
      </div>
      <form id="loginForm">
        <div id="loginError"></div>
        <div class="form-group">
          <label class="form-label">Correo</label>
          <input type="email" class="form-input" id="loginEmail" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input type="password" class="form-input" id="loginPassword" required autocomplete="current-password">
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="loginSubmit">Entrar</button>
    </div>
  `);

  document.getElementById('loginSubmit').addEventListener('click', handleLogin);
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin();
  });
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmit');

  if (!email || !password) {
    errorDiv.innerHTML = '<div class="form-error">Completa los dos campos</div>';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando...';
  errorDiv.innerHTML = '';

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: tesorero } = await db.from('tesoreros').select('*').eq('user_id', data.user.id).maybeSingle();

    if (!tesorero) {
      await db.auth.signOut();
      throw new Error('Tu usuario no tiene permisos de tesorero.');
    }

    state.user = data.user;
    state.isTesorero = true;
    enableTesoreroMode(tesorero.nombre);
    closeModal();
    reloadCurrentScreen();
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Error al entrar')}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
}

function showLogoutConfirm() {
  openModal(`
    <div class="modal-header">
      <h2>SALIR DE MODO TESORERO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">👋</div>
        <p style="color: var(--cream-2);">¿Seguro que quieres salir?</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="handleLogout()">Salir</button>
    </div>
  `);
}

async function handleLogout() {
  await db.auth.signOut();
  disableTesoreroMode();
  closeModal();
  reloadCurrentScreen();
}

document.getElementById('adminBtn').addEventListener('click', () => {
  if (state.isTesorero) showLogoutConfirm();
  else showLoginModal();
});

// ============================================================
// PANTALLA: INICIO
// ============================================================
async function loadHome() {
  const container = document.getElementById('home-content');
  try {
    const [nextGameRes, recordRes, balanceRes, expensesRes] = await Promise.all([
      db.from('v_next_game').select('*').maybeSingle(),
      db.from('v_season_record').select('*').maybeSingle(),
      db.from('v_team_balance').select('*').maybeSingle(),
      db.from('expenses').select('*').order('fecha', { ascending: false }).limit(4)
    ]);

    const nextGame = nextGameRes.data;
    const record = recordRes.data || { wins: 0, losses: 0, ties: 0 };
    const balance = balanceRes.data || { balance: 0, total_ingresos: 0 };
    const recentExpenses = expensesRes.data || [];

    let html = '';

    if (nextGame) {
      html += `
        <div class="next-game" onclick="showGameDetail('${nextGame.id}')">
          <div class="game-date">${formatDateLong(nextGame.fecha, nextGame.hora)}</div>
          <div class="game-matchup">
            <div class="team-side">
              <div class="team-name us">TAZOS</div>
              <div class="team-label">${nextGame.es_local ? 'LOCAL' : 'VISITA'}</div>
            </div>
            <div class="vs-box">VS</div>
            <div class="team-side">
              <div class="team-name">${escapeHtml(nextGame.rival || 'POR DEFINIR')}</div>
              <div class="team-label">${nextGame.es_local ? 'VISITA' : 'LOCAL'}</div>
            </div>
          </div>
          <div class="game-meta">${nextGame.campo ? `<span>📍 ${escapeHtml(nextGame.campo)}</span>` : ''}</div>
        </div>`;
    } else {
      html += `
        <div class="next-game" style="cursor: default;">
          <div class="game-date" style="color: var(--text-muted);">SIN JUEGOS PROGRAMADOS</div>
          <div style="text-align: center; padding: 20px 0; color: var(--cream-2); font-family: 'Caveat', cursive; font-size: 18px;">
            ¡Agarra la mascota, que vamos a empezar!
          </div>
        </div>`;
    }

    const rachaTxt = record.wins >= 3 ? '¡Ya parió la cochi! En racha' : record.wins > 0 ? 'Vamos en caballo' : 'Arrancando la temporada';
    html += `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Récord</div>
          <div class="record-split">
            <span class="wins">${record.wins}</span>
            <span class="dash">—</span>
            <span class="losses">${record.losses}</span>
          </div>
          <div class="stat-trend gold">${rachaTxt}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Saldo equipo</div>
          <div class="stat-value money">${formatMoney(balance.balance)}</div>
          <div class="stat-trend">Entradas: ${formatMoney(balance.total_ingresos)}</div>
        </div>
      </div>
      <div class="identity-card">
        <div class="identity-motto">SOMOS EDICIÓN LIMITADA</div>
        <div class="identity-sub">Tazos dorados, diamantes en bruto.<br>Un solo equipo.</div>
      </div>`;

    if (recentExpenses.length > 0) {
      html += `<div class="section-title">Últimos movimientos</div><div class="list-card">`;
      for (const exp of recentExpenses) {
        const fecha = new Date(exp.fecha + 'T12:00:00');
        const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        html += `
          <div class="list-row">
            <div class="list-row-icon out">↑</div>
            <div class="list-row-body">
              <div class="list-row-title">${escapeHtml(exp.descripcion || exp.categoria)}</div>
              <div class="list-row-sub">${fechaTxt} · ${escapeHtml(exp.categoria)}</div>
            </div>
            <div class="list-row-value neg">−${formatMoney(exp.monto)}</div>
          </div>`;
      }
      html += `</div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('Revisa tu conexión.', err.message);
  }
}

// ============================================================
// PANTALLA: TESORERÍA
// ============================================================
async function loadTesoreria() {
  const container = document.getElementById('tesoreria-content');
  try {
    const [balanceRes, catRes, playerStatusRes] = await Promise.all([
      db.from('v_team_balance').select('*').maybeSingle(),
      db.from('v_expenses_by_category').select('*'),
      db.from('v_player_status').select('*').eq('activo', true).order('numero')
    ]);

    const balance = balanceRes.data || { balance: 0, total_ingresos: 0, total_egresos: 0 };
    const categories = catRes.data || [];
    const playerStatus = playerStatusRes.data || [];
    const totalGastos = categories.reduce((s, c) => s + Number(c.total), 0);

    let html = `
      <div class="balance-hero">
        <div class="balance-label">SALDO DEL EQUIPO</div>
        <div class="balance-amount"><span class="currency">$</span>${Number(balance.balance).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
        <div class="balance-quote">"Te ganaste la beca, coqueto"</div>
        <div class="balance-footer">
          <span><span class="dot g"></span>Entradas: ${formatMoney(balance.total_ingresos)}</span>
          <span><span class="dot r"></span>Salidas: ${formatMoney(balance.total_egresos)}</span>
        </div>
      </div>`;

    if (categories.length > 0) {
      html += `<div class="section-title">Gastos por categoría</div><div class="cat-grid">`;
      const iconMap = { campo: '🏟️', pelotas: '⚾', liga: '🏆', uniformes: '👕', otros: '📋' };
      for (const cat of categories) {
        const pct = totalGastos > 0 ? Math.round((Number(cat.total) / totalGastos) * 100) : 0;
        html += `
          <div class="cat-card">
            <div class="cat-head">
              <span>${iconMap[cat.categoria] || '📋'}</span>
              <span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${pct}%</span>
            </div>
            <div class="cat-name">${escapeHtml(cat.categoria)}</div>
            <div class="cat-val">${formatMoney(cat.total)}</div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="empty-state"><div class="emoji">💸</div><p>Todavía no hay gastos.</p></div>`;
    }

    if (playerStatus.length > 0) {
      html += `<div class="section-title">Estado por jugador</div><div class="list-card">`;
      for (const p of playerStatus) {
        const deuda = Number(p.deuda_pendiente) || 0;
        const statusTxt = deuda > 0 ? 'Sin tanta chimichanga 😅' : 'Tazo al corriente ✨';
        const pill = deuda > 0 ? `<div class="debt-pill bad">−${formatMoney(deuda)}</div>` : `<div class="debt-pill ok">OK</div>`;
        const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
        const avatarText = p.foto_url ? '' : getInitials(p.nombre);
        html += `
          <div class="player-debt-row">
            <div class="player-avatar" ${avatarStyle}>${avatarText}</div>
            <div class="player-debt-body">
              <div class="player-debt-name">${escapeHtml(p.nombre)} <span style="color: var(--gold); font-family: 'Bebas Neue'; margin-left: 6px;">#${p.numero}</span></div>
              <div class="player-debt-status chk">${statusTxt}</div>
            </div>
            ${pill}
          </div>`;
      }
      html += `</div>`;
    }

    html += `
      <div class="identity-card" style="text-align: left;">
        <div style="font-family: 'Bebas Neue'; font-size: 14px; letter-spacing: 2px; color: var(--gold); margin-bottom: 10px;">◆ REGLAS DEL TAZO</div>
        <div style="font-size: 12px; line-height: 1.8; color: var(--cream-2);">
          ◆ Si juegas: aportas <strong style="color: var(--gold)">$100</strong><br>
          ◆ Si no puedes asistir: aportas <strong style="color: var(--gold)">$50</strong><br>
          ◆ Cubre Liga, Campo, Pelotas y Uniformes<br>
          ◆ El excedente va al fondo de uniformes
        </div>
      </div>`;

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('No se pudo cargar.', err.message);
  }
}

// ============================================================
// PANTALLA: ROSTER
// ============================================================
function renderPlayerCard(p) {
  const posiciones = Array.isArray(p.posicion) && p.posicion.length > 0 ? p.posicion.join(' / ') : 'UTILITY';
  const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
  const avatarText = p.foto_url ? '' : getInitials(p.nombre);
  const inactiveClass = p.activo ? '' : 'inactive';
  const inactiveBadge = p.activo ? '' : `<span class="inactive-badge">INACTIVO</span>`;
  return `
    <div class="player-card ${inactiveClass}" onclick="showPlayerDetail('${p.id}')">
      ${inactiveBadge}
      <div class="player-card-avatar" ${avatarStyle}>${avatarText}</div>
      <div class="player-number">#${String(p.numero).padStart(2, '0')}</div>
      <div class="player-card-name">${escapeHtml(p.apodo || p.nombre)}</div>
      <div class="player-pos">${escapeHtml(posiciones)}</div>
    </div>`;
}

async function loadRoster() {
  const container = document.getElementById('roster-content');
  try {
    const { data, error } = await db
      .from('players')
      .select('*')
      .order('activo', { ascending: false })
      .order('numero', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="emoji">⚾</div>
          <p>Todavía no hay jugadores.</p>
          <div class="chk">¿Dónde andan los coquetos?</div>
        </div>`;
      return;
    }

    const activos = data.filter(p => p.activo);
    const inactivos = data.filter(p => !p.activo);
    const mostrarInactivos = state.isTesorero && inactivos.length > 0;

    let html = `
      <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 12px; text-align: center; letter-spacing: 1px;">
        ${activos.length} TAZOS DORADOS ACTIVOS
      </div>
      <div class="roster-grid">`;
    for (const p of activos) html += renderPlayerCard(p);
    html += `</div>`;

    if (mostrarInactivos) {
      html += `
        <div class="inactive-subgrid-label">
          ─── DESACTIVADOS (${inactivos.length}) ───
        </div>
        <div class="roster-grid">`;
      for (const p of inactivos) html += renderPlayerCard(p);
      html += `</div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('No se pudo cargar el roster.', err.message);
  }
}

// ============================================================
// DETALLE DE JUGADOR
// ============================================================
async function showPlayerDetail(playerId) {
  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data: p, error } = await db.from('players').select('*').eq('id', playerId).maybeSingle();
    if (error) throw error;
    if (!p) throw new Error('Jugador no encontrado');
    renderPlayerDetail(p);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderPlayerDetail(p) {
  const posiciones = Array.isArray(p.posicion) && p.posicion.length > 0 ? p.posicion.join(' · ') : '—';
  const manoMap = { derecho: 'Derecho', zurdo: 'Zurdo', ambidiestro: 'Ambidiestro' };
  const edad = calcAge(p.fecha_nacimiento);
  const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
  const avatarText = p.foto_url ? '' : getInitials(p.nombre);

  const inactiveBanner = !p.activo ? `<div class="inactive-banner">⚠ JUGADOR DESACTIVADO</div>` : '';

  let footerButtons = '';
  if (state.isTesorero) {
    if (p.activo) {
      footerButtons = `<button class="btn btn-primary" onclick="showPlayerForm('${p.id}')">✏️ Editar</button>`;
    } else {
      footerButtons = `
        <button class="btn btn-secondary" onclick="showPlayerForm('${p.id}')">✏️ Editar</button>
        <button class="btn btn-success" onclick="reactivatePlayer('${p.id}')">↻ Reactivar</button>
      `;
    }
  }

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>JUGADOR</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${inactiveBanner}
      <div class="player-detail-avatar" ${avatarStyle}>${avatarText}</div>
      <div class="player-detail-number">#${String(p.numero).padStart(2, '0')}</div>
      <div class="player-detail-name">${escapeHtml(p.nombre)}</div>
      ${p.apodo ? `<div class="player-detail-nickname">"${escapeHtml(p.apodo)}"</div>` : ''}
      <div class="player-detail-info">
        <div class="detail-row"><span class="detail-label">Posición</span><span class="detail-value gold">${escapeHtml(posiciones)}</span></div>
        <div class="detail-row"><span class="detail-label">Lanza</span><span class="detail-value">${manoMap[p.mano] || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Batea</span><span class="detail-value">${manoMap[p.bateo] || '—'}</span></div>
        ${edad !== null ? `<div class="detail-row"><span class="detail-label">Edad</span><span class="detail-value">${edad} años</span></div>` : ''}
        ${p.telefono ? `<div class="detail-row"><span class="detail-label">Teléfono</span><span class="detail-value"><a href="tel:${escapeHtml(p.telefono)}" style="color: var(--gold);">${escapeHtml(p.telefono)}</a></span></div>` : ''}
      </div>
    </div>
    ${footerButtons ? `<div class="modal-footer">${footerButtons}</div>` : ''}`;
}

// ============================================================
// FORMULARIO JUGADOR
// ============================================================
async function showPlayerForm(playerId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>${playerId ? 'EDITANDO...' : 'NUEVO JUGADOR'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>
  `);

  let player = null;
  if (playerId) {
    const { data, error } = await db.from('players').select('*').eq('id', playerId).maybeSingle();
    if (error) {
      modalContent.innerHTML = `
        <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">${errorBox('No se pudo cargar el jugador.', error.message)}</div>`;
      return;
    }
    player = data;
  }
  renderPlayerForm(player);
}

function renderPlayerForm(p) {
  const isEdit = !!p;
  const posiciones = Array.isArray(p?.posicion) ? p.posicion : [];

  const posicionCheckboxes = POSICIONES.map(pos => `
    <label class="checkbox-chip">
      <input type="checkbox" name="posicion" value="${pos.code}" ${posiciones.includes(pos.code) ? 'checked' : ''}>
      <span class="checkbox-chip-label">${pos.code}</span>
    </label>`).join('');

  const manoRadios = ['derecho', 'zurdo', 'ambidiestro'].map(m => `
    <label class="radio-chip">
      <input type="radio" name="mano" value="${m}" ${p?.mano === m ? 'checked' : ''}>
      <span class="radio-chip-label">${m.charAt(0).toUpperCase() + m.slice(1)}</span>
    </label>`).join('');

  const bateoRadios = ['derecho', 'zurdo', 'ambidiestro'].map(b => `
    <label class="radio-chip">
      <input type="radio" name="bateo" value="${b}" ${p?.bateo === b ? 'checked' : ''}>
      <span class="radio-chip-label">${b.charAt(0).toUpperCase() + b.slice(1)}</span>
    </label>`).join('');

  const avatarStyle = p?.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
  const avatarClass = p?.foto_url ? 'has-image' : '';

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'EDITAR JUGADOR' : 'NUEVO JUGADOR'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <form id="playerForm">
        <input type="hidden" id="playerId" value="${p?.id || ''}">
        <input type="hidden" id="playerPhotoUrl" value="${escapeHtml(p?.foto_url || '')}">

        <div class="avatar-upload ${avatarClass}" id="avatarUpload" ${avatarStyle}>
          <span class="avatar-upload-icon">📷</span>
          <div class="avatar-uploading">Subiendo...</div>
        </div>
        <div class="avatar-upload-hint">Toca para ${p?.foto_url ? 'cambiar' : 'agregar'} foto</div>
        <input type="file" id="avatarInput" accept="image/*" style="display:none;">

        <div id="formError"></div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Número</label>
            <input type="number" class="form-input" id="numero" value="${p?.numero ?? ''}" required min="0" max="999">
          </div>
          <div class="form-group" style="flex: 2;">
            <label class="form-label">Nombre completo</label>
            <input type="text" class="form-input" id="nombre" value="${escapeHtml(p?.nombre || '')}" required placeholder="Luis Pérez">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Apodo (opcional)</label>
          <input type="text" class="form-input" id="apodo" value="${escapeHtml(p?.apodo || '')}" placeholder="El Tazo">
        </div>

        <div class="form-group">
          <label class="form-label">Posiciones</label>
          <div class="checkbox-grid">${posicionCheckboxes}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Lanza con</label>
          <div class="radio-row">${manoRadios}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Batea con</label>
          <div class="radio-row">${bateoRadios}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input type="tel" class="form-input" id="telefono" value="${escapeHtml(p?.telefono || '')}" placeholder="33 1234 5678">
        </div>

        <div class="form-group">
          <label class="form-label">Fecha de nacimiento</label>
          <input type="date" class="form-input" id="fechaNacimiento" value="${p?.fecha_nacimiento || ''}">
        </div>
      </form>
    </div>
    <div class="modal-footer">
      ${isEdit && p.activo ? `<button class="btn btn-danger" onclick="confirmDeactivate('${p.id}')">Desactivar</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="saveBtn">Guardar</button>
    </div>`;

  document.getElementById('saveBtn').addEventListener('click', savePlayer);
  document.getElementById('avatarUpload').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
  });
  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
    alert('Formato no soportado. Usa JPG, PNG, WEBP o HEIC.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('Archivo demasiado grande. Máximo 10 MB.');
    return;
  }

  const avatarEl = document.getElementById('avatarUpload');
  avatarEl.classList.add('uploading');

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', window.APP_CONFIG.cloudinaryUploadPreset);
    formData.append('folder', 'tazos-dorados/players');

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${window.APP_CONFIG.cloudinaryCloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Error al subir');
    }

    const data = await res.json();
    const optimizedUrl = data.secure_url.replace('/upload/', '/upload/c_fill,g_face,w_400,h_400,q_auto,f_auto/');

    document.getElementById('playerPhotoUrl').value = optimizedUrl;
    avatarEl.style.backgroundImage = `url('${optimizedUrl}')`;
    avatarEl.classList.add('has-image');
  } catch (err) {
    alert('Error: ' + err.message);
    console.error(err);
  } finally {
    avatarEl.classList.remove('uploading');
  }
}

async function savePlayer() {
  const errorDiv = document.getElementById('formError');
  const saveBtn = document.getElementById('saveBtn');

  const id = document.getElementById('playerId').value;
  const numero = parseInt(document.getElementById('numero').value);
  const nombre = document.getElementById('nombre').value.trim();
  const apodo = document.getElementById('apodo').value.trim() || null;
  const telefono = document.getElementById('telefono').value.trim() || null;
  const fechaNacimiento = document.getElementById('fechaNacimiento').value || null;
  const fotoUrl = document.getElementById('playerPhotoUrl').value || null;

  const posicion = Array.from(document.querySelectorAll('input[name="posicion"]:checked')).map(cb => cb.value);
  const manoEl = document.querySelector('input[name="mano"]:checked');
  const bateoEl = document.querySelector('input[name="bateo"]:checked');
  const mano = manoEl ? manoEl.value : null;
  const bateo = bateoEl ? bateoEl.value : null;

  if (!nombre || isNaN(numero)) {
    errorDiv.innerHTML = '<div class="form-error">Completa nombre y número</div>';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';
  errorDiv.innerHTML = '';

  const payload = {
    numero, nombre, apodo,
    posicion: posicion.length > 0 ? posicion : null,
    mano, bateo, telefono,
    fecha_nacimiento: fechaNacimiento,
    foto_url: fotoUrl
  };
  if (!id) payload.activo = true;

  try {
    let result;
    if (id) result = await db.from('players').update(payload).eq('id', id);
    else result = await db.from('players').insert(payload);
    if (result.error) throw result.error;
    closeModal();
    await loadRoster();
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

function confirmDeactivate(playerId) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>DESACTIVAR JUGADOR</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: var(--cream-2); line-height: 1.6;">
          Aparecerá al final del roster con la etiqueta <strong style="color: var(--red);">INACTIVO</strong>.
          <br>Sus registros se mantienen.
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showPlayerForm('${playerId}')">Regresar</button>
      <button class="btn btn-danger" onclick="deactivatePlayer('${playerId}')">Desactivar</button>
    </div>`;
}

async function deactivatePlayer(playerId) {
  try {
    const { error } = await db.from('players').update({ activo: false }).eq('id', playerId);
    if (error) throw error;
    closeModal();
    await loadRoster();
  } catch (err) { alert('Error: ' + err.message); }
}

async function reactivatePlayer(playerId) {
  try {
    const { error } = await db.from('players').update({ activo: true }).eq('id', playerId);
    if (error) throw error;
    closeModal();
    await loadRoster();
  } catch (err) { alert('Error: ' + err.message); }
}

// ============================================================
// PANTALLA: CALENDARIO (lista de juegos clickeable)
// ============================================================
async function loadCalendario() {
  const container = document.getElementById('calendario-content');
  try {
    const { data, error } = await db.from('games').select('*').order('fecha', { ascending: false });
    if (error) throw error;

    const upcoming = (data || []).filter(g => g.status === 'programado').reverse();
    const past = (data || []).filter(g => g.status === 'jugado');
    const cancelled = (data || []).filter(g => g.status === 'cancelado');

    let html = '';

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📅</div>
          <p>Todavía no hay juegos programados.</p>
          ${state.isTesorero ? `<div class="chk">Toca el botón dorado "+" para agregar el primero</div>` : ''}
        </div>`;
      return;
    }

    html += `<div class="section-title">Próximos juegos</div>`;
    if (upcoming.length > 0) {
      for (const g of upcoming) {
        const d = formatDateShort(g.fecha);
        html += `
          <div class="cal-game upcoming" onclick="showGameDetail('${g.id}')">
            <div class="cal-date">
              <div class="day">${d.day}</div>
              <div class="month">${d.month}</div>
            </div>
            <div class="cal-body">
              <div class="cal-opponent">${g.es_local ? 'vs' : '@'} ${escapeHtml(g.rival || 'Por definir')}</div>
              <div class="cal-venue">${escapeHtml(g.campo || 'Campo por confirmar')}${g.hora ? ' · ' + formatHour(g.hora) : ''}</div>
            </div>
          </div>`;
      }
    } else {
      html += `<div class="empty-state" style="padding: 24px;"><p style="font-size: 13px;">No hay juegos programados.</p></div>`;
    }

    if (past.length > 0) {
      html += `<div class="section-title" style="margin-top: 22px;">Resultados</div>`;
      for (const g of past) {
        const d = formatDateShort(g.fecha);
        const resultClass = g.resultado === 'W' ? 'won' : g.resultado === 'L' ? 'lost' : '';
        const resultPill = g.resultado === 'W'
          ? `<div class="cal-result w">G ${g.carreras_tazos || 0}-${g.carreras_rival || 0}</div>`
          : g.resultado === 'L'
          ? `<div class="cal-result l">P ${g.carreras_tazos || 0}-${g.carreras_rival || 0}</div>`
          : `<div class="cal-result t">E ${g.carreras_tazos || 0}-${g.carreras_rival || 0}</div>`;
        html += `
          <div class="cal-game ${resultClass}" onclick="showGameDetail('${g.id}')">
            <div class="cal-date">
              <div class="day">${d.day}</div>
              <div class="month">${d.month}</div>
            </div>
            <div class="cal-body">
              <div class="cal-opponent">${g.es_local ? 'vs' : '@'} ${escapeHtml(g.rival || 'Rival')}</div>
              <div class="cal-venue">${escapeHtml(g.campo || '')}</div>
            </div>
            ${resultPill}
          </div>`;
      }
    }

    if (cancelled.length > 0) {
      html += `<div class="section-title muted" style="margin-top: 22px;">Cancelados</div>`;
      for (const g of cancelled) {
        const d = formatDateShort(g.fecha);
        html += `
          <div class="cal-game cancelled" onclick="showGameDetail('${g.id}')">
            <div class="cal-date">
              <div class="day">${d.day}</div>
              <div class="month">${d.month}</div>
            </div>
            <div class="cal-body">
              <div class="cal-opponent">${g.es_local ? 'vs' : '@'} ${escapeHtml(g.rival || 'Rival')}</div>
              <div class="cal-venue">${escapeHtml(g.campo || '')}</div>
            </div>
            <div class="cal-result cancel">CANCELADO</div>
          </div>`;
      }
    }

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('No se pudo cargar.', err.message);
  }
}

// ============================================================
// DETALLE DE JUEGO
// ============================================================
async function showGameDetail(gameId) {
  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data: g, error } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
    if (error) throw error;
    if (!g) throw new Error('Juego no encontrado');
    renderGameDetail(g);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar el juego.', err.message)}</div>`;
  }
}

function renderGameDetail(g) {
  // Fecha grande
  const dateHeader = `
    <div class="game-detail-header">
      <div class="game-detail-date">${formatDateLong(g.fecha)}</div>
      ${g.hora ? `<div class="game-detail-time">${formatHour(g.hora)}</div>` : ''}
    </div>`;

  // Status banner
  let statusBanner = '';
  if (g.status === 'programado') {
    statusBanner = `<div class="status-banner programado">🟡 JUEGO PROGRAMADO</div>`;
  } else if (g.status === 'cancelado') {
    statusBanner = `<div class="status-banner cancelado">⛔ JUEGO CANCELADO</div>`;
  }

  // Scoreboard o matchup
  let scoreSection = '';
  if (g.status === 'jugado') {
    const tazosScore = g.carreras_tazos ?? 0;
    const rivalScore = g.carreras_rival ?? 0;
    const tazosClass = g.resultado === 'W' ? 'win' : g.resultado === 'L' ? 'loss' : '';
    const rivalClass = g.resultado === 'L' ? 'win' : g.resultado === 'W' ? 'loss' : '';

    let resultText = '', resultClass = '';
    if (g.resultado === 'W') { resultText = '🏆 GANAMOS'; resultClass = 'win'; }
    else if (g.resultado === 'L') { resultText = '💔 PERDIMOS'; resultClass = 'loss'; }
    else { resultText = '🤝 EMPATE'; resultClass = 'tie'; }

    scoreSection = `
      <div class="scoreboard">
        <div class="scoreboard-row">
          <div class="scoreboard-team us">
            TAZOS DORADOS
            <small>${g.es_local ? 'LOCAL' : 'VISITA'}</small>
          </div>
          <div class="scoreboard-score ${tazosClass}">${tazosScore}</div>
        </div>
        <div class="scoreboard-row">
          <div class="scoreboard-team rival">
            ${escapeHtml(g.rival || 'RIVAL')}
            <small>${g.es_local ? 'VISITA' : 'LOCAL'}</small>
          </div>
          <div class="scoreboard-score ${rivalClass}">${rivalScore}</div>
        </div>
      </div>
      <div class="result-badge ${resultClass}">${resultText}</div>`;
  } else {
    scoreSection = `
      <div class="game-matchup" style="margin-bottom: 18px;">
        <div class="team-side">
          <div class="team-name us">TAZOS</div>
          <div class="team-label">${g.es_local ? 'LOCAL' : 'VISITA'}</div>
        </div>
        <div class="vs-box">VS</div>
        <div class="team-side">
          <div class="team-name">${escapeHtml(g.rival || 'POR DEFINIR')}</div>
          <div class="team-label">${g.es_local ? 'VISITA' : 'LOCAL'}</div>
        </div>
      </div>`;
  }

  // Botón principal (captura resultado) — solo si programado y tesorero
  let captureButton = '';
  if (g.status === 'programado' && state.isTesorero) {
    captureButton = `
      <button class="btn-hero" onclick="showCaptureResult('${g.id}')">
        <span class="icon">⚾</span>
        <span>CAPTURAR RESULTADO</span>
      </button>`;
  }

  // Info del campo y notas
  const infoRows = `
    <div class="player-detail-info">
      ${g.campo ? `<div class="detail-row"><span class="detail-label">Campo</span><span class="detail-value">${escapeHtml(g.campo)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Condición</span><span class="detail-value gold">${g.es_local ? '🏠 Somos locales' : '✈️ Vamos de visita'}</span></div>
      ${g.hora ? `<div class="detail-row"><span class="detail-label">Hora</span><span class="detail-value">${formatHour(g.hora)}</span></div>` : ''}
    </div>
    ${g.notas ? `<div class="notes-box">📝 ${escapeHtml(g.notas)}</div>` : ''}`;

  // Footer — editar/duplicar/eliminar para tesorero
  let footerButtons = '';
  if (state.isTesorero) {
    footerButtons = `
      <button class="btn btn-secondary" onclick="showGameForm('${g.id}')">✏️ Editar</button>
      <button class="btn btn-secondary" onclick="duplicateGame('${g.id}')">📋 Duplicar</button>
      <button class="btn btn-danger" onclick="confirmDeleteGame('${g.id}')">🗑️</button>`;
  }

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>JUEGO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${dateHeader}
      ${statusBanner}
      ${scoreSection}
      ${captureButton}
      ${infoRows}
    </div>
    ${footerButtons ? `<div class="modal-footer">${footerButtons}</div>` : ''}`;
}

// ============================================================
// FORMULARIO DE JUEGO (crear/editar)
// ============================================================
async function showGameForm(gameId, prefillData) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>${gameId ? 'EDITANDO...' : (prefillData ? 'DUPLICANDO...' : 'NUEVO JUEGO')}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>
  `);

  let game = null;
  if (gameId) {
    const { data, error } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
    if (error) {
      modalContent.innerHTML = `
        <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">${errorBox('No se pudo cargar el juego.', error.message)}</div>`;
      return;
    }
    game = data;
  } else if (prefillData) {
    game = prefillData;
  }
  renderGameForm(game, !!gameId);
}

function renderGameForm(g, isEdit) {
  const statusChips = [
    { v: 'programado', label: '🟡 Programado' },
    { v: 'jugado', label: '✅ Jugado' },
    { v: 'cancelado', label: '⛔ Cancelado' }
  ].map(s => `
    <label class="status-chip">
      <input type="radio" name="status" value="${s.v}" ${(g?.status || 'programado') === s.v ? 'checked' : ''}>
      <span class="status-chip-label">${s.label}</span>
    </label>`).join('');

  const localChips = [
    { v: 'true', label: '🏠 LOCAL' },
    { v: 'false', label: '✈️ VISITA' }
  ].map(s => `
    <label class="radio-chip">
      <input type="radio" name="es_local" value="${s.v}" ${String(g?.es_local ?? true) === s.v ? 'checked' : ''}>
      <span class="radio-chip-label">${s.label}</span>
    </label>`).join('');

  // Si es jugado mostramos campos de marcador
  const scoreFields = `
    <div id="scoreFieldsWrapper" style="display: ${g?.status === 'jugado' ? 'block' : 'none'};">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Carreras Tazos</label>
          <input type="number" class="form-input" id="carrerasTazos" value="${g?.carreras_tazos ?? ''}" min="0" max="99">
        </div>
        <div class="form-group">
          <label class="form-label">Carreras Rival</label>
          <input type="number" class="form-input" id="carrerasRival" value="${g?.carreras_rival ?? ''}" min="0" max="99">
        </div>
      </div>
    </div>`;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'EDITAR JUEGO' : 'NUEVO JUEGO'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <form id="gameForm">
        <input type="hidden" id="gameId" value="${isEdit ? g.id : ''}">
        <div id="gameFormError"></div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input type="date" class="form-input" id="gameFecha" value="${g?.fecha || ''}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Hora</label>
            <input type="time" class="form-input" id="gameHora" value="${g?.hora ? g.hora.substring(0,5) : ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Rival</label>
          <input type="text" class="form-input" id="gameRival" value="${escapeHtml(g?.rival || '')}" required placeholder="Ej. Los Águilas">
        </div>

        <div class="form-group">
          <label class="form-label">Campo / Estadio</label>
          <input type="text" class="form-input" id="gameCampo" value="${escapeHtml(g?.campo || '')}" placeholder="Ej. Parque Agua Azul">
        </div>

        <div class="form-group">
          <label class="form-label">¿Dónde jugamos?</label>
          <div class="radio-row">${localChips}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Estado</label>
          <div class="status-toggle">${statusChips}</div>
        </div>

        ${scoreFields}

        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <textarea class="form-textarea" id="gameNotas" placeholder="Pitcher abridor, jugadas épicas, ausencias, clima...">${escapeHtml(g?.notas || '')}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="saveGameBtn">Guardar</button>
    </div>`;

  document.getElementById('saveGameBtn').addEventListener('click', saveGame);

  // Mostrar/ocultar campos de marcador según status
  document.querySelectorAll('input[name="status"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const wrapper = document.getElementById('scoreFieldsWrapper');
      wrapper.style.display = e.target.value === 'jugado' ? 'block' : 'none';
    });
  });
}

async function saveGame() {
  const errorDiv = document.getElementById('gameFormError');
  const saveBtn = document.getElementById('saveGameBtn');

  const id = document.getElementById('gameId').value;
  const fecha = document.getElementById('gameFecha').value;
  const hora = document.getElementById('gameHora').value || null;
  const rival = document.getElementById('gameRival').value.trim();
  const campo = document.getElementById('gameCampo').value.trim() || null;
  const esLocalEl = document.querySelector('input[name="es_local"]:checked');
  const statusEl = document.querySelector('input[name="status"]:checked');
  const es_local = esLocalEl ? esLocalEl.value === 'true' : true;
  const status = statusEl ? statusEl.value : 'programado';
  const notas = document.getElementById('gameNotas').value.trim() || null;

  if (!fecha || !rival) {
    errorDiv.innerHTML = '<div class="form-error">Completa fecha y rival</div>';
    return;
  }

  const payload = {
    fecha, hora, rival, campo, es_local, status, notas
  };

  // Si status es jugado, incluir marcador y calcular resultado
  if (status === 'jugado') {
    const cTazos = parseInt(document.getElementById('carrerasTazos').value);
    const cRival = parseInt(document.getElementById('carrerasRival').value);
    if (isNaN(cTazos) || isNaN(cRival)) {
      errorDiv.innerHTML = '<div class="form-error">Si el juego ya se jugó, captura las carreras de ambos equipos</div>';
      return;
    }
    payload.carreras_tazos = cTazos;
    payload.carreras_rival = cRival;
    payload.resultado = calcResult(cTazos, cRival);
  } else if (status === 'programado') {
    payload.carreras_tazos = null;
    payload.carreras_rival = null;
    payload.resultado = null;
  } else if (status === 'cancelado') {
    payload.carreras_tazos = null;
    payload.carreras_rival = null;
    payload.resultado = null;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';
  errorDiv.innerHTML = '';

  try {
    let result;
    if (id) result = await db.from('games').update(payload).eq('id', id);
    else result = await db.from('games').insert(payload);
    if (result.error) throw result.error;
    closeModal();
    // Forzar recarga de home y calendario
    loaded.home = false;
    loaded.calendario = false;
    if (state.currentScreen === 'calendario') await loadCalendario();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

// ============================================================
// CAPTURAR RESULTADO (flujo dedicado con preview)
// ============================================================
async function showCaptureResult(gameId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data: g, error } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
    if (error) throw error;
    if (!g) throw new Error('Juego no encontrado');
    renderCaptureResult(g);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderCaptureResult(g) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>CAPTURAR RESULTADO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="game-detail-header">
        <div class="game-detail-date">${formatDateLong(g.fecha)}</div>
        <div style="color: var(--cream-2); margin-top: 6px; font-size: 14px;">vs ${escapeHtml(g.rival)}</div>
      </div>

      <div id="captureError"></div>

      <div class="score-capture">
        <div class="score-side">
          <div class="score-side-label us">TAZOS</div>
          <input type="number" class="score-input" id="capTazos" min="0" max="99" inputmode="numeric" value="">
        </div>
        <div class="score-vs-big">VS</div>
        <div class="score-side">
          <div class="score-side-label rival">${escapeHtml(g.rival.length > 8 ? g.rival.substring(0, 8) + '…' : g.rival).toUpperCase()}</div>
          <input type="number" class="score-input" id="capRival" min="0" max="99" inputmode="numeric" value="">
        </div>
      </div>

      <div class="result-preview" id="resultPreview">
        INGRESA EL MARCADOR
      </div>

      <div class="form-group">
        <label class="form-label">Notas del juego (opcional)</label>
        <textarea class="form-textarea" id="capNotas" placeholder="¿Quién pitcheó? ¿Jugada épica? Anota lo memorable...">${escapeHtml(g.notas || '')}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="saveResultBtn" disabled>Guardar resultado</button>
    </div>`;

  const capTazos = document.getElementById('capTazos');
  const capRival = document.getElementById('capRival');
  const preview = document.getElementById('resultPreview');
  const saveBtn = document.getElementById('saveResultBtn');

  function updatePreview() {
    const t = parseInt(capTazos.value);
    const r = parseInt(capRival.value);
    preview.className = 'result-preview';
    if (isNaN(t) || isNaN(r)) {
      preview.textContent = 'INGRESA EL MARCADOR';
      saveBtn.disabled = true;
      return;
    }
    saveBtn.disabled = false;
    if (t > r) {
      preview.classList.add('win');
      preview.textContent = `🏆 GANAMOS ${t}-${r}`;
    } else if (t < r) {
      preview.classList.add('loss');
      preview.textContent = `💔 PERDIMOS ${t}-${r}`;
    } else {
      preview.classList.add('tie');
      preview.textContent = `🤝 EMPATE ${t}-${r}`;
    }
  }

  capTazos.addEventListener('input', updatePreview);
  capRival.addEventListener('input', updatePreview);

  saveBtn.addEventListener('click', async () => {
    const t = parseInt(capTazos.value);
    const r = parseInt(capRival.value);
    const notas = document.getElementById('capNotas').value.trim() || null;

    if (isNaN(t) || isNaN(r)) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const { error } = await db.from('games').update({
        carreras_tazos: t,
        carreras_rival: r,
        resultado: calcResult(t, r),
        status: 'jugado',
        notas
      }).eq('id', g.id);

      if (error) throw error;
      closeModal();
      loaded.home = false;
      loaded.calendario = false;
      if (state.currentScreen === 'calendario') await loadCalendario();
      else if (state.currentScreen === 'home') await loadHome();
      // Mostrar el detalle del juego recién capturado
      setTimeout(() => showGameDetail(g.id), 150);
    } catch (err) {
      document.getElementById('captureError').innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar resultado';
    }
  });

  // Focus en input de Tazos al abrir
  setTimeout(() => capTazos.focus(), 200);
}

// ============================================================
// DUPLICAR JUEGO
// ============================================================
async function duplicateGame(gameId) {
  try {
    const { data: g } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
    if (!g) throw new Error('Juego no encontrado');

    // Prefill: mismo rival, campo, es_local, hora. Fecha vacía para que se re-ingrese. Status programado.
    const prefill = {
      rival: g.rival,
      campo: g.campo,
      es_local: g.es_local,
      hora: g.hora,
      status: 'programado',
      fecha: '',
      notas: ''
    };
    showGameForm(null, prefill);
  } catch (err) {
    alert('Error al duplicar: ' + err.message);
  }
}

// ============================================================
// ELIMINAR JUEGO
// ============================================================
function confirmDeleteGame(gameId) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>ELIMINAR JUEGO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: var(--cream-2); line-height: 1.6;">
          Esta acción <strong style="color: var(--red);">NO se puede deshacer</strong>.
          <br><br>
          Se eliminarán el juego y todos sus datos relacionados (fotos, asistencia, gastos asociados).
          <br><br>
          <strong style="color: var(--gold);">¿Estás seguro?</strong>
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showGameDetail('${gameId}')">Cancelar</button>
      <button class="btn btn-danger" onclick="deleteGame('${gameId}')">Sí, eliminar</button>
    </div>`;
}

async function deleteGame(gameId) {
  try {
    const { error } = await db.from('games').delete().eq('id', gameId);
    if (error) throw error;
    closeModal();
    loaded.home = false;
    loaded.calendario = false;
    if (state.currentScreen === 'calendario') await loadCalendario();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');

const loaders = {
  home: loadHome,
  tesoreria: loadTesoreria,
  roster: loadRoster,
  calendario: loadCalendario,
  galeria: () => {}
};

const loaded = { home: false, tesoreria: false, roster: false, calendario: false };

function showScreen(target) {
  screens.forEach(s => s.classList.toggle('active', s.id === target));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.screen === target));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  state.currentScreen = target;

  document.body.classList.remove('screen-home', 'screen-tesoreria', 'screen-roster', 'screen-calendario', 'screen-galeria');
  document.body.classList.add(`screen-${target}`);

  if (!loaded[target] && loaders[target]) {
    loaders[target]();
    loaded[target] = true;
  }
}

function reloadCurrentScreen() {
  loaded[state.currentScreen] = false;
  if (loaders[state.currentScreen]) {
    loaders[state.currentScreen]();
    loaded[state.currentScreen] = true;
  }
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// FAB: diferentes acciones según la pantalla
document.getElementById('fabAdd').addEventListener('click', () => {
  if (state.currentScreen === 'roster') showPlayerForm();
  else if (state.currentScreen === 'calendario') showGameForm();
});

// Exponer funciones globales (para onclick)
window.showPlayerDetail = showPlayerDetail;
window.showPlayerForm = showPlayerForm;
window.showGameDetail = showGameDetail;
window.showGameForm = showGameForm;
window.showCaptureResult = showCaptureResult;
window.duplicateGame = duplicateGame;
window.confirmDeleteGame = confirmDeleteGame;
window.deleteGame = deleteGame;
window.closeModal = closeModal;
window.handleLogout = handleLogout;
window.confirmDeactivate = confirmDeactivate;
window.deactivatePlayer = deactivatePlayer;
window.reactivatePlayer = reactivatePlayer;

// INICIO
(async () => {
  await checkAuthStatus();
  document.body.classList.add('screen-home');
  loadHome();
  loaded.home = true;
})();
