/* painel.js — PharmaFit Admin Panel */

// ── STATE ─────────────────────────────────────────────────────────────────────
window.App = {
  admin:         null,
  pedidos:       [],
  clientes:      [],
  produtos:      [],
  stats:         {},
  admins:        [],
  view:          'kanban',
  drawerOrderId: null,
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
function renderKanban() {
  renderStats();
  const q          = (document.getElementById('kanban-search')?.value || '').toLowerCase().trim();
  const allPedidos = q
    ? App.pedidos.filter(p =>
        (p.clinica   || '').toLowerCase().includes(q) ||
        (p.produtos  || '').toLowerCase().includes(q) ||
        (p.telefone  || '').includes(q) ||
        (p.data      || '').includes(q))
    : App.pedidos;

  const cancelados = allPedidos.filter(p => p.status === 'Cancelado');
  const board      = document.getElementById('kanban-board');

  board.innerHTML = STAGES.map(stage => {
    const orders = allPedidos.filter(p => p.status === stage.key);
    return `
      <div class="kanban-col">
        <div class="col-header" style="--col-color:${stage.color}">
          <span>${stage.label}</span>
          <span class="col-badge">${orders.length}</span>
        </div>
        <div class="col-body">
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
}

function renderCard(order) {
  const stuck   = isStuck(order);
  const prods   = (order.produtos || '').split('\n').filter(Boolean);
  const preview = prods[0] ? prods[0].replace(/^\d+x\s*/, '') : '—';
  const extras  = prods.length > 1
    ? `<div class="card-extras">+ ${prods.length - 1} item${prods.length > 2 ? 's' : ''}</div>` : '';
  const next  = NEXT_STATUS[order.status];
  const tempo = timeAgo(order.dataStatus || order.data);
  const nextLabel = next
    ? next.replace('Pag. Confirmado','Confirmar Pag.').replace('Etiqueta Gerada','Gerar Etiqueta')
    : '';

  return `
    <div class="kanban-card${stuck ? ' card-stuck' : ''}" onclick="openDrawer(${order.id})">
      ${stuck ? '<div class="stuck-badge">⚠️ +24h</div>' : ''}
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

  try {
    await API.atualizarStatus(orderId, nextStatus, extra);
    await loadPedidos();
    renderKanban();
    if (App.drawerOrderId === orderId) {
      const upd = App.pedidos.find(p => p.id === orderId);
      if (upd) renderDrawer(upd);
    }
    showToast(`→ ${nextStatus}`);
  } catch (e) {
    showToast('Erro ao atualizar status', 'error');
  }
}

async function cancelarPedido(orderId) {
  if (!confirm('Cancelar este pedido?')) return;
  try {
    await API.atualizarStatus(orderId, 'Cancelado');
    await loadPedidos();
    closeDrawer();
    renderKanban();
    showToast('Pedido cancelado');
  } catch (e) {
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
  const stage = STAGES.find(s => s.key === order.status);
  const next  = NEXT_STATUS[order.status];
  const sc    = stage ? stage.color : '#6b7280';
  const stuck = isStuck(order);
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
          ${stuck ? '<span class="drawer-stuck-badge">⚠️ Parado +24h</span>' : ''}
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

  tbody.innerHTML = lista.length === 0
    ? `<tr><td colspan="5" class="empty-msg">Nenhum cliente encontrado</td></tr>`
    : lista.map(c => `
      <tr>
        <td><strong>${esc(c.clinica)}</strong></td>
        <td>${esc(c.responsavel || '—')}</td>
        <td>${esc(c.telefone || '—')}</td>
        <td>${esc(c.cidade || '—')}${c.estado ? ' — ' + esc(c.estado) : ''}</td>
        <td>
          ${c.telefone
            ? `<a href="https://wa.me/55${c.telefone.replace(/\D/g,'')}" target="_blank" class="btn-xs">WhatsApp</a>`
            : '—'}
        </td>
      </tr>`).join('');
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
    ? `<tr><td colspan="5" class="empty-msg">Nenhum produto encontrado</td></tr>`
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
