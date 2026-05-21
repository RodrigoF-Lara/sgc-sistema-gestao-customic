# Módulo Produção 🏭

> Setor de Produção — PCP, Ordens, Apontamentos, MES, APS, Expedição.
> **Status:** 🚧 em desenvolvimento (iniciado em maio/2026).

---

## 1. Escopo Planejado

| Submódulo | Descrição | Status |
|-----------|-----------|--------|
| **PCP** | Planejamento e Controle da Produção | ⬜ Planejado |
| **Ordens de Produção** | Criação, liberação e acompanhamento de OPs | ⬜ Planejado |
| **Apontamentos** | Registro de produção (chão de fábrica) | ⬜ Planejado |
| **MES** | Manufacturing Execution System (execução em tempo real) | ⬜ Planejado |
| **APS** | Advanced Planning & Scheduling (sequenciamento) | ⬜ Planejado |
| **Expedição** | Saída de produto acabado | ⬜ Planejado |
| **Produtividade / OEE** | Indicadores de eficiência | ⬜ Planejado |
| **Aderência ao Planejado** | Comparativo planejado vs realizado | ⬜ Planejado |

---

## 2. Princípios de Design

1. **Independência:** este módulo não depende diretamente de `modules/embalagem/`.
2. **Reutilização:** consome `shared/` para login, cadastros, layout e notificações.
3. **Integração com Embalagem:** quando necessário, via tabelas compartilhadas ou endpoints `/api/shared/`.
4. **Tabelas:** todas com prefixo `PROD_*`.
5. **Endpoints:** todos sob `/api/producao/*`.

---

## 3. Arquitetura Planejada

```mermaid
flowchart TB
    subgraph FE[Frontend Produção]
        PCP_UI[PCP]
        OP_UI[Ordens]
        APT_UI[Apontamentos]
        MES_UI[MES]
        APS_UI[APS]
        EXP_UI[Expedição]
        IND_UI[Indicadores]
    end

    subgraph API[/api/producao]
        PCP_API[pcp.js]
        OP_API[ordens.js]
        APT_API[apontamentos.js]
        MES_API[mes.js]
        APS_API[aps.js]
        EXP_API[expedicao.js]
        IND_API[indicadores.js]
    end

    subgraph DB[SQL Server]
        OP_T[(PROD_ORDEM)]
        APT_T[(PROD_APONTAMENTO)]
        ROT_T[(PROD_ROTEIRO)]
        REC_T[(PROD_RECURSO)]
        EXP_T[(PROD_EXPEDICAO)]
    end

    FE --> API
    API --> DB
```

---

## 4. Roadmap (a definir)

A próxima etapa é o levantamento de requisitos com o setor de Produção:
- Quais processos críticos primeiro?
- Quais integrações com ERP/Embalagem são necessárias?
- Há sistema legado a substituir?
- Quais indicadores são prioritários?

---

## 5. Quando começar a codar

A migração da Fase 1 do [ARCHITECTURE.md](../../ARCHITECTURE.md) deve ser concluída
**antes** do primeiro arquivo deste módulo, para que a base esteja limpa.
