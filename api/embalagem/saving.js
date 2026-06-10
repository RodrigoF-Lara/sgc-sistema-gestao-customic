// =====================================================================
// /api/embalagem/saving
//
// Módulo Saving de Compras — itens curva A ativos, custos mensais da
// última NF lançada e gestão de metas de redução (%).
//
// Endpoints (via ?action= ou body.action):
//   GET  ?action=list&dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD
//        → lista itens A com custo da última NF por mês no período
//          + meta cadastrada para o último mês (mês-âncora) do período
//
//   GET  ?action=indicador&anoMes=YYYY-MM
//        → planejado vs realizado para o mês-âncora informado
//
//   POST { action: 'saveMeta', codigo, anoMes, metaPct, custoBase }
//        → upsert de meta para (CODIGO, ANO_MES)
//
//   POST { action: 'saveMetasBatch', itens: [{codigo, anoMes, metaPct, custoBase}] }
//        → upsert em lote (transação)
//
//   DELETE ?codigo=...&anoMes=YYYY-MM
//        → remove meta
// =====================================================================

import { getConnection, sql } from "../../db.js";

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case "GET":    return await handleGet(req, res);
            case "POST":   return await handlePost(req, res);
            case "DELETE": return await handleDelete(req, res);
            default:
                res.setHeader("Allow", ["GET", "POST", "DELETE"]);
                return res.status(405).end(`Method ${req.method} Not Allowed`);
        }
    } catch (err) {
        console.error("[api/embalagem/saving] erro:", err);
        return res.status(500).json({ message: "Erro interno do servidor.", error: err.message });
    }
}

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------
async function handleGet(req, res) {
    const { action } = req.query;
    if (action === "indicador") return await getIndicador(req, res);
    return await listSaving(req, res);
}

/**
 * Lista itens curva A (ativos) com custo da última NF para cada mês
 * do período + a meta cadastrada para o mês-âncora (último mês do período).
 */
async function listSaving(req, res) {
    const { dtIni, dtFim } = req.query;
    if (!dtIni || !dtFim) {
        return res.status(400).json({ message: "Parâmetros 'dtIni' e 'dtFim' são obrigatórios (YYYY-MM-DD)." });
    }

    const pool = await getConnection();

    // Mês-âncora = último mês do período
    const dFim = new Date(dtFim + "T00:00:00");
    const anoAncora = dFim.getFullYear();
    const mesAncora = dFim.getMonth() + 1;
    const anoMesAncora = `${anoAncora}-${String(mesAncora).padStart(2, "0")}`;

    // 1) Itens curva A ativos
    const itensResult = await pool.request().query(`
        SELECT CODIGO, DESCRICAO
        FROM [dbo].[CAD_PROD]
        WHERE CURVA_A_B_C = 'A'
          AND ATIVO = 1
        ORDER BY DESCRICAO
    `);
    const itens = itensResult.recordset;
    if (itens.length === 0) {
        return res.status(200).json({ anoMesAncora, itens: [], meses: gerarMeses(dtIni, dtFim) });
    }

    // 2) Última NF do mês para cada (CODIGO, ANO, MES) no período
    //    Apenas para itens A (filtro via subselect garante performance e segurança).
    const custosResult = await pool.request()
        .input("dtIni", sql.Date, dtIni)
        .input("dtFim", sql.Date, dtFim)
        .query(`
            ;WITH BaseNF AS (
                SELECT
                    p.PROD_COD_PROD                                       AS CODIGO,
                    YEAR(c.CAB_DT_EMISSAO)                                AS ANO,
                    MONTH(c.CAB_DT_EMISSAO)                               AS MES,
                    p.PROD_CUSTO_FISCAL_MEDIO_NOVO                        AS CUSTO,
                    c.CAB_DT_EMISSAO                                      AS DT_EMISSAO,
                    c.CAB_ID_NF                                           AS ID_NF,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.PROD_COD_PROD,
                                     YEAR(c.CAB_DT_EMISSAO),
                                     MONTH(c.CAB_DT_EMISSAO)
                        ORDER BY c.CAB_DT_EMISSAO DESC, c.CAB_ID_NF DESC
                    ) AS rn
                FROM [dbo].[NF_PRODUTOS] p
                INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                WHERE c.CAB_DT_EMISSAO >= @dtIni
                  AND c.CAB_DT_EMISSAO <= @dtFim
                  AND p.PROD_COD_PROD IN (
                      SELECT CODIGO FROM [dbo].[CAD_PROD]
                      WHERE CURVA_A_B_C = 'A' AND ATIVO = 1
                  )
                  AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL
                  AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
            )
            SELECT CODIGO, ANO, MES, CUSTO
            FROM BaseNF
            WHERE rn = 1
            ORDER BY CODIGO, ANO, MES
        `);

    // 3) Meta cadastrada para o mês-âncora
    const metasResult = await pool.request()
        .input("anoMes", sql.Char(7), anoMesAncora)
        .query(`
            SELECT CODIGO, ANO_MES, META_PCT, CUSTO_BASE, USUARIO, DT_CADASTRO, DT_ATUALIZACAO
            FROM [dbo].[TB_SAVING_META]
            WHERE ANO_MES = @anoMes
        `);

    // Indexar custos por código → { 'YYYY-MM': custo }
    const custosPorItem = {};
    for (const row of custosResult.recordset) {
        const key = String(row.CODIGO);
        const ym = `${row.ANO}-${String(row.MES).padStart(2, "0")}`;
        if (!custosPorItem[key]) custosPorItem[key] = {};
        custosPorItem[key][ym] = Number(row.CUSTO);
    }

    // Indexar metas por código
    const metasPorItem = {};
    for (const m of metasResult.recordset) {
        metasPorItem[String(m.CODIGO)] = {
            metaPct: Number(m.META_PCT),
            custoBase: m.CUSTO_BASE != null ? Number(m.CUSTO_BASE) : null,
            usuario: m.USUARIO,
            dtCadastro: m.DT_CADASTRO,
            dtAtualizacao: m.DT_ATUALIZACAO
        };
    }

    const meses = gerarMeses(dtIni, dtFim);

    // Montar resposta
    const resposta = itens.map(it => {
        const cod = String(it.CODIGO);
        const custos = custosPorItem[cod] || {};
        const custoBase = custos[anoMesAncora] != null ? custos[anoMesAncora] : null;
        const meta = metasPorItem[cod] || null;
        const metaPct = meta ? meta.metaPct : null;
        const savingValor = (custoBase != null && metaPct != null)
            ? +(custoBase * (metaPct / 100)).toFixed(4) : null;
        const custoTarget = (custoBase != null && metaPct != null)
            ? +(custoBase - savingValor).toFixed(4) : null;

        return {
            codigo: cod,
            descricao: it.DESCRICAO,
            custoBase,
            metaPct,
            savingValor,
            custoTarget,
            custos
        };
    });

    return res.status(200).json({
        anoMesAncora,
        meses,
        itens: resposta
    });
}

/**
 * Indicador planejado vs realizado para um mês-âncora.
 * - Planejado: somatório do savingValor cadastrado (= custoBase × metaPct).
 * - Realizado: para cada item com meta, calcula (custoBase - custoMesPosterior)
 *   considerando o mês imediatamente posterior ao mês-âncora (se houver NF).
 *
 * Nota: como não temos volume comprado vinculado à meta, indicador é
 * apresentado por unidade. Frontend pode multiplicar pelo volume desejado.
 */
async function getIndicador(req, res) {
    const { anoMes } = req.query;
    if (!anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
        return res.status(400).json({ message: "Parâmetro 'anoMes' obrigatório no formato YYYY-MM." });
    }
    const pool = await getConnection();

    const [ano, mes] = anoMes.split("-").map(Number);
    const mesPosterior = mes === 12 ? 1 : mes + 1;
    const anoPosterior = mes === 12 ? ano + 1 : ano;

    // Metas + custo real do mês posterior (última NF)
    const result = await pool.request()
        .input("anoMes", sql.Char(7), anoMes)
        .input("anoPost", sql.Int, anoPosterior)
        .input("mesPost", sql.Int, mesPosterior)
        .query(`
            ;WITH UltimaNFPost AS (
                SELECT
                    p.PROD_COD_PROD AS CODIGO,
                    p.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_REAL,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.PROD_COD_PROD
                        ORDER BY c.CAB_DT_EMISSAO DESC, c.CAB_ID_NF DESC
                    ) AS rn
                FROM [dbo].[NF_PRODUTOS] p
                INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                WHERE YEAR(c.CAB_DT_EMISSAO) = @anoPost
                  AND MONTH(c.CAB_DT_EMISSAO) = @mesPost
                  AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL
                  AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
            )
            SELECT
                m.CODIGO,
                cp.DESCRICAO,
                m.META_PCT,
                m.CUSTO_BASE,
                u.CUSTO_REAL
            FROM [dbo].[TB_SAVING_META] m
            LEFT JOIN [dbo].[CAD_PROD] cp ON cp.CODIGO = m.CODIGO
            LEFT JOIN UltimaNFPost u ON u.CODIGO = m.CODIGO AND u.rn = 1
            WHERE m.ANO_MES = @anoMes
            ORDER BY cp.DESCRICAO
        `);

    const itens = result.recordset.map(r => {
        const custoBase = r.CUSTO_BASE != null ? Number(r.CUSTO_BASE) : null;
        const metaPct = Number(r.META_PCT);
        const custoReal = r.CUSTO_REAL != null ? Number(r.CUSTO_REAL) : null;

        const savingPlanejado = (custoBase != null)
            ? +(custoBase * (metaPct / 100)).toFixed(4) : null;
        const savingRealizado = (custoBase != null && custoReal != null)
            ? +(custoBase - custoReal).toFixed(4) : null;
        const atingimentoPct = (savingPlanejado && savingRealizado != null)
            ? +(savingRealizado / savingPlanejado * 100).toFixed(2) : null;

        return {
            codigo: r.CODIGO,
            descricao: r.DESCRICAO,
            metaPct,
            custoBase,
            custoReal,
            savingPlanejado,
            savingRealizado,
            atingimentoPct
        };
    });

    const totais = itens.reduce((acc, it) => {
        if (it.savingPlanejado != null) acc.planejado += it.savingPlanejado;
        if (it.savingRealizado != null) acc.realizado += it.savingRealizado;
        return acc;
    }, { planejado: 0, realizado: 0 });
    totais.planejado = +totais.planejado.toFixed(4);
    totais.realizado = +totais.realizado.toFixed(4);
    totais.atingimentoPct = totais.planejado > 0
        ? +(totais.realizado / totais.planejado * 100).toFixed(2) : null;

    return res.status(200).json({
        anoMes,
        anoMesComparacao: `${anoPosterior}-${String(mesPosterior).padStart(2, "0")}`,
        itens,
        totais
    });
}

// ---------------------------------------------------------------------
// POST (upsert de metas)
// ---------------------------------------------------------------------
async function handlePost(req, res) {
    const { action } = req.body || {};
    if (action === "saveMeta")        return await saveMeta(req, res);
    if (action === "saveMetasBatch")  return await saveMetasBatch(req, res);
    return res.status(400).json({ message: "Ação POST inválida." });
}

async function saveMeta(req, res) {
    const { codigo, anoMes, metaPct, custoBase, usuario } = req.body;
    if (!codigo || !anoMes || metaPct === undefined || metaPct === null) {
        return res.status(400).json({ message: "Campos obrigatórios: codigo, anoMes, metaPct." });
    }
    if (!/^\d{4}-\d{2}$/.test(anoMes)) {
        return res.status(400).json({ message: "anoMes deve estar no formato YYYY-MM." });
    }
    const pctNum = Number(metaPct);
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
        return res.status(400).json({ message: "metaPct deve ser número entre 0 e 100." });
    }
    const pool = await getConnection();
    await upsertMeta(pool.request(), { codigo, anoMes, metaPct: pctNum, custoBase, usuario });
    return res.status(200).json({ message: "Meta salva.", codigo, anoMes, metaPct: pctNum });
}

async function saveMetasBatch(req, res) {
    const { itens, usuario } = req.body;
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ message: "Lista 'itens' vazia ou inválida." });
    }
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        let salvos = 0;
        let removidos = 0;
        for (const it of itens) {
            const { codigo, anoMes, metaPct, custoBase } = it;
            if (!codigo || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) continue;

            // Se metaPct vazia/null/<=0, remove a meta
            if (metaPct === null || metaPct === undefined || metaPct === "" || Number(metaPct) <= 0) {
                await new sql.Request(transaction)
                    .input("codigo", sql.NVarChar(50), String(codigo))
                    .input("anoMes", sql.Char(7), anoMes)
                    .query(`DELETE FROM [dbo].[TB_SAVING_META] WHERE CODIGO = @codigo AND ANO_MES = @anoMes`);
                removidos++;
                continue;
            }

            const pctNum = Number(metaPct);
            if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) continue;

            await upsertMeta(new sql.Request(transaction), {
                codigo, anoMes, metaPct: pctNum, custoBase, usuario
            });
            salvos++;
        }
        await transaction.commit();
        return res.status(200).json({ message: "Metas processadas.", salvos, removidos });
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

async function upsertMeta(request, { codigo, anoMes, metaPct, custoBase, usuario }) {
    request
        .input("codigo", sql.NVarChar(50), String(codigo))
        .input("anoMes", sql.Char(7), anoMes)
        .input("metaPct", sql.Decimal(5, 2), Number(metaPct))
        .input("custoBase", sql.Decimal(18, 6), custoBase != null ? Number(custoBase) : null)
        .input("usuario", sql.NVarChar(100), usuario || null);

    await request.query(`
        MERGE [dbo].[TB_SAVING_META] AS target
        USING (SELECT @codigo AS CODIGO, @anoMes AS ANO_MES) AS src
           ON target.CODIGO = src.CODIGO AND target.ANO_MES = src.ANO_MES
        WHEN MATCHED THEN
            UPDATE SET META_PCT = @metaPct,
                       CUSTO_BASE = @custoBase,
                       USUARIO = @usuario,
                       DT_ATUALIZACAO = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (CODIGO, ANO_MES, META_PCT, CUSTO_BASE, USUARIO)
            VALUES (@codigo, @anoMes, @metaPct, @custoBase, @usuario);
    `);
}

// ---------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------
async function handleDelete(req, res) {
    const { codigo, anoMes } = req.query;
    if (!codigo || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
        return res.status(400).json({ message: "Parâmetros 'codigo' e 'anoMes' (YYYY-MM) obrigatórios." });
    }
    const pool = await getConnection();
    await pool.request()
        .input("codigo", sql.NVarChar(50), String(codigo))
        .input("anoMes", sql.Char(7), anoMes)
        .query(`DELETE FROM [dbo].[TB_SAVING_META] WHERE CODIGO = @codigo AND ANO_MES = @anoMes`);
    return res.status(200).json({ message: "Meta removida.", codigo, anoMes });
}

// ---------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------
function gerarMeses(dtIni, dtFim) {
    const result = [];
    const start = new Date(dtIni + "T00:00:00");
    const end = new Date(dtFim + "T00:00:00");
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const stop = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= stop) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        result.push({
            anoMes: `${y}-${String(m).padStart(2, "0")}`,
            label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
}
