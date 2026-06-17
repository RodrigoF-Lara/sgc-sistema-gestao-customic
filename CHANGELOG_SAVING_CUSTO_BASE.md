# 🔧 Correção: CUSTO_BASE Fixo em Saving de Compras

**Data:** 17/06/2026  
**Tipo:** Bug Fix

---

## 🐛 Problema Identificado

Quando um usuário visualizava metas já cadastradas em meses futuros, o sistema recalculava o `CUSTO_BASE` a partir das NFs disponíveis no período consultado, ao invés de usar o valor histórico salvo na `TB_SAVING_META`.

Isso causava inconsistências nos cálculos de:
- Saving R$/un
- Custo Target
- Atingimento %
- Projeções 12 meses

**Exemplo:**
1. Usuário define meta de 5% em junho/2026 com CUSTO_BASE = R$ 2,48980
2. Em outubro/2026, ao consultar a meta, o sistema recalculava o custoBase baseado em NFs recentes (potencialmente diferente)
3. Todos os cálculos ficavam baseados em uma referência diferente da original

---

## ✅ Solução Implementada

### Backend (`api/embalagem/relatorios.js`)

**Antes:**
```javascript
const custoBase = anoMesBase != null ? custos[anoMesBase] : null;
const meta = metasPorItem[cod] || null;
```

**Depois:**
```javascript
const meta = metasPorItem[cod] || null;
// IMPORTANTE: prioriza custoBase SALVO na meta (fixo), senão calcula da NF
const custoBase = (meta && meta.custoBase != null)
    ? meta.custoBase
    : (anoMesBase != null ? custos[anoMesBase] : null);
```

### Comportamento Correto

1. **Ao salvar meta pela primeira vez:**
   - Backend calcula `custoBase` = última NF **antes** do mês-meta
   - Frontend envia esse valor junto com a meta %
   - Backend salva na `TB_SAVING_META` com `CUSTO_BASE` fixo

2. **Ao consultar no futuro:**
   - Backend **prioriza** o `CUSTO_BASE` salvo na `TB_SAVING_META` (se existir)
   - Só calcula das NFs se ainda não houver meta salva
   - Todos os cálculos (Saving, Target, etc.) usam o custo fixo

---

## 📝 Impacto

- ✅ **Consistência:** Metas mantêm referência fixa ao custo da época
- ✅ **Rastreabilidade:** Sempre possível comparar com o baseline original
- ✅ **Confiabilidade:** Indicadores de atingimento refletem a meta real
- ⚠️ **Nenhuma migração necessária:** Metas já salvas mantêm o CUSTO_BASE correto

---

## 📚 Documentação Atualizada

- ✅ [modules/embalagem/README.md](modules/embalagem/README.md) — Seção "Saving de Compras"
  - Adicionada regra explícita sobre CUSTO_BASE fixo

---

## 🔗 Commits Relacionados

- `d855109` — fix(saving): priorizar CUSTO_BASE salvo na TB_SAVING_META ao invés de recalcular das NFs
- `89b5407` — docs(embalagem): adicionar regra sobre CUSTO_BASE fixo em Saving de Compras
