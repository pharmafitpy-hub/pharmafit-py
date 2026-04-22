# PharmaFit B2B — Guia de Uso

Sistema de pedidos B2B para clínicas parceiras.

---

## Páginas

| Página | Acesso | Função |
|---|---|---|
| `index.html` | Público | Catálogo de produtos com estoque e preços |
| `pedido_pharmafit.html` | Público | Formulário de pedido (4 passos) |
| `vendedores.html` | PIN + login | Área das vendedoras |
| `gerador_pedido.html` | Interno | Gerador de pedido manual pela equipe |
| `catalogo_interno.html` | Interno | Catálogo interno |

---

## Como fazer um pedido (`pedido_pharmafit.html`)

1. **Produtos** — adicione itens ao carrinho (dose, quantidade)
2. **Dados** — informe nome, clínica, CPF/CNPJ, telefone, endereço
3. **Pagamento** — escolha forma de pagamento, parcelas e frete
   - Insira o cupom (se tiver) para aplicar desconto, parcelamento sem juros ou frete grátis
4. **Revisão** — confira o resumo e clique em **Enviar pedido via WhatsApp**

O pedido é enviado via WhatsApp e registrado automaticamente na planilha.

---

## Área das Vendedoras (`vendedores.html`)

### Primeiro acesso
1. Informe o **PIN** fornecido pela equipe
2. Clique em **Criar conta** e preencha: nome, e-mail, senha e data de nascimento
3. Faça login com e-mail e senha

### Criar cupom
- Defina código, tipo (% ou preço fixo), validade e produtos
- Opcional: ativar **parcelamento 1×–3× sem juros** e/ou **frete grátis acima de R$ X**
- Validade **Indeterminada** mantém o cupom ativo indefinidamente

### Histórico
- Veja todos os pedidos que usaram seus cupons
- Totais de vendas e descontos aplicados

### Recuperação de senha
Na tela de login → **Esqueci minha senha** → informe e-mail + data de nascimento → redefine sem suporte.

---

## Cupons — como funcionam

| Tipo | Comportamento |
|---|---|
<<<<<<< HEAD
| `%` | Desconto percentual sobre o total |
| `fixo` | Preço fixo por produto específico |
| Parcelamento | Libera 1×–3× sem juros no cartão |
| Frete grátis | Frete zerado para pedidos acima do valor definido |
=======
| `index.html` | Catálogo de produtos |
| `pedido_pharmafit.html` | Formulário de pedido (4 passos) |
| `gerador_pedido.html` | Gerador interno de pedidos (uso da equipe) |
| `vendedores.html` | Área das vendedoras — criar cupons, histórico |
| `catalogo_interno.html` | Catálogo interno |
| `informativos/` | Páginas HTML de protocolo por produto |
>>>>>>> 6825e99a1e822947e190c49260ddde4c30118780

---

## Deploy

Push para `main` → GitHub Actions injeta `SHEETS_URL` e publica no GitHub Pages.

**Secret necessário:**  
Repositório → Settings → Secrets → Actions → `SHEETS_URL` = URL do Web App do GAS.
