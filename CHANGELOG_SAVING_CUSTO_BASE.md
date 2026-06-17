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
- `5e331f6` — fix(saving): exibir CUSTO_BASE de meta salva mesmo sem NF no período atual

---

## 📋 Detalhes Técnicos Adicionais (17/06/2026 - tarde)

### Problema Complementar

Mesmo após a correção inicial que priorizava o CUSTO_BASE salvo, havia um problema de **visualização**: quando o usuário retornava ao relatório usando um período diferente (ex: jan/26-jun/26) que não continha a NF original (jul/25), o sistema mostrava "sem NF" ao invés de exibir o custo salvo.

**Causa:** O backend calculava `anoMesBase` apenas das NFs presentes no período visualizado. Se a NF original não estava nesse período, `anoMesBase = null`, e o frontend interpretava como "sem custo base".

### Solução Complementar

1. **Backend** ([api/embalagem/relatorios.js](api/embalagem/relatorios.js)):
   - Adicionado campo `custoBaseOrigem: 'meta' | 'nf' | null`
   - Quando existe meta salva com CUSTO_BASE: `custoBaseOrigem = 'meta'` e `anoMesBase = mês-meta`
   - Frontend pode distinguir custo histórico de custo do período

2. **Frontend** ([modules/embalagem/saving/savingCompras.js](modules/embalagem/saving/savingCompras.js)):
   - Exibe **"★ Meta Salva"** (cor laranja) quando `custoBaseOrigem === 'meta'`
   - Exibe mês e custo (azul) quando `custoBaseOrigem === 'nf'`
   - Valida `custoBase != null` (não `anoMesBase`) para habilitar inputs
   - Permite editar metas existentes mesmo sem NFs no período atual

### Resultado Final

Agora o sistema mantém **total consistência** entre períodos:
- ✅ Salvou meta em jan/25-jun/26 com base em NF jul/25 → custo fixado
- ✅ Visualiza em jan/26-jun/26 → mostra "★ Meta Salva R$ 2,4898" (não "sem NF")
- ✅ Todos os cálculos baseados no custo histórico fixo
- ✅ Permite editar % da meta sem precisar incluir jul/25 no período
