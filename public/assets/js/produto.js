/* produto.js — página dedicada de um produto */

(function() {
  'use strict';

  const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const esc     = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtBR   = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Pega ?id=... da URL
  function getProdId() {
    const p = new URLSearchParams(window.location.search);
    return (p.get('id') || '').trim();
  }

  // Carrinho: mesma key/estrutura do pedido.js (lp_cart_v1 com TTL 24h)
  const _CART_KEY = 'lp_cart_v1';
  const _CART_TTL = 24 * 60 * 60 * 1000;
  function getCartStorage() {
    try {
      const raw = localStorage.getItem(_CART_KEY);
      if (!raw) return { cart: {}, selectedVariants: {} };
      const d = JSON.parse(raw);
      if (!d || (Date.now() - d.ts) > _CART_TTL) {
        localStorage.removeItem(_CART_KEY);
        return { cart: {}, selectedVariants: {} };
      }
      return { cart: d.cart || {}, selectedVariants: d.selectedVariants || {} };
    } catch(_) { return { cart: {}, selectedVariants: {} }; }
  }
  function saveCartStorage(state) {
    try {
      if (Object.keys(state.cart).length === 0) {
        localStorage.removeItem(_CART_KEY);
        return;
      }
      localStorage.setItem(_CART_KEY, JSON.stringify({
        cart: state.cart,
        selectedVariants: state.selectedVariants || {},
        ts: Date.now()
      }));
    } catch(_) {}
  }
  function addToCart(prodId, varIdx, qty) {
    const state = getCartStorage();
    const key = (varIdx !== null && varIdx !== undefined) ? `${prodId}__${varIdx}` : prodId;
    state.cart[key] = (parseInt(state.cart[key]) || 0) + (parseInt(qty) || 1);
    if (varIdx !== null && varIdx !== undefined) {
      state.selectedVariants[prodId] = varIdx;
    }
    saveCartStorage(state);
  }

  // Estado da página
  let PRODUTO = null;
  let TODOS   = [];
  let PROTOCOLOS = {};
  let varianteSelecionada = null; // índice ou null

  function isPromoAtiva(p) {
    if (!p || !p.promo_preco || parseFloat(p.promo_preco) <= 0) return false;
    if (!p.promo_fim) return true;
    try {
      const parts = String(p.promo_fim).split(/[\/ :]/);
      const dt = new Date(parts[2], parts[1]-1, parts[0], parts[3]||0, parts[4]||0);
      return dt.getTime() > Date.now();
    } catch(_) { return true; }
  }

  function precoEfetivo(p) {
    if (varianteSelecionada !== null && p.variantes?.[varianteSelecionada]) {
      const v = p.variantes[varianteSelecionada];
      const promo = parseFloat(v.promo_preco) || 0;
      return promo > 0 && isPromoAtiva(p) ? promo : (parseFloat(v.preco) || 0);
    }
    return isPromoAtiva(p) ? parseFloat(p.promo_preco) : parseFloat(p.preco || 0);
  }

  function imagemHTML(p, sizeClass) {
    // Suporta URL completa (Drive — upload pelo admin) OU nome de arquivo legado
    const fotoVal = p.imagem || p.foto || '';
    if (fotoVal) {
      const isUrl = /^https?:\/\//i.test(fotoVal);
      const src   = isUrl ? fotoVal : `assets/img/produtos/${fotoVal}`;
      return `<img src="${escAttr(src)}" alt="${escAttr(p.nome)}" onerror="this.outerHTML='<div class=\\'img-placeholder tone-0\\'><span class=\\'ph-icon\\'>📦</span></div>'"/>`;
    }
    return `<div class="img-placeholder tone-0"><span class="ph-icon">${esc(p.icone || '📦')}</span></div>`;
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  function render() {
    const p = PRODUTO;
    if (!p) {
      document.getElementById('produto-loading').style.display = 'none';
      document.getElementById('produto-erro').style.display    = 'block';
      return;
    }

    // Title & breadcrumb
    document.title = `${p.nome} · ${(typeof CLIENT !== 'undefined' && CLIENT.name) || 'Sua Empresa'}`;
    document.getElementById('bc-produto').textContent  = p.nome;
    document.getElementById('bc-categoria').textContent = p.categoria
      ? p.categoria.charAt(0).toUpperCase() + p.categoria.slice(1)
      : '—';

    // Imagem
    document.getElementById('produto-image-main').innerHTML = imagemHTML(p);

    // Badges
    const badges = [];
    if (p.destaque === 'destaque')     badges.push('<span class="produto-badge badge-destaque">⭐ Destaque</span>');
    if (p.destaque === 'recomendado')  badges.push('<span class="produto-badge badge-recomendado">👍 Recomendado</span>');
    if (isPromoAtiva(p))               badges.push('<span class="produto-badge badge-promo">🔥 Promoção</span>');
    document.getElementById('produto-badges').innerHTML = badges.join('');

    // Lab + nome + conc
    document.getElementById('produto-lab').textContent  = p.lab || '';
    document.getElementById('produto-name').textContent = p.nome || '';
    document.getElementById('produto-conc').textContent = p.conc || '';

    // Variantes
    const variEl = document.getElementById('produto-variantes');
    if (p.variantes && p.variantes.length > 0 && p.variantes[0].dose) {
      variEl.style.display = '';
      const list = p.variantes.map((v, i) => `
        <button type="button" class="produto-variante-btn" data-idx="${i}" onclick="window._selecionarVariante(${i})">
          <span class="produto-variante-dose">${esc(v.dose)}</span>
          <span class="produto-variante-preco">R$ ${fmtBR(v.preco)}</span>
        </button>`).join('');
      document.getElementById('produto-variantes-list').innerHTML = list;
      // Seleciona a primeira por padrão
      window._selecionarVariante(0);
    } else {
      variEl.style.display = 'none';
      varianteSelecionada = null;
      renderPreco();
    }

    // Tags
    const tags = Array.isArray(p.tags) ? p.tags : [];
    document.getElementById('produto-tags').innerHTML = tags
      .map(t => `<span class="produto-tag">${esc(t)}</span>`)
      .join('');

    // Estoque
    const estTotal = p.variantes?.length
      ? p.variantes.reduce((s, v) => s + (parseInt(v.estoque)||0), 0)
      : (parseInt(p.estoque)||0);
    document.getElementById('produto-estoque').textContent = estTotal > 0
      ? `Estoque: ${estTotal} un.`
      : 'Sem estoque no momento';

    document.getElementById('produto-categoria-label').textContent = p.categoria
      ? p.categoria.charAt(0).toUpperCase() + p.categoria.slice(1)
      : 'Sem categoria';

    // Descrição
    const desc = [];
    if (p.lab)  desc.push(`<p><strong>Laboratório:</strong> ${esc(p.lab)}</p>`);
    if (p.conc) desc.push(`<p><strong>Concentração:</strong> ${esc(p.conc)}</p>`);
    if (tags.length) desc.push(`<p><strong>Categorias / tags:</strong> ${tags.map(esc).join(', ')}</p>`);
    desc.push(`<p style="margin-top:14px;color:#4B5563">Produto disponível no catálogo. Selecione a quantidade e adicione ao carrinho.</p>`);
    document.getElementById('produto-descricao-body').innerHTML = desc.join('');

    // Protocolo (se houver)
    const proto = PROTOCOLOS[p.id];
    const protoEl = document.getElementById('produto-protocolo-body');
    if (proto && (proto.mecanismo || proto.dosagem || proto.protocolo1)) {
      const blocos = [];
      if (proto.mecanismo)      blocos.push(`<h3>Mecanismo</h3><p>${esc(proto.mecanismo)}</p>`);
      if (proto.reconstituicao) blocos.push(`<h3>Reconstituição</h3><p>${esc(proto.reconstituicao)}</p>`);
      if (proto.dosagem)        blocos.push(`<h3>Dosagem</h3><p>${esc(proto.dosagem)}</p>`);
      if (proto.protocolo1)     blocos.push(`<h3>Protocolo sugerido</h3><p>${esc(proto.protocolo1)}</p>`);
      if (proto.protocolo2)     blocos.push(`<p>${esc(proto.protocolo2)}</p>`);
      if (proto.protocolo3)     blocos.push(`<p>${esc(proto.protocolo3)}</p>`);
      if (proto.cuidados)       blocos.push(`<h3>Cuidados</h3><p>${esc(proto.cuidados)}</p>`);
      protoEl.innerHTML = blocos.join('');
    } else {
      protoEl.innerHTML = '<div class="produto-tab-empty">Nenhum protocolo cadastrado para este produto.</div>';
    }

    // Mostra UI
    document.getElementById('produto-loading').style.display    = 'none';
    document.getElementById('produto-wrap').style.display       = 'grid';
    document.getElementById('produto-tabs-wrap').style.display  = 'block';

    // Relacionados
    renderRelacionados(p);
  }

  function renderPreco() {
    const p = PRODUTO;
    const block = document.getElementById('produto-price-block');
    const promo = isPromoAtiva(p);
    const preco = precoEfetivo(p);

    let html = '';
    if (promo && p.preco) {
      html += `<div class="produto-price-original">De R$ ${fmtBR(p.preco)}</div>`;
      html += `<div class="produto-price-current promo">R$ ${fmtBR(preco)}`;
      if (p.promo_pct) html += `<span class="produto-promo-desconto">−${p.promo_pct}%</span>`;
      html += `</div>`;
    } else {
      html += `<div class="produto-price-current">R$ ${fmtBR(preco)}</div>`;
    }
    html += `<div class="produto-price-unit">por unidade</div>`;
    block.innerHTML = html;
  }

  window._selecionarVariante = function(idx) {
    varianteSelecionada = idx;
    document.querySelectorAll('.produto-variante-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.idx) === idx);
    });
    renderPreco();
  };

  function renderRelacionados(p) {
    if (!TODOS.length) return;
    // Mesma categoria, exclui o atual, limite 4
    const sameCat = TODOS.filter(x =>
      x.id !== p.id &&
      x.categoria === p.categoria
    ).slice(0, 4);
    // Se não tem mesma categoria suficiente, completa com aleatórios
    const candidatos = sameCat.length >= 4
      ? sameCat
      : sameCat.concat(TODOS.filter(x => x.id !== p.id && !sameCat.some(s => s.id === x.id)).slice(0, 4 - sameCat.length));

    if (candidatos.length === 0) return;
    document.getElementById('produto-relacionados-section').style.display = 'block';
    document.getElementById('produto-relacionados-grid').innerHTML = candidatos.map(r => `
      <a href="produto.html?id=${escAttr(r.id)}" class="rel-card">
        <div class="rel-media">${imagemHTML(r)}</div>
        <div class="rel-nome">${esc(r.nome)}</div>
        <div class="rel-conc">${esc(r.conc || '')}</div>
        <div class="rel-preco">R$ ${fmtBR(r.preco)}</div>
      </a>
    `).join('');
  }

  // ─── ABAS ─────
  window.setTab = function(t) {
    document.querySelectorAll('.produto-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === t)
    );
    document.getElementById('tab-descricao').style.display = t === 'descricao' ? 'block' : 'none';
    document.getElementById('tab-protocolo').style.display = t === 'protocolo' ? 'block' : 'none';
  };

  // ─── QTD ─────
  window.changeQty = function(delta) {
    const inp = document.getElementById('produto-qty');
    let n = parseInt(inp.value) || 1;
    n = Math.max(1, n + delta);
    inp.value = n;
  };

  // ─── ADD CARRINHO ─────
  window.addAoCarrinho = function() {
    if (!PRODUTO) return;
    const qty = Math.max(1, parseInt(document.getElementById('produto-qty').value) || 1);
    addToCart(PRODUTO.id, varianteSelecionada, qty);
    const btn = document.getElementById('produto-btn-add');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Adicionado!';
    btn.disabled = true;
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 1200);
  };

  // ─── LOAD ─────
  async function loadProduto() {
    // Feature flag: se admin desligou a página de produto, volta pro catálogo.
    // Falha silenciosa — se não conseguir checar, abre normalmente.
    try {
      const cfgRes = await fetch(`${SHEETS_URL}?action=get_config_features`);
      const cfg = await cfgRes.json();
      if (cfg && cfg.ok && cfg.flags && cfg.flags.feature_pagina_produto === false) {
        window.location.replace('pedido.html');
        return;
      }
    } catch (e) { /* silencioso */ }

    const id = getProdId();
    if (!id) {
      document.getElementById('produto-loading').style.display = 'none';
      document.getElementById('produto-erro').style.display    = 'block';
      return;
    }

    try {
      const [resProd, resProto] = await Promise.all([
        fetch(`${SHEETS_URL}?action=produtos`),
        fetch(`${SHEETS_URL}?action=protocolos`),
      ]);
      const data  = await resProd.json();
      const protos = await resProto.json().catch(() => ({}));

      if (!Array.isArray(data)) throw new Error('Lista de produtos inválida');
      TODOS = data;
      PROTOCOLOS = protos || {};

      // Pega protocolo por ID
      if (Array.isArray(PROTOCOLOS)) {
        // se vier como array, transforma em map
        const m = {};
        PROTOCOLOS.forEach(p => { if (p.id || p['ID Produto']) m[p.id || p['ID Produto']] = p; });
        PROTOCOLOS = m;
      }

      PRODUTO = data.find(p => String(p.id) === String(id));
      render();
    } catch(err) {
      console.error('[Produto] Erro:', err);
      document.getElementById('produto-loading').style.display = 'none';
      document.getElementById('produto-erro').style.display    = 'block';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProduto);
  } else {
    loadProduto();
  }
})();
