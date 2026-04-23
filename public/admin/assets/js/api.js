/* api.js — Wrapper GAS para o Admin Panel */

const API = {
  async call(params) {
    const admin = window.App?.admin;
    if (admin) {
      if (!params.email) params.email = admin.email;
      if (!params.token) params.token = admin.token;
    }
    const url = new URL(SHEETS_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  pedidos:      ()               => API.call({ action: 'painel_pedidos' }),
  estatisticas: ()               => API.call({ action: 'estatisticas' }),
  clientes:     ()               => API.call({ action: 'clientes' }),
  produtos:     ()               => API.call({ action: 'produtos' }),

  atualizarStatus: (id, status, extra = {}) =>
    API.call({ action: 'atualizar_status', id, status, ...extra }),

  adicionarRastreio: (id, codigo) =>
    API.call({ action: 'add_rastreio', id, codigo }),

  atualizarProduto: (prod_id, campo, valor) =>
    API.call({ action: 'atualizar_produto', prod_id, campo, valor }),
};
