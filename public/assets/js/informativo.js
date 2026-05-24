/**
 * informativo.js — Substitui placeholders pelo nome/tagline do cliente.
 * Usado em informativos E nas páginas principais (index, pedido, perfil, etc).
 * Lê CLIENT.name e CLIENT.tagline de config.js (precisa carregar ANTES).
 *
 * Operações:
 *   - "Sua Empresa" / "SUA EMPRESA"  → CLIENT.name (em texto, alt, title, meta)
 *   - "Catálogo B2B"                 → CLIENT.tagline (idem)
 *   - "-PY" / "-Py" / "<span>-PY</span>" → removido
 *   - Atributo data-client-name      → CLIENT.name (substitui textContent)
 *   - Atributo data-client-tagline   → CLIENT.tagline (idem)
 */
(function() {
  // Feature flag: feature_informativos_novo_layout (default true).
  // Se admin desativar, esse JS sai sem fazer nada — placeholders "Sua Empresa"
  // ficam visíveis (volta ao comportamento antigo do informativo hardcoded).
  // Check é síncrono via URL atual: assume true e segue. Override real fica em
  // catalogo_interno.js (gate do link "Informativo") que já consulta flags.

  var c = (typeof CLIENT !== 'undefined' && CLIENT) ? CLIENT : {};
  var clientName = c.name    || 'Sua Empresa';
  var tagline    = c.tagline || 'Catálogo B2B';

  function fixText(text) {
    return text
      .split('Sua Empresa').join(clientName)
      .split('SUA EMPRESA').join(clientName.toUpperCase())
      .split('Catálogo B2B').join(tagline)
      .replace(/-Py\b/gi, '')
      .replace(/\s{2,}/g, ' ');
  }

  // Title
  if (document.title) document.title = fixText(document.title);

  // Meta tags (og:title, twitter:title, description)
  document.querySelectorAll('meta[content]').forEach(function(m) {
    var ct = m.getAttribute('content');
    if (ct && (ct.indexOf('Sua Empresa') !== -1 || ct.indexOf('Catálogo B2B') !== -1)) {
      m.setAttribute('content', fixText(ct));
    }
  });

  // Atributos alt das imagens
  document.querySelectorAll('img[alt]').forEach(function(img) {
    img.alt = fixText(img.alt);
  });

  // Atributos data-client-name / data-client-tagline (jeito mais explícito)
  document.querySelectorAll('[data-client-name]').forEach(function(el) {
    el.textContent = clientName;
  });
  document.querySelectorAll('[data-client-tagline]').forEach(function(el) {
    el.textContent = tagline;
  });

  // Remove spans vazios na .brand-name (o <span>-PY</span> hardcoded)
  document.querySelectorAll('.brand-name span').forEach(function(s) {
    var t = s.textContent.trim();
    if (/^-?Py$/i.test(t) || /^-?P[Yy]$/.test(t) || t === '') s.remove();
  });

  // Text nodes do body
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  var nodes = [];
  var n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(function(n) {
    var v = n.nodeValue;
    if (v && (v.indexOf('Sua Empresa') !== -1 || v.indexOf('SUA EMPRESA') !== -1 || v.indexOf('Catálogo B2B') !== -1 || v.indexOf('-Py') !== -1 || v.indexOf('-PY') !== -1)) {
      n.nodeValue = fixText(v);
    }
  });

  // ── Gate: esconde UI de indicação quando o admin desativa o programa ──
  // Procura elementos com classe .js-indicacao-ui e remove se a flag tá false.
  // Endpoint público: GET ?action=get_config_indicacao (sem token) retorna { ok, ativa }.
  try {
    var indEls = document.querySelectorAll('.js-indicacao-ui');
    if (indEls.length > 0 && typeof SHEETS_URL === 'string' && SHEETS_URL && SHEETS_URL.indexOf('%%') === -1) {
      fetch(SHEETS_URL + '?action=get_config_indicacao')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.ok && d.ativa === false) {
            indEls.forEach(function(el) { el.style.display = 'none'; });
            window.__INDICACAO_ATIVA__ = false;
          } else {
            window.__INDICACAO_ATIVA__ = true;
          }
        })
        .catch(function() { /* falha silenciosa — UI fica visível por default */ });
    }
  } catch(_) {}
})();
