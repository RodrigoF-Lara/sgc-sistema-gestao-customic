# SGC — Sistema de Gestão Customic — Instruções para AI

> **Última atualização:** 21/05/2026 • Refatoração Fase 1 concluída.
> Sempre que algo mudar (estrutura, padrão, endpoint, tabela), atualize **este arquivo
> e os documentos da seção [Documentação Viva](#-documentação-viva)** no MESMO commit.

---

## Visão Geral

Plataforma web modular para gestão industrial. Hoje em produção: **Módulo Embalagem**
(Requisições, Kardex, NF, Inventário Cíclico, Relatórios). Em desenvolvimento:
**Módulo Produção** (PCP, Ordens, Apontamentos, MES, Expedição, OEE).

- **Frontend:** Vanilla JS/HTML/CSS, páginas `.html` independentes, layout/sidebar carregado por [shared/frontend/layout.js](../shared/frontend/layout.js)
- **Backend:** Node.js serverless (Vercel), handlers em `api/{escopo}/*.js` no padrão `export default async function handler(req, res)`
- **DB:** SQL Server via `mssql`, pool em [db.js](../db.js) (raiz)
- **Deploy:** Vercel (sem `vercel.json` — auto-detect)

---

## Estrutura de Pastas (REAL — pós Fase 1)

```
requisicoes/
├── db.js                       ← pool SQL (raiz, importado por todas as APIs)
├── index.html                  ← login (raiz por Vercel routing)
├── menu.html                   ← hub principal (raiz)
├── ARCHITECTURE.md             ← documento mestre
│
├── shared/                     ← código transversal a todos os módulos
│   ├── frontend/               ← layout.js, menu-lateral.html, style.css, script.js, fundos.js
│   ├── cadastros/              ← cadastroUsuarios/Fornecedores/Produtos + cadastros.html
│   └── config/                 ← configuracoes.html, configNotificacoes.{html,js}
│
├── modules/
│   ├── embalagem/              ← módulo em produção
│   │   ├── requisicoes/        ← novaRequisicao, requisicoes, consulta, detalhes
│   │   ├── kardex/             ← estoque, consumoMedio, saidaRapida, inventoryManagement
│   │   ├── nf/                 ← lancamentoNF, statusNF
│   │   ├── inventario/         ← inventarioCiclico, configInventario
│   │   ├── saving/             ← savingCompras (metas de redução curva A)
│   │   └── relatorios/         ← relatorio* (todos)
│   └── producao/               ← em desenvolvimento (somente README)
│
├── api/
│   ├── shared/                 ← auth, cadastros, config, fundos, notificacoes, listaTabelas
│   └── embalagem/              ← requisicao, inventory, lancamentoNF, statusNF, inventarioCiclico, relatorios (inclui saving via `?acao=saving*`)
│
└── sql/
    ├── shared/
    └── embalagem/
```

**Regra de ouro:** módulos NUNCA se importam entre si. Compartilhamento sempre via
`shared/` ou `api/shared/`.

---

## Padrões Críticos

- **API:** um handler por endpoint, `switch (req.method)` para GET/POST/PUT/DELETE
- **Import do db.js a partir de `api/{escopo}/`:** `require('../../db.js')`
- **DB queries:** sempre parametrizadas — `.input('param', sql.Type, value)`. Nunca concatenação
- **Transações:** `pool.transaction()` para operações multi-etapa
- **Frontend:** scripts em arquivos `.js` separados (não inline), comunicação via `fetch('/api/{escopo}/{recurso}')`
- **Estado:** `localStorage` para `userName` e dados temporários
- **CSV upload:** PapaParse via CDN, formato `CODIGO,QNT_REQ`
- **Encoding:** TODOS os arquivos source em **UTF-8**. NUNCA usar `Set-Content`/`Add-Content`
  do PowerShell 5.1 em arquivos existentes — ele corrompe UTF-8 para cp1252. Sempre
  usar ferramentas de edição do agente (`replace_string_in_file`, `create_file`).

---

## Sidebar / Navegação

[shared/frontend/menu-lateral.html](../shared/frontend/menu-lateral.html) organiza tudo em
**3 módulos top-level colapsáveis** (Embalagens, Produção, Geral). Suporta acordeões
**aninhados** (ex: Embalagens > Operações > Requisições). Lógica em
[shared/frontend/layout.js](../shared/frontend/layout.js) — usa seletores `>` (filho direto)
nas regras CSS de `.nav-group.open` para isolar grupos aninhados.

Ao adicionar página nova, mapeie o `idMap` em `layout.js` (linhas ~50-75) para que o
item ativo seja destacado automaticamente.

---

## Fluxos de Dados Principais

- **Requisição:** Upload CSV → `POST /api/embalagem/requisicao` (action: `createHeader` → `uploadItems`)
- **Inventário Cíclico:** 5 blocos (1-3 = maior valor; 4 = maior custo unitário; 5 = não contados recentemente). Config em `TB_CONFIG_INVENTARIO`
- **Kardex:** `KARDEX_2026` é a fonte de saldo/movimentação (versionada por ano)
- **NF:** `lancamentoNF` → `TB_LOG_NF`; `statusNF` faz bipagem contra `TB_STATUS_NF`

---

## Tabelas-Chave

| Tabela | Módulo | Função |
|---|---|---|
| `TB_REQUISICOES` / `TB_REQ_ITEM` | Embalagem | Cabeçalho/itens de requisições |
| `KARDEX_2026` | Embalagem | Movimentações e saldos |
| `TB_INVENTARIO_CICLICO_LOG` / `_ITEM` | Embalagem | Logs e itens de inventário |
| `TB_CONFIG_INVENTARIO` | Embalagem | Quantidades por bloco 1-5 |
| `TB_LOG_NF` / `TB_STATUS_NF` | Embalagem | Lançamento e bipagem de NFs |
| `TB_SAVING_META` | Embalagem | Metas de redução de custo % por item e mês-âncora |
| `TB_USUARIOS` | Shared | Login |
| `CAD_FORNECEDOR` / `TB_PRODUTOS` | Shared | Cadastros |
| `TB_NOTIFICACOES` | Shared | Notificações |

Schema completo em `/memories/repo/database-schema.md`.

---

## Fluxo de Trabalho Obrigatório do Agente

1. **Edição direta e autônoma:** aplicar mudanças nos arquivos sem pedir confirmação prévia.
2. **Antes de `git commit`, executar o Checklist de Documentação abaixo.**
   Se algum item dispara, **incluir os docs no MESMO commit.** Documentação desatualizada é bug.
3. **Commit e push automáticos** após sucesso, com mensagem descritiva (`feat:`, `fix:`,
   `refactor:`, `docs:`, `style:`, `chore:`).
4. **Foco na execução:** minimizar interações; usar ferramentas em paralelo quando independentes.

### ⚠️ Checklist de Documentação (rodar mentalmente antes de TODO commit)

| Se a mudança envolveu… | Atualizar OBRIGATORIAMENTE |
|---|---|
| Criar/mover/renomear/**deletar** arquivo ou pasta | [ARCHITECTURE.md](../ARCHITECTURE.md) (seção Estrutura) + este arquivo (seção Estrutura) |
| Novo endpoint `api/{escopo}/*` | [modules/{escopo}/README.md](../modules/embalagem/README.md) (tabela Endpoints) |
| Nova página HTML | [modules/{escopo}/README.md](../modules/embalagem/README.md) (Estrutura) + `idMap` em [layout.js](../shared/frontend/layout.js) |
| Nova tabela ou coluna SQL | `/memories/repo/database-schema.md` + README do módulo |
| Mudança em sidebar, layout, autenticação, CSS global, encoding, padrão de import | [shared/README.md](../shared/README.md) + este arquivo |
| Mudança de fluxo de negócio (NF, requisição, inventário, kardex) | README do módulo (seção Fluxos) + possivelmente CHANGELOG |
| Remoção de subprojeto, módulo ou feature | Remover referências em TODOS os READMEs + ARCHITECTURE |

**Frase-gatilho:** antes de digitar `git commit`, pergunte:
*"qual item do checklist essa mudança dispara?"* — se a resposta for vazio E o diff toca código (não só doc), provavelmente está faltando algo.

### Adicionar novo endpoint

1. Identificar módulo dono (`shared`, `embalagem` ou `producao`).
2. Criar `api/{escopo}/{nome}.js` com `export default async function handler`.
3. Importar pool: `const { getConnection } = require('../../db.js')`.
4. Frontend chama via `fetch('/api/{escopo}/{nome}')`.
5. Atualizar README do módulo (tabela "Endpoints da API").

### Adicionar nova página

1. Criar em `modules/{modulo}/{categoria}/{nome}.{html,js}` ou `shared/{categoria}/`.
2. Adicionar link em [shared/frontend/menu-lateral.html](../shared/frontend/menu-lateral.html) (no acordeão correto).
3. Mapear `idMap` em [shared/frontend/layout.js](../shared/frontend/layout.js).
4. Atualizar README do módulo (seção "Mapa de Telas").

---

## 📚 Documentação Viva

| Documento | Escopo | Atualizar quando |
|---|---|---|
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Arquitetura geral, mermaid, roadmap | Mudanças estruturais, novos módulos, novos padrões |
| `.github/copilot-instructions.md` (este) | Onboarding rápido do agente | Mudou estrutura, padrão de import, fluxo de trabalho |
| [modules/embalagem/README.md](../modules/embalagem/README.md) | Endpoints, telas, tabelas do módulo | Novo endpoint, nova tela, nova tabela |
| [modules/producao/README.md](../modules/producao/README.md) | Plano e progresso do módulo | A cada feature do módulo produção |
| [shared/README.md](../shared/README.md) | O que vive em shared/ e quem usa | Novo recurso compartilhado |
| [sql/README.md](../sql/README.md) | Catálogo de scripts SQL | Novo script SQL |
| `/memories/repo/database-schema.md` | Schema completo das tabelas | Nova coluna, nova tabela, nova FK |
| `CHANGELOG_*.md` | Decisões pontuais relevantes | Mudança de lógica de negócio relevante |

**Caminhos rápidos:**
- Pool SQL: [db.js](../db.js)
- Padrão de API: [api/embalagem/requisicao.js](../api/embalagem/requisicao.js)
- Sidebar / accordion: [shared/frontend/menu-lateral.html](../shared/frontend/menu-lateral.html) + [shared/frontend/layout.js](../shared/frontend/layout.js)
- Estilos: [shared/frontend/style.css](../shared/frontend/style.css)
- Login: [index.html](../index.html) + [api/shared/auth.js](../api/shared/auth.js)
- Hub principal: [menu.html](../menu.html)
