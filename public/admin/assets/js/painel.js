/* painel.js — PharmaFit Admin Panel */

// ── STATE ─────────────────────────────────────────────────────────────────────
window.App = {
  admin:         null,
  pedidos:       [],
  clientes:      [],
  produtos:      [],
  stats:         {},
  admins:        [],
  cupons:        [],
  relatorio:     null,
  kanbanPeriod:  'all',
  charts:        {},
  view:          'kanban',
  drawerOrderId: null,
  batchSelected: new Set(),
};

// ── STAGES ────────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'Novo',            label: '🆕 Novo',      color: '#6b7280' },
  { key: 'Pag. Confirmado', label: '💰 Pagamento', color: '#f59e0b' },
  { key: 'Em Separação',    label: '📋 Separação', color: '#3b82f6' },
  { key: 'Embalado',        label: '📦 Embalado',  color: '#8b5cf6' },
  { key: 'Etiqueta Gerada', label: '🏷️ Etiqueta',  color: '#6366f1' },
  { key: 'Enviado',         label: '🚚 Enviado',   color: '#06b6d4' },
  { key: 'Entregue',        label: '✅ Entregue',  color: '#10b981' },
];

const NEXT_STATUS = {
  'Novo':            'Pag. Confirmado',
  'Pag. Confirmado': 'Em Separação',
  'Em Separação':    'Embalado',
  'Embalado':        'Etiqueta Gerada',
  'Etiqueta Gerada': 'Enviado',
  'Enviado':         'Entregue',
};

const PREV_STATUS = {
  'Pag. Confirmado': 'Novo',
  'Em Separação':    'Pag. Confirmado',
  'Embalado':        'Em Separação',
  'Etiqueta Gerada': 'Embalado',
  'Enviado':         'Etiqueta Gerada',
  'Entregue':        'Enviado',
};

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const saved = sessionStorage.getItem('pharmafit_admin');
  if (!saved) return (window.location.href = 'index.html');
  App.admin = JSON.parse(saved);
  document.getElementById('admin-nome').textContent = App.admin.nome;

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => setView(btn.dataset.view))
  );

  showLoading(true);
  await loadAll();
  showLoading(false);
  setView('kanban');

  setInterval(async () => {
    await loadPedidos();
    if (App.view === 'kanban') renderKanban();
  }, 180_000);
});

function showLoading(on) {
  document.getElementById('global-loading').classList.toggle('hidden', !on);
}

async function loadAll() {
  await Promise.all([loadPedidos(), loadClientes(), loadProdutos(), loadStats()]);
}

async function loadCupons() {
  try {
    const data = await API.listarCupons();
    if (data.ok) App.cupons = data.cupons;
  } catch(e) {}
}

async function loadRelatorio() {
  try {
    const data = await API.relatorio();
    if (data.ok) App.relatorio = data.dados;
  } catch(e) {}
}

async function loadPedidos() {
  try {
    const data = await API.pedidos();
    if (data.ok) App.pedidos = data.pedidos;
  } catch (e) { console.error('loadPedidos', e); }
}

async function loadClientes() {
  try {
    const data = await API.clientes();
    if (Array.isArray(data)) App.clientes = data;
  } catch (e) {}
}

async function loadProdutos() {
  try {
    const data = await API.produtos();
    if (Array.isArray(data)) App.produtos = data;
  } catch (e) {}
}

async function loadStats() {
  try {
    const data = await API.estatisticas();
    if (data.ok) App.stats = data.stats;
  } catch (e) {}
}

async function loadAdmins() {
  try {
    const data = await API.call({ action: 'listar_admins' });
    if (data.ok) App.admins = data.admins;
  } catch (e) {}
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function setView(view) {
  App.view = view;
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view)
  );
  document.querySelectorAll('.view').forEach(el =>
    el.classList.toggle('hidden', el.id !== `view-${view}`)
  );
  renderCurrentView();
}

function renderCurrentView() {
  if (App.view === 'kanban')   renderKanban();
  if (App.view === 'clientes') renderClientes();
  if (App.view === 'produtos') renderProdutos();
  if (App.view === 'cupons')   { loadCupons().then(renderCupons); }
  if (App.view === 'relatorio') { loadRelatorio().then(renderRelatorio); }
  if (App.view === 'config')   { loadAdmins().then(renderConfig); }
}

// ── STATS BAR ─────────────────────────────────────────────────────────────────
function renderStats() {
  const s  = App.stats;
  const el = document.getElementById('stats-bar');
  if (!el) return;
  const pendentes = App.pedidos.filter(p =>
    ['Novo','Pag. Confirmado','Em Separação','Embalado','Etiqueta Gerada'].includes(p.status)
  ).length;
  const stuckCount = App.pedidos.filter(p => isStuck(p)).length;
  el.innerHTML = `
    <div class="stat-card"><span class="stat-val">${s.novos_hoje || 0}</span><span class="stat-lbl">Novos Hoje</span></div>
    <div class="stat-card"><span class="stat-val">${pendentes}</span><span class="stat-lbl">Pendentes</span></div>
    <div class="stat-card"><span class="stat-val">${s.enviados || 0}</span><span class="stat-lbl">Enviados</span></div>
    <div class="stat-card"><span class="stat-val">${formatMoeda(s.faturamento_mes || 0)}</span><span class="stat-lbl">Faturamento Mês</span></div>
    ${stuckCount > 0 ? `<div class="stat-card stat-alert"><span class="stat-val">${stuckCount}</span><span class="stat-lbl">⚠️ Parados +24h</span></div>` : ''}
  `;
}

// ── STUCK DETECTION ───────────────────────────────────────────────────────────
function isStuck(order) {
  if (['Entregue', 'Cancelado', 'Enviado'].includes(order.status)) return false;
  const dateStr = order.dataStatus || order.data;
  if (!dateStr) return false;
  const m = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  const d = m ? new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]) : new Date(dateStr);
  if (isNaN(d)) return false;
  return (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;
}

// ── KANBAN ────────────────────────────────────────────────────────────────────
function setKanbanPeriod(btn) {
  App.kanbanPeriod = btn.dataset.period;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderKanban();
}

function renderKanban() {
  renderStats();
  const q   = (document.getElementById('kanban-search')?.value || '').toLowerCase().trim();
  const pag = (document.getElementById('filter-pagamento')?.value || '').toLowerCase();
  const now = Date.now();
  const periodMs = { today: 86400000, week: 604800000, month: 2592000000 };

  const allPedidos = App.pedidos.filter(p => {
    if (q && !(
      (p.clinica  || '').toLowerCase().includes(q) ||
      (p.produtos || '').toLowerCase().includes(q) ||
      (p.telefone || '').includes(q) ||
      (p.data     || '').includes(q))) return false;
    if (pag && !(p.pagamento || '').toLowerCase().includes(pag)) return false;
    if (App.kanbanPeriod !== 'all') {
      const m = String(p.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      const d = m ? new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]) : new Date(p.data);
      if (isNaN(d) || (now - d.getTime()) > periodMs[App.kanbanPeriod]) return false;
    }
    return true;
  });

  const devPedidos  = allPedidos.filter(p => isDevOrder(p));
  const realPedidos = allPedidos.filter(p => !isDevOrder(p));
  const cancelados  = realPedidos.filter(p => p.status === 'Cancelado');
  const board       = document.getElementById('kanban-board');
  const devZone     = document.getElementById('kanban-dev-zone');

  board.innerHTML = STAGES.map(stage => {
    const orders = realPedidos.filter(p => p.status === stage.key);
    const total  = orders.reduce((s, o) => s + (parseFloat(String(o.total||'').replace(',','.')) || 0), 0);
    return `
      <div class="kanban-col">
        <div class="col-header" style="--col-color:${stage.color}">
          <span>${stage.label}</span>
          <div class="col-header-right">
            <span class="col-total">${formatMoeda(total)}</span>
            <span class="col-badge">${orders.length}</span>
          </div>
        </div>
        <div class="col-body"
          ondragover="event.preventDefault();event.currentTarget.classList.add('drag-over')"
          ondragleave="event.currentTarget.classList.remove('drag-over')"
          ondrop="onDrop(event,'${stage.key}')">
          ${orders.length === 0
            ? `<div class="col-empty">—</div>`
            : orders.map(renderCard).join('')}
        </div>
      </div>`;
  }).join('');

  if (cancelados.length > 0) {
    board.innerHTML += `
      <div class="kanban-col">
        <div class="col-header" style="--col-color:#ef4444">
          <span>❌ Cancelado</span>
          <span class="col-badge">${cancelados.length}</span>
        </div>
        <div class="col-body">${cancelados.map(renderCard).join('')}</div>
      </div>`;
  }

  if (devZone) {
    if (devPedidos.length === 0) { devZone.innerHTML = ''; return; }
    const existingBody = devZone.querySelector('.kanban-dev-body');
    const open = existingBody ? existingBody.style.display !== 'none' : false;
    devZone.innerHTML = `
      <div class="kanban-dev-section">
        <div class="kanban-dev-header" onclick="toggleDevZone(this)">
          <span>🔧 DEV / Testes</span>
          <span class="kanban-dev-count">${devPedidos.length} pedido${devPedidos.length > 1 ? 's' : ''}</span>
          <span class="kanban-dev-chevron">${open ? '▲' : '▼'}</span>
        </div>
        <div class="kanban-dev-body" style="display:${open ? 'flex' : 'none'}">
          ${devPedidos.map(renderCard).join('')}
        </div>
      </div>`;
  }
}

function toggleDevZone(header) {
  const body    = header.nextElementSibling;
  const chevron = header.querySelector('.kanban-dev-chevron');
  const open    = body.style.display !== 'none';
  body.style.display    = open ? 'none' : 'flex';
  chevron.textContent   = open ? '▼' : '▲';
}

function renderCard(order) {
  const stuck   = isStuck(order);
  const isDev   = isDevOrder(order);
  const prods   = (order.produtos || '').split('\n').filter(Boolean);
  const preview = prods[0] ? prods[0].replace(/^\d+x\s*/, '') : '—';
  const extras  = prods.length > 1
    ? `<div class="card-extras">+ ${prods.length - 1} item${prods.length > 2 ? 's' : ''}</div>` : '';
  const next  = NEXT_STATUS[order.status];
  const prev  = PREV_STATUS[order.status];
  const tempo = timeAgo(order.dataStatus || order.data);
  const nextLabel = next
    ? next.replace('Pag. Confirmado','Confirmar Pag.').replace('Etiqueta Gerada','Gerar Etiqueta')
    : '';

  return `
    <div class="kanban-card${stuck ? ' card-stuck' : ''}${isDev ? ' card-dev' : ''}"
      draggable="true"
      ondragstart="onDragStart(event,${order.id})"
      onclick="openDrawer(${order.id})">
      <div class="card-top-row">
        <input type="checkbox" class="card-check"
          onclick="event.stopPropagation();toggleCardSelect(${order.id},this)"
          ${App.batchSelected.has(order.id) ? 'checked' : ''}/>
        ${isDev ? '<div class="dev-badge">🔧 DEV</div>' : stuck ? '<div class="stuck-badge">⚠️ +24h</div>' : ''}
      </div>
      <div class="card-clinica">${esc(order.clinica)}</div>
      <div class="card-prod">${esc(preview)}</div>
      ${extras}
      <div class="card-total">${formatMoeda(order.total)}</div>
      <div class="card-footer">
        <span class="card-pag">${esc(order.pagamento || '')}</span>
        <span class="card-tempo${stuck ? ' tempo-alert' : ''}">${tempo}</span>
      </div>
      <div class="card-actions">
        <button class="card-btn" onclick="event.stopPropagation();openDrawer(${order.id})">Detalhes</button>
        ${prev
          ? `<button class="card-btn card-btn-prev"
               onclick="event.stopPropagation();revertStatus(${order.id})">← Voltar</button>`
          : ''}
        ${next
          ? `<button class="card-btn card-btn-advance"
               onclick="event.stopPropagation();advanceStatus(${order.id},'${next}')">→ ${esc(nextLabel)}</button>`
          : ''}
      </div>
    </div>`;
}

// ── STATUS ACTIONS ────────────────────────────────────────────────────────────
async function advanceStatus(orderId, nextStatus) {
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;

  let extra = {};
  if (nextStatus === 'Embalado') {
    const peso = prompt('Peso do pacote (kg):', order.peso || '');
    if (peso === null) return;
    const dim  = prompt('Dimensões L×A×P (cm):', order.dimensoes || '');
    if (dim === null) return;
    extra = { peso, dimensoes: dim };
  }

  // Optimistic update — UI reage imediatamente
  const snapshot = { status: order.status, dataStatus: order.dataStatus, peso: order.peso, dimensoes: order.dimensoes };
  const nowStr = nowBR_();
  order.status = nextStatus;
  order.dataStatus = nowStr;
  if (extra.peso) order.peso = extra.peso;
  if (extra.dimensoes) order.dimensoes = extra.dimensoes;
  renderKanban();
  if (App.drawerOrderId === orderId) renderDrawer(order);
  showToast(`→ ${nextStatus}`);

  try {
    await API.atualizarStatus(orderId, nextStatus, extra);
    loadPedidos().then(() => {
      if (App.view === 'kanban') renderKanban();
      if (App.drawerOrderId === orderId) {
        const upd = App.pedidos.find(p => p.id === orderId);
        if (upd) renderDrawer(upd);
      }
    });
  } catch (e) {
    Object.assign(order, snapshot);
    renderKanban();
    if (App.drawerOrderId === orderId) renderDrawer(order);
    showToast('Erro ao atualizar status', 'error');
  }
}

// ── DRAG AND DROP ─────────────────────────────────────────────────────────────
function onDragStart(event, orderId) {
  event.dataTransfer.setData('orderId', String(orderId));
  event.dataTransfer.effectAllowed = 'move';
}

async function onDrop(event, stageKey) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const orderId = parseInt(event.dataTransfer.getData('orderId'));
  if (!orderId) return;
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order || order.status === stageKey) return;
  await advanceStatus(orderId, stageKey);
}

// ── REVERT STATUS ─────────────────────────────────────────────────────────────
async function revertStatus(orderId) {
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;
  const prevSt = PREV_STATUS[order.status];
  if (!prevSt) return showToast('Não é possível voltar deste status', 'error');
  if (!confirm(`Voltar status para "${prevSt}"?`)) return;

  const snapshot = { status: order.status, dataStatus: order.dataStatus };
  order.status = prevSt;
  order.dataStatus = nowBR_();
  renderKanban();
  if (App.drawerOrderId === orderId) renderDrawer(order);
  showToast(`← ${prevSt}`);

  try {
    await API.atualizarStatus(orderId, prevSt);
    loadPedidos().then(() => {
      if (App.view === 'kanban') renderKanban();
      if (App.drawerOrderId === orderId) {
        const upd = App.pedidos.find(p => p.id === orderId);
        if (upd) renderDrawer(upd);
      }
    });
  } catch(e) {
    Object.assign(order, snapshot);
    renderKanban();
    if (App.drawerOrderId === orderId) renderDrawer(order);
    showToast('Erro ao voltar status', 'error');
  }
}

// ── BATCH ACTIONS ─────────────────────────────────────────────────────────────
function toggleCardSelect(orderId, el) {
  if (el.checked) App.batchSelected.add(orderId);
  else App.batchSelected.delete(orderId);
  updateBatchToolbar();
}

function updateBatchToolbar() {
  let bar = document.getElementById('batch-toolbar');
  if (App.batchSelected.size === 0) {
    if (bar) bar.classList.remove('visible');
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'batch-toolbar';
    bar.className = 'batch-toolbar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <span class="batch-count">${App.batchSelected.size} selecionado(s)</span>
    <select id="batch-status" class="batch-select">
      ${STAGES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
      <option value="Cancelado">❌ Cancelado</option>
    </select>
    <button class="btn-sm btn-accent" onclick="batchUpdateStatus()">Aplicar</button>
    <button class="btn-sm" onclick="clearBatchSelection()">✕ Cancelar</button>`;
  bar.classList.add('visible');
}

function clearBatchSelection() {
  App.batchSelected.clear();
  document.querySelectorAll('.card-check').forEach(cb => cb.checked = false);
  updateBatchToolbar();
}

async function batchUpdateStatus() {
  const status = document.getElementById('batch-status')?.value;
  if (!status || App.batchSelected.size === 0) return;
  const count = App.batchSelected.size;
  if (!confirm(`Aplicar "${status}" em ${count} pedido(s)?`)) return;
  const ids = [...App.batchSelected];
  let errors = 0;
  for (const id of ids) {
    try { await API.atualizarStatus(id, status); }
    catch(e) { errors++; }
  }
  clearBatchSelection();
  await loadPedidos();
  renderKanban();
  showToast(errors > 0 ? `${count - errors} atualizados, ${errors} erros` : `${count} pedido(s) atualizados`);
}

async function cancelarPedido(orderId) {
  if (!confirm('Cancelar este pedido?')) return;
  const order = App.pedidos.find(p => p.id === orderId);
  const snapshot = order ? { status: order.status, dataStatus: order.dataStatus } : null;
  if (order) { order.status = 'Cancelado'; order.dataStatus = nowBR_(); }
  closeDrawer();
  renderKanban();
  showToast('Pedido cancelado');
  try {
    await API.atualizarStatus(orderId, 'Cancelado');
    loadPedidos().then(() => { if (App.view === 'kanban') renderKanban(); });
  } catch (e) {
    if (order && snapshot) Object.assign(order, snapshot);
    renderKanban();
    showToast('Erro ao cancelar', 'error');
  }
}

// ── DRAWER ────────────────────────────────────────────────────────────────────
function openDrawer(orderId) {
  App.drawerOrderId = orderId;
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;
  renderDrawer(order);
  document.getElementById('order-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('show');
}

function closeDrawer() {
  App.drawerOrderId = null;
  document.getElementById('order-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('show');
}

function renderDrawer(order) {
  const stage  = STAGES.find(s => s.key === order.status);
  const next   = NEXT_STATUS[order.status];
  const sc     = stage ? stage.color : '#6b7280';
  const stuck  = isStuck(order);
  const isDev  = isDevOrder(order);
  const itens = parseItens(order);

  let hist = [];
  try { hist = JSON.parse(order.histStatus || '[]'); } catch (e) {}

  const addrParts = [order.endereco, order.cidade, order.estado ? `— ${order.estado}` : '', order.cep ? `CEP ${order.cep}` : '']
    .filter(Boolean).join(', ');

  const waRastreioHref = order.rastreio && order.telefone
    ? `https://wa.me/55${order.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(
        `Olá ${order.clinica}! 📦\nSeu pedido foi enviado!\nRastreio: *${order.rastreio}*\nAcompanhe em: https://rastreamento.correios.com.br/app/resultado.app?objeto=${order.rastreio}`
      )}`
    : null;

  document.getElementById('order-drawer').innerHTML = `
    <div class="drawer-header">
      <div class="drawer-title-row">
        <button class="drawer-close" onclick="closeDrawer()">✕</button>
        <div class="drawer-title">
          <span class="drawer-clinica" title="${esc(order.clinica)}">${esc(order.clinica)}</span>
          <span class="drawer-status" style="--sc:${sc}">${esc(order.status)}</span>
          ${isDev ? '<span class="drawer-dev-badge">🔧 DEV</span>' : stuck ? '<span class="drawer-stuck-badge">⚠️ Parado +24h</span>' : ''}
        </div>
        <span class="drawer-id">#${order.id}</span>
      </div>
      <div class="drawer-meta">
        <span>📅 ${esc(order.data)}</span>
        ${order.pagamento ? `<span>💳 ${esc(order.pagamento)}${order.parcelas ? ' · ' + esc(order.parcelas) + 'x' : ''}</span>` : ''}
        ${order.telefone ? `<span>📱 <a href="https://wa.me/55${order.telefone.replace(/\D/g,'')}" target="_blank">${esc(order.telefone)}</a></span>` : ''}
      </div>
    </div>

    <div class="drawer-body">

      <div class="drawer-section">
        <h3>📋 Produtos</h3>
        <table class="items-table">
          <thead><tr><th>Produto</th><th>Dose</th><th style="width:50px;text-align:center">Qtd</th></tr></thead>
          <tbody>${itens.map(it => `
            <tr>
              <td>${esc(it.nome)}</td>
              <td>${esc(it.dose || '—')}</td>
              <td style="text-align:center">${it.qty}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="drawer-total">
          Total: <strong>${formatMoeda(order.total)}</strong>
          ${order.cupom ? ` &nbsp;·&nbsp; Cupom: <code>${esc(order.cupom)}</code>` : ''}
        </div>
      </div>

      ${addrParts ? `
      <div class="drawer-section">
        <h3>📍 Entrega</h3>
        <div class="info-grid">
          <div><label>Endereço</label><span>${esc(addrParts)}</span></div>
          ${order.freteMetodo ? `<div><label>Frete</label><span>${esc(order.freteMetodo)}${order.freteValor ? ' · R$ ' + esc(order.freteValor) : ''}</span></div>` : ''}
        </div>
      </div>` : ''}

      <div class="drawer-section">
        <h3>📦 Logística</h3>
        <div class="logistica-row">
          <div class="field-inline">
            <label>Peso (kg)</label>
            <input id="dr-peso" type="text" value="${escAttr(order.peso)}" placeholder="0.000"/>
          </div>
          <div class="field-inline">
            <label>Dimensões L×A×P (cm)</label>
            <input id="dr-dim" type="text" value="${escAttr(order.dimensoes)}" placeholder="ex: 30x20x15"/>
          </div>
        </div>
        <div class="rastreio-row">
          <input id="dr-rastreio" type="text" value="${escAttr(order.rastreio)}"
            placeholder="Código de rastreio (Correios / Jadlog)"/>
          <button class="btn-sm btn-accent" onclick="salvarRastreio(${order.id})">Salvar</button>
        </div>
        ${order.rastreio ? `
        <div class="rastreio-info">
          <code>${esc(order.rastreio)}</code>
          ${waRastreioHref
            ? `<a href="${waRastreioHref}" target="_blank" class="btn-wa-rastreio">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                 Avisar por WhatsApp
               </a>`
            : ''}
        </div>` : ''}
        ${order.dataEnvio ? `<div class="info-chip">🚚 Enviado em ${esc(order.dataEnvio)}</div>` : ''}
      </div>

      ${order.obs ? `
      <div class="drawer-section">
        <h3>💬 Observação</h3>
        <div class="obs-box">${esc(order.obs)}</div>
      </div>` : ''}

      <div class="drawer-section">
        <h3>📝 Nota Interna</h3>
        <textarea id="dr-nota-int" class="nota-int-area" placeholder="Anotações internas (não visível ao cliente)..."
          rows="3">${esc(order.nota_int || '')}</textarea>
        <button class="btn-sm" style="margin-top:6px" onclick="salvarNotaInterna(${order.id})">💾 Salvar Nota</button>
      </div>

      <div class="drawer-section">
        <h3>📜 Histórico</h3>
        <div class="hist-list">
          ${hist.length === 0
            ? '<div class="hist-empty">Sem histórico</div>'
            : hist.map(h => `
              <div class="hist-item">
                <span class="hist-status">${esc(h.s)}</span>
                <span class="hist-ts">${esc(h.ts || '')}</span>
                <span class="hist-by">${h.by ? '— ' + esc(h.by) : ''}</span>
              </div>`).join('')}
        </div>
      </div>

    </div>

    <div class="drawer-footer">
      <button class="btn-sm btn-outline" onclick="printRomaneio(${order.id})">🖨️ Romaneio</button>
      <button class="btn-sm btn-outline" onclick="salvarLogistica(${order.id})">💾 Salvar Dados</button>
      <button class="btn-sm btn-outline" onclick="corrigirPedido(${order.id})">✏️ Corrigir</button>
      ${isDev ? `<button class="btn-sm btn-dev-ret" onclick="retornarEstoque(${order.id})">🔄 Retornar ao Estoque</button>` : ''}
      ${PREV_STATUS[order.status]
        ? `<button class="btn-sm btn-outline" onclick="revertStatus(${order.id})">← Voltar Status</button>`
        : ''}
      ${next
        ? `<button class="btn-sm btn-accent" onclick="advanceStatus(${order.id},'${esc(next)}')">→ ${esc(next)}</button>`
        : ''}
      ${!['Cancelado','Entregue'].includes(order.status)
        ? `<button class="btn-sm btn-danger" onclick="cancelarPedido(${order.id})">❌ Cancelar</button>`
        : ''}
    </div>`;
}

function parseItens(order) {
  if (order.carrinho) {
    try {
      const cart = JSON.parse(order.carrinho);
      const itens = Object.entries(cart).map(([chave, qty]) => {
        const [prodId, varIdx] = chave.split('__');
        const prod = App.produtos.find(p => p.id === prodId);
        if (prod && varIdx !== undefined && prod.variantes?.[parseInt(varIdx)]) {
          const v = prod.variantes[parseInt(varIdx)];
          return { nome: prod.nome, dose: v.dose, qty };
        }
        if (prod) return { nome: prod.nome, dose: prod.conc, qty };
        return { nome: prodId, dose: '', qty };
      });
      if (itens.length > 0) return itens;
    } catch (e) {}
  }
  const prods = (order.produtos || '').split('\n').filter(Boolean);
  const qtds  = (order.quantidades || '').split('\n').filter(Boolean);
  return prods.map((p, i) => ({
    nome: p.replace(/^\d+x\s*/, '').trim(),
    dose: '',
    qty:  qtds[i] || '1',
  }));
}

async function salvarLogistica(orderId) {
  const peso  = document.getElementById('dr-peso')?.value?.trim() || '';
  const dim   = document.getElementById('dr-dim')?.value?.trim()  || '';
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;
  try {
    await API.atualizarStatus(orderId, order.status, { peso, dimensoes: dim });
    await loadPedidos();
    const upd = App.pedidos.find(p => p.id === orderId);
    if (upd) renderDrawer(upd);
    showToast('Dados salvos!');
  } catch (e) {
    showToast('Erro ao salvar', 'error');
  }
}

async function salvarRastreio(orderId) {
  const codigo = document.getElementById('dr-rastreio')?.value?.trim();
  if (!codigo) return showToast('Informe o código de rastreio', 'error');
  try {
    await API.adicionarRastreio(orderId, codigo);
    await loadPedidos();
    const upd = App.pedidos.find(p => p.id === orderId);
    if (upd) renderDrawer(upd);
    renderKanban();
    showToast('Rastreio salvo → Enviado');
  } catch (e) {
    showToast('Erro ao salvar rastreio', 'error');
  }
}

function printRomaneio(orderId) {
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;
  sessionStorage.setItem('romaneio_order', JSON.stringify({ ...order, itens: parseItens(order) }));
  window.open('print/romaneio.html', '_blank');
}

function corrigirPedido(orderId) {
  const order = App.pedidos.find(p => p.id === orderId);
  if (!order) return;
  const payload = {
    rowNum:      orderId,
    pagamento:   order.pagamento,
    parcelas:    order.parcelas,
    obs:         order.obs,
    cupom:       order.cupom,
    carrinho:    order.carrinho,
    cep:         order.cep,
    freteMetodo: order.freteMetodo,
    freteValor:  order.freteValor,
    total:       order.total,
    produtos:    order.produtos,
    cli: {
      clinica:     order.clinica,
      responsavel: order.responsavel,
      cargo:       order.cargo,
      telefone:    order.telefone,
      email:       order.email_cli,
      cpf:         order.documento,
      cidade:      order.cidade,
      estado:      order.estado,
      endereco:    order.endereco,
    },
  };
  sessionStorage.setItem('pharmafit_corrigir', JSON.stringify(payload));
  window.open('../gerador_pedido.html', '_blank');
}

async function salvarNotaInterna(orderId) {
  const nota = document.getElementById('dr-nota-int')?.value ?? '';
  try {
    await API.salvarNotaInt(orderId, nota);
    const order = App.pedidos.find(p => p.id === orderId);
    if (order) order.nota_int = nota;
    showToast('Nota salva!');
  } catch(e) { showToast('Erro ao salvar nota', 'error'); }
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
function renderClientes() {
  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;
  const q = (document.getElementById('busca-clientes')?.value || '').toLowerCase();
  const lista = q
    ? App.clientes.filter(c =>
        (c.clinica || '').toLowerCase().includes(q) ||
        (c.telefone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.responsavel || '').toLowerCase().includes(q))
    : App.clientes;

  // Build order count map from loaded pedidos
  const countMap = {};
  App.pedidos.forEach(p => {
    const tel = (p.telefone || '').replace(/\D/g, '');
    const key = tel || (p.email_cli || '').toLowerCase();
    if (key) countMap[key] = (countMap[key] || 0) + 1;
  });

  document.getElementById('clientes-count').textContent = `${lista.length} clientes`;
  tbody.innerHTML = lista.length === 0
    ? `<tr><td colspan="6" class="empty-msg">Nenhum cliente encontrado</td></tr>`
    : lista.map(c => {
        const key = (c.telefone||'').replace(/\D/g,'') || (c.email||'').toLowerCase();
        const nPed = countMap[key] || 0;
        return `
        <tr>
          <td><strong>${esc(c.clinica)}</strong></td>
          <td>${esc(c.responsavel || '—')}</td>
          <td>${esc(c.telefone || '—')}</td>
          <td>${esc(c.cidade || '—')}${c.estado ? ' — ' + esc(c.estado) : ''}</td>
          <td style="text-align:center">
            ${nPed > 0
              ? `<button class="btn-xs" onclick="abrirHistoricoCliente('${escAttr(c.cpf||c.email)}','${escAttr(c.clinica)}')"
                  title="Ver pedidos">${nPed} pedido${nPed>1?'s':''}</button>`
              : `<span style="color:var(--text2);font-size:12px">0</span>`}
          </td>
          <td style="display:flex;gap:4px">
            ${c.telefone ? `<a href="https://wa.me/55${c.telefone.replace(/\D/g,'')}" target="_blank" class="btn-xs">WhatsApp</a>` : ''}
            <button class="btn-xs" onclick="abrirEditarCliente(${JSON.stringify(c).replace(/"/g,'&quot;')})">✏️ Editar</button>
          </td>
        </tr>`;
      }).join('');
}

// ── PRODUTOS ──────────────────────────────────────────────────────────────────
function renderProdutos() {
  const tbody = document.getElementById('produtos-tbody');
  if (!tbody) return;
  const q = (document.getElementById('busca-produtos')?.value || '').toLowerCase();
  const lista = q
    ? App.produtos.filter(p => (p.nome || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q))
    : App.produtos;

  tbody.innerHTML = lista.length === 0
    ? `<tr><td colspan="6" class="empty-msg">Nenhum produto encontrado</td></tr>`
    : lista.map(p => {
        const est = p.variantes?.length > 0
          ? p.variantes.reduce((s, v) => s + (parseInt(v.estoque) || 0), 0)
          : (parseInt(p.estoque) || 0);
        const low = est < 5;
        return `
          <tr>
            <td>${p.icone || '💊'} <strong>${esc(p.nome)}</strong></td>
            <td style="color:var(--text2)">${esc(p.conc || '—')}</td>
            <td class="${low ? 'stock-low' : ''}">
              ${p.variantes?.length > 0
                ? `<span title="Soma das variantes">${est}</span>`
                : `<input type="number" class="stock-input" value="${est}" min="0"
                     onchange="updateStock('${escAttr(p.id)}', this.value)"/>`}
            </td>
            <td>R$ ${formatNum(p.preco)}</td>
            <td><span class="badge ${est > 0 ? 'badge-on' : 'badge-off'}">${est > 0 ? 'Ativo' : 'Esgotado'}</span></td>
            <td><button class="btn-xs" onclick="abrirEditarProduto('${escAttr(p.id)}')">✏️ Editar</button></td>
          </tr>`;
      }).join('');
}

async function updateStock(prodId, valor) {
  try {
    await API.atualizarProduto(prodId, 'estoque', valor);
    showToast('Estoque atualizado');
  } catch (e) {
    showToast('Erro ao atualizar estoque', 'error');
  }
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
function renderConfig() {
  const tbody = document.getElementById('admins-tbody');
  if (tbody) {
    tbody.innerHTML = App.admins.length === 0
      ? `<tr><td colspan="4" class="empty-msg">Nenhum admin cadastrado</td></tr>`
      : App.admins.map(a => `
          <tr>
            <td><strong>${esc(a.nome)}</strong></td>
            <td>${esc(a.email)}</td>
            <td>${esc(a.cargo || '—')}</td>
            <td style="color:var(--text2);font-size:12px">${esc(a.criado || '—')}</td>
          </tr>`).join('');
  }
}

async function cadastrarAdmin(e) {
  e.preventDefault();
  const pin   = document.getElementById('cfg-pin').value.trim();
  const email = document.getElementById('cfg-email').value.trim();
  const senha = document.getElementById('cfg-senha').value.trim();
  const nome  = document.getElementById('cfg-nome').value.trim();
  const cargo = document.getElementById('cfg-cargo').value.trim();
  const msg   = document.getElementById('cfg-status');
  msg.textContent = '';

  try {
    const data = await API.call({ action: 'cadastrar_admin', pin, email, senha, nome, cargo });
    if (data.ok) {
      showToast(`Admin ${data.nome} cadastrado!`);
      e.target.reset();
      await loadAdmins();
      renderConfig();
    } else {
      msg.textContent = data.erro || 'Erro ao cadastrar';
      msg.style.color = 'var(--danger)';
    }
  } catch (ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem('pharmafit_admin');
  window.location.href = 'index.html';
}

async function refreshAll() {
  await loadAll();
  renderCurrentView();
  showToast('Atualizado!');
}

function nowBR_() {
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isDevOrder(order) {
  if (!order) return false;
  const tel = (order.telefone || '').replace(/\D/g, '');
  const em  = (order.email_cli || '').trim().toLowerCase();
  return App.clientes.some(c => {
    if ((c.categoria || '') !== 'dev') return false;
    const ct = (c.telefone || '').replace(/\D/g, '');
    const ce = (c.email || '').trim().toLowerCase();
    return (tel && ct && ct === tel) || (em && ce && ce === em);
  });
}

async function retornarEstoque(orderId) {
  if (!confirm('Retornar itens deste pedido ao estoque?')) return;
  try {
    await API.retornarEstoque(orderId);
    showToast('Estoque restaurado!');
  } catch(e) {
    showToast('Erro ao restaurar estoque', 'error');
  }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function formatMoeda(s) {
  const n = parseFloat(String(s || '0').replace(',','.')) || 0;
  return 'R$ ' + n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function formatNum(n) {
  return parseFloat(n || 0).toFixed(2).replace('.',',');
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  const d = m ? new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]) : new Date(dateStr);
  if (isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function showToast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `toast toast-${type} toast-visible`;
  el.textContent = msg;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('toast-visible'), 3000);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(html) {
  const box = document.getElementById('modal-box');
  const ov  = document.getElementById('modal-overlay');
  box.innerHTML = html;
  box.classList.add('open');
  ov.classList.add('open');
}
function closeModal() {
  document.getElementById('modal-box').classList.remove('open');
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── CSV EXPORT ────────────────────────────────────────────────────────────────
function exportarCSV() {
  const cols = ['ID','Data','Clínica','Responsável','Telefone','Email','Cidade','Estado',
    'Produtos','Total','Pagamento','Parcelas','Cupom','Status','Rastreio','FreteMetodo','FreteValor'];
  const rows = App.pedidos.map(p => [
    p.id, p.data, p.clinica, p.responsavel, p.telefone, p.email_cli,
    p.cidade, p.estado, (p.produtos||'').replace(/\n/g,' | '),
    p.total, p.pagamento, p.parcelas, p.cupom, p.status, p.rastreio, p.freteMetodo, p.freteValor,
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
  const csv  = [cols.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── CUPONS ────────────────────────────────────────────────────────────────────
function renderCupons() {
  const tbody = document.getElementById('cupons-tbody');
  if (!tbody) return;
  const q = (document.getElementById('busca-cupons')?.value || '').toLowerCase();
  const lista = q ? App.cupons.filter(c => c.codigo.toLowerCase().includes(q) || (c.vendedora||'').toLowerCase().includes(q)) : App.cupons;

  const statusCls = { Ativo: 'badge-on', Desativado: 'badge-off', Expirado: 'badge-off' };
  tbody.innerHTML = lista.length === 0
    ? `<tr><td colspan="9" class="empty-msg">Nenhum cupom encontrado</td></tr>`
    : lista.map(c => {
        const beneficios = [
          c.parcelamento === 'SIM' ? `<span class="badge badge-on" style="font-size:10px">3x s/j</span>` : '',
          c.freteAcima   ? `<span class="badge badge-on" style="font-size:10px">🚚 +R$${esc(c.freteAcima)}</span>` : '',
        ].filter(Boolean).join(' ') || '<span style="color:var(--text2);font-size:11px">—</span>';
        return `
      <tr>
        <td><strong>${esc(c.codigo)}</strong></td>
        <td>${esc(c.tipo === '%' ? '% Desconto' : 'Preço Fixo')}</td>
        <td>${c.tipo === '%' ? c.valor + '%' : '—'}</td>
        <td style="font-size:12px;color:var(--text2)">${esc(c.validade)}</td>
        <td style="font-size:12px;color:var(--text2)">${esc(c.vendedora || '—')}</td>
        <td style="text-align:center">${c.usos}</td>
        <td style="white-space:nowrap">${beneficios}</td>
        <td><span class="badge ${statusCls[c.status] || 'badge-off'}">${esc(c.status)}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn-xs ${c.status === 'Ativo' ? 'btn-xs-danger' : ''}"
            onclick="toggleCupomAdmin('${escAttr(c.codigo)}','${c.status}')">
            ${c.status === 'Ativo' ? 'Desativar' : 'Ativar'}
          </button>
          <button class="btn-xs btn-xs-danger"
            onclick="apagarCupomAdmin('${escAttr(c.codigo)}')">🗑️</button>
        </td>
      </tr>`;}).join('');
}

function toggleFormCupom() {
  const p = document.getElementById('cupom-form-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) {
    // Sempre re-renderiza o picker ao abrir (garante variantes atualizadas)
    renderProdPickerCupom();
    // Reset tipo para % e mostrar campo desconto
    const tipoSel = document.getElementById('nc-tipo');
    if (tipoSel) { tipoSel.value = '%'; toggleCupomTipo(); }
  }
}

function renderProdPickerCupom() {
  const items = document.getElementById('nc-prod-items');
  if (!items) return;
  const rows = [];
  if (App.produtos.length === 0) {
    rows.push(`<div style="color:var(--text2);font-size:11px;padding:8px">Nenhum produto carregado</div>`);
  }
  App.produtos.forEach(p => {
    // data-search includes name, tags, lab, conc — enables tag/lab searching
    const baseSearch = escAttr([p.nome, p.conc, p.lab, ...(p.tags||[])].filter(Boolean).join(' ').toLowerCase());
    if (p.variantes && p.variantes.length > 0) {
      rows.push(`
        <label class="prod-pick-item prod-pick-group-label" data-search="${baseSearch}">
          <input type="checkbox" class="prod-pick-group-cb" data-prod="${escAttr(p.id)}"
            onchange="toggleVariantGroup('${escAttr(p.id)}', this)"/>
          ${p.icone||'💊'} <strong>${esc(p.nome)}</strong>
          <span style="color:var(--text2);font-size:10px;margin-left:auto">${p.variantes.length} doses</span>
        </label>`);
      p.variantes.forEach((v, i) => {
        // Variant inherits parent search so filtering by product name still shows doses
        const varSearch = escAttr(baseSearch + ' ' + (v.dose||'').toLowerCase());
        rows.push(`
          <label class="prod-pick-item prod-pick-variant" data-search="${varSearch}">
            <input type="checkbox" class="prod-pick-cb" value="${escAttr(p.id+'__'+i)}"
              data-prod-group="${escAttr(p.id)}" onchange="onVariantChange('${escAttr(p.id)}', this)"/>
            <span style="color:var(--text2)">↳</span> ${esc(v.dose)}
            <span style="color:var(--text2);font-size:11px">R$ ${formatNum(v.preco)}</span>
          </label>`);
      });
    } else {
      rows.push(`
        <label class="prod-pick-item" data-search="${baseSearch}">
          <input type="checkbox" class="prod-pick-cb" value="${escAttr(p.id)}" onchange="syncProdPickerInput()"/>
          ${p.icone||'💊'} ${esc(p.nome)}${p.conc ? ` <span style="color:var(--text2);font-size:11px">${esc(p.conc)}</span>` : ''}
        </label>`);
    }
  });
  items.innerHTML = rows.join('');
}

function toggleVariantGroup(prodId, cb) {
  document.querySelectorAll(`.prod-pick-cb[data-prod-group="${CSS.escape(prodId)}"]`)
    .forEach(el => { el.checked = cb.checked; });
  syncProdPickerInput();
}

function onVariantChange(prodId, changedCb) {
  const all  = [...document.querySelectorAll(`.prod-pick-cb[data-prod-group="${CSS.escape(prodId)}"]`)];
  const groupCb = document.querySelector(`.prod-pick-group-cb[data-prod="${CSS.escape(prodId)}"]`);
  if (groupCb) {
    const nChecked = all.filter(el => el.checked).length;
    groupCb.indeterminate = nChecked > 0 && nChecked < all.length;
    groupCb.checked = nChecked === all.length;
  }
  syncProdPickerInput();
}

function filtrarProdPicker(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.prod-pick-item').forEach(el => {
    const text = (el.dataset.search || el.textContent).toLowerCase();
    el.style.display = !lower || text.includes(lower) ? '' : 'none';
  });
}

function syncProdPickerInput() {
  const checked = [...document.querySelectorAll('.prod-pick-cb:checked')].map(cb => cb.value);
  document.getElementById('nc-produtos').value = checked.length > 0 ? checked.join(',') : 'todos';
  renderPrecosFixos();
}

function renderPrecosFixos() {
  const wrap  = document.getElementById('nc-precos-wrap');
  const items = document.getElementById('nc-precos-items');
  if (!wrap || !items) return;
  const tipo = document.getElementById('nc-tipo')?.value;
  if (tipo !== 'fixo') { wrap.classList.add('hidden'); return; }
  const checked = [...document.querySelectorAll('.prod-pick-cb:checked')].map(cb => cb.value);
  if (checked.length === 0) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  items.innerHTML = checked.map(key => {
    const [prodId, varIdxStr] = key.split('__');
    const prod = App.produtos.find(x => x.id === prodId);
    if (!prod) return '';
    const varIdx = varIdxStr !== undefined ? parseInt(varIdxStr) : null;
    const label  = varIdx !== null
      ? `${prod.icone||'💊'} ${prod.nome} — ${prod.variantes?.[varIdx]?.dose || varIdxStr}`
      : `${prod.icone||'💊'} ${prod.nome}${prod.conc ? ' ' + prod.conc : ''}`;
    const basePrice = varIdx !== null
      ? (prod.variantes?.[varIdx]?.preco || prod.preco)
      : prod.preco;
    return `
      <div class="preco-fix-row">
        <span class="preco-fix-label">${esc(label)}</span>
        <input type="number" step="0.01" min="0" class="preco-fix-input" data-key="${escAttr(key)}"
          placeholder="${formatNum(basePrice)}" title="Preço fixo (padrão: R$ ${formatNum(basePrice)})"/>
      </div>`;
  }).join('');
}

function toggleTodosProdutos(cb) {
  const list = document.getElementById('nc-prod-list');
  if (cb.checked) {
    list.classList.add('hidden');
    document.getElementById('nc-precos-wrap')?.classList.add('hidden');
    document.getElementById('nc-produtos').value = 'todos';
  } else {
    list.classList.remove('hidden');
    renderProdPickerCupom();
    syncProdPickerInput();
  }
}

function toggleFreteGratis(cb) {
  const input = document.getElementById('nc-frete');
  const label = document.getElementById('nc-frete-real-label');
  input?.classList.toggle('hidden', !cb.checked);
  label?.classList.toggle('hidden', !cb.checked);
}

function toggleCupomTipo() {
  const tipo   = document.getElementById('nc-tipo').value;
  const isFixo = tipo === 'fixo';
  document.getElementById('nc-valor-wrap').style.display = isFixo ? 'none' : '';
  if (isFixo) {
    // Preço fixo exige produtos específicos — desmarcar "Todos"
    const todosCheck = document.getElementById('nc-todos-prods');
    if (todosCheck?.checked) { todosCheck.checked = false; toggleTodosProdutos(todosCheck); }
    renderPrecosFixos();
  } else {
    document.getElementById('nc-precos-wrap')?.classList.add('hidden');
  }
}

async function salvarCupomAdmin(e) {
  e.preventDefault();
  const msg = document.getElementById('nc-status');
  msg.textContent = '';
  const freteToggle = document.getElementById('nc-frete-toggle');
  const tipo = document.getElementById('nc-tipo').value;
  const precos = tipo === 'fixo'
    ? [...document.querySelectorAll('.preco-fix-input')]
        .filter(i => i.value.trim())
        .map(i => `${i.dataset.key}:${i.value.trim()}`)
        .join('|')
    : '';
  const params = {
    codigo:              document.getElementById('nc-codigo').value.trim(),
    tipo,
    valor:               document.getElementById('nc-valor').value,
    produtos:            document.getElementById('nc-produtos').value.trim() || 'todos',
    precos,
    validade:            document.getElementById('nc-validade').value.trim() || 'INDETERMINADO',
    frete_gratis_acima:  (freteToggle?.checked ? document.getElementById('nc-frete').value : '') || '',
    parcelamento:        document.getElementById('nc-parc').checked ? 'SIM' : 'NAO',
  };
  try {
    const data = await API.criarCupom(params);
    if (data.ok) {
      showToast(`Cupom ${data.codigo} criado!`);
      e.target.reset();
      // Reset product picker state
      const todosCheck = document.getElementById('nc-todos-prods');
      if (todosCheck) { todosCheck.checked = true; toggleTodosProdutos(todosCheck); }
      const _pi = document.getElementById('nc-prod-items'); if (_pi) _pi.innerHTML = '';
      const _pf = document.getElementById('nc-precos-items'); if (_pf) _pf.innerHTML = '';
      document.getElementById('nc-precos-wrap')?.classList.add('hidden');
      document.getElementById('nc-produtos').value = 'todos';
      document.getElementById('nc-valor-wrap').style.display = '';
      const freteToggle = document.getElementById('nc-frete-toggle');
      if (freteToggle) { freteToggle.checked = false; toggleFreteGratis(freteToggle); }
      toggleFormCupom();
      await loadCupons();
      renderCupons();
    } else {
      msg.textContent = data.erro || 'Erro ao criar';
      msg.style.color = 'var(--danger)';
    }
  } catch(ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

async function apagarCupomAdmin(codigo) {
  if (!confirm(`Apagar permanentemente o cupom ${codigo}? Esta ação não pode ser desfeita.`)) return;
  try {
    await API.apagarCupom(codigo);
    App.cupons = App.cupons.filter(c => c.codigo !== codigo);
    renderCupons();
    showToast(`Cupom ${codigo} apagado`);
  } catch(e) {
    showToast('Erro ao apagar cupom', 'error');
  }
}

async function toggleCupomAdmin(codigo, statusAtual) {
  const label = statusAtual === 'Ativo' ? 'desativar' : 'ativar';
  if (!confirm(`Deseja ${label} o cupom ${codigo}?`)) return;
  try {
    await API.toggleCupom(codigo);
    await loadCupons();
    renderCupons();
    showToast(`Cupom ${codigo} ${statusAtual === 'Ativo' ? 'desativado' : 'ativado'}`);
  } catch(e) {
    showToast('Erro ao alterar cupom', 'error');
  }
}

// ── PRODUTO — EDIÇÃO COMPLETA ─────────────────────────────────────────────────
// ── VARIANT EDITOR HELPERS ────────────────────────────────────────────────────
function toggleVariantEditor(cb, prefix) {
  const editor  = document.getElementById(`${prefix}-variantes-editor`);
  const preco   = document.getElementById(`${prefix}-preco`);
  const estoque = document.getElementById(`${prefix}-estoque`);
  editor?.classList.toggle('hidden', !cb.checked);
  if (preco)   preco.disabled   = cb.checked;
  if (estoque) estoque.disabled = cb.checked;
  if (cb.checked) {
    const tbody = document.getElementById(`${prefix}-var-tbody`);
    if (tbody && tbody.children.length === 0) addVariantRow(prefix);
  }
}

function addVariantRow(prefix, dose = '', preco = '', estoque = '') {
  const tbody = document.getElementById(`${prefix}-var-tbody`);
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'variant-row';
  tr.innerHTML = `
    <td><input class="vr-dose" type="text" placeholder="ex: 2mg" value="${escAttr(String(dose))}"/></td>
    <td><input class="vr-preco" type="number" step="0.01" min="0" placeholder="0.00" value="${escAttr(String(preco||''))}"/></td>
    <td><input class="vr-estoque" type="number" min="0" placeholder="0" value="${escAttr(String(estoque||''))}"/></td>
    <td><button type="button" class="btn-xs btn-xs-danger" onclick="this.closest('tr').remove()">×</button></td>`;
  tbody.appendChild(tr);
}

function buildVariantesStr(prefix) {
  return [...document.querySelectorAll(`#${prefix}-var-tbody .variant-row`)]
    .map(row => {
      const dose  = row.querySelector('.vr-dose')?.value.trim() || '';
      const preco = parseFloat(row.querySelector('.vr-preco')?.value || 0) || 0;
      const est   = parseInt(row.querySelector('.vr-estoque')?.value || 0) || 0;
      return dose ? `${dose}:${preco}:${est}` : null;
    }).filter(Boolean).join('|');
}

function abrirEditarProduto(prodId) {
  const p = App.produtos.find(x => x.id === prodId);
  if (!p) return;
  const hasPromo     = !!(p.promo_preco || p.promo_pct || p.promo_fim);
  const hasVariantes = !!(p.variantes && p.variantes.length > 0);
  openModal(`
    <div class="modal-header">
      <span>✏️ Editar Produto — ${esc(p.nome)}</span>
      <button onclick="closeModal()">✕</button>
    </div>
    <form class="cfg-form" onsubmit="salvarProduto(event,'${escAttr(prodId)}')">
      <div class="cfg-row">
        <div class="field-inline" style="flex:0 0 60px"><label>Ícone</label><input id="ep-icone" value="${escAttr(p.icone||'💊')}" maxlength="4" style="text-align:center;font-size:20px"/></div>
        <div class="field-inline"><label>Nome</label><input id="ep-nome" value="${escAttr(p.nome)}"/></div>
        <div class="field-inline"><label>Concentração / Dose</label><input id="ep-conc" value="${escAttr(p.conc||'')}"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Preço Base (R$)</label><input type="number" step="0.01" id="ep-preco" value="${p.preco||0}" ${hasVariantes?'disabled':''}/>  </div>
        <div class="field-inline"><label>Estoque</label><input type="number" id="ep-estoque" value="${hasVariantes ? '' : (p.estoque||0)}" ${hasVariantes?'disabled placeholder="via variantes"':''}/></div>
        <div class="field-inline"><label>Laboratório</label><input id="ep-lab" value="${escAttr(p.lab||'')}"/></div>
      </div>

      <div class="var-section">
        <label class="var-toggle-label">
          <input type="checkbox" id="ep-tem-variantes" ${hasVariantes?'checked':''}
            onchange="toggleVariantEditor(this,'ep')"/>
          Variantes — doses com preços individuais
        </label>
        <div id="ep-variantes-editor" class="variantes-editor ${hasVariantes?'':'hidden'}">
          <table class="var-table">
            <thead><tr><th>Dose / Conc.</th><th>Preço R$</th><th>Estoque</th><th></th></tr></thead>
            <tbody id="ep-var-tbody"></tbody>
          </table>
          <button type="button" class="btn-xs" style="margin-top:6px" onclick="addVariantRow('ep')">+ Dose</button>
        </div>
      </div>

      <div class="cfg-row">
        <div class="field-inline"><label>Categoria</label>
          <select id="ep-categoria">
            <option value="">— Selecionar —</option>
            ${['emagrecimento','hormonal','performance','bem-estar','antienvelhecimento','outros'].map(c =>
              `<option value="${c}" ${p.categoria===c?'selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field-inline"><label>Tags (vírgula)</label><input id="ep-tags" value="${escAttr((p.tags||[]).join(', '))}"/></div>
        <div class="field-inline"><label>Status</label>
          <select id="ep-ativo">
            <option value="true" selected>Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div class="field-inline" style="flex:0 0 auto;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="ep-destaque" ${p.destaque==='sim'?'checked':''}/> Destaque
          </label>
        </div>
      </div>

      <details class="promo-section" ${hasPromo?'open':''}>
        <summary class="promo-summary">🏷️ Promoção</summary>
        <div class="cfg-row" style="margin-top:10px">
          <div class="field-inline"><label>Preço Promocional (R$)</label><input type="number" step="0.01" id="ep-promo-preco" value="${p.promo_preco||''}"/></div>
          <div class="field-inline"><label>Desconto (%)</label><input type="number" min="0" max="100" id="ep-promo-pct" value="${p.promo_pct||''}"/></div>
          <div class="field-inline"><label>Fim da Promo (dd/mm/aaaa hh:mm)</label><input id="ep-promo-fim" value="${escAttr(p.promo_fim||'')}" placeholder="31/12/2025 23:59"/></div>
        </div>
      </details>

      <div id="ep-status" class="cfg-status-msg"></div>
      <div style="display:flex;gap:8px">
        <button type="submit" class="btn-sm btn-accent">Salvar</button>
        <button type="button" class="btn-sm" onclick="closeModal()">Cancelar</button>
      </div>
    </form>`);
  // Populate variant rows after modal renders
  if (hasVariantes) {
    p.variantes.forEach(v => addVariantRow('ep', v.dose, v.preco, v.estoque));
  }
}

async function salvarProduto(e, prodId) {
  e.preventDefault();
  const msg = document.getElementById('ep-status');
  msg.textContent = 'Salvando...';
  const params = { prod_id: prodId };
  const nome = document.getElementById('ep-nome')?.value.trim(); if (nome) params.nome = nome;
  const conc = document.getElementById('ep-conc')?.value.trim(); if (conc !== undefined) params.conc = conc;
  const temVar = document.getElementById('ep-tem-variantes')?.checked;
  if (temVar) {
    params.variantes = buildVariantesStr('ep');
  } else {
    params.variantes = '';
    const preco = document.getElementById('ep-preco')?.value; if (preco) params.preco = preco;
    const est = document.getElementById('ep-estoque'); if (est && !est.disabled) params.estoque = est.value;
  }
  const lab = document.getElementById('ep-lab')?.value.trim(); if (lab !== undefined) params.lab = lab;
  params.ativo = document.getElementById('ep-ativo')?.value;
  const pp = document.getElementById('ep-promo-preco')?.value; if (pp) params.promo_preco = pp;
  const pct = document.getElementById('ep-promo-pct')?.value; if (pct) params.promo_pct = pct;
  const pfim = document.getElementById('ep-promo-fim')?.value.trim(); if (pfim) params.promo_fim = pfim;
  const icone = document.getElementById('ep-icone')?.value.trim(); if (icone) params.icone = icone;
  const cat = document.getElementById('ep-categoria')?.value; if (cat !== undefined) params.categoria = cat;
  const tags = document.getElementById('ep-tags')?.value.trim(); if (tags !== undefined) params.tags = tags;
  params.destaque = document.getElementById('ep-destaque')?.checked ? 'sim' : '';
  try {
    const data = await API.editarProduto(params);
    if (data.ok) {
      showToast('Produto atualizado!');
      closeModal();
      await loadProdutos();
      renderProdutos();
    } else {
      msg.textContent = data.erro || 'Erro ao salvar';
      msg.style.color = 'var(--danger)';
    }
  } catch(ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

// ── CLIENTE — HISTÓRICO + EDIÇÃO ──────────────────────────────────────────────
async function abrirHistoricoCliente(documento, nomeClinica) {
  openModal(`<div class="modal-header"><span>📋 Pedidos — ${esc(nomeClinica)}</span><button onclick="closeModal()">✕</button></div>
    <div class="loading-msg">⏳ Carregando pedidos...</div>`);
  try {
    const data = await API.pedidosCliente(documento);
    if (!data.ok) { document.querySelector('#modal-box .loading-msg').textContent = 'Erro ao carregar'; return; }
    const STATUS_COR = { 'Novo':'#6b7280','Pag. Confirmado':'#f59e0b','Em Separação':'#3b82f6','Embalado':'#8b5cf6','Etiqueta Gerada':'#6366f1','Enviado':'#06b6d4','Entregue':'#10b981','Cancelado':'#ef4444' };
    document.getElementById('modal-box').innerHTML = `
      <div class="modal-header">
        <span>📋 Pedidos — ${esc(nomeClinica)}</span>
        <button onclick="closeModal()">✕</button>
      </div>
      <div class="modal-summary">
        <span><strong>${data.qtd}</strong> pedidos</span>
        <span>Total gasto: <strong style="color:var(--accent)">${formatMoeda(data.total_gasto)}</strong></span>
      </div>
      <div class="modal-table-wrap">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Produtos</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Rastreio</th></tr></thead>
          <tbody>
            ${data.pedidos.length === 0
              ? '<tr><td colspan="6" class="empty-msg">Nenhum pedido</td></tr>'
              : data.pedidos.map(p => `
                <tr>
                  <td style="font-size:12px">${esc(p.data.slice(0,10))}</td>
                  <td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((p.produtos||'').replace(/\n/g,' | '))}</td>
                  <td style="color:var(--accent);font-weight:600">${formatMoeda(p.total)}</td>
                  <td style="font-size:12px">${esc(p.pagamento||'—')}</td>
                  <td><span style="color:${STATUS_COR[p.status]||'#6b7280'};font-size:12px;font-weight:600">${esc(p.status)}</span></td>
                  <td style="font-size:11px">${esc(p.rastreio||'—')}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    showToast('Erro ao carregar pedidos', 'error');
  }
}

function abrirEditarCliente(c) {
  if (typeof c === 'string') c = JSON.parse(c);
  openModal(`
    <div class="modal-header"><span>✏️ Editar Cliente — ${esc(c.clinica)}</span><button onclick="closeModal()">✕</button></div>
    <form class="cfg-form" onsubmit="salvarCliente(event,'${escAttr(c.cpf||'')}','${escAttr(c.email||'')}')">
      <div class="cfg-row">
        <div class="field-inline"><label>Clínica / Nome</label><input id="ec-clinica" value="${escAttr(c.clinica)}"/></div>
        <div class="field-inline"><label>Responsável</label><input id="ec-resp" value="${escAttr(c.responsavel||'')}"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Cargo</label><input id="ec-cargo" value="${escAttr(c.cargo||'')}"/></div>
        <div class="field-inline"><label>Telefone</label><input id="ec-tel" value="${escAttr(c.telefone||'')}"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>E-mail</label><input type="email" id="ec-email" value="${escAttr(c.email||'')}"/></div>
        <div class="field-inline"><label>CPF / CNPJ</label><input id="ec-cpf" value="${escAttr(c.cpf||'')}"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Cidade</label><input id="ec-cidade" value="${escAttr(c.cidade||'')}"/></div>
        <div class="field-inline"><label>Estado</label><input id="ec-estado" value="${escAttr(c.estado||'')}"/></div>
      </div>
      <div class="field-inline"><label>Endereço</label><input id="ec-end" value="${escAttr(c.endereco||'')}"/></div>
      <div class="field-inline"><label>Categoria</label>
        <select id="ec-categoria">
          <option value="" ${!c.categoria?'selected':''}>— Padrão —</option>
          <option value="dev" ${c.categoria==='dev'?'selected':''}>🔧 Dev / Interno</option>
          <option value="vip" ${c.categoria==='vip'?'selected':''}>⭐ VIP</option>
        </select>
      </div>
      <div id="ec-status" class="cfg-status-msg"></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" class="btn-sm btn-accent">Salvar</button>
        <button type="button" class="btn-sm" onclick="closeModal()">Cancelar</button>
      </div>
    </form>`);
}

async function salvarCliente(e, cpf, emailCli) {
  e.preventDefault();
  const msg = document.getElementById('ec-status');
  msg.textContent = 'Salvando...';
  const params = {
    documento:   cpf, email_cli: emailCli,
    clinica:     document.getElementById('ec-clinica')?.value.trim(),
    responsavel: document.getElementById('ec-resp')?.value.trim(),
    cargo:       document.getElementById('ec-cargo')?.value.trim(),
    telefone:    document.getElementById('ec-tel')?.value.trim(),
    email_novo:  document.getElementById('ec-email')?.value.trim(),
    cpf_novo:    document.getElementById('ec-cpf')?.value.trim(),
    cidade:      document.getElementById('ec-cidade')?.value.trim(),
    estado:      document.getElementById('ec-estado')?.value.trim(),
    endereco:    document.getElementById('ec-end')?.value.trim(),
    categoria:   document.getElementById('ec-categoria')?.value ?? '',
  };
  try {
    const data = await API.editarCliente(params);
    if (data.ok) {
      showToast('Cliente atualizado!');
      closeModal();
      await loadClientes();
      renderClientes();
    } else {
      msg.textContent = data.erro || 'Erro ao salvar';
      msg.style.color = 'var(--danger)';
    }
  } catch(ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

// ── NOVO CLIENTE ──────────────────────────────────────────────────────────────
function abrirNovoCliente() {
  openModal(`
    <div class="modal-header"><span>👤 Novo Cliente</span><button onclick="closeModal()">✕</button></div>
    <form class="cfg-form" onsubmit="salvarNovoCliente(event)">
      <div class="cfg-row">
        <div class="field-inline"><label>Clínica / Nome *</label><input id="nn-clinica" required placeholder="Nome da clínica"/></div>
        <div class="field-inline"><label>Responsável</label><input id="nn-resp" placeholder="Nome do responsável"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Telefone *</label><input id="nn-tel" required placeholder="(11) 99999-0000"/></div>
        <div class="field-inline"><label>E-mail</label><input type="email" id="nn-email" placeholder="email@clinica.com"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>CPF / CNPJ</label><input id="nn-cpf" placeholder="00.000.000/0001-00"/></div>
        <div class="field-inline"><label>Cargo</label><input id="nn-cargo" placeholder="ex: Gerente"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Cidade</label><input id="nn-cidade"/></div>
        <div class="field-inline"><label>Estado</label><input id="nn-estado" maxlength="2" placeholder="SP"/></div>
      </div>
      <div class="field-inline"><label>Endereço</label><input id="nn-end"/></div>
      <div id="nn-status" class="cfg-status-msg"></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" class="btn-sm btn-accent">Cadastrar</button>
        <button type="button" class="btn-sm" onclick="closeModal()">Cancelar</button>
      </div>
    </form>`);
}

async function salvarNovoCliente(e) {
  e.preventDefault();
  const msg = document.getElementById('nn-status');
  msg.textContent = 'Cadastrando...';
  const params = {
    action:      'cadastrar',
    clinica:     document.getElementById('nn-clinica').value.trim(),
    responsavel: document.getElementById('nn-resp').value.trim(),
    cargo:       document.getElementById('nn-cargo').value.trim(),
    telefone:    document.getElementById('nn-tel').value.trim(),
    email:       document.getElementById('nn-email').value.trim(),
    cpf:         document.getElementById('nn-cpf').value.trim(),
    cidade:      document.getElementById('nn-cidade').value.trim(),
    estado:      document.getElementById('nn-estado').value.trim(),
    endereco:    document.getElementById('nn-end').value.trim(),
  };
  try {
    const url = new URL(SHEETS_URL);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.ok) {
      showToast('Cliente cadastrado!');
      closeModal();
      await loadClientes();
      renderClientes();
    } else if (data.duplicado) {
      const campo = data.duplicado === 'cpf' ? 'CPF/CNPJ' : data.duplicado === 'email' ? 'E-mail' : 'Telefone';
      msg.textContent = `${campo} já cadastrado.`;
      msg.style.color = 'var(--danger)';
    } else {
      msg.textContent = data.erro || 'Erro ao cadastrar';
      msg.style.color = 'var(--danger)';
    }
  } catch(ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

// ── NOVO PRODUTO ───────────────────────────────────────────────────────────────
function abrirNovoProduto() {
  openModal(`
    <div class="modal-header"><span>💊 Novo Produto</span><button onclick="closeModal()">✕</button></div>
    <form class="cfg-form" onsubmit="salvarNovoProduto(event)">
      <div class="cfg-row">
        <div class="field-inline" style="flex:0 0 64px"><label>Ícone</label>
          <input id="np-icone" value="💊" maxlength="4" style="text-align:center;font-size:20px"/></div>
        <div class="field-inline"><label>Nome *</label><input id="np-nome" required placeholder="Nome do produto"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Concentração / Dose</label><input id="np-conc" placeholder="ex: 2mg/mL"/></div>
        <div class="field-inline"><label>Laboratório</label><input id="np-lab" placeholder="ex: Farmácia X"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Preço Base (R$) *</label>
          <input type="number" step="0.01" id="np-preco" required placeholder="0.00"/></div>
        <div class="field-inline"><label>Estoque inicial</label>
          <input type="number" id="np-estoque" value="0" min="0"/></div>
      </div>
      <div class="cfg-row">
        <div class="field-inline"><label>Categoria</label>
          <select id="np-categoria">
            <option value="">— Selecionar —</option>
            ${['emagrecimento','hormonal','performance','bem-estar','antienvelhecimento','outros'].map(c =>
              `<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field-inline"><label>Tags (vírgula)</label>
          <input id="np-tags" placeholder="ex: peptídeo, injetável"/></div>
      </div>

      <div class="var-section">
        <label class="var-toggle-label">
          <input type="checkbox" id="np-tem-variantes" onchange="toggleVariantEditor(this,'np')"/>
          Variantes — doses com preços individuais
        </label>
        <div id="np-variantes-editor" class="variantes-editor hidden">
          <table class="var-table">
            <thead><tr><th>Dose / Conc.</th><th>Preço R$</th><th>Estoque</th><th></th></tr></thead>
            <tbody id="np-var-tbody"></tbody>
          </table>
          <button type="button" class="btn-xs" style="margin-top:6px" onclick="addVariantRow('np')">+ Dose</button>
        </div>
      </div>

      <div id="np-status" class="cfg-status-msg"></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" class="btn-sm btn-accent">Criar Produto</button>
        <button type="button" class="btn-sm" onclick="closeModal()">Cancelar</button>
      </div>
    </form>`);
}

async function salvarNovoProduto(e) {
  e.preventDefault();
  const msg = document.getElementById('np-status');
  msg.textContent = 'Criando...';
  const temVar = document.getElementById('np-tem-variantes')?.checked;
  const params = {
    nome:      document.getElementById('np-nome').value.trim(),
    icone:     document.getElementById('np-icone').value.trim() || '💊',
    conc:      document.getElementById('np-conc').value.trim(),
    lab:       document.getElementById('np-lab').value.trim(),
    preco:     temVar ? '0' : document.getElementById('np-preco').value,
    estoque:   temVar ? '0' : (document.getElementById('np-estoque').value || '0'),
    variantes: temVar ? buildVariantesStr('np') : '',
    categoria: document.getElementById('np-categoria').value,
    tags:      document.getElementById('np-tags').value.trim(),
  };
  try {
    const data = await API.criarProduto(params);
    if (data.ok) {
      showToast(`Produto criado! (ID: ${data.id})`);
      closeModal();
      await loadProdutos();
      renderProdutos();
    } else {
      msg.textContent = data.erro || 'Erro ao criar produto';
      msg.style.color = 'var(--danger)';
    }
  } catch(ex) {
    msg.textContent = 'Erro de conexão';
    msg.style.color = 'var(--danger)';
  }
}

// ── RELATÓRIO ─────────────────────────────────────────────────────────────────
function renderRelatorio() {
  const el = document.getElementById('relatorio-body');
  if (!el) return;
  const d = App.relatorio;
  if (!d) { el.innerHTML = '<div class="empty-msg">Sem dados disponíveis</div>'; return; }

  // ── Filtro client-side completo (independente do redeploy do GAS) ────────────
  const devNomes = new Set(
    App.clientes.filter(c => c.categoria === 'dev').map(c => (c.clinica||'').toLowerCase().trim())
  );
  const topClientes = (d.top_clientes || []).filter(c => !devNomes.has((c.nome||'').toLowerCase().trim()));
  const topProdutos = d.top_produtos || [];

  // Recalcula faturamento excluindo pedidos de devs (App.pedidos tem tudo)
  const PAID_STATUSES = ['Pag. Confirmado','Em Separação','Embalado','Etiqueta Gerada','Enviado','Entregue'];
  const pedReais    = App.pedidos.filter(p => !isDevOrder(p));
  const pagos       = pedReais.filter(p => PAID_STATUSES.includes(p.status));
  const cancelados  = pedReais.filter(p => p.status === 'Cancelado');
  const totalGeral  = pagos.reduce((s, p) => s + (parseFloat(String(p.total||'').replace(',','.')) || 0), 0);
  const nPedidos    = pagos.length;
  const avgTicket   = nPedidos > 0 ? totalGeral / nPedidos : 0;
  const nTodos      = nPedidos + cancelados.length;
  const taxaCancelVal = nTodos > 0 ? (cancelados.length / nTodos * 100).toFixed(1) : '0';
  const taxaCancel  = parseFloat(taxaCancelVal);
  el.innerHTML = `
    <div class="rel-stats">
      <div class="stat-card"><span class="stat-val">${formatMoeda(totalGeral)}</span><span class="stat-lbl">Faturamento Total</span></div>
      <div class="stat-card"><span class="stat-val">${nPedidos}</span><span class="stat-lbl">Pedidos (sem cancel.)</span></div>
      <div class="stat-card"><span class="stat-val">${formatMoeda(avgTicket)}</span><span class="stat-lbl">Ticket Médio</span></div>
      <div class="stat-card${taxaCancel > 10 ? ' stat-alert' : ''}">
        <span class="stat-val">${taxaCancelVal}%</span>
        <span class="stat-lbl">Taxa Cancelamento</span>
      </div>
    </div>
    <div class="rel-row">
      <div class="rel-card rel-wide">
        <h4>Faturamento por Semana</h4>
        <canvas id="chart-semanas" height="60"></canvas>
      </div>
    </div>
    <div class="rel-row">
      <div class="rel-card">
        <h4>Top 5 Clientes</h4>
        <canvas id="chart-clientes" height="100"></canvas>
      </div>
      <div class="rel-card">
        <h4>Top 5 Produtos (qtd vendida)</h4>
        <canvas id="chart-produtos" height="100"></canvas>
      </div>
    </div>
    <div class="rel-row">
      <div class="rel-card" style="max-width:320px">
        <h4>Pedidos por Status</h4>
        <canvas id="chart-status" height="120"></canvas>
      </div>
      <div class="rel-card" style="max-width:320px">
        <h4>Forma de Pagamento</h4>
        <canvas id="chart-pagamento" height="120"></canvas>
      </div>
    </div>
    ${d.por_vendedora && d.por_vendedora.length > 0 ? `
    <div class="rel-row">
      <div class="rel-card rel-wide">
        <h4>Faturamento por Vendedora</h4>
        <canvas id="chart-vendedoras" height="60"></canvas>
      </div>
    </div>` : ''}
  `;

  const chartOpts = { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#7aaccb' }, grid: { color: '#1e3a52' } }, y: { ticks: { color: '#7aaccb' }, grid: { color: '#1e3a52' } } } };
  const horizOpts = { ...chartOpts, indexAxis: 'y' };

  // Destroy old charts
  Object.values(App.charts).forEach(c => c.destroy());
  App.charts = {};

  App.charts.semanas = new Chart(document.getElementById('chart-semanas'), {
    type: 'bar',
    data: {
      labels:   d.semanas.map(s => s.label),
      datasets: [{ data: d.semanas.map(s => s.total), backgroundColor: '#1abc9c', borderRadius: 4 }],
    },
    options: { ...chartOpts, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'R$ ' + ctx.raw.toFixed(2).replace('.',',') } } } },
  });

  App.charts.clientes = new Chart(document.getElementById('chart-clientes'), {
    type: 'bar',
    data: {
      labels:   topClientes.map(c => c.nome.length > 20 ? c.nome.slice(0,18)+'…' : c.nome),
      datasets: [{ data: topClientes.map(c => c.total), backgroundColor: '#3b82f6', borderRadius: 4 }],
    },
    options: { ...horizOpts, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'R$ ' + ctx.raw.toFixed(2).replace('.',',') } } } },
  });

  App.charts.produtos = new Chart(document.getElementById('chart-produtos'), {
    type: 'bar',
    data: {
      labels:   topProdutos.map(p => p.nome.length > 20 ? p.nome.slice(0,18)+'…' : p.nome),
      datasets: [{ data: topProdutos.map(p => p.qtd), backgroundColor: '#8b5cf6', borderRadius: 4 }],
    },
    options: { ...horizOpts, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + ' unid.' } } } },
  });

  const statusCores = { 'Novo':'#6b7280','Pag. Confirmado':'#f59e0b','Em Separação':'#3b82f6','Embalado':'#8b5cf6','Etiqueta Gerada':'#6366f1','Enviado':'#06b6d4','Entregue':'#10b981','Cancelado':'#ef4444' };
  const stLabels = Object.keys(d.por_status);
  App.charts.status = new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: {
      labels:   stLabels,
      datasets: [{ data: stLabels.map(k => d.por_status[k]), backgroundColor: stLabels.map(k => statusCores[k] || '#6b7280'), borderWidth: 0 }],
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#7aaccb', font: { size: 11 } } } } },
  });

  if (d.por_pagamento && Object.keys(d.por_pagamento).length > 0) {
    const pagLabels = Object.keys(d.por_pagamento);
    const pagCores  = ['#1abc9c','#3b82f6','#f59e0b','#8b5cf6','#ef4444'];
    App.charts.pagamento = new Chart(document.getElementById('chart-pagamento'), {
      type: 'doughnut',
      data: {
        labels:   pagLabels,
        datasets: [{ data: pagLabels.map(k => d.por_pagamento[k]), backgroundColor: pagLabels.map((_, i) => pagCores[i % pagCores.length]), borderWidth: 0 }],
      },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#7aaccb', font: { size: 11 } } } } },
    });
  }

  if (d.por_vendedora && d.por_vendedora.length > 0 && document.getElementById('chart-vendedoras')) {
    App.charts.vendedoras = new Chart(document.getElementById('chart-vendedoras'), {
      type: 'bar',
      data: {
        labels:   d.por_vendedora.map(v => v.nome.length > 25 ? v.nome.slice(0,23)+'…' : v.nome),
        datasets: [{ data: d.por_vendedora.map(v => v.total), backgroundColor: '#f59e0b', borderRadius: 4 }],
      },
      options: { ...chartOpts, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'R$ ' + ctx.raw.toFixed(2).replace('.',',') } } } },
    });
  }
}
