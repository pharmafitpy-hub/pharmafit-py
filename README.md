# PharmaFit B2B — Guia da Planilha

Sistema de pedidos e cupons para clínicas parceiras. Backend em Google Apps Script + frontend estático no GitHub Pages.

---

## Estrutura de arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Catálogo de produtos |
| `pedido_pharmafit.html` | Formulário de pedido (4 passos) |
| `gerador_pedido.html` | Gerador interno de pedidos (uso da equipe) |
| `vendedores.html` | Área das vendedoras — criar cupons, histórico |
| `catalogo_interno.html` | Catálogo interno |
| `informativos/` | Páginas HTML de protocolo por produto |

---

## Deploy

Push para `main` → GitHub Actions injeta `SHEETS_URL` (via Secret) e publica no GitHub Pages automaticamente.

**Configurar o Secret:**  
Repositório → Settings → Secrets and variables → Actions → `SHEETS_URL` = URL do Web App do GAS.

---

## Abas da planilha

| Aba | O que controla |
|---|---|
| **Produtos** | Catálogo — nome, preço, estoque, variantes, promoções |
| **Pedidos** | Registro automático de cada pedido |
| **Protocolos** | Informações técnicas dos produtos |
| **Cupons** | Códigos de desconto criados pelas vendedoras |
| **Parcelas** | Opções de parcelamento e juros |
| **Vendedoras** | Contas das vendedoras (criada automaticamente pelo GAS) |
| **Clinicas** | Cadastro de clínicas (criada automaticamente pelo GAS) |
| **Config** | Configurações gerais — PIN de acesso |

---

## Aba Produtos — colunas

| Col. | Campo | Tipo | Exemplo |
|---|---|---|---|
| A | ID | texto único | `tirz_usa` |
| B | Ícone | emoji | 💉 |
| C | Nome | texto | Tirzepatida |
| D | Concentração / Lab | texto | USA Peptides |
| E | Preço (R$) | número | 450 |
| F | Estoque | número | 49 |
| G | Tags | texto, vírgulas | `glp1,emagrecimento` |
| H | Ativo | SIM / TRUE | SIM |
| I | Laboratório | texto | USA Peptides |
| J | Variantes | formato especial | `30mg:150:50 \| 40mg:200:30` |
| K | Promo Preço (R$) | número | 99 |
| L | Promo Início | data/hora | `01/04/2026 08:00` |
| M | Promo Fim | data/hora | `30/04/2026 23:59` |
| N | Promo % | número 0–100 | 10 |

> **Ativo** deve ser `SIM` ou `TRUE`. Em branco ou `NÃO` oculta o produto.  
> **ID** deve ser único, sem espaços. Não altere após criado — é usado para rastrear estoque.

---

## Variantes (doses múltiplas) — coluna J

Formato: `Dose:Preço:Estoque:PrecoPromo` — variantes separadas por ` | `

```
30mg:150:50:135 | 40mg:200:30:0 | 120mg:300:10:270
```

- **PrecoPromo** é opcional — use `0` se não houver promoção nessa dose
- Use `999` no estoque para "ilimitado"
- Se a coluna J estiver preenchida, as colunas E e F são ignoradas

---

## Promoções

**Tipo 1 — Preço fixo (coluna K):** preencha K com o preço promocional + datas em L e M.  
**Tipo 2 — Desconto % (coluna N):** preencha N com o percentual + datas em L e M.  
**Tipo 3 — Por variante:** 4º campo dentro da coluna J (datas em L e M ainda controlam).

Formato de data: `DD/MM/AAAA HH:MM` (ex: `30/04/2026 23:59`)

Para desativar antes da hora: apague M ou coloque uma data no passado.

---

## Aba Cupons

| Col. | Campo | Descrição |
|---|---|---|
| A | Codigo | Código que a vendedora/cliente digita — ex: `ANA20` |
| B | Tipo | `%` para percentual ou `fixo` para preço fixo por produto |
| C | Valor | Percentual (ex: `20`) ou identificador |
| D | Produtos | `todos` ou IDs separados por vírgula |
| E | Precos | JSON com preços fixos por produto ID |
| F | Validade | Data `YYYY-MM-DD` ou `INDETERMINADO` |
| G | EmailVendedora | E-mail da vendedora que criou |
| H | Parcelamento | `SIM` para ativar 1×–3× sem juros |
| I | FreteGratisAcima | Valor mínimo para frete grátis (ex: `5000`) |
| J | Ativo | `SIM` ativo, `NAO` deletado |

> Cupons são criados pelas vendedoras via `vendedores.html`. Não é necessário criar manualmente.

---

## Aba Parcelas

| Col. | Campo | Descrição |
|---|---|---|
| A | Parcelas | Número de parcelas (ex: `3`, `6`, `12`) |
| B | Juros % | Use `0` para sem juros |

Exemplo:
```
1  | 0    → 1x sem juros
3  | 0    → 3x sem juros
6  | 5    → 6x com 5% juros
12 | 10   → 12x com 10% juros
```

---

## Aba Config

| A (chave) | B (valor) |
|---|---|
| `pin` | PIN de 4–8 dígitos para acessar `vendedores.html` |

---

## Estoque

O estoque é decrementado automaticamente a cada pedido enviado via `action=decrementar_estoque`.  
Para repor: edite a coluna F (produtos simples) ou o 3º campo da coluna J (variantes).

Indicadores no formulário:
- ✅ `> 10 un.` — normal
- ⚡ `1–10 un.` — últimas unidades
- ⚠️ `0 un.` — produto bloqueado (não adiciona ao carrinho)

---

## Vendedoras — como funciona

1. Vendedora acessa `vendedores.html` → PIN de acesso
2. Cria conta com nome, data de nascimento, e-mail e senha
3. Cria cupons com % de desconto ou preço fixo por produto
4. Pode ver histórico de pedidos que usaram seus cupons e gerenciar cupons ativos

**Recuperação de senha:** e-mail + data de nascimento → redefine sem precisar do suporte.

---

## Google Apps Script — atualizar após mudanças no Code.gs

1. Abrir a planilha → Extensões → Apps Script
2. Substituir todo o conteúdo por `Code.gs`
3. Implantar → Gerenciar implantações → Nova versão → Implantar
4. Copiar a nova URL e atualizar o Secret `SHEETS_URL` no GitHub (se mudou)

> Mudanças de conteúdo (preços, estoque, promoções) **não exigem** reimplantação — recarregar a página já reflete.
