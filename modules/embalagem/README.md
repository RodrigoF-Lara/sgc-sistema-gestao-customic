# Módulo Embalagem 📦

> Setor de Embalagem — Requisições, Kardex, Notas Fiscais, Inventário e Relatórios.
> Módulo original do SGC, em produção.
>
> **Última atualização:** 21/05/2026 (pós-Fase 1 da refatoração)

---

## 1. Escopo

- 📝 **Requisições de material** com upload por CSV
- 📦 **Kardex** (movimentação e saldo de estoque)
- 🧾 **Notas Fiscais** (lançamento e status)
- 📋 **Inventário Cíclico** com 5 blocos de prioridade
- 📊 **Relatórios** gerenciais
- ⚡ **Saída Rápida** via QR Code
- 💰 **Saving de Compras** — metas de redução de custo para itens curva A

---

## 2. Estrutura de Arquivos

```
modules/embalagem/
├── requisicoes/   novaRequisicao, requisicoes, consulta, detalhes
├── kardex/        estoque, consumoMedio, saidaRapida, inventoryManagement
├── nf/            lancamentoNF, statusNF (+ statusNF-page.js, NF.frm/frx)
├── inventario/    inventarioCiclico, configInventario
├── saving/        savingCompras (planejamento + indicador planejado x realizado)
└── relatorios/    relatorios, relatorioRequisicoes, relatorioBaixaPorPeriodo,
                   relatorioSaldo, relatorioAcuracidade, relatorioMovimentoDiario
```

---

## 3. Endpoints da API

### Específicos do módulo (`/api/embalagem/`)

| Endpoint | Métodos | Arquivo | Função |
|----------|---------|---------|--------|
| `/api/embalagem/requisicao` | GET, POST, PUT | [api/embalagem/requisicao.js](../../api/embalagem/requisicao.js) | CRUD de requisições + upload CSV |
| `/api/embalagem/inventory` | GET, POST | [api/embalagem/inventory.js](../../api/embalagem/inventory.js) | Movimentações Kardex e saldos |
| `/api/embalagem/lancamentoNF` | GET, POST, PUT | [api/embalagem/lancamentoNF.js](../../api/embalagem/lancamentoNF.js) | Lançamento de notas fiscais |
| `/api/embalagem/statusNF` | GET, POST | [api/embalagem/statusNF.js](../../api/embalagem/statusNF.js) | Status e bipagem de NFs |
| `/api/embalagem/inventarioCiclico` | GET, POST, PUT | [api/embalagem/inventarioCiclico.js](../../api/embalagem/inventarioCiclico.js) | Logs e blocos de inventário |
| `/api/embalagem/relatorios` | GET, POST, DELETE | [api/embalagem/relatorios.js](../../api/embalagem/relatorios.js) | Relatórios consolidados + Saving de Compras (`?acao=savingList`, `savingIndicador`, `savingSaveMetasBatch`, `savingSaveMeta`, `savingDeleteMeta`) |

### Compartilhados (`/api/shared/`)

| Endpoint | Função |
|----------|--------|
| `/api/shared/auth` | Login |
| `/api/shared/cadastros` | Produtos, fornecedores, usuários |
| `/api/shared/config` | Configurações gerais e de inventário |
| `/api/shared/notificacoes` | Notificações |
| `/api/shared/fundos` | Imagens de fundo |
| `/api/shared/listaTabelas` | Diagnóstico SQL |

---

## 4. Tabelas SQL

### Específicas do módulo

| Tabela | Descrição |
|--------|-----------|
| `TB_REQUISICOES` | Cabeçalho das requisições |
| `TB_REQ_ITEM` | Itens das requisições |
| `KARDEX_2026` | Movimentações e saldos de estoque (versionada por ano) |
| `TB_INVENTARIO_CICLICO_LOG` | Histórico de contagens |
| `TB_INVENTARIO_CICLICO_ITEM` | Itens contados |
| `TB_CONFIG_INVENTARIO` | Quantidades por bloco (1–5) |
| `TB_LOG_NF` | Notas fiscais lançadas |
| `TB_STATUS_NF` | Status e bipagem |
| `TB_SAVING_META` | Metas de redução de custo (%) por item e mês-âncora |

### Compartilhadas

| Tabela | Uso |
|--------|-----|
| `TB_USUARIOS` | Login e permissões |
| `CAD_FORNECEDOR` | Cadastro de fornecedores |
| `TB_PRODUTOS` | Cadastro de produtos |
| `TB_NOTIFICACOES` | Sistema de notificações |

> Schema completo: `/memories/repo/database-schema.md`.

---

## 5. Fluxos Principais

### Requisição (Upload CSV)

```mermaid
sequenceDiagram
    participant U as Usuário
    participant FE as novaRequisicao.html
    participant API as /api/embalagem/requisicao
    participant DB as SQL Server

    U->>FE: Seleciona CSV (CODIGO, QNT_REQ)
    FE->>FE: PapaParse parseia CSV
    U->>FE: Clica "Criar Requisição"
    FE->>API: POST { action: 'createHeader', ... }
    API->>DB: INSERT TB_REQUISICOES
    DB-->>API: id_requisicao
    API-->>FE: { id }
    FE->>API: POST { action: 'uploadItems', items, id }
    API->>DB: BULK INSERT TB_REQ_ITEM (transação)
    DB-->>API: OK
    API-->>FE: sucesso
```

### Inventário Cíclico (5 Blocos)

```mermaid
flowchart LR
    Start[Início] --> B1[Bloco 1 - Maior valor total]
    Start --> B2[Bloco 2 - Maior valor total]
    Start --> B3[Bloco 3 - Maior valor total]
    Start --> B4[Bloco 4 - Maior custo unitário]
    Start --> B5[Bloco 5 - Não contados recentemente]
    B1 --> Cont[Contagem física]
    B2 --> Cont
    B3 --> Cont
    B4 --> Cont
    B5 --> Cont
    Cont --> Comp[Comparação com Kardex]
    Comp --> Acu[Cálculo de Acuracidade]
    Acu --> Ajuste{Divergência?}
    Ajuste -->|Sim| AjusteSaldo[Ajuste de saldo + log]
    Ajuste -->|Não| Fim[Inventário OK]
    AjusteSaldo --> Fim
```

> Detalhes em [CHANGELOG_BLOCOS_4_5.md](../../CHANGELOG_BLOCOS_4_5.md).

### Saving de Compras

```mermaid
flowchart LR
    A[Usuário escolhe período<br/>dtIni - dtFim] --> B[Backend lista itens<br/>curva A ativos]
    B --> C[Para cada item:<br/>última NF por mês]
    C --> D[Mês-âncora =<br/>último mês do período]
    D --> E[Custo Base =<br/>custo NF do mês-âncora]
    E --> F[Usuário define Meta %]
    F --> G[Saving R$/un = Base × Meta%<br/>Custo Target = Base − Saving]
    G --> H[Salvar em TB_SAVING_META<br/>CODIGO + ANO_MES]
    H --> I[Indicador:<br/>compara com custo<br/>do mês seguinte]
```

**Regras:**
- **Itens elegíveis:** `CAD_PROD.CURVA_A_B_C = 'A' AND ATIVO = 1`
- **Custo por mês:** última NF do mês em `NF_PRODUTOS.PROD_CUSTO_FISCAL_MEDIO_NOVO`, ordenada por `NF_CABECALHO.CAB_DT_EMISSAO DESC`.
- **Mês-base (âncora) por item:** mês mais recente do item com NF dentro do período (cada item pode ter um mês diferente — itens sem compras nos meses finais usam o último mês em que houve NF).
- **Meta persistida** em `TB_SAVING_META(CODIGO, ANO_MES)` — granularidade mensal, salva no mês-base de cada item.
- **Saving Realizado:** `CustoBase − CustoUltimaNF(mêsSeguinte ao mês-base)`.
- **Atingimento %:** `SavingRealizado / SavingPlanejado × 100`.

---

## 6. Como Adicionar uma Nova Funcionalidade

1. Identifique a categoria (`requisicoes` / `kardex` / `nf` / `inventario` / `relatorios`).
2. Crie `.html` + `.js` na subpasta correspondente.
3. Estenda ou crie endpoint em `api/embalagem/`.
4. Use `require('../../db.js')` + `getConnection()` — sempre queries parametrizadas.
5. Adicione link em [shared/frontend/menu-lateral.html](../../shared/frontend/menu-lateral.html).
6. Mapeie `idMap` em [shared/frontend/layout.js](../../shared/frontend/layout.js).
7. Atualize este README + commit + push.
