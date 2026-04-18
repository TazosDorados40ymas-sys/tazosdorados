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

const state = { user: null, isTesorero: false, currentScreen: 'home' };

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

    // Últimos movimientos — mezcla gastos (egresos) + contribuciones (ingresos)
    const movements = [
      ...recentExpenses.map(e => ({
        tipo: 'egreso',
        fecha: e.fecha,
        titulo: e.descripcion || e.categoria,
        sub: e.categoria,
        monto: Number(e.monto)
      })),
      ...recentContribs.map(c => ({
        tipo: 'ingreso',
        fecha: c.fecha,
        titulo: c.donante_display,
        sub: c.concepto || (c.origen === 'jugador' ? 'Aportación voluntaria' : c.origen === 'patrocinador' ? 'Patrocinio' : 'Donación'),
        monto: Number(c.monto),
        origen: c.origen,
        anonimo: c.anonimo
      }))
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5);

    if (movements.length > 0) {
      html += `<div class="section-title">Últimos movimientos</div><div class="list-card">`;
      for (const m of movements) {
        const fecha = new Date(m.fecha + 'T12:00:00');
        const fechaTxt = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const isIngreso = m.tipo === 'ingreso';
        const iconClass = isIngreso ? 'in' : 'out';
        const arrow = isIngreso ? '↓' : '↑';
        const valueClass = isIngreso ? 'pos' : 'neg';
        const valueSign = isIngreso ? '+' : '−';
        html += `
          <div class="list-row">
            <div class="list-row-icon ${iconClass}">${arrow}</div>
            <div class="list-row-body">
              <div class="list-row-title">${escapeHtml(m.titulo)}</div>
              <div class="list-row-sub">${fechaTxt} · ${escapeHtml(m.sub)}</div>
            </div>
            <div class="list-row-value ${valueClass}">${valueSign}${formatMoney(m.monto)}</div>
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
    const [balanceRes, catRes, playerStatusRes, contribRes] = await Promise.all([
      db.from('v_team_balance').select('*').maybeSingle(),
      db.from('v_expenses_by_category').select('*'),
      db.from('v_player_status').select('*').eq('activo', true).order('numero'),
      db.from('v_contribuciones_publicas').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(8)
    ]);

    const balance = balanceRes.data || { balance: 0, total_ingresos: 0, total_egresos: 0, ingresos_cuotas: 0, ingresos_extra: 0 };
    const categories = catRes.data || [];
    const playerStatus = playerStatusRes.data || [];
    const contribuciones = contribRes.data || [];
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
        html += `
          <div class="contrib-row">
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
    } else if (state.isTesorero) {
      html += `
        <div class="empty-state" style="padding: 24px;">
          <div class="emoji" style="font-size: 36px;">💝</div>
          <p style="font-size: 13px;">Todavía no hay ingresos extra.</p>
          <div class="chk">Toca el botón dorado para registrar una aportación voluntaria o un patrocinador</div>
        </div>`;
    }

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
    const [gameRes, attRes] = await Promise.all([
      db.from('games').select('*').eq('id', gameId).maybeSingle(),
      db.from('attendance').select('estado, aportacion, pagado').eq('game_id', gameId)
    ]);
    if (gameRes.error) throw gameRes.error;
    if (!gameRes.data) throw new Error('Juego no encontrado');
    renderGameDetail(gameRes.data, attRes.data || []);
  } catch (err) {
    modalContent.innerHTML = `
      <div class="modal-header"><h2>ERROR</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${errorBox('No se pudo cargar el juego.', err.message)}</div>`;
  }
}

function renderGameDetail(g, attendanceRecords) {
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
      const cobrado = attendanceRecords.filter(a => a.pagado).reduce((s, a) => s + Number(a.aportacion || 0), 0);
      const porCobrar = totalAport - cobrado;

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

    // Inicializar estado
    attendanceState = {};
    for (const p of allPlayers) {
      const existing = existingAtt.find(a => a.player_id === p.id);
      attendanceState[p.id] = existing
        ? { estado: existing.estado, pagado: !!existing.pagado }
        : { estado: 'pendiente', pagado: false };
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
  const st = attendanceState[p.id] || { estado: 'pendiente', pagado: false };
  const avatarStyle = p.foto_url ? `style="background-image: url('${escapeHtml(p.foto_url)}');"` : '';
  const avatarText = p.foto_url ? '' : getInitials(p.nombre);
  const aportacion = getAportacion(st.estado);

  const jugoActive = st.estado === 'jugo' ? 'active-jugo' : '';
  const avisoActive = st.estado === 'no_asistio' ? 'active-aviso' : '';
  const pendActive = st.estado === 'pendiente' ? 'active-pend' : '';

  const showPay = st.estado !== 'pendiente';
  const paidClass = st.pagado ? 'paid' : '';

  const amountText = aportacion > 0
    ? `Aporta: <strong>${formatMoney(aportacion)}</strong>`
    : '<span style="opacity: 0.6;">Sin aportación aún</span>';

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
            <button class="att-pay-toggle ${paidClass}" onclick="togglePagado('${p.id}')">
              ${st.pagado ? '💰 PAGÓ' : '⏳ DEBE'}
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
    attendanceState[playerId] = { estado, pagado: false };
  } else {
    attendanceState[playerId].estado = estado;
    // Si pasa a pendiente, resetear pagado
    if (estado === 'pendiente') attendanceState[playerId].pagado = false;
  }
  attendanceDirty = true;

  // Re-render solo esa fila
  const p = attendancePlayersCache.find(pl => pl.id === playerId);
  if (p) {
    const row = document.getElementById(`attRow-${playerId}`);
    if (row) row.outerHTML = renderAttendancePlayerRow(p);
  }
  updateAttendanceStats();
}

function togglePagado(playerId) {
  const st = attendanceState[playerId];
  if (!st || st.estado === 'pendiente') return;

  st.pagado = !st.pagado;
  attendanceDirty = true;

  const p = attendancePlayersCache.find(pl => pl.id === playerId);
  if (p) {
    const row = document.getElementById(`attRow-${playerId}`);
    if (row) row.outerHTML = renderAttendancePlayerRow(p);
  }
  updateAttendanceStats();
}

function updateAttendanceStats() {
  const states = Object.values(attendanceState);
  const jugaron = states.filter(s => s.estado === 'jugo').length;
  const avisaron = states.filter(s => s.estado === 'no_asistio').length;
  const pendientes = states.filter(s => s.estado === 'pendiente').length;

  const total = states.reduce((sum, s) => sum + getAportacion(s.estado), 0);
  const cobrado = states.filter(s => s.pagado).reduce((sum, s) => sum + getAportacion(s.estado), 0);
  const porCobrar = total - cobrado;

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
    if (!attendanceState[p.id]) attendanceState[p.id] = { estado: 'pendiente', pagado: false };
    if (action === 'jugaron') {
      attendanceState[p.id].estado = 'jugo';
    } else if (action === 'avisaron') {
      attendanceState[p.id].estado = 'no_asistio';
    } else if (action === 'limpiar') {
      attendanceState[p.id].estado = 'pendiente';
      attendanceState[p.id].pagado = false;
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
    const rows = Object.entries(attendanceState).map(([playerId, s]) => ({
      game_id: gameId,
      player_id: playerId,
      estado: s.estado,
      aportacion: getAportacion(s.estado),
      pagado: s.pagado
    }));

    const { error } = await db.from('attendance').upsert(rows, { onConflict: 'game_id,player_id' });
    if (error) throw error;

    attendanceDirty = false;
    closeModal();

    // Refrescar pantallas que muestran datos de aportaciones
    loaded.home = false;
    loaded.tesoreria = false;
    if (state.currentScreen === 'tesoreria') await loadTesoreria();
    else if (state.currentScreen === 'home') await loadHome();

    // Volver al detalle del juego para ver el resumen actualizado
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
  else if (state.currentScreen === 'tesoreria') showContribucionForm();
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
window.showAttendance = showAttendance;
window.renderAttendanceScreen = renderAttendanceScreen;
window.setAttendanceEstado = setAttendanceEstado;
window.togglePagado = togglePagado;
window.bulkAttendanceAction = bulkAttendanceAction;
window.saveAttendance = saveAttendance;
window.confirmCloseAttendance = confirmCloseAttendance;
window.showContribucionForm = showContribucionForm;
window.confirmDeleteContribucion = confirmDeleteContribucion;
window.deleteContribucion = deleteContribucion;

// INICIO
(async () => {
  await checkAuthStatus();
  document.body.classList.add('screen-home');
  loadHome();
  loaded.home = true;
})();
