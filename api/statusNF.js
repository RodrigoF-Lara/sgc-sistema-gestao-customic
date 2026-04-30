// filepath: api/statusNF.js
import { getConnection, sql } from "../db.js";

export default async function handler(req, res) {
    const { method } = req;
    
    try {
        switch (method) {
            case "GET": return await handleGet(req, res);
            case "POST": return await handlePost(req, res);
            default:
                res.setHeader("Allow", ["GET", "POST"]);
                return res.status(405).json({ message: "Método não permitido" });
        }
    } catch (err) {
        console.error("Erro geral no handler de /api/statusNF:", err);
        return res.status(500).json({ message: "Erro interno do servidor." });
    }
}

async function handleGet(req, res) {
    const { acao, nf, codigo } = req.query;
    
    // Endpoint para buscar log de uma NF específica
    if (acao === 'log' && nf && codigo) {
        return await buscarLog(req, res);
    }
    
    // Endpoint padrão para listar status
    return await listarStatus(req, res);
}

async function handlePost(req, res) {
    const { acao } = req.body;
    
    if (acao === 'atualizarStatus') {
        return await atualizarStatus(req, res);
    }
    
    return res.status(400).json({ message: "Ação não reconhecida" });
}

async function listarStatus(req, res) {
    const tipoProduto = req.query.tipoProduto || 'EMBALAGEM';

    try {
        const pool = await getConnection();
        
        let tipoWhereCondition = "cp.TIPO = @tipoProduto";
        if (tipoProduto === 'OUTROS') {
            tipoWhereCondition = "cp.TIPO <> 'EMBALAGEM'";
        }
        
        const result = await pool.request()
            .input('tipoProduto', sql.VarChar, tipoProduto)
            .query(`
                WITH RankedLogs AS (
                    SELECT 
                        log.[NF], log.[CODIGO], log.[USUARIO], log.[DT],
                        log.[HH], log.[PROCESSO], log.[ID_NF], log.[ID_NF_PROD],
                        log.[QNT],
                        ROW_NUMBER() OVER(PARTITION BY log.[NF], log.[CODIGO] ORDER BY log.[DT] DESC, log.[HH] DESC) as rn
                    FROM [dbo].[TB_LOG_NF] log
                )
                SELECT 
                    rl.NF, rl.CODIGO, cp.DESCRICAO, rl.USUARIO, rl.DT,
                    CONVERT(varchar(8), rl.HH, 108) as HH,
                    rl.PROCESSO, rl.ID_NF, rl.ID_NF_PROD,
                    rl.QNT
                FROM RankedLogs rl
                INNER JOIN [dbo].[CAD_PROD] cp ON rl.CODIGO = cp.CODIGO
                WHERE rl.rn = 1 AND (${tipoWhereCondition})
                ORDER BY rl.DT DESC, rl.HH DESC;
            `);
        
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error("ERRO NO ENDPOINT /api/statusNF:", err);
        res.status(500).json({ message: "Erro interno do servidor ao buscar status.", error: err.message });
    }
}

async function buscarLog(req, res) {
    const { nf, codigo } = req.query;

    if (!nf || !codigo) {
        return res.status(400).json({ message: "Os parâmetros 'nf' e 'codigo' são obrigatórios." });
    }

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('NF', sql.NVarChar, nf)
            .input('CODIGO', sql.NVarChar, codigo)
            .query(`
                SELECT 
                    USUARIO,
                    DT,
                    CONVERT(varchar(8), HH, 108) as HH,
                    PROCESSO
                FROM 
                    [dbo].[TB_LOG_NF]
                WHERE 
                    NF = @NF AND CODIGO = @CODIGO
                ORDER BY 
                    DT DESC, HH DESC;
            `);
        
        return res.status(200).json(result.recordset);

    } catch (err) {
        console.error("ERRO ao buscar log:", err);
        return res.status(500).json({ message: "Erro interno do servidor ao buscar o log." });
    }
}

async function atualizarStatus(req, res) {
    const { nf, codigo, processo, usuario, id_nf, id_nf_prod, qnt } = req.body || {};

    if (!nf || !codigo || !processo || !usuario) {
        return res.status(400).json({ message: "Parâmetros obrigatórios: nf, codigo, processo, usuario" });
    }

    try {
        const pool = await getConnection();
        const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

        // Formata data e hora em BRT
        const dt = nowBRT.toISOString().split("T")[0]; // YYYY-MM-DD
        const hh = nowBRT.toTimeString().split(" ")[0]; // HH:MM:SS

        await pool.request()
            .input("ID_NF", sql.Int, id_nf ? Number(id_nf) : null)
            .input("ID_NF_PROD", sql.Int, id_nf_prod ? Number(id_nf_prod) : null)
            .input("NF", sql.NVarChar, nf.toString())
            .input("CODIGO", sql.NVarChar, codigo.toString())
            .input("USUARIO", sql.NVarChar, usuario.toString())
            .input("DT", sql.Date, dt)
            .input("HH", sql.NVarChar, hh)
            .input("PROCESSO", sql.NVarChar, processo.toString())
            .input("APP", sql.NVarChar, "KARDEX WEB")
            .input("QNT", sql.Int, qnt !== undefined && qnt !== null ? Number(qnt) : 0)
            .query(`
                INSERT INTO [dbo].[TB_LOG_NF]
                  ([ID_NF],[ID_NF_PROD],[NF],[CODIGO],[USUARIO],[DT],[HH],[PROCESSO],[APP],[QNT])
                VALUES
                  (@ID_NF,@ID_NF_PROD,@NF,@CODIGO,@USUARIO,@DT,@HH,@PROCESSO,@APP,@QNT);
            `);

        return res.status(200).json({ message: "Processo atualizado com sucesso." });
    } catch (err) {
        console.error("ERRO ao atualizar status:", err);
        return res.status(500).json({ message: "Erro interno ao atualizar processo.", error: err.message });
    }
}