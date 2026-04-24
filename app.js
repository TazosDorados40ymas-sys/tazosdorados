/* ============================================================
   TAZOS DORADOS · app.js v4
   Módulos:
   - Auth (login/logout tesorero)
   - Home (próximo juego, récord, saldo, últimos movimientos)
   - Tesorería (saldo, gastos por categoría, estado por jugador)
   - Roster (tarjetas, detalle, form nuevo/editar, foto Cloudinary)
   - Juegos (CRUD, scoreboard, captura resultado, duplicar)
   - Asistencia (3 estados, pagó/debe, bulk actions, stats en vivo)
   ============================================================ */

const { createClient } = window.supabase;
const db = createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabasePublishableKey,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const state = { 
  user: null, 
  isTesorero: false, 
  isPlayer: false,        // ← NUEVO: jugador con cuenta activa
  playerInfo: null,       // ← NUEVO: datos del jugador si tiene cuenta
  currentScreen: 'home' 
};

const POSICIONES = [
  { code: 'P', name: 'Pitcher' }, { code: 'C', name: 'Catcher' },
  { code: '1B', name: '1ª Base' }, { code: '2B', name: '2ª Base' },
  { code: '3B', name: '3ª Base' }, { code: 'SS', name: 'Shortstop' },
  { code: 'LF', name: 'Jardín Izq.' }, { code: 'CF', name: 'Jardín Cen.' },
  { code: 'RF', name: 'Jardín Der.' }, { code: 'DH', name: 'Bat. Des.' },
  { code: 'Utility', name: 'Utility' }
];

// Aportaciones según reglas del equipo
const APORTACION_JUGO = 100;
const APORTACION_AVISO = 50;
const APORTACION_PENDIENTE = 0;

function getAportacion(estado) {
  if (estado === 'jugo') return APORTACION_JUGO;
  if (estado === 'no_asistio') return APORTACION_AVISO;
  return APORTACION_PENDIENTE;
}

// Categorías de gastos
const EXPENSE_CATEGORIES = [
  { value: 'campo', label: 'Campo', icon: '🏟️' },
  { value: 'pelotas', label: 'Pelotas', icon: '⚾' },
  { value: 'liga', label: 'Liga', icon: '🏆' },
  { value: 'uniformes', label: 'Uniformes', icon: '👕' },
  { value: 'otros', label: 'Otros', icon: '📋' }
];

function getCategoryIcon(cat) {
  return EXPENSE_CATEGORIES.find(c => c.value === cat)?.icon || '📋';
}

function getCategoryLabel(cat) {
  return EXPENSE_CATEGORIES.find(c => c.value === cat)?.label || cat;
}

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
// AUTH — 3 roles: tesorero, jugador, invitado (público)
// ============================================================
async function checkAuthStatus() {
  const { data: { session } } = await db.auth.getSession();
  
  if (!session) {
    // Modo invitado (público)
    state.user = null;
    state.isTesorero = false;
    state.isPlayer = false;
    state.playerInfo = null;
    document.body.classList.add('guest-mode');
    document.body.classList.remove('tesorero-mode', 'player-mode');
    return;
  }

  state.user = session.user;

  // Verificar si es tesorero
  const { data: tesorero } = await db.from('tesoreros')
    .select('*').eq('user_id', session.user.id).maybeSingle();

  if (tesorero) {
    state.isTesorero = true;
    enableTesoreroMode(tesorero.nombre);
    return;
  }

  // Verificar si es jugador con cuenta activa
  const { data: playerAccount } = await db.from('player_accounts')
    .select('*, players(*)')
    .eq('user_id', session.user.id)
    .eq('activo', true)
    .maybeSingle();

  if (playerAccount && playerAccount.players) {
    state.isPlayer = true;
    state.playerInfo = playerAccount.players;
    enablePlayerMode(playerAccount.players);
    // Actualizar last_login
    db.from('player_accounts').update({ last_login: new Date().toISOString() })
      .eq('id', playerAccount.id).then(() => {});
    return;
  }

  // Usuario autenticado pero sin rol — cerrar sesión
  await db.auth.signOut();
  document.body.classList.add('guest-mode');
}

function enableTesoreroMode(nombre) {
  document.body.classList.add('tesorero-mode');
  document.body.classList.remove('guest-mode', 'player-mode');
  const btn = document.getElementById('adminBtn');
  btn.innerHTML = '<span class="crown-badge">👑</span>';
  btn.classList.add('active');
  btn.title = `Tesorero: ${nombre}`;
  document.getElementById('header-subtitle').textContent = `TESORERO · ${(nombre || '').toUpperCase()}`;
}

function enablePlayerMode(player) {
  document.body.classList.add('player-mode');
  document.body.classList.remove('guest-mode', 'tesorero-mode');
  const btn = document.getElementById('adminBtn');
  btn.innerHTML = '⚾';
  btn.classList.add('active');
  btn.title = `${player.apodo || player.nombre} #${player.numero}`;
  const displayName = player.apodo || player.nombre.split(' ')[0];
  document.getElementById('header-subtitle').textContent = `#${player.numero} · ${displayName.toUpperCase()}`;
}

function disableAllAuthModes() {
  document.body.classList.remove('tesorero-mode', 'player-mode');
  document.body.classList.add('guest-mode');
  const btn = document.getElementById('adminBtn');
  btn.innerHTML = '🔒';
  btn.classList.remove('active');
  btn.title = 'Iniciar sesión';
  document.getElementById('header-subtitle').textContent = 'LIGA VETERANOS 40+ · 2026';
  state.user = null;
  state.isTesorero = false;
  state.isPlayer = false;
  state.playerInfo = null;
}

// Alias para mantener compatibilidad con código previo
function disableTesoreroMode() {
  disableAllAuthModes();
}

function showLoginModal() {
  openModal(`
    <div class="modal-header">
      <h2>ENTRAR</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="login-intro">
        <div class="crown">⚾</div>
        <div class="title">"BIENVENIDO, TAZO"</div>
        <div class="quote">Usa el correo que te dio el tesorero</div>
      </div>
      <form id="loginForm">
        <div id="loginError"></div>
        <div class="form-group">
          <label class="form-label">Correo</label>
          <input type="email" class="form-input" id="loginEmail" required autocomplete="email" autocapitalize="none">
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

    // Verificar tesorero primero
    const { data: tesorero } = await db.from('tesoreros')
      .select('*').eq('user_id', data.user.id).maybeSingle();

    if (tesorero) {
      state.user = data.user;
      state.isTesorero = true;
      enableTesoreroMode(tesorero.nombre);
      closeModal();
      reloadCurrentScreen();
      return;
    }

    // Verificar jugador
    const { data: playerAccount } = await db.from('player_accounts')
      .select('*, players(*)')
      .eq('user_id', data.user.id)
      .eq('activo', true)
      .maybeSingle();

    if (playerAccount && playerAccount.players) {
      state.user = data.user;
      state.isPlayer = true;
      state.playerInfo = playerAccount.players;
      enablePlayerMode(playerAccount.players);
      db.from('player_accounts').update({ last_login: new Date().toISOString() })
        .eq('id', playerAccount.id).then(() => {});
      closeModal();
      reloadCurrentScreen();
      return;
    }

    // Autenticado pero sin rol
    await db.auth.signOut();
    throw new Error('Tu cuenta no está activa. Contacta al tesorero.');
  } catch (err) {
    let msg = err.message || 'Error al entrar';
    if (msg.includes('Invalid login')) msg = 'Correo o contraseña incorrecta';
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
}

function showLogoutConfirm() {
  const rolTxt = state.isTesorero ? 'modo tesorero' : 'tu cuenta';
  openModal(`
    <div class="modal-header">
      <h2>CERRAR SESIÓN</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">👋</div>
        <p style="color: var(--cream-2);">¿Seguro que quieres salir de ${rolTxt}?</p>
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
  disableAllAuthModes();
  closeModal();
  reloadCurrentScreen();
}

document.getElementById('adminBtn').addEventListener('click', () => {
  if (state.isTesorero || state.isPlayer) showLogoutConfirm();
  else showLoginModal();
});

// ============================================================
// PANTALLA: INICIO (público o privado según login)
// ============================================================
async function loadHome() {
  const container = document.getElementById('home-content');

  // Si es invitado (sin login): mostrar gate público
  if (!state.isTesorero && !state.isPlayer) {
    return loadPublicHome(container);
  }

  // Si está logueado: mostrar home completa
  return loadPrivateHome(container);
}

async function loadPublicHome(container) {
  try {
    const [recordRes, nextGameRes, sponsorsRes, teamInfoRes] = await Promise.all([
      db.from('v_public_record').select('*').maybeSingle(),
      db.from('v_public_next_game').select('*').maybeSingle(),
      db.from('v_public_patrocinadores').select('*').limit(6),
      db.from('v_public_team_info').select('*').maybeSingle()
    ]);

    const record = recordRes.data || { wins: 0, losses: 0, ties: 0 };
    const nextGame = nextGameRes.data;
    const sponsors = sponsorsRes.data || [];
    const teamInfo = teamInfoRes.data || { total_jugadores: 0 };

    let html = `
      <div class="public-gate">
        <div class="public-gate-title">Tazos</div>
        <div class="public-gate-sub">Dorados</div>
        <div class="public-gate-league">LIGA VETERANOS 40+ · 2026</div>

        <button class="public-login-btn" onclick="showLoginModal()">
          🔐 ENTRAR A LA APP
        </button>

        <div class="public-hint">Pide acceso al tesorero para ver todo</div>
      </div>`;

    // Récord público
    html += `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Récord</div>
          <div class="record-split">
            <span class="wins">${record.wins}</span>
            <span class="dash">—</span>
            <span class="losses">${record.losses}</span>
          </div>
          <div class="stat-trend gold">${record.juegos_jugados} juegos jugados</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Roster</div>
          <div class="stat-value" style="color: var(--gold);">${teamInfo.total_jugadores}</div>
          <div class="stat-trend">Tazos activos</div>
        </div>
      </div>`;

    // Próximo juego (si hay)
    if (nextGame) {
      html += `
        <div class="next-game" style="cursor: default;">
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
          ${nextGame.campo ? `<div class="game-meta"><span>📍 ${escapeHtml(nextGame.campo)}</span></div>` : ''}
        </div>`;
    }

    // Vitrina de patrocinadores pública
    if (sponsors.length > 0) {
      html += `
        <div class="sponsors-section">
          <div class="sponsors-title">
            <div class="sponsors-title-label">🤝 NUESTROS PATROCINADORES</div>
            <div class="sponsors-title-sub">"Gracias, coquetos"</div>
          </div>
          <div class="sponsors-grid">`;
      for (const s of sponsors) {
        html += `
          <div class="sponsor-card">
            <div class="sponsor-card-icon">🏆</div>
            <div class="sponsor-card-name">${escapeHtml(s.nombre)}</div>
            <div class="sponsor-card-amount">${formatMoney(s.total_aportado)}</div>
            <div class="sponsor-card-meta">${s.num_contribuciones} aportación${s.num_contribuciones > 1 ? 'es' : ''}</div>
          </div>`;
      }
      html += `</div></div>`;
    }

    // Motto
    html += `
      <div class="identity-card">
        <div class="identity-motto">SOMOS EDICIÓN LIMITADA</div>
        <div class="identity-sub">Tazos dorados, diamantes en bruto.<br>Un solo equipo.</div>
      </div>`;

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('No se pudo cargar.', err.message);
  }
}

async function loadPrivateHome(container) {
  try {
    const [nextGameRes, recordRes, balanceRes, expensesRes, contribRes, sponsorsRes] = await Promise.all([
      db.from('v_next_game').select('*').maybeSingle(),
      db.from('v_season_record').select('*').maybeSingle(),
      db.from('v_team_balance').select('*').maybeSingle(),
      db.from('expenses').select('*').order('fecha', { ascending: false }).limit(6),
      db.from('v_contribuciones_publicas').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(6),
      db.from('v_patrocinadores').select('*').limit(6)
    ]);

    const nextGame = nextGameRes.data;
    const record = recordRes.data || { wins: 0, losses: 0, ties: 0 };
    const balance = balanceRes.data || { balance: 0, total_ingresos: 0 };
    const recentExpenses = expensesRes.data || [];
    const recentContribs = contribRes.data || [];
    const sponsors = sponsorsRes.data || [];

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

    // Si es tesorero: ver saldo. Si es jugador: ver su propia info.
    let secondStatCard = '';
    if (state.isTesorero) {
      secondStatCard = `
        <div class="stat-card">
          <div class="stat-label">Saldo equipo</div>
          <div class="stat-value money">${formatMoney(balance.balance)}</div>
          <div class="stat-trend">Entradas: ${formatMoney(balance.total_ingresos)}</div>
        </div>`;
    } else if (state.isPlayer && state.playerInfo) {
      // Jugadores ven sus propios datos
      const { data: myStatus } = await db.from('v_player_status')
        .select('*').eq('id', state.playerInfo.id).maybeSingle();
      const deuda = Number(myStatus?.deuda_pendiente || 0);
      const voluntarias = Number(myStatus?.total_voluntarias || 0);
      const excedente = Number(myStatus?.excedente_fondo || 0);

      let miEstado, miLabel;
      if (deuda > 0) {
        miEstado = `−${formatMoney(deuda)}`;
        miLabel = 'Pendiente por cobrar';
      } else if (excedente > 0) {
        miEstado = `+${formatMoney(excedente)}`;
        miLabel = `Aportado voluntario`;
      } else {
        miEstado = 'OK';
        miLabel = '¡Tazo al corriente!';
      }

      secondStatCard = `
        <div class="stat-card">
          <div class="stat-label">Mi cuenta</div>
          <div class="stat-value money" style="color: ${deuda > 0 ? 'var(--red)' : excedente > 0 ? 'var(--gold)' : 'var(--green)'};">${miEstado}</div>
          <div class="stat-trend">${miLabel}</div>
        </div>`;
    }

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
        ${secondStatCard}
      </div>
      <div class="identity-card">
        <div class="identity-motto">SOMOS EDICIÓN LIMITADA</div>
        <div class="identity-sub">Tazos dorados, diamantes en bruto.<br>Un solo equipo.</div>
      </div>`;

    // Vitrina de patrocinadores
    if (sponsors.length > 0) {
      html += `
        <div class="sponsors-section">
          <div class="sponsors-title">
            <div class="sponsors-title-label">🤝 NUESTROS PATROCINADORES</div>
            <div class="sponsors-title-sub">"Gracias, coquetos"</div>
          </div>
          <div class="sponsors-grid">`;
      for (const s of sponsors) {
        html += `
          <div class="sponsor-card">
            <div class="sponsor-card-icon">🏆</div>
            <div class="sponsor-card-name">${escapeHtml(s.nombre)}</div>
            <div class="sponsor-card-amount">${formatMoney(s.total_aportado)}</div>
            <div class="sponsor-card-meta">${s.num_contribuciones} aportación${s.num_contribuciones > 1 ? 'es' : ''}</div>
          </div>`;
      }
      html += `</div></div>`;
    }

    // Últimos movimientos — solo tesorero
    if (state.isTesorero) {
      const movements = [
        ...recentExpenses.map(e => ({
          tipo: 'egreso', fecha: e.fecha,
          titulo: e.descripcion || e.categoria, sub: e.categoria,
          monto: Number(e.monto)
        })),
        ...recentContribs.map(c => ({
          tipo: 'ingreso', fecha: c.fecha,
          titulo: c.donante_display,
          sub: c.concepto || (c.origen === 'jugador' ? 'Aportación voluntaria' : c.origen === 'patrocinador' ? 'Patrocinio' : 'Donación'),
          monto: Number(c.monto)
        }))
      ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5);

      if (movements.length > 0) {
        html += `<div class="section-title">Últimos movimientos</div><div class="list-card">`;
        for (const m of movements) {
          const fecha = new Date(m.fecha + 'T12:00:00');
          const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
          const isIngreso = m.tipo === 'ingreso';
          html += `
            <div class="list-row">
              <div class="list-row-icon ${isIngreso ? 'in' : 'out'}">${isIngreso ? '↓' : '↑'}</div>
              <div class="list-row-body">
                <div class="list-row-title">${escapeHtml(m.titulo)}</div>
                <div class="list-row-sub">${fechaTxt} · ${escapeHtml(m.sub)}</div>
              </div>
              <div class="list-row-value ${isIngreso ? 'pos' : 'neg'}">${isIngreso ? '+' : '−'}${formatMoney(m.monto)}</div>
            </div>`;
        }
        html += `</div>`;
      }
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
    const [balanceRes, catRes, playerStatusRes, contribRes, expensesRes, allExpensesCountRes] = await Promise.all([
      db.from('v_team_balance').select('*').maybeSingle(),
      db.from('v_expenses_by_category').select('*'),
      db.from('v_player_status').select('*').eq('activo', true).order('numero'),
      db.from('v_contribuciones_publicas').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(6),
      db.from('expenses').select('*').order('fecha', { ascending: false }).limit(5),
      db.from('expenses').select('*', { count: 'exact', head: true })
    ]);

    const balance = balanceRes.data || { balance: 0, total_ingresos: 0, total_egresos: 0, ingresos_cuotas: 0, ingresos_extra: 0 };
    const categories = catRes.data || [];
    const playerStatus = playerStatusRes.data || [];
    const contribuciones = contribRes.data || [];
    const recentExpenses = expensesRes.data || [];
    const totalExpensesCount = allExpensesCountRes.count || 0;
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
      </div>

      <div class="income-split-grid">
        <div class="income-mini-card cuotas">
          <div class="income-mini-label">Cuotas cobradas</div>
          <div class="income-mini-value"><small>$</small>${Number(balance.ingresos_cuotas || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
          <div class="income-mini-sub">por asistencia</div>
        </div>
        <div class="income-mini-card extra">
          <div class="income-mini-label">Ingresos extra</div>
          <div class="income-mini-value"><small>$</small>${Number(balance.ingresos_extra || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
          <div class="income-mini-sub">voluntarias + patrocinio</div>
        </div>
      </div>`;

    // Lista de contribuciones recientes
    if (contribuciones.length > 0) {
      html += `<div class="section-title">Contribuciones recientes</div><div class="list-card">`;
      for (const c of contribuciones) {
        const origenIcon = c.origen === 'jugador' ? '⚾' : c.origen === 'patrocinador' ? '🤝' : '💝';
        const fecha = new Date(c.fecha + 'T12:00:00');
        const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const tags = [];
        if (!c.publico) tags.push('<span class="tag privado">🔒 PRIVADO</span>');
        if (c.anonimo) tags.push('<span class="tag anonimo">🤫 ANÓN</span>');
        const clickAttr = state.isTesorero ? `onclick="showContribucionForm('${c.id}')"` : '';
        html += `
          <div class="contrib-row" ${clickAttr} style="${state.isTesorero ? 'cursor: pointer;' : ''}">
            <div class="contrib-row-icon ${c.origen}">${origenIcon}</div>
            <div class="contrib-row-body">
              <div class="contrib-row-donante ${c.anonimo ? 'anonimo' : ''}">${escapeHtml(c.donante_display)}</div>
              <div class="contrib-row-meta">
                <span>${fechaTxt}</span>
                ${c.concepto ? `<span>· ${escapeHtml(c.concepto)}</span>` : ''}
                ${tags.join('')}
              </div>
            </div>
            <div class="contrib-row-value">+${formatMoney(c.monto)}</div>
          </div>`;
      }
      html += `</div>`;
    }

    // Gastos por categoría (tarjetas clicables)
    if (categories.length > 0) {
      html += `<div class="section-title">Gastos por categoría</div><div class="cat-grid">`;
      for (const cat of categories) {
        const pct = totalGastos > 0 ? Math.round((Number(cat.total) / totalGastos) * 100) : 0;
        html += `
          <div class="cat-card" onclick="showExpenseList('${cat.categoria}')">
            <div class="cat-head">
              <span>${getCategoryIcon(cat.categoria)}</span>
              <span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${pct}%</span>
            </div>
            <div class="cat-name">${escapeHtml(cat.categoria)}</div>
            <div class="cat-val">${formatMoney(cat.total)}</div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
      }
      html += `</div>`;
    }

    // Últimos gastos
    if (recentExpenses.length > 0) {
      html += `
        <div class="section-title" style="display: flex; justify-content: space-between; align-items: baseline;">
          <span>Últimos gastos</span>
          <span style="font-size: 11px; color: var(--gold); cursor: pointer; letter-spacing: 1px;" onclick="showExpenseList()">VER TODOS (${totalExpensesCount}) →</span>
        </div>
        <div class="list-card">`;
      for (const e of recentExpenses) {
        const fecha = new Date(e.fecha + 'T12:00:00');
        const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const clickAttr = state.isTesorero ? `onclick="showExpenseDetail('${e.id}')"` : '';
        html += `
          <div class="expense-row" ${clickAttr}>
            <div class="expense-row-icon">${getCategoryIcon(e.categoria)}</div>
            <div class="expense-row-body">
              <div class="expense-row-desc">${escapeHtml(e.descripcion || getCategoryLabel(e.categoria))}</div>
              <div class="expense-row-meta">${fechaTxt} · ${escapeHtml(e.categoria)}</div>
            </div>
            <div class="expense-row-value">−${formatMoney(e.monto)}</div>
          </div>`;
      }
      html += `</div>`;
    } else if (state.isTesorero && contribuciones.length === 0) {
      html += `
        <div class="empty-state" style="padding: 24px;">
          <div class="emoji" style="font-size: 36px;">💸</div>
          <p style="font-size: 13px;">Sin movimientos todavía.</p>
          <div class="chk">Toca el botón dorado para registrar ingresos o gastos</div>
        </div>`;
    }

    if (playerStatus.length > 0) {
      html += `<div class="section-title">Estado por jugador</div><div class="list-card">`;
      for (const p of playerStatus) {
        const deuda = Number(p.deuda_pendiente) || 0;
        const excedente = Number(p.excedente_fondo) || 0;
        const voluntarias = Number(p.total_voluntarias) || 0;

        let statusTxt, pill;
        if (deuda > 0) {
          statusTxt = 'Sin tanta chimichanga 😅';
          pill = `<div class="debt-pill bad">−${formatMoney(deuda)}</div>`;
        } else if (excedente > 0) {
          statusTxt = `¡Diamante en bruto! Aportó ${formatMoney(voluntarias)} ✨`;
          pill = `<div class="debt-pill credit">+${formatMoney(excedente)}</div>`;
        } else if (voluntarias > 0) {
          statusTxt = `Tazo al corriente + aportó ${formatMoney(voluntarias)} ✨`;
          pill = `<div class="debt-pill ok">OK ✨</div>`;
        } else {
          statusTxt = 'Tazo al corriente ✨';
          pill = `<div class="debt-pill ok">OK</div>`;
        }

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
          ◆ El excedente va al fondo de uniformes<br>
          ◆ Aportaciones voluntarias cubren deuda primero
        </div>
      </div>

      <button class="btn btn-secondary" style="width: 100%; margin-top: 14px;" onclick="showAccessPanel()">
        🔐 Gestionar accesos del equipo
      </button>`;

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

        ${!isEdit ? `
        <!-- SECCIÓN DE ACCESO A LA APP — solo para jugadores nuevos -->
        <div class="form-section-divider">
          <span>🔐 ACCESO A LA APP</span>
        </div>

        <div class="form-group">
          <label class="checkbox-row">
            <input type="checkbox" id="createAccountCheckbox" checked onchange="togglePlayerAccountFields()">
            <span class="checkbox-row-label">
              <strong>Crear cuenta ahora</strong>
              <div class="form-hint" style="margin-top: 2px;">El jugador podrá entrar a la app con email y password</div>
            </span>
          </label>
        </div>

        <div id="accountFields">
          <div class="form-group">
            <label class="form-label">Email (auto-generado)</label>
            <input type="email" class="form-input" id="newPlayerEmail" autocapitalize="none" style="font-family: monospace; font-size: 13px;" placeholder="se genera al escribir número y apodo/nombre">
            <div class="form-hint">Editable. Si prefieres el email real del jugador, ponlo aquí.</div>
          </div>

          <div class="form-group">
            <label class="form-label">Password temporal (auto-generado)</label>
            <input type="text" class="form-input" id="newPlayerPassword" autocapitalize="none" style="font-family: monospace; font-size: 14px; letter-spacing: 1px;">
            <div class="form-hint">El jugador podrá cambiarlo después.</div>
          </div>
        </div>
        ` : ''}
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

  // Si es nuevo jugador, inicializar campos de cuenta
  if (!isEdit) {
    // Generar password aleatorio al abrir el formulario
    const pwField = document.getElementById('newPlayerPassword');
    if (pwField) pwField.value = generateTempPassword();

    // Listeners para auto-generar email cuando cambian número/apodo/nombre
    const numeroInput = document.getElementById('numero');
    const apodoInput = document.getElementById('apodo');
    const nombreInput = document.getElementById('nombre');

    const updateEmailPreview = () => {
      const checkbox = document.getElementById('createAccountCheckbox');
      if (!checkbox || !checkbox.checked) return;

      const emailField = document.getElementById('newPlayerEmail');
      if (!emailField) return;

      // Solo auto-generar si el usuario NO ha modificado manualmente el email
      // (para no sobreescribir lo que él puso)
      if (emailField.dataset.manuallyEdited === 'true') return;

      const numero = numeroInput.value;
      const apodo = apodoInput.value.trim();
      const nombre = nombreInput.value.trim();

      // Usar apodo, si no hay, primer nombre
      let base = (apodo || nombre.split(' ')[0] || '').toLowerCase();
      base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      base = base.replace(/[^a-z0-9]/g, '');

      if (numero !== '' && base) {
        const numeroPadded = String(parseInt(numero) || 0).padStart(2, '0');
        emailField.value = `${numeroPadded}${base}@tazosdorados.app`;
      }
    };

    numeroInput.addEventListener('input', updateEmailPreview);
    apodoInput.addEventListener('input', updateEmailPreview);
    nombreInput.addEventListener('input', updateEmailPreview);

    // Si el usuario edita manualmente el email, no sobrescribir después
    const emailField = document.getElementById('newPlayerEmail');
    if (emailField) {
      emailField.addEventListener('input', () => {
        emailField.dataset.manuallyEdited = 'true';
      });
    }
  }
}

// Toggle para mostrar/ocultar campos de cuenta
function togglePlayerAccountFields() {
  const checkbox = document.getElementById('createAccountCheckbox');
  const fields = document.getElementById('accountFields');
  if (!checkbox || !fields) return;
  fields.style.display = checkbox.checked ? 'block' : 'none';
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

  // Leer datos de cuenta si aplica (solo para jugadores nuevos)
  const isNew = !id;
  const accountCheckbox = document.getElementById('createAccountCheckbox');
  const createAccount = isNew && accountCheckbox && accountCheckbox.checked;

  let accountEmail = '';
  let accountPassword = '';

  if (createAccount) {
    accountEmail = document.getElementById('newPlayerEmail').value.trim();
    accountPassword = document.getElementById('newPlayerPassword').value.trim();

    if (!accountEmail || !accountPassword) {
      errorDiv.innerHTML = '<div class="form-error">Completa email y password (o desmarca la casilla de crear cuenta)</div>';
      return;
    }

    if (accountPassword.length < 6) {
      errorDiv.innerHTML = '<div class="form-error">Password muy corto (mínimo 6 caracteres)</div>';
      return;
    }
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
    // PASO 1: Guardar el jugador (nuevo o editar)
    let result;
    let newPlayerId = id;

    if (id) {
      result = await db.from('players').update(payload).eq('id', id);
    } else {
      result = await db.from('players').insert(payload).select('id').single();
      if (result.data) newPlayerId = result.data.id;
    }
    if (result.error) throw result.error;

    // PASO 2: Si es nuevo y pidió cuenta, crear la cuenta
    if (createAccount && newPlayerId) {
      saveBtn.textContent = 'Creando cuenta...';

      try {
        await createAccountForNewPlayer(newPlayerId, accountEmail, accountPassword, nombre, apodo);
        // createAccountForNewPlayer ya muestra la pantalla de credenciales
        // No cerramos modal aquí
        await loadRoster();  // refrescar en background para cuando vuelva
      } catch (accErr) {
        // El jugador SÍ se creó, pero la cuenta falló
        // Avisar al tesorero para que cree la cuenta después
        let accMsg = accErr.message || 'Error desconocido';
        if (accMsg.includes('already registered') || accMsg.includes('already been registered')) {
          accMsg = 'Ese email ya está registrado. El jugador quedó guardado pero sin cuenta. Puedes crearla después con otro email desde "Gestionar accesos".';
        }
        // Mostrar modal de advertencia
        modalContent.innerHTML = `
          <div class="modal-header">
            <h2>⚠️ JUGADOR GUARDADO</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div style="text-align: center; margin-bottom: 14px;">
              <div style="font-size: 42px;">⚠️</div>
              <div style="font-family: 'Bebas Neue', sans-serif; font-size: 16px; color: var(--gold); letter-spacing: 2px; margin-top: 6px;">
                ${escapeHtml(apodo || nombre)} SE AGREGÓ AL ROSTER
              </div>
            </div>
            <div class="form-error" style="text-align: left;">
              <strong>Pero la cuenta no se pudo crear:</strong><br><br>
              ${escapeHtml(accMsg)}<br><br>
              <em>Puedes intentar crear la cuenta después desde Cuentas → Gestionar accesos.</em>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" style="width: 100%;" onclick="closeModal()">Entendido</button>
          </div>`;
        await loadRoster();
      }
    } else {
      // Sin crear cuenta: comportamiento normal (solo cerrar modal)
      closeModal();
      await loadRoster();
    }
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

// Crea la cuenta Auth y la vincula con el jugador recién creado
async function createAccountForNewPlayer(playerId, email, password, nombre, apodo) {
  // Guardamos el state del tesorero actual
  const tesoreroSession = await db.auth.getSession();

  // PASO 1: Crear usuario en Auth (signUp desloguea al tesorero temporalmente)
  const { data: authData, error: authError } = await db.auth.signUp({
    email: email,
    password: password,
    options: { emailRedirectTo: undefined }
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('No se pudo crear el usuario');

  const newUserId = authData.user.id;

  // PASO 2: Re-loguearnos como tesorero
  if (tesoreroSession.data.session) {
    await db.auth.setSession({
      access_token: tesoreroSession.data.session.access_token,
      refresh_token: tesoreroSession.data.session.refresh_token
    });
  }

  // PASO 3: Vincular usuario con jugador en player_accounts
  const { error: linkError } = await db.from('player_accounts').insert({
    player_id: playerId,
    user_id: newUserId,
    email: email,
    activo: true
  });

  if (linkError) {
    throw new Error(`Usuario creado pero no se vinculó: ${linkError.message}`);
  }

  // ÉXITO: mostrar pantalla de credenciales + WhatsApp (reutilizamos la función existente)
  await showCredentialsScreen(playerId, email, password);
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
// PANTALLA: CALENDARIO
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
    const [gameRes, attRes, expRes, photosRes] = await Promise.all([
      db.from('games').select('*').eq('id', gameId).maybeSingle(),
      db.from('attendance').select('estado, aportacion, aportacion_pagada, pagado').eq('game_id', gameId),
      db.from('expenses').select('*').eq('game_id', gameId).order('fecha', { ascending: false }),
      db.from('photos').select('*').eq('game_id', gameId).order('created_at', { ascending: false })
    ]);
    if (gameRes.error) throw gameRes.error;
    if (!gameRes.data) throw new Error('Juego no encontrado');
    renderGameDetail(gameRes.data, attRes.data || [], expRes.data || [], photosRes.data || []);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar el juego.', err.message)}</div>`;
  }
}

function renderGameDetail(g, attendanceRecords, expensesRecords, photosRecords) {
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

  // Botón capturar resultado — solo si programado + tesorero
  let captureButton = '';
  if (g.status === 'programado' && state.isTesorero) {
    captureButton = `
      <button class="btn-hero" onclick="showCaptureResult('${g.id}')">
        <span class="icon">⚾</span>
        <span>CAPTURAR RESULTADO</span>
      </button>`;
  }

  // Mini resumen de asistencia + botón
  const attExists = attendanceRecords.length > 0;
  let attendanceMini = '';
  let attendanceButton = '';

  if (g.status === 'jugado') {
    if (attExists) {
      const jugaron = attendanceRecords.filter(a => a.estado === 'jugo').length;
      const avisaron = attendanceRecords.filter(a => a.estado === 'no_asistio').length;
      const pendientes = attendanceRecords.filter(a => a.estado === 'pendiente').length;
      const totalAport = attendanceRecords.reduce((s, a) => s + Number(a.aportacion || 0), 0);
      const cobrado = attendanceRecords.reduce((s, a) => s + Number(a.aportacion_pagada || 0), 0);
      const porCobrar = Math.max(0, totalAport - cobrado);

      attendanceMini = `
        <div class="attendance-mini-summary">
          <div class="attendance-mini-title">📋 ASISTENCIA & APORTACIONES</div>
          <div class="attendance-mini-row">
            <span>
              ${jugaron > 0 ? `<span class="mini-pill jugo">⚾ ${jugaron} JUGÓ</span>` : ''}
              ${avisaron > 0 ? `<span class="mini-pill aviso">📲 ${avisaron} AVISÓ</span>` : ''}
              ${pendientes > 0 ? `<span class="mini-pill pend">❓ ${pendientes} PEND</span>` : ''}
            </span>
          </div>
          <div class="attendance-mini-row" style="margin-top: 8px;">
            <span>Total a aportar</span>
            <strong>${formatMoney(totalAport)}</strong>
          </div>
          <div class="attendance-mini-row">
            <span style="color: var(--green);">Cobrado</span>
            <strong style="color: var(--green);">${formatMoney(cobrado)}</strong>
          </div>
          ${porCobrar > 0 ? `
          <div class="attendance-mini-row">
            <span style="color: var(--red);">Por cobrar</span>
            <strong style="color: var(--red);">${formatMoney(porCobrar)}</strong>
          </div>` : ''}
        </div>`;

      if (state.isTesorero) {
        attendanceButton = `
          <button class="btn btn-secondary" style="width: 100%; margin-bottom: 14px;" onclick="showAttendance('${g.id}')">
            ✏️ EDITAR ASISTENCIA
          </button>`;
      }
    } else if (state.isTesorero) {
      attendanceButton = `
        <button class="btn-hero" onclick="showAttendance('${g.id}')">
          <span class="icon">📋</span>
          <span>CAPTURAR ASISTENCIA</span>
        </button>`;
    }
  }

  // Info del campo y notas
  const infoRows = `
    <div class="player-detail-info">
      ${g.campo ? `<div class="detail-row"><span class="detail-label">Campo</span><span class="detail-value">${escapeHtml(g.campo)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Condición</span><span class="detail-value gold">${g.es_local ? '🏠 Somos locales' : '✈️ Vamos de visita'}</span></div>
      ${g.hora ? `<div class="detail-row"><span class="detail-label">Hora</span><span class="detail-value">${formatHour(g.hora)}</span></div>` : ''}
    </div>
    ${g.notas ? `<div class="notes-box">📝 ${escapeHtml(g.notas)}</div>` : ''}`;

  // Sección de gastos del juego
  let expensesSection = '';
  const gastos = expensesRecords || [];
  const totalGastosJuego = gastos.reduce((s, e) => s + Number(e.monto || 0), 0);

  // ¿Ya hay ampayeo registrado en este juego?
  const yaHayAmpayeo = gastos.some(e => 
    (e.descripcion || '').toLowerCase().match(/ampay|umpir/)
  );
  // Solo mostramos el botón quick si es tesorero, el juego ya se jugó y aún no hay ampayeo
  const mostrarAmpayeoQuick = state.isTesorero && g.status === 'jugado' && !yaHayAmpayeo;

  if (gastos.length > 0) {
    let items = '';
    for (const e of gastos) {
      const clickAttr = state.isTesorero ? `onclick="showExpenseDetail('${e.id}')"` : '';
      items += `
        <div class="expenses-mini-item" ${clickAttr} ${state.isTesorero ? 'style="cursor: pointer;"' : ''}>
          <span>${getCategoryIcon(e.categoria)} ${escapeHtml(e.descripcion || getCategoryLabel(e.categoria))}</span>
          <span class="amt">−${formatMoney(e.monto)}</span>
        </div>`;
    }
    expensesSection = `
      <div class="expenses-mini-summary">
        <div class="expenses-mini-title">
          💸 GASTOS DEL JUEGO
          <strong>${formatMoney(totalGastosJuego)}</strong>
        </div>
        ${items}
        ${state.isTesorero ? `
          ${mostrarAmpayeoQuick ? `
            <button class="btn btn-primary" style="width: 100%; margin-top: 10px; font-size: 13px; padding: 10px; background: var(--gold-dark); border-color: var(--gold-dark);" onclick="quickAddAmpayeo('${g.id}')">
              ⚾ REGISTRAR AMPAYEO
            </button>` : ''}
          <button class="btn btn-secondary" style="width: 100%; margin-top: 8px; font-size: 12px; padding: 8px;" onclick="showExpenseForm(null, '${g.id}')">
            + Agregar otro gasto
          </button>` : ''}
      </div>`;
  } else if (state.isTesorero) {
    expensesSection = `
      ${mostrarAmpayeoQuick ? `
        <button class="btn btn-primary" style="width: 100%; margin-bottom: 10px; background: var(--gold-dark); border-color: var(--gold-dark); padding: 12px;" onclick="quickAddAmpayeo('${g.id}')">
          ⚾ REGISTRAR AMPAYEO
        </button>` : ''}
      <button class="btn btn-secondary" style="width: 100%; margin-bottom: 14px;" onclick="showExpenseForm(null, '${g.id}')">
        💸 Agregar gasto a este juego
      </button>`;
  }

  // Sección de fotos del juego
  let photosSection = '';
  const photos = photosRecords || [];
  if (photos.length > 0) {
    const previews = photos.slice(0, 6);
    const extra = photos.length - previews.length;
    let thumbsHtml = '';
    previews.forEach((p, idx) => {
      const isLast = idx === previews.length - 1 && extra > 0;
      const overlayClass = isLast ? 'more-overlay' : '';
      const overlayData = isLast ? `data-more="+${extra}"` : '';
      thumbsHtml += `
        <div class="photo-thumb ${overlayClass}"
             ${overlayData}
             style="background-image: url('${photoThumb(p.cloudinary_url)}');"
             onclick="openGameLightbox('${g.id}', ${idx})"></div>`;
    });
    photosSection = `
      <div class="photo-section">
        <div class="photo-section-head">
          <div class="photo-section-title">📸 MEMORIAS DEL JUEGO</div>
          <div class="photo-section-count">${photos.length} foto${photos.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="photo-grid">${thumbsHtml}</div>
        ${state.isTesorero ? `
          <button class="btn btn-secondary" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 8px;" onclick="showPhotoUploadForm('${g.id}')">
            📷 Agregar más fotos
          </button>` : ''}
      </div>`;
  } else if (state.isTesorero) {
    photosSection = `
      <button class="btn btn-secondary" style="width: 100%; margin-bottom: 14px;" onclick="showPhotoUploadForm('${g.id}')">
        📸 Agregar fotos del juego
      </button>`;
  }

  // Footer
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
      ${attendanceMini}
      ${attendanceButton}
      ${expensesSection}
      ${photosSection}
      ${infoRows}
    </div>
    ${footerButtons ? `<div class="modal-footer">${footerButtons}</div>` : ''}`;
}

// ============================================================
// FORMULARIO DE JUEGO
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

  const payload = { fecha, hora, rival, campo, es_local, status, notas };

  if (status === 'jugado') {
    const cTazos = parseInt(document.getElementById('carrerasTazos').value);
    const cRival = parseInt(document.getElementById('carrerasRival').value);
    if (isNaN(cTazos) || isNaN(cRival)) {
      errorDiv.innerHTML = '<div class="form-error">Si el juego ya se jugó, captura las carreras</div>';
      return;
    }
    payload.carreras_tazos = cTazos;
    payload.carreras_rival = cRival;
    payload.resultado = calcResult(cTazos, cRival);
  } else {
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
// CAPTURAR RESULTADO
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
      // Pasar DIRECTO a asistencia (flow guiado)
      setTimeout(() => showAttendance(g.id), 200);
    } catch (err) {
      document.getElementById('captureError').innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar resultado';
    }
  });

  setTimeout(() => capTazos.focus(), 200);
}

// ============================================================
// DUPLICAR JUEGO
// ============================================================
async function duplicateGame(gameId) {
  try {
    const { data: g } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
    if (!g) throw new Error('Juego no encontrado');

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
          Se eliminarán el juego y todos sus datos (asistencia, fotos, gastos asociados).
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
// ASISTENCIA
// ============================================================
let attendanceState = {};
let attendancePlayersCache = [];
let attendanceGameCache = null;
let attendanceDirty = false;

async function showAttendance(gameId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const [gameRes, playersRes, attRes] = await Promise.all([
      db.from('games').select('*').eq('id', gameId).maybeSingle(),
      db.from('players').select('*').eq('activo', true).order('numero'),
      db.from('attendance').select('*').eq('game_id', gameId)
    ]);

    if (gameRes.error) throw gameRes.error;
    if (!gameRes.data) throw new Error('Juego no encontrado');

    const game = gameRes.data;
    const activePlayers = playersRes.data || [];
    const existingAtt = attRes.data || [];

    // Si hay jugadores inactivos con asistencia registrada, incluirlos
    const extraIds = existingAtt
      .map(a => a.player_id)
      .filter(id => !activePlayers.find(p => p.id === id));

    let extraPlayers = [];
    if (extraIds.length > 0) {
      const { data } = await db.from('players').select('*').in('id', extraIds);
      extraPlayers = data || [];
    }

    const allPlayers = [...activePlayers, ...extraPlayers];

    // Inicializar estado con pagos parciales
    attendanceState = {};
    for (const p of allPlayers) {
      const existing = existingAtt.find(a => a.player_id === p.id);
      if (existing) {
        attendanceState[p.id] = {
          estado: existing.estado,
          aportacion_pagada: Number(existing.aportacion_pagada || 0)
        };
      } else {
        attendanceState[p.id] = { estado: 'pendiente', aportacion_pagada: 0 };
      }
    }

    attendancePlayersCache = allPlayers;
    attendanceGameCache = game;
    attendanceDirty = false;

    renderAttendanceScreen();
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderAttendanceScreen() {
  const g = attendanceGameCache;
  const players = attendancePlayersCache;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>ASISTENCIA</h2>
      <button class="modal-close" onclick="confirmCloseAttendance()">×</button>
    </div>
    <div class="modal-body">
      <div class="game-detail-header">
        <div class="game-detail-date">${formatDateLong(g.fecha)}</div>
        <div style="color: var(--cream-2); margin-top: 4px; font-size: 14px;">vs ${escapeHtml(g.rival)}</div>
      </div>

      <div class="attendance-stats" id="attStatGrid"></div>

      <div class="att-money-card" id="attMoneyCard"></div>

      <div class="att-bulk-actions">
        <button class="att-bulk-btn" onclick="bulkAttendanceAction('jugaron')">✅ TODOS JUGARON</button>
        <button class="att-bulk-btn" onclick="bulkAttendanceAction('avisaron')">📲 TODOS AVISARON</button>
        <button class="att-bulk-btn" onclick="bulkAttendanceAction('limpiar')">🗑️ LIMPIAR</button>
      </div>

      <div id="attPlayersContainer">
        ${players.map(p => renderAttendancePlayerRow(p)).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="confirmCloseAttendance()">Cancelar</button>
      <button class="btn btn-primary" id="saveAttendanceBtn" onclick="saveAttendance()">Guardar</button>
    </div>`;

  updateAttendanceStats();
}

function renderAttendancePlayerRow(p) {
  const st = attendanceState[p.id] || { estado: 'pendiente', aportacion_pagada: 0 };
  const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
  const avatarText = p.foto_url ? '' : getInitials(p.nombre);
  const aportacionTeorica = getAportacion(st.estado);
  const pagado = Number(st.aportacion_pagada || 0);
  const falta = Math.max(0, aportacionTeorica - pagado);

  const jugoActive = st.estado === 'jugo' ? 'active-jugo' : '';
  const avisoActive = st.estado === 'no_asistio' ? 'active-aviso' : '';
  const pendActive = st.estado === 'pendiente' ? 'active-pend' : '';

  const showPay = st.estado !== 'pendiente';

  // Determinar estado del botón de pago:
  // 0 pagado → "⏳ DEBE $X" (rojo/gris)
  // pagó algo pero < total → "💵 $X/$Y" (amarillo, parcial)
  // pagó >= total → "💰 PAGÓ $X" (verde, completo)
  let payBtnClass, payBtnText;
  if (pagado === 0) {
    payBtnClass = '';
    payBtnText = `⏳ DEBE ${formatMoney(aportacionTeorica)}`;
  } else if (pagado < aportacionTeorica) {
    payBtnClass = 'partial';
    payBtnText = `💵 ${formatMoney(pagado)}/${formatMoney(aportacionTeorica)}`;
  } else {
    payBtnClass = 'paid';
    payBtnText = `💰 PAGÓ ${formatMoney(pagado)}`;
  }

  let amountText;
  if (aportacionTeorica === 0) {
    amountText = '<span style="opacity: 0.6;">Sin aportación aún</span>';
  } else if (pagado === 0) {
    amountText = `Aporta: <strong>${formatMoney(aportacionTeorica)}</strong>`;
  } else if (pagado < aportacionTeorica) {
    amountText = `Pagó: <strong>${formatMoney(pagado)}</strong> · Falta: <strong style="color: var(--orange);">${formatMoney(falta)}</strong>`;
  } else {
    amountText = `Pagó: <strong style="color: var(--green);">${formatMoney(pagado)}</strong> ✓`;
  }

  return `
    <div class="att-player-row ${st.estado}" id="attRow-${p.id}">
      <div class="att-player-head">
        <div class="att-player-avatar" ${avatarStyle}>${avatarText}</div>
        <div class="att-player-info">
          <div class="att-player-name">${escapeHtml(p.apodo || p.nombre)} <span class="att-player-num">#${p.numero}</span></div>
          <div class="att-player-amount">${amountText}</div>
        </div>
        ${showPay ? `
          <div class="att-player-pay">
            <button class="att-pay-toggle ${payBtnClass}" onclick="showPaymentModal('${p.id}')">
              ${payBtnText}
            </button>
          </div>` : ''}
      </div>
      <div class="att-estado-toggle">
        <button class="att-estado-btn ${jugoActive}" onclick="setAttendanceEstado('${p.id}', 'jugo')">⚾ JUGÓ</button>
        <button class="att-estado-btn ${avisoActive}" onclick="setAttendanceEstado('${p.id}', 'no_asistio')">📲 AVISÓ</button>
        <button class="att-estado-btn ${pendActive}" onclick="setAttendanceEstado('${p.id}', 'pendiente')">❓ PEND</button>
      </div>
    </div>`;
}

function setAttendanceEstado(playerId, estado) {
  if (!attendanceState[playerId]) {
    attendanceState[playerId] = { estado, aportacion_pagada: 0 };
  } else {
    attendanceState[playerId].estado = estado;
    // Si pasa a pendiente, resetear pago
    if (estado === 'pendiente') attendanceState[playerId].aportacion_pagada = 0;
  }
  attendanceDirty = true;

  const p = attendancePlayersCache.find(pl => pl.id === playerId);
  if (p) {
    const row = document.getElementById(`attRow-${playerId}`);
    if (row) row.outerHTML = renderAttendancePlayerRow(p);
  }
  updateAttendanceStats();
}

// NUEVO: Modal para registrar pago (completo / parcial / nada)
function showPaymentModal(playerId) {
  const p = attendancePlayersCache.find(pl => pl.id === playerId);
  const st = attendanceState[playerId];
  if (!p || !st || st.estado === 'pendiente') return;

  const aportacionTeorica = getAportacion(st.estado);
  const pagado = Number(st.aportacion_pagada || 0);

  // Usamos un mini-overlay encima del modal principal (no cerramos asistencia)
  const existingOverlay = document.getElementById('paymentOverlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'paymentOverlay';
  overlay.className = 'modal-backdrop show';
  overlay.style.zIndex = '250';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 380px;">
      <div class="modal-header">
        <h2>REGISTRAR PAGO</h2>
        <button class="modal-close" onclick="closePaymentModal()">×</button>
      </div>
      <div class="modal-body">
        <div style="text-align: center; margin-bottom: 14px;">
          <div style="font-family: 'Bebas Neue', sans-serif; font-size: 16px; color: var(--gold); letter-spacing: 2px;">
            ${escapeHtml(p.apodo || p.nombre)} #${p.numero}
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            Cuota del juego: <strong style="color: var(--cream);">${formatMoney(aportacionTeorica)}</strong>
          </div>
        </div>

        <!-- Opción 1: pagó completo -->
        <button class="btn btn-primary" style="width: 100%; margin-bottom: 10px; background: var(--green); color: white; border-color: var(--green); font-size: 14px; padding: 14px;" onclick="setPayment('${playerId}', ${aportacionTeorica})">
          💰 PAGÓ COMPLETO (${formatMoney(aportacionTeorica)})
        </button>

        <!-- Opción 2: pagó parcial -->
        <div style="background: var(--navy-2); border: 1px solid var(--gold-deep); border-radius: 10px; padding: 12px; margin-bottom: 10px;">
          <div style="font-family: 'Bebas Neue', sans-serif; font-size: 11px; letter-spacing: 1.5px; color: var(--gold); margin-bottom: 6px;">💵 PAGÓ PARCIAL</div>
          <div style="display: flex; gap: 8px; align-items: stretch;">
            <div style="position: relative; flex: 1;">
              <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--gold); font-family: monospace; font-size: 14px;">$</span>
              <input type="number" id="partialPaymentInput" min="1" max="${aportacionTeorica - 1}" step="1" inputmode="numeric" placeholder="70" value="${pagado > 0 && pagado < aportacionTeorica ? pagado : ''}" class="form-input" style="padding-left: 22px; font-family: monospace; font-size: 16px; font-weight: 700;">
            </div>
            <button class="btn btn-primary" style="padding: 0 16px; font-size: 12px;" onclick="applyPartialPayment('${playerId}', ${aportacionTeorica})">OK</button>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">
            Máximo ${formatMoney(aportacionTeorica - 1)} (si es más, mejor "COMPLETO")
          </div>
        </div>

        <!-- Opción 3: nada pagado -->
        <button class="btn btn-secondary" style="width: 100%;" onclick="setPayment('${playerId}', 0)">
          ⏳ NADA PAGADO AÚN
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePaymentModal();
  });

  // Auto-focus en input si hay pago parcial previo
  setTimeout(() => {
    const input = document.getElementById('partialPaymentInput');
    if (input) input.focus();
  }, 100);
}

function closePaymentModal() {
  const overlay = document.getElementById('paymentOverlay');
  if (overlay) overlay.remove();
}

function setPayment(playerId, amount) {
  const st = attendanceState[playerId];
  if (!st) return;
  st.aportacion_pagada = Number(amount) || 0;
  attendanceDirty = true;

  const p = attendancePlayersCache.find(pl => pl.id === playerId);
  if (p) {
    const row = document.getElementById(`attRow-${playerId}`);
    if (row) row.outerHTML = renderAttendancePlayerRow(p);
  }
  updateAttendanceStats();
  closePaymentModal();
}

function applyPartialPayment(playerId, maxAmount) {
  const input = document.getElementById('partialPaymentInput');
  if (!input) return;
  const amount = parseFloat(input.value);
  if (isNaN(amount) || amount <= 0) {
    alert('Ingresa un monto válido mayor a 0');
    return;
  }
  if (amount >= maxAmount) {
    // Si puso el total o más, tratarlo como pago completo
    setPayment(playerId, maxAmount);
    return;
  }
  setPayment(playerId, amount);
}

function updateAttendanceStats() {
  const states = Object.values(attendanceState);
  const jugaron = states.filter(s => s.estado === 'jugo').length;
  const avisaron = states.filter(s => s.estado === 'no_asistio').length;
  const pendientes = states.filter(s => s.estado === 'pendiente').length;

  const total = states.reduce((sum, s) => sum + getAportacion(s.estado), 0);
  const cobrado = states.reduce((sum, s) => sum + Number(s.aportacion_pagada || 0), 0);
  const porCobrar = Math.max(0, total - cobrado);

  const statGrid = document.getElementById('attStatGrid');
  if (statGrid) {
    statGrid.innerHTML = `
      <div class="att-stat-card jugo">
        <div class="att-stat-number">${jugaron}</div>
        <div class="att-stat-label">Jugaron</div>
      </div>
      <div class="att-stat-card aviso">
        <div class="att-stat-number">${avisaron}</div>
        <div class="att-stat-label">Avisaron</div>
      </div>
      <div class="att-stat-card pend">
        <div class="att-stat-number">${pendientes}</div>
        <div class="att-stat-label">Pendientes</div>
      </div>`;
  }

  const moneyCard = document.getElementById('attMoneyCard');
  if (moneyCard) {
    moneyCard.innerHTML = `
      <div class="att-money-label">TOTAL A APORTAR</div>
      <div class="att-money-total"><small>$</small>${total.toLocaleString('es-MX')}</div>
      <div class="att-money-footer">
        <div class="cobrado">COBRADO<strong>${formatMoney(cobrado)}</strong></div>
        ${porCobrar > 0 ? `<div class="por-cobrar">POR COBRAR<strong>${formatMoney(porCobrar)}</strong></div>` : ''}
      </div>`;
  }
}

function bulkAttendanceAction(action) {
  for (const p of attendancePlayersCache) {
    if (!attendanceState[p.id]) attendanceState[p.id] = { estado: 'pendiente', aportacion_pagada: 0 };
    if (action === 'jugaron') {
      attendanceState[p.id].estado = 'jugo';
    } else if (action === 'avisaron') {
      attendanceState[p.id].estado = 'no_asistio';
    } else if (action === 'limpiar') {
      attendanceState[p.id].estado = 'pendiente';
      attendanceState[p.id].aportacion_pagada = 0;
    }
  }
  attendanceDirty = true;

  const container = document.getElementById('attPlayersContainer');
  if (container) {
    container.innerHTML = attendancePlayersCache.map(p => renderAttendancePlayerRow(p)).join('');
  }
  updateAttendanceStats();
}

async function saveAttendance() {
  const gameId = attendanceGameCache.id;
  const saveBtn = document.getElementById('saveAttendanceBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    const rows = Object.entries(attendanceState).map(([playerId, s]) => {
      const aportacionTeorica = getAportacion(s.estado);
      const aportacionPagada = Number(s.aportacion_pagada || 0);
      return {
        game_id: gameId,
        player_id: playerId,
        estado: s.estado,
        aportacion: aportacionTeorica,
        aportacion_pagada: aportacionPagada,
        // Campo legacy: true si pagó completo, para compatibilidad
        pagado: aportacionPagada >= aportacionTeorica && aportacionTeorica > 0
      };
    });

    const { error } = await db.from('attendance').upsert(rows, { onConflict: 'game_id,player_id' });
    if (error) throw error;

    attendanceDirty = false;
    closeModal();

    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();

    setTimeout(() => showGameDetail(gameId), 150);
  } catch (err) {
    alert('Error al guardar: ' + err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

function confirmCloseAttendance() {
  if (!attendanceDirty) {
    closeModal();
    return;
  }

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>¿SALIR SIN GUARDAR?</h2>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: var(--cream-2);">Hay cambios sin guardar. Se perderán si sales ahora.</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="renderAttendanceScreen()">Seguir editando</button>
      <button class="btn btn-danger" onclick="closeModal()">Salir sin guardar</button>
    </div>`;
}

// ============================================================
// CONTRIBUCIONES (voluntarias + patrocinadores)
// ============================================================
const CONCEPTOS_SUGERIDOS = ['General', 'Uniformes', 'Pelotas', 'Campo', 'Liga', 'Gasolina'];

async function showContribucionForm(contribId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>${contribId ? 'EDITANDO...' : 'NUEVA CONTRIBUCIÓN'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  let contrib = null;
  // Cargar jugadores activos para el selector
  const { data: players, error: playersErr } = await db.from('players').select('id, numero, nombre, apodo').eq('activo', true).order('numero');
  if (playersErr) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', playersErr.message)}</div>`;
    return;
  }

  if (contribId) {
    const { data, error } = await db.from('contribuciones').select('*').eq('id', contribId).maybeSingle();
    if (error) {
      modalContent.innerHTML = `
        <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">${errorBox('No se pudo cargar.', error.message)}</div>`;
      return;
    }
    contrib = data;
  }

  renderContribucionForm(contrib, players || []);
}

function renderContribucionForm(c, players) {
  const isEdit = !!c;
  const today = new Date().toISOString().substring(0, 10);
  const currentOrigen = c?.origen || 'jugador';
  const currentPlayerId = c?.player_id || '';
  const currentNombre = c?.nombre_donante || '';
  const currentMonto = c?.monto || '';
  const currentFecha = c?.fecha || today;
  const currentConcepto = c?.concepto || 'General';
  const currentNotas = c?.notas || '';

  // Visibilidad actual: publico, anonimo
  let visibilidad = 'publico'; // publico_nombre, publico_anonimo, privado
  if (c) {
    if (!c.publico) visibilidad = 'privado';
    else if (c.anonimo) visibilidad = 'anonimo';
    else visibilidad = 'publico';
  }

  const playerOptions = players.map(p =>
    `<option value="${p.id}" ${currentPlayerId === p.id ? 'selected' : ''}>#${p.numero} — ${escapeHtml(p.apodo || p.nombre)}</option>`
  ).join('');

  const conceptChips = CONCEPTOS_SUGERIDOS.map(concepto => `
    <button type="button" class="concept-chip ${currentConcepto === concepto ? 'active' : ''}" data-concept="${concepto}">${concepto}</button>
  `).join('');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'EDITAR CONTRIBUCIÓN' : 'NUEVA CONTRIBUCIÓN'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <form id="contribForm">
        <input type="hidden" id="contribId" value="${c?.id || ''}">
        <div id="contribFormError"></div>

        <div class="form-group">
          <label class="form-label">¿De quién viene?</label>
          <div class="contrib-type-selector">
            <div class="contrib-type-btn ${currentOrigen === 'jugador' ? 'active' : ''}" data-origen="jugador">
              <div class="contrib-type-icon">⚾</div>
              <div class="contrib-type-label">Jugador</div>
            </div>
            <div class="contrib-type-btn ${currentOrigen === 'patrocinador' ? 'active' : ''}" data-origen="patrocinador">
              <div class="contrib-type-icon">🤝</div>
              <div class="contrib-type-label">Patrocinador</div>
            </div>
            <div class="contrib-type-btn ${currentOrigen === 'otro' ? 'active' : ''}" data-origen="otro">
              <div class="contrib-type-icon">💝</div>
              <div class="contrib-type-label">Otro</div>
            </div>
          </div>
        </div>

        <div id="donanteFields">
          <!-- populated based on origen -->
        </div>

        <div class="form-group">
          <label class="form-label">Visibilidad</label>
          <div class="visibility-selector" id="visibilityFields">
            <!-- populated based on origen -->
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Monto ($)</label>
            <input type="number" class="form-input" id="contribMonto" value="${currentMonto}" required min="1" step="1" inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input type="date" class="form-input" id="contribFecha" value="${currentFecha}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Concepto</label>
          <input type="text" class="form-input" id="contribConcepto" value="${escapeHtml(currentConcepto)}" placeholder="Ej. Uniformes">
          <div class="concept-chips" id="conceptChipsRow">${conceptChips}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Notas privadas (opcional)</label>
          <textarea class="form-textarea" id="contribNotas" placeholder="Notas internas del tesorero...">${escapeHtml(currentNotas)}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      ${isEdit ? `<button class="btn btn-danger" onclick="confirmDeleteContribucion('${c.id}')">Eliminar</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="saveContribBtn">Guardar</button>
    </div>`;

  // Internal state
  const formState = {
    origen: currentOrigen,
    player_id: currentPlayerId,
    nombre_donante: currentNombre,
    visibilidad,
    playersData: players
  };

  function renderDonanteFields() {
    const donanteDiv = document.getElementById('donanteFields');
    if (formState.origen === 'jugador') {
      donanteDiv.innerHTML = `
        <div class="form-group">
          <label class="form-label">Jugador</label>
          <select class="form-select" id="contribPlayerId">
            <option value="">— Selecciona un jugador —</option>
            ${formState.playersData.map(p =>
              `<option value="${p.id}" ${formState.player_id === p.id ? 'selected' : ''}>#${p.numero} — ${escapeHtml(p.apodo || p.nombre)}</option>`
            ).join('')}
          </select>
        </div>`;
    } else if (formState.origen === 'patrocinador') {
      donanteDiv.innerHTML = `
        <div class="form-group">
          <label class="form-label">Nombre del patrocinador</label>
          <input type="text" class="form-input" id="contribNombreDonante" value="${escapeHtml(formState.nombre_donante)}" placeholder="Ej. Taquería El Chikilín" required>
          <div class="form-hint">Este nombre aparecerá en la vitrina pública de patrocinadores</div>
        </div>`;
    } else {
      donanteDiv.innerHTML = `
        <div class="form-group">
          <label class="form-label">Nombre del donante (opcional)</label>
          <input type="text" class="form-input" id="contribNombreDonante" value="${escapeHtml(formState.nombre_donante)}" placeholder="Ej. Un amigo del equipo">
        </div>`;
    }
  }

  function renderVisibilityFields() {
    const visDiv = document.getElementById('visibilityFields');
    const options = formState.origen === 'patrocinador'
      ? [
          { v: 'publico', icon: '🏆', title: 'Público con nombre', desc: 'Aparece en la vitrina de patrocinadores del home' },
          { v: 'privado', icon: '🔒', title: 'Privado', desc: 'Solo el tesorero lo ve en cuentas (no aparece en vitrina)' }
        ]
      : [
          { v: 'publico', icon: '📣', title: 'Con nombre', desc: 'Aparece con el nombre del donante' },
          { v: 'anonimo', icon: '🤫', title: 'Público anónimo', desc: 'Aparece como "Aportación anónima" — solo tesorero ve el nombre' },
          { v: 'privado', icon: '🔒', title: 'Privado', desc: 'Solo el tesorero lo ve, no aparece en la app pública' }
        ];

    visDiv.innerHTML = options.map(o => `
      <label class="visibility-option ${formState.visibilidad === o.v ? 'active' : ''}">
        <input type="radio" name="visibility" value="${o.v}" ${formState.visibilidad === o.v ? 'checked' : ''}>
        <div class="visibility-option-body">
          <div class="visibility-option-title">${o.icon} ${o.title}</div>
          <div class="visibility-option-desc">${o.desc}</div>
        </div>
      </label>
    `).join('');

    // Listeners para visibility
    document.querySelectorAll('input[name="visibility"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        formState.visibilidad = e.target.value;
        // Actualizar clases active
        document.querySelectorAll('.visibility-option').forEach(opt => {
          opt.classList.toggle('active', opt.querySelector('input').checked);
        });
      });
    });
  }

  // Initial render
  renderDonanteFields();
  renderVisibilityFields();

  // Origen selector
  document.querySelectorAll('.contrib-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      formState.origen = btn.dataset.origen;
      document.querySelectorAll('.contrib-type-btn').forEach(b => b.classList.toggle('active', b === btn));
      // Si cambia a patrocinador, forzar visibilidad a "publico" por defecto
      if (formState.origen === 'patrocinador' && formState.visibilidad === 'anonimo') {
        formState.visibilidad = 'publico';
      }
      renderDonanteFields();
      renderVisibilityFields();
    });
  });

  // Concept chips
  document.querySelectorAll('.concept-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const concepto = chip.dataset.concept;
      document.getElementById('contribConcepto').value = concepto === 'General' ? '' : concepto;
      document.querySelectorAll('.concept-chip').forEach(c => c.classList.toggle('active', c === chip));
    });
  });

  document.getElementById('saveContribBtn').addEventListener('click', () => saveContribucion(formState));
}

async function saveContribucion(formState) {
  const errorDiv = document.getElementById('contribFormError');
  const saveBtn = document.getElementById('saveContribBtn');

  const id = document.getElementById('contribId').value;
  const monto = parseFloat(document.getElementById('contribMonto').value);
  const fecha = document.getElementById('contribFecha').value;
  const concepto = document.getElementById('contribConcepto').value.trim() || null;
  const notas = document.getElementById('contribNotas').value.trim() || null;
  const origen = formState.origen;
  const visibilidad = formState.visibilidad;

  // Validaciones
  if (isNaN(monto) || monto <= 0) {
    errorDiv.innerHTML = '<div class="form-error">Ingresa un monto válido</div>';
    return;
  }
  if (!fecha) {
    errorDiv.innerHTML = '<div class="form-error">Selecciona la fecha</div>';
    return;
  }

  let player_id = null;
  let nombre_donante = null;

  if (origen === 'jugador') {
    const select = document.getElementById('contribPlayerId');
    player_id = select?.value || null;
    if (!player_id) {
      errorDiv.innerHTML = '<div class="form-error">Selecciona el jugador</div>';
      return;
    }
  } else {
    const nombreInput = document.getElementById('contribNombreDonante');
    nombre_donante = nombreInput?.value?.trim() || null;
    if (origen === 'patrocinador' && !nombre_donante) {
      errorDiv.innerHTML = '<div class="form-error">Ingresa el nombre del patrocinador</div>';
      return;
    }
  }

  const publico = visibilidad !== 'privado';
  const anonimo = visibilidad === 'anonimo';

  const payload = {
    fecha, monto, origen, player_id, nombre_donante,
    publico, anonimo, concepto, notas
  };

  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';
  errorDiv.innerHTML = '';

  try {
    let result;
    if (id) result = await db.from('contribuciones').update(payload).eq('id', id);
    else {
      payload.created_by = state.user?.id || null;
      result = await db.from('contribuciones').insert(payload);
    }
    if (result.error) throw result.error;

    closeModal();
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

function confirmDeleteContribucion(contribId) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>ELIMINAR CONTRIBUCIÓN</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: var(--cream-2); line-height: 1.6;">
          Esta acción <strong style="color: var(--red);">NO se puede deshacer</strong>.
          <br><br>
          Se recalcularán automáticamente los saldos y las deudas.
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showContribucionForm('${contribId}')">Cancelar</button>
      <button class="btn btn-danger" onclick="deleteContribucion('${contribId}')">Sí, eliminar</button>
    </div>`;
}

async function deleteContribucion(contribId) {
  try {
    const { error } = await db.from('contribuciones').delete().eq('id', contribId);
    if (error) throw error;
    closeModal();
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// GASTOS (expenses)
// ============================================================

// FAB picker — pregunta "¿Ingreso o Gasto?" antes de abrir el form correcto
function showFabPicker() {
  openModal(`
    <div class="modal-header">
      <h2>¿QUÉ VAS A REGISTRAR?</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="fab-picker-grid">
        <div class="fab-picker-btn ingreso" onclick="closeModal(); setTimeout(() => showContribucionForm(), 100);">
          <div class="fab-picker-icon">💰</div>
          <div class="fab-picker-body">
            <div class="fab-picker-title">INGRESO</div>
            <div class="fab-picker-sub">Voluntaria, patrocinador, donación</div>
          </div>
          <div class="fab-picker-arrow">→</div>
        </div>
        <div class="fab-picker-btn egreso" onclick="closeModal(); setTimeout(() => showExpenseForm(), 100);">
          <div class="fab-picker-icon">💸</div>
          <div class="fab-picker-body">
            <div class="fab-picker-title">GASTO</div>
            <div class="fab-picker-sub">Campo, pelotas, liga, uniformes...</div>
          </div>
          <div class="fab-picker-arrow">→</div>
        </div>
      </div>
    </div>`);
}

async function showExpenseList(filterCategoria) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data, error } = await db.from('expenses').select('*').order('fecha', { ascending: false });
    if (error) throw error;
    renderExpenseList(data || [], filterCategoria || 'todas');
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderExpenseList(allExpenses, activeFilter) {
  const filtered = activeFilter === 'todas'
    ? allExpenses
    : allExpenses.filter(e => e.categoria === activeFilter);

  const totalFiltrado = filtered.reduce((s, e) => s + Number(e.monto || 0), 0);

  const chips = [{ value: 'todas', label: 'Todos', icon: '📊' }, ...EXPENSE_CATEGORIES]
    .map(c => `
      <div class="filter-chip ${activeFilter === c.value ? 'active' : ''}" onclick="filterExpenseList('${c.value}')">
        ${c.icon} ${c.label}
      </div>`).join('');

  let listHtml = '';
  if (filtered.length === 0) {
    listHtml = `
      <div class="empty-state" style="padding: 30px;">
        <div class="emoji" style="font-size: 40px;">📭</div>
        <p style="font-size: 13px;">Sin gastos en esta categoría.</p>
      </div>`;
  } else {
    listHtml = '<div class="list-card">';
    for (const e of filtered) {
      const fecha = new Date(e.fecha + 'T12:00:00');
      const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
      listHtml += `
        <div class="expense-row" onclick="showExpenseDetail('${e.id}')">
          <div class="expense-row-icon">${getCategoryIcon(e.categoria)}</div>
          <div class="expense-row-body">
            <div class="expense-row-desc">${escapeHtml(e.descripcion || getCategoryLabel(e.categoria))}</div>
            <div class="expense-row-meta">${fechaTxt} · ${escapeHtml(e.categoria)}${e.game_id ? ' · 📅 asociado a juego' : ''}</div>
          </div>
          <div class="expense-row-value">−${formatMoney(e.monto)}</div>
        </div>`;
    }
    listHtml += '</div>';
  }

  // Guardar cache para re-filtrar sin consultar DB
  window._expenseListCache = allExpenses;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>GASTOS</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body" style="padding-bottom: 80px;">
      <div class="filter-chips" id="expenseFilterChips">${chips}</div>
      <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 10px; text-align: center;">
        ${filtered.length} gasto${filtered.length !== 1 ? 's' : ''}
      </div>
      ${listHtml}
    </div>
    <div class="modal-footer sticky">
      <div class="expenses-total-bar" style="flex: 1; margin-bottom: 0;">
        <div class="expenses-total-bar-label">TOTAL ${activeFilter === 'todas' ? 'GENERAL' : activeFilter.toUpperCase()}</div>
        <div class="expenses-total-bar-value">${formatMoney(totalFiltrado)}</div>
      </div>
    </div>`;
}

function filterExpenseList(categoria) {
  const cache = window._expenseListCache || [];
  renderExpenseList(cache, categoria);
}

async function showExpenseDetail(expenseId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data: e, error } = await db.from('expenses').select('*').eq('id', expenseId).maybeSingle();
    if (error) throw error;
    if (!e) throw new Error('Gasto no encontrado');

    // Si tiene game_id, cargar info del juego
    let gameInfo = null;
    if (e.game_id) {
      const { data: g } = await db.from('games').select('id, fecha, rival').eq('id', e.game_id).maybeSingle();
      gameInfo = g;
    }

    renderExpenseDetail(e, gameInfo);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderExpenseDetail(e, gameInfo) {
  const fecha = new Date(e.fecha + 'T12:00:00');
  const fechaTxt = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>GASTO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="expense-detail-amount">
        <div><span class="currency">$</span><span class="number">${Number(e.monto).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span></div>
        <div class="expense-detail-cat">${getCategoryIcon(e.categoria)} ${escapeHtml(e.categoria).toUpperCase()}</div>
      </div>

      ${e.descripcion ? `
        <div class="notes-box" style="font-style: normal;">
          📝 ${escapeHtml(e.descripcion)}
        </div>` : ''}

      <div class="player-detail-info">
        <div class="detail-row"><span class="detail-label">Fecha</span><span class="detail-value">${fechaTxt}</span></div>
        ${gameInfo ? `
          <div class="detail-row">
            <span class="detail-label">Juego asociado</span>
            <span class="detail-value gold" style="cursor: pointer;" onclick="showGameDetail('${gameInfo.id}')">vs ${escapeHtml(gameInfo.rival || '')} →</span>
          </div>` : ''}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="confirmDeleteExpense('${e.id}')">Eliminar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="showExpenseForm('${e.id}')">Editar</button>
    </div>`;
}

async function showExpenseForm(expenseId, prefillGameId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>${expenseId ? 'EDITANDO...' : 'NUEVO GASTO'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  let expense = null;
  if (expenseId) {
    const { data, error } = await db.from('expenses').select('*').eq('id', expenseId).maybeSingle();
    if (error) {
      modalContent.innerHTML = `
        <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">${errorBox('No se pudo cargar.', error.message)}</div>`;
      return;
    }
    expense = data;
  } else if (prefillGameId) {
    expense = { game_id: prefillGameId };
  }

  // Cargar juegos recientes para el selector (últimos 30 días a futuro + 60 atrás)
  const { data: games } = await db.from('games')
    .select('id, fecha, rival')
    .order('fecha', { ascending: false })
    .limit(30);

  renderExpenseForm(expense, games || []);
}

// ============================================================
// AMPAYEO RÁPIDO — registra el gasto en 1 tap con confirmación
// ============================================================
async function quickAddAmpayeo(gameId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>⚾ AMPAYEO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    // Buscar el último ampayeo registrado para sugerir el mismo monto
    const { data: lastAmpayeo } = await db.from('expenses')
      .select('monto, descripcion')
      .or('descripcion.ilike.%ampay%,descripcion.ilike.%umpir%')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    const suggestedAmount = lastAmpayeo?.monto || 250;
    const lastLabel = lastAmpayeo?.monto 
      ? `Último ampayeo cobrado: <strong style="color: var(--gold);">${formatMoney(lastAmpayeo.monto)}</strong>`
      : `Cantidad sugerida (puedes cambiarla)`;

    // Obtener datos del juego para mostrar contexto
    const { data: game } = await db.from('games').select('fecha, rival').eq('id', gameId).maybeSingle();
    const gameLabel = game 
      ? `${formatDateLong(game.fecha)} · vs ${escapeHtml(game.rival || 'rival')}`
      : '';

    modalContent.innerHTML = `
      <div class="modal-header">
        <h2>⚾ AMPAYEO</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="font-size: 42px;">⚾</div>
          <div style="font-family: 'Bebas Neue', sans-serif; font-size: 14px; color: var(--gold); letter-spacing: 2px; margin-top: 6px;">
            GASTO DE AMPAYEO
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            ${gameLabel}
          </div>
        </div>

        <div style="background: var(--navy-2); border: 1px solid var(--gold-deep); border-radius: 10px; padding: 14px; margin-bottom: 14px; text-align: center;">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">${lastLabel}</div>
          <div style="display: flex; align-items: stretch; gap: 8px; justify-content: center;">
            <span style="font-family: 'Bebas Neue', sans-serif; font-size: 32px; color: var(--gold); line-height: 1;">$</span>
            <input type="number" id="ampayeoAmount" value="${suggestedAmount}" min="1" step="1" inputmode="numeric" 
              style="background: var(--navy); border: 2px solid var(--gold); color: var(--cream); font-family: 'Bebas Neue', sans-serif; font-size: 32px; padding: 6px 12px; border-radius: 8px; width: 140px; text-align: center; letter-spacing: 1px;">
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
            Edita el monto si fue distinto
          </div>
        </div>

        <div class="notes-box" style="font-style: normal; font-size: 11px;">
          ⚡ Al confirmar, se agrega como gasto del juego con categoría <strong style="color: var(--gold);">"otros"</strong> y descripción <strong style="color: var(--gold);">"Ampayeo"</strong>.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="saveAmpayeoBtn" onclick="saveAmpayeo('${gameId}')">⚾ Registrar ampayeo</button>
      </div>`;

    // Auto-focus en el input (con pequeño delay por animación del modal)
    setTimeout(() => {
      const input = document.getElementById('ampayeoAmount');
      if (input) { input.focus(); input.select(); }
    }, 150);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

async function saveAmpayeo(gameId) {
  const input = document.getElementById('ampayeoAmount');
  const saveBtn = document.getElementById('saveAmpayeoBtn');
  const monto = parseFloat(input?.value || '0');

  if (!monto || monto <= 0) {
    alert('Ingresa un monto válido mayor a 0');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    // Obtener fecha del juego para asignar la misma fecha al gasto
    const { data: game } = await db.from('games').select('fecha').eq('id', gameId).maybeSingle();
    const fecha = game?.fecha || new Date().toISOString().substring(0, 10);

    const { error } = await db.from('expenses').insert({
      game_id: gameId,
      categoria: 'otros',
      descripcion: 'Ampayeo',
      monto: monto,
      fecha: fecha
    });

    if (error) throw error;

    closeModal();

    // Refrescar pantallas relevantes
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();

    setTimeout(() => showGameDetail(gameId), 150);
  } catch (err) {
    alert('Error al guardar: ' + err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = '⚾ Registrar ampayeo';
  }
}

function renderExpenseForm(e, recentGames) {
  const isEdit = !!(e && e.id);
  const today = new Date().toISOString().substring(0, 10);
  const currentCategoria = e?.categoria || 'campo';
  const currentMonto = e?.monto || '';
  const currentFecha = e?.fecha || today;
  const currentDescripcion = e?.descripcion || '';
  const currentGameId = e?.game_id || '';

  const catButtons = EXPENSE_CATEGORIES.map(cat => `
    <div class="cat-visual-btn ${currentCategoria === cat.value ? 'active' : ''}" data-cat="${cat.value}">
      <div class="cat-visual-icon">${cat.icon}</div>
      <div class="cat-visual-label">${cat.label}</div>
    </div>
  `).join('');

  const gameOptions = recentGames.map(g => {
    const d = new Date(g.fecha + 'T12:00:00');
    const dStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return `<option value="${g.id}" ${currentGameId === g.id ? 'selected' : ''}>${dStr} · vs ${escapeHtml(g.rival || '')}</option>`;
  }).join('');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'EDITAR GASTO' : 'NUEVO GASTO'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <form id="expenseForm">
        <input type="hidden" id="expenseId" value="${e?.id || ''}">
        <div id="expenseFormError"></div>

        <div class="form-group">
          <label class="form-label">Categoría</label>
          <div class="cat-visual-grid" id="catVisualGrid">${catButtons}</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Monto ($)</label>
            <input type="number" class="form-input" id="expenseMonto" value="${currentMonto}" required min="1" step="1" inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input type="date" class="form-input" id="expenseFecha" value="${currentFecha}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" class="form-input" id="expenseDescripcion" value="${escapeHtml(currentDescripcion)}" placeholder="Ej. Renta de campo vs Águilas">
        </div>

        <div class="form-group">
          <label class="form-label">Asociar a un juego (opcional)</label>
          <select class="form-select" id="expenseGameId">
            <option value="">— Sin asociar —</option>
            ${gameOptions}
          </select>
          <div class="form-hint">Útil para ver "cuánto nos costó este juego"</div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      ${isEdit ? `<button class="btn btn-danger" onclick="confirmDeleteExpense('${e.id}')">Eliminar</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="saveExpenseBtn">Guardar</button>
    </div>`;

  // Estado local
  const formState = { categoria: currentCategoria };

  // Listeners para botones de categoría
  document.querySelectorAll('.cat-visual-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      formState.categoria = btn.dataset.cat;
      document.querySelectorAll('.cat-visual-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('saveExpenseBtn').addEventListener('click', () => saveExpense(formState));
}

async function saveExpense(formState) {
  const errorDiv = document.getElementById('expenseFormError');
  const saveBtn = document.getElementById('saveExpenseBtn');

  const id = document.getElementById('expenseId').value;
  const monto = parseFloat(document.getElementById('expenseMonto').value);
  const fecha = document.getElementById('expenseFecha').value;
  const descripcion = document.getElementById('expenseDescripcion').value.trim() || null;
  const game_id = document.getElementById('expenseGameId').value || null;
  const categoria = formState.categoria;

  if (isNaN(monto) || monto <= 0) {
    errorDiv.innerHTML = '<div class="form-error">Ingresa un monto válido</div>';
    return;
  }
  if (!fecha) {
    errorDiv.innerHTML = '<div class="form-error">Selecciona la fecha</div>';
    return;
  }
  if (!categoria) {
    errorDiv.innerHTML = '<div class="form-error">Selecciona una categoría</div>';
    return;
  }

  const payload = { fecha, monto, categoria, descripcion, game_id };

  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';
  errorDiv.innerHTML = '';

  try {
    let result;
    if (id) result = await db.from('expenses').update(payload).eq('id', id);
    else result = await db.from('expenses').insert(payload);
    if (result.error) throw result.error;

    closeModal();
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar';
  }
}

function confirmDeleteExpense(expenseId) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>ELIMINAR GASTO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: var(--cream-2); line-height: 1.6;">
          Esta acción <strong style="color: var(--red);">NO se puede deshacer</strong>.
          <br><br>
          Se recalcularán automáticamente el saldo del equipo y la categoría.
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showExpenseDetail('${expenseId}')">Cancelar</button>
      <button class="btn btn-danger" onclick="deleteExpense('${expenseId}')">Sí, eliminar</button>
    </div>`;
}

async function deleteExpense(expenseId) {
  try {
    const { error } = await db.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    closeModal();
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// GALERÍA DE FOTOS
// ============================================================

// Helper para optimizar URLs de Cloudinary
function cloudinaryTransform(url, transform) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/${transform}/`);
}
function photoThumb(url) {
  return cloudinaryTransform(url, 'c_fill,g_auto,w_400,h_400,q_auto,f_auto');
}
function photoFull(url) {
  return cloudinaryTransform(url, 'q_auto:best,f_auto,w_1600');
}

// ----------------- PANTALLA: GALERÍA -----------------
async function loadGaleria() {
  const container = document.getElementById('galeria-content');
  try {
    // Traer fotos con info del juego (via join manual con 2 queries)
    const { data: photos, error: photosErr } = await db
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (photosErr) throw photosErr;

    if (!photos || photos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📸</div>
          <p>Todavía no hay fotos.</p>
          <div class="chk">¡Ya parió la cochi!</div>
          ${state.isTesorero ? '<p style="font-size: 11px; color: var(--text-muted); margin-top: 12px;">Entra al detalle de un juego para agregar las primeras memorias.</p>' : ''}
        </div>`;
      return;
    }

    // Agrupar por game_id
    const photosByGame = {};
    for (const p of photos) {
      if (!photosByGame[p.game_id]) photosByGame[p.game_id] = [];
      photosByGame[p.game_id].push(p);
    }

    // Traer los juegos involucrados
    const gameIds = Object.keys(photosByGame);
    const { data: games } = await db.from('games').select('*').in('id', gameIds);
    const gamesMap = {};
    for (const g of games || []) gamesMap[g.id] = g;

    // Ordenar juegos por la foto más reciente que tienen
    const gameIdsSorted = gameIds.sort((a, b) => {
      const latestA = photosByGame[a][0]?.created_at || '';
      const latestB = photosByGame[b][0]?.created_at || '';
      return latestB.localeCompare(latestA);
    });

    let html = `
      <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 14px; text-align: center; letter-spacing: 1px;">
        ${photos.length} FOTO${photos.length !== 1 ? 'S' : ''} · ${gameIdsSorted.length} JUEGO${gameIdsSorted.length !== 1 ? 'S' : ''}
      </div>`;

    for (const gid of gameIdsSorted) {
      const game = gamesMap[gid];
      if (!game) continue;
      const gamePhotos = photosByGame[gid];
      const d = formatDateShort(game.fecha);
      const previews = gamePhotos.slice(0, 6);
      const extra = gamePhotos.length - previews.length;

      let resultPill = '';
      if (game.resultado === 'W') resultPill = `<div class="photo-game-result w">G ${game.carreras_tazos || 0}-${game.carreras_rival || 0}</div>`;
      else if (game.resultado === 'L') resultPill = `<div class="photo-game-result l">P ${game.carreras_tazos || 0}-${game.carreras_rival || 0}</div>`;
      else if (game.resultado === 'T') resultPill = `<div class="photo-game-result t">E ${game.carreras_tazos || 0}-${game.carreras_rival || 0}</div>`;

      let previewHtml = '<div class="photo-grid">';
      previews.forEach((p, idx) => {
        const isLast = idx === previews.length - 1 && extra > 0;
        const overlayClass = isLast ? 'more-overlay' : '';
        const overlayData = isLast ? `data-more="+${extra}"` : '';
        previewHtml += `
          <div class="photo-thumb ${overlayClass}"
               ${overlayData}
               style="background-image: url('${photoThumb(p.cloudinary_url)}');"
               onclick="openGameLightbox('${gid}', ${idx})"></div>`;
      });
      previewHtml += '</div>';

      html += `
        <div class="photo-game-card">
          <div class="photo-game-head">
            <div>
              <div class="photo-game-title">vs ${escapeHtml(game.rival || 'Rival')}</div>
              <div class="photo-game-date">${d.day} ${d.month} · ${gamePhotos.length} foto${gamePhotos.length !== 1 ? 's' : ''}</div>
            </div>
            ${resultPill}
          </div>
          ${previewHtml}
        </div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = errorBox('No se pudo cargar la galería.', err.message);
  }
}

// Cache de fotos por juego para el lightbox
const photosCacheByGame = {};

async function openGameLightbox(gameId, startIndex) {
  try {
    let photos = photosCacheByGame[gameId];
    if (!photos) {
      const { data, error } = await db
        .from('photos')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      photos = data || [];
      photosCacheByGame[gameId] = photos;
    }
    if (photos.length === 0) return;
    showLightbox(photos, startIndex || 0, gameId);
  } catch (err) {
    alert('Error al abrir galería: ' + err.message);
  }
}

// ----------------- LIGHTBOX -----------------
const lightboxState = { photos: [], index: 0, gameId: null };

function showLightbox(photos, startIndex, gameId) {
  lightboxState.photos = photos;
  lightboxState.index = startIndex;
  lightboxState.gameId = gameId;

  document.body.classList.add('lightbox-open');
  document.getElementById('lightboxOverlay').classList.add('show');
  document.getElementById('lightboxDelete').style.display = state.isTesorero ? 'grid' : 'none';

  renderLightboxPhoto();
}

function renderLightboxPhoto() {
  const { photos, index } = lightboxState;
  if (photos.length === 0) { closeLightbox(); return; }
  const photo = photos[index];

  const img = document.getElementById('lightboxImg');
  img.src = photoFull(photo.cloudinary_url);
  img.alt = `Foto ${index + 1}`;

  document.getElementById('lightboxCounter').textContent = `${index + 1} / ${photos.length}`;

  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');
  prev.disabled = index === 0;
  next.disabled = index === photos.length - 1;

  const footer = document.getElementById('lightboxFooter');
  if (photo.created_at) {
    const d = new Date(photo.created_at);
    footer.textContent = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    footer.textContent = '';
  }

  // Precargar siguiente para UX fluida
  if (index + 1 < photos.length) {
    const nextImg = new Image();
    nextImg.src = photoFull(photos[index + 1].cloudinary_url);
  }
}

function closeLightbox() {
  document.body.classList.remove('lightbox-open');
  document.getElementById('lightboxOverlay').classList.remove('show');
}

function lightboxNext() {
  if (lightboxState.index < lightboxState.photos.length - 1) {
    lightboxState.index++;
    renderLightboxPhoto();
  }
}

function lightboxPrev() {
  if (lightboxState.index > 0) {
    lightboxState.index--;
    renderLightboxPhoto();
  }
}

async function lightboxShare() {
  const photo = lightboxState.photos[lightboxState.index];
  if (!photo) return;

  const shareUrl = photoFull(photo.cloudinary_url);

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Tazos Dorados',
        text: 'Memorias del corazón, coqueto 💛',
        url: shareUrl
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  } else {
    // Fallback: copiar URL al clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link de la foto copiado al portapapeles 📋');
    } catch (err) {
      prompt('Copia esta URL:', shareUrl);
    }
  }
}

async function lightboxDelete() {
  if (!state.isTesorero) return;
  const photo = lightboxState.photos[lightboxState.index];
  if (!photo) return;

  if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return;

  try {
    const { error } = await db.from('photos').delete().eq('id', photo.id);
    if (error) throw error;

    // Remover del state local
    lightboxState.photos.splice(lightboxState.index, 1);
    if (lightboxState.photos.length === 0) {
      closeLightbox();
    } else {
      // Ajustar index si se salió del rango
      if (lightboxState.index >= lightboxState.photos.length) {
        lightboxState.index = lightboxState.photos.length - 1;
      }
      renderLightboxPhoto();
    }

    // Invalidar cache y reload
    if (lightboxState.gameId) delete photosCacheByGame[lightboxState.gameId];
    loaded.galeria = false;
    if (state.currentScreen === 'galeria') await loadGaleria();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// Touch/swipe para el lightbox
let lightboxTouchStartX = null;
function lightboxTouchStart(e) { lightboxTouchStartX = e.touches[0].clientX; }
function lightboxTouchEnd(e) {
  if (lightboxTouchStartX === null) return;
  const endX = e.changedTouches[0].clientX;
  const dx = endX - lightboxTouchStartX;
  if (Math.abs(dx) > 50) {
    if (dx < 0) lightboxNext();
    else lightboxPrev();
  }
  lightboxTouchStartX = null;
}

// Listeners del lightbox (se enganchan al inicio)
function initLightbox() {
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', lightboxPrev);
  document.getElementById('lightboxNext').addEventListener('click', lightboxNext);
  document.getElementById('lightboxShare').addEventListener('click', lightboxShare);
  document.getElementById('lightboxDelete').addEventListener('click', lightboxDelete);

  const lbBody = document.querySelector('.lightbox-body');
  lbBody.addEventListener('touchstart', lightboxTouchStart, { passive: true });
  lbBody.addEventListener('touchend', lightboxTouchEnd, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('lightboxOverlay').classList.contains('show')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lightboxPrev();
    else if (e.key === 'ArrowRight') lightboxNext();
  });
}

// ----------------- UPLOAD DE FOTOS -----------------
let photoUploadState = { gameId: null, files: [] };

async function showPhotoUploadForm(gameId) {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>CARGANDO...</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    const { data: g, error } = await db.from('games').select('id, fecha, rival').eq('id', gameId).maybeSingle();
    if (error) throw error;
    if (!g) throw new Error('Juego no encontrado');

    photoUploadState = { gameId, files: [], game: g };
    renderPhotoUploadForm();
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderPhotoUploadForm() {
  const { game, files } = photoUploadState;
  const d = formatDateShort(game.fecha);

  let previewHtml = '';
  if (files.length > 0) {
    previewHtml = `
      <div class="photo-section-head">
        <div class="photo-section-title">📎 ${files.length} foto${files.length !== 1 ? 's' : ''} seleccionada${files.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="upload-preview-grid">
        ${files.map((f, i) => `
          <div class="upload-preview-item" style="background-image: url('${f.previewUrl}');">
            <button class="upload-preview-remove" onclick="removePhotoFromQueue(${i})">×</button>
          </div>
        `).join('')}
      </div>`;
  }

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>AGREGAR FOTOS</h2>
      <button class="modal-close" onclick="closePhotoUploadForm()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; margin-bottom: 14px; color: var(--cream-2);">
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 14px; letter-spacing: 2px; color: var(--gold);">vs ${escapeHtml(game.rival || 'Rival')}</div>
        <div style="font-size: 12px; margin-top: 2px;">${d.day} ${d.month}</div>
      </div>

      <div id="uploadError"></div>

      <div class="upload-zone" onclick="document.getElementById('photoInput').click();">
        <div class="upload-zone-icon">📸</div>
        <div class="upload-zone-title">TOCA PARA SELECCIONAR FOTOS</div>
        <div class="upload-zone-sub">Puedes elegir varias a la vez · JPG, PNG, WEBP, HEIC</div>
      </div>
      <input type="file" id="photoInput" accept="image/*" multiple style="display:none;">

      <div id="previewArea">${previewHtml}</div>

      <div id="uploadProgressArea"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closePhotoUploadForm()">Cancelar</button>
      <button class="btn btn-primary" id="startUploadBtn" onclick="startPhotoUpload()" ${files.length === 0 ? 'disabled' : ''}>
        ${files.length > 0 ? `Subir ${files.length} foto${files.length !== 1 ? 's' : ''}` : 'Selecciona fotos'}
      </button>
    </div>`;

  document.getElementById('photoInput').addEventListener('change', handlePhotoSelection);
}

function handlePhotoSelection(e) {
  const files = Array.from(e.target.files || []);
  const errorDiv = document.getElementById('uploadError');
  errorDiv.innerHTML = '';

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const maxSize = 10 * 1024 * 1024; // 10 MB

  const accepted = [];
  const rejected = [];
  for (const f of files) {
    const isImg = allowed.includes(f.type) || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name);
    if (!isImg) { rejected.push(`${f.name}: formato no soportado`); continue; }
    if (f.size > maxSize) { rejected.push(`${f.name}: pasa los 10 MB`); continue; }
    accepted.push({ file: f, previewUrl: URL.createObjectURL(f), name: f.name });
  }

  if (rejected.length > 0) {
    errorDiv.innerHTML = `<div class="form-error">${rejected.join('<br>')}</div>`;
  }

  photoUploadState.files = [...photoUploadState.files, ...accepted];
  renderPhotoUploadForm();
}

function removePhotoFromQueue(index) {
  const file = photoUploadState.files[index];
  if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
  photoUploadState.files.splice(index, 1);
  renderPhotoUploadForm();
}

function closePhotoUploadForm() {
  // Liberar URLs de preview
  for (const f of photoUploadState.files) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  }
  photoUploadState = { gameId: null, files: [] };
  closeModal();
}

async function startPhotoUpload() {
  const { gameId, files } = photoUploadState;
  if (files.length === 0) return;

  const btn = document.getElementById('startUploadBtn');
  btn.disabled = true;

  const progressArea = document.getElementById('uploadProgressArea');
  const uploadZone = document.querySelector('.upload-zone');
  if (uploadZone) uploadZone.style.display = 'none';

  progressArea.innerHTML = `
    <div class="upload-progress">
      <div class="upload-progress-label" id="uploadLabel">SUBIENDO...</div>
      <div class="upload-progress-bar"><div class="upload-progress-fill" id="uploadFill" style="width: 0%;"></div></div>
      <div class="upload-progress-count" id="uploadCount">0 / ${files.length}</div>
    </div>`;

  let uploaded = 0;
  let errors = [];

  for (let i = 0; i < files.length; i++) {
    document.getElementById('uploadLabel').textContent = `SUBIENDO ${i + 1} DE ${files.length}...`;
    try {
      await uploadSinglePhoto(files[i].file, gameId);
      uploaded++;
    } catch (err) {
      console.error(err);
      errors.push(`${files[i].name}: ${err.message}`);
    }
    const pct = Math.round(((i + 1) / files.length) * 100);
    document.getElementById('uploadFill').style.width = `${pct}%`;
    document.getElementById('uploadCount').textContent = `${i + 1} / ${files.length}`;
  }

  // Limpiar URLs de preview
  for (const f of files) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  }

  if (errors.length > 0) {
    document.getElementById('uploadError').innerHTML = `<div class="form-error">Subidas: ${uploaded} · Fallidas: ${errors.length}<br>${errors.slice(0, 3).join('<br>')}</div>`;
    btn.disabled = false;
    btn.textContent = 'Cerrar';
    btn.onclick = () => closePhotoUploadForm();
  } else {
    // Limpio, cerrar y refrescar
    photoUploadState = { gameId: null, files: [] };
    closeModal();
  }

  // Invalidar caches y refrescar
  delete photosCacheByGame[gameId];
  loaded.galeria = false;
  if (state.currentScreen === 'galeria') await loadGaleria();

  // Si el usuario está viendo el detalle del juego, refrescar
  if (modalBackdrop.classList.contains('show')) {
    setTimeout(() => showGameDetail(gameId), 100);
  }
}

async function uploadSinglePhoto(file, gameId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', window.APP_CONFIG.cloudinaryUploadPreset);
  formData.append('folder', `tazos-dorados/games/${gameId}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${window.APP_CONFIG.cloudinaryCloudName}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();

  // Guardar en Supabase
  const payload = {
    game_id: gameId,
    cloudinary_public_id: data.public_id,
    cloudinary_url: data.secure_url,
    created_by: state.user?.id || null
  };

  const { error } = await db.from('photos').insert(payload);
  if (error) throw error;

  return data;
}

// ============================================================
// PANEL DE ACCESOS (admin de cuentas de jugadores)
// ============================================================
async function showAccessPanel() {
  if (!state.isTesorero) { showLoginModal(); return; }

  openModal(`
    <div class="modal-header">
      <h2>ACCESOS DEL EQUIPO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>`);

  try {
    // Traer jugadores activos + sus cuentas (si tienen)
    const { data: players } = await db.from('players')
      .select('*').eq('activo', true).order('numero');

    const { data: accounts } = await db.from('player_accounts')
      .select('*');

    renderAccessPanel(players || [], accounts || []);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar.', err.message)}</div>`;
  }
}

function renderAccessPanel(players, accounts) {
  // Mapear jugador → cuenta
  const accountByPlayer = {};
  for (const a of accounts) accountByPlayer[a.player_id] = a;

  let conCuentaActiva = 0;
  let conCuentaInactiva = 0;
  let sinCuenta = 0;

  for (const p of players) {
    const acc = accountByPlayer[p.id];
    if (!acc) sinCuenta++;
    else if (acc.activo) conCuentaActiva++;
    else conCuentaInactiva++;
  }

  let playersHtml = '';
  for (const p of players) {
    const acc = accountByPlayer[p.id];
    const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
    const avatarText = p.foto_url ? '' : getInitials(p.nombre);

    let rowClass, statusHtml, actionHtml;
    if (!acc) {
      rowClass = 'none';
      statusHtml = `<span class="badge none">SIN CUENTA</span>`;
      actionHtml = `<button class="access-btn primary" onclick="showCreateAccountForm('${p.id}')">+ Crear</button>`;
    } else if (acc.activo) {
      rowClass = 'active';
      const lastLogin = acc.last_login
        ? new Date(acc.last_login).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
        : 'nunca';
      statusHtml = `
        <span class="badge ok">ACTIVO</span>
        <span>${escapeHtml(acc.email)}</span>
        <span>Entró: ${lastLogin}</span>`;
      actionHtml = `<button class="access-btn danger" onclick="confirmDeactivateAccount('${acc.id}', '${escapeHtml(p.nombre)}')">Dar de baja</button>`;
    } else {
      rowClass = 'pending';
      statusHtml = `
        <span class="badge pending">DESACTIVADA</span>
        <span>${escapeHtml(acc.email)}</span>`;
      actionHtml = `<button class="access-btn" onclick="reactivateAccount('${acc.id}')">Reactivar</button>`;
    }

    playersHtml += `
      <div class="access-row ${rowClass}">
        <div class="access-row-avatar" ${avatarStyle}>${avatarText}</div>
        <div class="access-row-body">
          <div class="access-row-name">${escapeHtml(p.apodo || p.nombre)}<span class="access-row-num">#${p.numero}</span></div>
          <div class="access-row-status">${statusHtml}</div>
        </div>
        <div class="access-row-action">${actionHtml}</div>
      </div>`;
  }

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>ACCESOS DEL EQUIPO</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="access-stats">
        <div class="access-stat-card active">
          <div class="access-stat-value">${conCuentaActiva}</div>
          <div class="access-stat-label">Con acceso</div>
        </div>
        <div class="access-stat-card pending">
          <div class="access-stat-value">${conCuentaInactiva}</div>
          <div class="access-stat-label">Dados de baja</div>
        </div>
        <div class="access-stat-card none">
          <div class="access-stat-value">${sinCuenta}</div>
          <div class="access-stat-label">Sin cuenta</div>
        </div>
      </div>

      <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 10px; text-align: center; line-height: 1.5;">
        Total: ${players.length} jugadores activos<br>
        Toca <strong style="color: var(--gold);">+ CREAR</strong> para generar cuenta y mandar acceso por WhatsApp
      </div>

      ${playersHtml}
    </div>`;
}

// ============================================================
// HELPERS para creación de cuentas
// ============================================================

// Genera email automático tipo "06pepe@tazosdorados.app"
function generateAutoEmail(player) {
  const numero = String(player.numero).padStart(2, '0');
  // Usa apodo si existe, si no primer nombre
  let base = (player.apodo || player.nombre.split(' ')[0] || '').toLowerCase();
  // Remover acentos y caracteres especiales
  base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Solo letras y números
  base = base.replace(/[^a-z0-9]/g, '');
  if (!base) base = 'tazo';
  return `${numero}${base}@tazosdorados.app`;
}

// Genera password aleatorio fácil de leer (sin caracteres confusos)
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const length = 10;
  let password = '';
  const crypto = window.crypto || window.msCrypto;
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    password += chars[randomValues[i] % chars.length];
  }
  return password;
}

// ============================================================
// CREAR CUENTA DE JUGADOR (desde el móvil)
// ============================================================

async function showCreateAccountForm(playerId) {
  const { data: player } = await db.from('players').select('*').eq('id', playerId).maybeSingle();
  if (!player) return;

  const autoEmail = generateAutoEmail(player);
  const autoPassword = generateTempPassword();

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>CREAR CUENTA</h2>
      <button class="modal-close" onclick="showAccessPanel()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 42px;">⚾</div>
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 16px; color: var(--gold); letter-spacing: 2px; margin-top: 8px;">
          ${escapeHtml(player.apodo || player.nombre)} #${player.numero}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
          ${escapeHtml(player.nombre)}
        </div>
      </div>

      <div id="createAccountError"></div>

      <div class="form-group">
        <label class="form-label">Email del jugador</label>
        <input type="email" class="form-input" id="newAccountEmail" value="${autoEmail}" autocapitalize="none" style="font-family: monospace; font-size: 13px;">
        <div class="form-hint">Se genera automático. Si el jugador tiene email real, ponlo aquí.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Password temporal</label>
        <input type="text" class="form-input" id="newAccountPassword" value="${autoPassword}" autocapitalize="none" style="font-family: monospace; font-size: 14px; letter-spacing: 1px;">
        <div class="form-hint">Se genera automático. El jugador podrá cambiarlo.</div>
      </div>

      <div class="notes-box" style="font-style: normal; font-size: 11px; margin-top: 10px;">
        ⚡ Al crear: la cuenta queda lista y podrás mandársela al jugador por WhatsApp en el siguiente paso.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showAccessPanel()">Cancelar</button>
      <button class="btn btn-primary" id="saveAccountBtn" onclick="createPlayerAccount('${playerId}')">Crear cuenta</button>
    </div>`;
}

async function createPlayerAccount(playerId) {
  const email = document.getElementById('newAccountEmail').value.trim();
  const password = document.getElementById('newAccountPassword').value.trim();
  const errorDiv = document.getElementById('createAccountError');
  const saveBtn = document.getElementById('saveAccountBtn');

  if (!email || !password) {
    errorDiv.innerHTML = '<div class="form-error">Completa ambos campos</div>';
    return;
  }

  if (password.length < 6) {
    errorDiv.innerHTML = '<div class="form-error">Password muy corto (mínimo 6 caracteres)</div>';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Creando...';
  errorDiv.innerHTML = '';

  // Guardamos el state del tesorero actual
  const tesoreroSession = await db.auth.getSession();

  try {
    // PASO 1: Crear usuario en Auth
    // Nota: signUp logea automáticamente al nuevo usuario,
    // lo cual nos desloguea a nosotros. Lo revertimos al final.
    const { data: authData, error: authError } = await db.auth.signUp({
      email: email,
      password: password,
      options: {
        // No redirigir tras email confirmation (ya la desactivamos en Supabase)
        emailRedirectTo: undefined
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear el usuario');

    const newUserId = authData.user.id;

    // PASO 2: Re-loguearnos como tesorero (el signUp nos desloggeó)
    if (tesoreroSession.data.session) {
      // Restaurar sesión del tesorero
      await db.auth.setSession({
        access_token: tesoreroSession.data.session.access_token,
        refresh_token: tesoreroSession.data.session.refresh_token
      });
    }

    // PASO 3: Vincular usuario con jugador en player_accounts
    const { error: linkError } = await db.from('player_accounts').insert({
      player_id: playerId,
      user_id: newUserId,
      email: email,
      activo: true
    });

    if (linkError) {
      // Si falla la vinculación, el usuario queda huérfano
      // pero guardamos las credenciales para que el tesorero sepa
      throw new Error(`Usuario creado pero no se vinculó: ${linkError.message}. Email: ${email}`);
    }

    // ÉXITO: mostrar pantalla de credenciales + WhatsApp
    showCredentialsScreen(playerId, email, password);
  } catch (err) {
    let msg = err.message;
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      msg = 'Este email ya está registrado. Prueba con otro.';
    }
    if (msg.includes('Password should be')) {
      msg = 'El password debe tener al menos 6 caracteres.';
    }
    if (msg.includes('invalid email') || msg.includes('Invalid email')) {
      msg = 'El email no es válido. Prueba con otro dominio (ej. @gmail.com).';
    }
    errorDiv.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Crear cuenta';

    // Restaurar sesión del tesorero por si se perdió
    if (tesoreroSession.data.session) {
      await db.auth.setSession({
        access_token: tesoreroSession.data.session.access_token,
        refresh_token: tesoreroSession.data.session.refresh_token
      }).catch(() => {});
    }
  }
}

async function showCredentialsScreen(playerId, email, password) {
  const { data: player } = await db.from('players').select('*').eq('id', playerId).maybeSingle();
  if (!player) return;

  const playerName = player.apodo || player.nombre.split(' ')[0];
  const appUrl = window.location.origin + window.location.pathname;

  // Mensaje WhatsApp pre-escrito (lo guardamos en variable global para evitar problemas de escape)
  const waMessage = `¡Hola ${playerName}! ⚾

Ya tienes acceso a la app de los Tazos Dorados 🟡

🔗 Link: ${appUrl}

📧 Email: ${email}
🔑 Password: ${password}

Cuando entres, cambia el password por uno tuyo.

💡 Instala la app en tu celular:
  • iPhone: toca "Compartir" y "Añadir a inicio"
  • Android: te aparece un banner dorado "Instalar"

¡BIENVENIDO, TAZO! 👑`;

  // Guardamos en variable global temporal — evita todos los problemas de escape
  window._credsCache = { email, password, waMessage, playerName };

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>✅ CUENTA CREADA</h2>
      <button class="modal-close" onclick="showAccessPanel()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; margin-bottom: 18px;">
        <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: var(--gold); letter-spacing: 2px;">
          ¡BIENVENIDO ${escapeHtml(playerName).toUpperCase()}!
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          La cuenta quedó lista. Comparte estas credenciales:
        </div>
      </div>

      <div style="background: var(--navy-2); border: 1px solid var(--gold-deep); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 10px; letter-spacing: 1.5px; color: var(--gold); margin-bottom: 6px;">📧 EMAIL</div>
        <div style="font-family: monospace; font-size: 13px; color: var(--cream); word-break: break-all; margin-bottom: 12px;">${escapeHtml(email)}</div>
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 10px; letter-spacing: 1.5px; color: var(--gold); margin-bottom: 6px;">🔑 PASSWORD TEMPORAL</div>
        <div style="font-family: monospace; font-size: 15px; color: var(--cream); font-weight: 700; letter-spacing: 1px;">${escapeHtml(password)}</div>
      </div>

      <button class="btn btn-primary" style="width: 100%; margin-bottom: 8px; background: #25D366; color: white; border-color: #25D366; font-size: 14px; padding: 14px;" onclick="shareViaWhatsApp()">
        📲 ENVIAR POR WHATSAPP
      </button>

      <button class="btn btn-secondary" style="width: 100%; margin-bottom: 8px;" onclick="copyCredentials()">
        📋 Copiar email y password
      </button>

      <button class="btn btn-secondary" style="width: 100%; margin-bottom: 14px;" onclick="copyFullMessage()">
        📝 Copiar mensaje completo
      </button>

      <div class="notes-box" style="font-style: normal; font-size: 11px;">
        💡 <strong>Importante:</strong> Guarda estas credenciales. No podrás ver el password otra vez por seguridad. Si se pierde, le creas cuenta nueva al jugador.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" style="width: 100%;" onclick="showAccessPanel()">Volver al panel</button>
    </div>`;
}

function shareViaWhatsApp() {
  if (!window._credsCache) return;
  const encoded = encodeURIComponent(window._credsCache.waMessage);
  const waUrl = `https://wa.me/?text=${encoded}`;
  window.open(waUrl, '_blank');
}

async function copyCredentials() {
  if (!window._credsCache) return;
  const { email, password } = window._credsCache;
  const text = `Email: ${email}\nPassword: ${password}`;
  try {
    await navigator.clipboard.writeText(text);
    // Feedback visual: cambiar texto del botón 1.5 seg
    const btns = document.querySelectorAll('.btn-secondary');
    for (const btn of btns) {
      if (btn.textContent.includes('Copiar email')) {
        const original = btn.innerHTML;
        btn.innerHTML = '✅ COPIADO';
        btn.style.background = 'rgba(107, 169, 107, 0.15)';
        btn.style.color = 'var(--green)';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
        break;
      }
    }
  } catch (err) {
    alert('Credenciales:\n\n' + text);
  }
}

async function copyFullMessage() {
  if (!window._credsCache) return;
  const { waMessage } = window._credsCache;
  try {
    await navigator.clipboard.writeText(waMessage);
    const btns = document.querySelectorAll('.btn-secondary');
    for (const btn of btns) {
      if (btn.textContent.includes('Copiar mensaje')) {
        const original = btn.innerHTML;
        btn.innerHTML = '✅ COPIADO';
        btn.style.background = 'rgba(107, 169, 107, 0.15)';
        btn.style.color = 'var(--green)';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
        break;
      }
    }
  } catch (err) {
    alert(waMessage);
  }
}

function confirmDeactivateAccount(accountId, playerName) {
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>DAR DE BAJA</h2>
      <button class="modal-close" onclick="showAccessPanel()">×</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">🚫</div>
        <p style="color: var(--cream-2); line-height: 1.6;">
          <strong style="color: var(--gold);">${escapeHtml(playerName)}</strong> ya no podrá entrar a la app.
          <br><br>
          Sus datos históricos (asistencia, cobros, fotos) se mantienen intactos.
          <br><br>
          ¿Confirmas?
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showAccessPanel()">Cancelar</button>
      <button class="btn btn-danger" onclick="deactivateAccount('${accountId}')">Dar de baja</button>
    </div>`;
}

async function deactivateAccount(accountId) {
  try {
    const { error } = await db.from('player_accounts').update({ activo: false }).eq('id', accountId);
    if (error) throw error;
    showAccessPanel();
  } catch (err) { alert('Error: ' + err.message); }
}

async function reactivateAccount(accountId) {
  try {
    const { error } = await db.from('player_accounts').update({ activo: true }).eq('id', accountId);
    if (error) throw error;
    showAccessPanel();
  } catch (err) { alert('Error: ' + err.message); }
}

// ============================================================
// PWA: Service Worker + Install Banner + Update detection
// ============================================================
let deferredInstallPrompt = null;

function initPWA() {
  // Desactivar pinch-to-zoom en iOS (Safari ignora maximum-scale del meta viewport)
  // Estos listeners bloquean el gesto nativo de zoom pero dejan todo lo demás funcionar
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // Doble-tap zoom en iOS (evento específico)
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // 1. Registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Detectar nuevas versiones
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          // Si ya había un SW previo y el nuevo terminó de instalarse → hay update
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });

      // Revisar si hay update disponible cada 60 segundos mientras la app está abierta
      setInterval(() => reg.update().catch(() => {}), 60000);
    }).catch((err) => {
      console.warn('SW registro falló:', err);
    });

    // Cuando el SW nuevo toma control, recargar para aplicar cambios
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  // 2. Banner de instalación — escuchar beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Mostrar solo si el usuario no ha descartado antes y no está ya instalada
    if (localStorage.getItem('installBannerDismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    setTimeout(() => {
      const banner = document.getElementById('installBanner');
      if (banner) banner.classList.add('show');
    }, 2000);
  });

  // 3. Listeners del banner
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installBannerBtn');
  const closeBtn = document.getElementById('installBannerClose');

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      installBanner.classList.remove('show');
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('installBannerDismissed', '1');
      }
      deferredInstallPrompt = null;
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      installBanner.classList.remove('show');
      localStorage.setItem('installBannerDismissed', '1');
    });
  }

  // 4. Banner "instalado correctamente"
  window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.classList.remove('show');
    localStorage.setItem('installBannerDismissed', '1');
  });

  // 5. Safari iOS: no soporta beforeinstallprompt. Mostramos hint solo si no es standalone.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        window.navigator.standalone === true;
  if (isIOS && !isStandalone && !localStorage.getItem('installBannerDismissed')) {
    // Safari no expone prompt, pero podemos decirle al usuario cómo hacerlo
    setTimeout(() => showIOSInstallHint(), 3000);
  }

  // 6. Shortcut via URL (?s=tesoreria etc, para atajos del manifest)
  const urlParams = new URLSearchParams(window.location.search);
  const shortcut = urlParams.get('s');
  if (shortcut && ['home','tesoreria','roster','calendario','galeria'].includes(shortcut)) {
    setTimeout(() => showScreen(shortcut), 100);
  }
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('updateBanner');
  const btn = document.getElementById('updateBannerBtn');
  if (!banner) return;
  banner.classList.add('show');
  btn.onclick = () => {
    // Le decimos al SW que se active YA y luego recargamos
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    }
    banner.classList.remove('show');
  };
}

function showIOSInstallHint() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.innerHTML = `
    <div class="install-banner-icon">📲</div>
    <div class="install-banner-body">
      <div class="install-banner-title">Instala los Tazos</div>
      <div class="install-banner-sub">Toca <strong>Compartir ↗</strong> y luego <strong>"Añadir a inicio"</strong></div>
    </div>
    <button class="install-banner-close" id="installBannerCloseIOS">×</button>
  `;
  banner.classList.add('show');
  document.getElementById('installBannerCloseIOS').addEventListener('click', () => {
    banner.classList.remove('show');
    localStorage.setItem('installBannerDismissed', '1');
  });
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
  galeria: loadGaleria
};

const loaded = { home: false, tesoreria: false, roster: false, calendario: false, galeria: false };

const PUBLIC_SCREENS = ['home'];

function showScreen(target) {
  // Si es invitado y trata de entrar a pantalla privada → mostrar login
  if (!state.isTesorero && !state.isPlayer && !PUBLIC_SCREENS.includes(target)) {
    showLoginModal();
    return;
  }

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

// Fix para Android Honor/MagicOS: usar pointerdown como fallback
// y click normal. Ambos llaman a showScreen para máxima compatibilidad.
let lastNavTap = 0;
navItems.forEach(btn => {
  const handler = (e) => {
    // Debounce para evitar double-fire de pointerdown + click
    const now = Date.now();
    if (now - lastNavTap < 300) return;
    lastNavTap = now;
    e.preventDefault();
    e.stopPropagation();
    showScreen(btn.dataset.screen);
  };
  btn.addEventListener('click', handler, { passive: false });
  // Pointerdown como fallback para dispositivos con touch event quirks
  btn.addEventListener('pointerdown', handler, { passive: false });
});

// FAB: diferentes acciones según la pantalla
let lastFabTap = 0;
const fabHandler = (e) => {
  const now = Date.now();
  if (now - lastFabTap < 300) return;
  lastFabTap = now;
  e.preventDefault();
  e.stopPropagation();
  if (state.currentScreen === 'roster') showPlayerForm();
  else if (state.currentScreen === 'calendario') showGameForm();
  else if (state.currentScreen === 'tesoreria') showFabPicker();
};
document.getElementById('fabAdd').addEventListener('click', fabHandler, { passive: false });
document.getElementById('fabAdd').addEventListener('pointerdown', fabHandler, { passive: false });

// Exponer funciones globales (para onclick)
window.showPlayerDetail = showPlayerDetail;
window.showPlayerForm = showPlayerForm;
window.togglePlayerAccountFields = togglePlayerAccountFields;
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
window.showAttendance = showAttendance;
window.renderAttendanceScreen = renderAttendanceScreen;
window.setAttendanceEstado = setAttendanceEstado;
window.showPaymentModal = showPaymentModal;
window.closePaymentModal = closePaymentModal;
window.setPayment = setPayment;
window.applyPartialPayment = applyPartialPayment;
window.bulkAttendanceAction = bulkAttendanceAction;
window.saveAttendance = saveAttendance;
window.confirmCloseAttendance = confirmCloseAttendance;
window.showContribucionForm = showContribucionForm;
window.confirmDeleteContribucion = confirmDeleteContribucion;
window.deleteContribucion = deleteContribucion;
window.showFabPicker = showFabPicker;
window.showExpenseList = showExpenseList;
window.filterExpenseList = filterExpenseList;
window.showExpenseDetail = showExpenseDetail;
window.showExpenseForm = showExpenseForm;
window.quickAddAmpayeo = quickAddAmpayeo;
window.saveAmpayeo = saveAmpayeo;
window.confirmDeleteExpense = confirmDeleteExpense;
window.deleteExpense = deleteExpense;
window.showPhotoUploadForm = showPhotoUploadForm;
window.closePhotoUploadForm = closePhotoUploadForm;
window.removePhotoFromQueue = removePhotoFromQueue;
window.startPhotoUpload = startPhotoUpload;
window.openGameLightbox = openGameLightbox;
window.showAccessPanel = showAccessPanel;
window.showCreateAccountForm = showCreateAccountForm;
window.createPlayerAccount = createPlayerAccount;
window.showCredentialsScreen = showCredentialsScreen;
window.shareViaWhatsApp = shareViaWhatsApp;
window.copyCredentials = copyCredentials;
window.copyFullMessage = copyFullMessage;
window.confirmDeactivateAccount = confirmDeactivateAccount;
window.deactivateAccount = deactivateAccount;
window.reactivateAccount = reactivateAccount;
window.showLoginModal = showLoginModal;

// INICIO
(async () => {
  initLightbox();
  initPWA();
  await checkAuthStatus();
  document.body.classList.add('screen-home');
  loadHome();
  loaded.home = true;
})();
