import { getConnection, sql } from "../../db.js";
import { exigirPermissao, podeAcessar, nivelDoRequest } from "../../lib/permissoesHelper.js";

function obterDataHoraSaoPaulo() {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(agora);

    const map = Object.fromEntries(partes.map(p => [p.type, p.value]));
    return {
        dataISO: `${map.year}-${map.month}-${map.day}`,
        horaLocal: `${map.hour}:${map.minute}:${map.second}`
    };
}

// Função Principal que decide o que fazer
export default async function handler(req, res) {
    const { method } = req;
    try {
        switch (method) {
            case "GET": await handleGet(req, res); break;
            case "POST": await handlePost(req, res); break;
            case "PUT": await handlePut(req, res); break;
            case "DELETE": await handleDelete(req, res); break;
            default:
                res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
                res.status(405).end(`Method ${method} Not Allowed`);
        }
    } catch (err) {
        console.error("Erro geral no handler de /api/requisicao:", err);
        res.status(500).json({ message: "Erro interno do servidor." });
    }
}

// --- LÓGICA GET (COM AJUSTE NA BUSCA DO LOG) ---
async function handleGet(req, res) {
    // Consulta lista/detalhe exige permissão de consultar (ou hub legado)
    const nivel = nivelDoRequest(req);
    if (nivel !== null) {
        const ok =
            (await podeAcessar("consultar-requisicoes", nivel)) ||
            (await podeAcessar("requisicoes", nivel));
        if (!ok) {
            return res.status(403).json({
                success: false,
                error: "Sem permissão para consultar requisições.",
            });
        }
    }

    const { id, idReqItemLog, idReqLog } = req.query;
    const pool = await getConnection();
    if (id) {
        const headerResult = await pool.request().input('idReq', sql.Int, id).query("SELECT * FROM [dbo].[TB_REQUISICOES] WHERE ID_REQ = @idReq");
        if (headerResult.recordset.length === 0) return res.status(404).json({ message: "Requisição não encontrada" });
        const itemsResult = await pool.request().input('idReqItems', sql.Int, id).query(`
            SELECT 
                I.*, 
                P.DESCRICAO AS DESCRICAO_PRODUTO,
                ISNULL((
                    SELECT SUM(ISNULL(K3.SALDO, 0))
                    FROM [dbo].[KARDEX_2026_EMBALAGEM] K3
                    WHERE K3.CODIGO = I.CODIGO
                      AND K3.D_E_L_E_T_ = ''
                      AND K3.KARDEX = 2026
                ), 0) AS SALDO_ESTOQUE,
                STUFF((
                    SELECT ', ' + ENDERECO_ARM
                    FROM (
                        SELECT DISTINCT 
                            ISNULL(K2.ENDERECO, '-') + ' (ARM:' + ISNULL(CAST(K2.ARMAZEM AS VARCHAR), '-') + ')' AS ENDERECO_ARM
                        FROM [dbo].[KARDEX_2026_EMBALAGEM] K2
                        WHERE K2.CODIGO = I.CODIGO 
                          AND K2.SALDO > 0
                          AND K2.D_E_L_E_T_ = ''
                          AND K2.KARDEX = 2026
                    ) AS EnderecosDist
                    ORDER BY ENDERECO_ARM
                    FOR XML PATH('')
                ), 1, 2, '') AS ENDERECOS
            FROM [dbo].[TB_REQ_ITEM] I 
            LEFT JOIN [dbo].[CAD_PROD] P ON I.CODIGO = P.CODIGO
            WHERE I.ID_REQ = @idReqItems 
            ORDER BY I.ID_REQ_ITEM
        `);
        return res.status(200).json({ header: headerResult.recordset[0], items: itemsResult.recordset });
    } else if (idReqItemLog) {
        // CORREÇÃO: Filtra também por ID_REQ pois ID_REQ_ITEM é sequencial por requisição (não é único globalmente)
        const request = pool.request().input('ID_REQ_ITEM', sql.Int, idReqItemLog);
        let logQuery = "SELECT STATUS_ANTERIOR, STATUS_NOVO, RESPONSAVEL, DT_HR_ALTERACAO FROM TB_REQ_ITEM_LOG WHERE ID_REQ_ITEM = @ID_REQ_ITEM";
        if (idReqLog) {
            request.input('ID_REQ', sql.Int, idReqLog);
            logQuery += " AND ID_REQ = @ID_REQ";
        }
        logQuery += " ORDER BY DT_HR_ALTERACAO DESC;";
        const result = await request.query(logQuery);
        return res.status(200).json(result.recordset);
    } else {
        const result = await pool.request().query("SELECT H.ID_REQ, H.DT_REQUISICAO, H.HR_REQUSICAO, H.DT_NECESSIDADE, H.DT_CONCLUSAO, H.STATUS, H.PRIORIDADE, H.SOLICITANTE, (SELECT COUNT(*) FROM [dbo].[TB_REQ_ITEM] I WHERE I.ID_REQ = H.ID_REQ) AS TOTAL_ITENS FROM [dbo].[TB_REQUISICOES] H ORDER BY H.ID_REQ DESC;");
        return res.status(200).json(result.recordset);
    }
}

function normalizarChaveCsv(chave) {
    return String(chave || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
}

function valorCampoCsv(row, aliases) {
    if (!row || typeof row !== "object") return null;
    const map = {};
    for (const [chave, valor] of Object.entries(row)) {
        map[normalizarChaveCsv(chave)] = valor;
    }
    for (const alias of aliases) {
        const valor = map[alias];
        if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
            return String(valor).trim();
        }
    }
    return null;
}

function normalizarItensCsv(data) {
    if (!Array.isArray(data)) return [];
    const itens = [];
    for (const row of data) {
        const codigo = valorCampoCsv(row, ["CODIGO", "COD", "CODE", "PRODUTO"]);
        const qntRaw = valorCampoCsv(row, ["QNT_REQ", "QNT", "QTD", "QUANTIDADE", "QTD_REQ", "QNTREQ"]);
        if (!codigo) continue;
        const quantidade = parseFloat(String(qntRaw ?? "").replace(",", "."));
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
        itens.push({ CODIGO: codigo, QNT_REQ: quantidade });
    }
    return itens;
}

async function inserirItensRequisicao(makeRequest, idReq, itens) {
    let idReqItem = 1;
    for (const item of itens) {
        await makeRequest()
            .input("ID_REQ", sql.Int, idReq)
            .input("ID_REQ_ITEM", sql.Int, idReqItem++)
            .input("CODIGO", sql.NVarChar, item.CODIGO)
            .input("QNT_REQ", sql.Float, item.QNT_REQ)
            .input("QNT_PAGA", sql.Float, 0)
            .input("SALDO", sql.Float, item.QNT_REQ)
            .input("STATUS_ITEM", sql.NVarChar, "Pendente")
            .query(`
                INSERT INTO [dbo].[TB_REQ_ITEM]
                    (ID_REQ, ID_REQ_ITEM, CODIGO, QNT_REQ, QNT_PAGA, SALDO, STATUS_ITEM)
                VALUES
                    (@ID_REQ, @ID_REQ_ITEM, @CODIGO, @QNT_REQ, @QNT_PAGA, @SALDO, @STATUS_ITEM)
            `);
    }
}

async function criarCabecalhoRequisicao(executor, { solicitante, dtNecessidade, prioridade }) {
    const agoraSP = obterDataHoraSaoPaulo();
    const result = await executor
        .input("SOLICITANTE", sql.NVarChar, solicitante)
        .input("DT_REQUISICAO", sql.Date, agoraSP.dataISO)
        .input("HR_REQUSICAO", sql.NVarChar, agoraSP.horaLocal)
        .input("STATUS", sql.NVarChar, "Pendente")
        .input("DT_NECESSIDADE", sql.Date, dtNecessidade)
        .input("PRIORIDADE", sql.NVarChar, prioridade)
        .query(`
            INSERT INTO [dbo].[TB_REQUISICOES]
                (SOLICITANTE, DT_REQUISICAO, HR_REQUSICAO, STATUS, DT_NECESSIDADE, PRIORIDADE)
            OUTPUT INSERTED.ID_REQ
            VALUES
                (@SOLICITANTE, @DT_REQUISICAO, @HR_REQUSICAO, @STATUS, @DT_NECESSIDADE, @PRIORIDADE);
        `);
    return result.recordset[0].ID_REQ;
}

async function removerRequisicaoVazia(pool, idReq) {
    const countResult = await pool.request()
        .input("ID_REQ", sql.Int, idReq)
        .query("SELECT COUNT(1) AS TOTAL FROM [dbo].[TB_REQ_ITEM] WHERE ID_REQ = @ID_REQ");
    if (Number(countResult.recordset[0]?.TOTAL || 0) > 0) return false;

    await pool.request()
        .input("ID_REQ", sql.Int, idReq)
        .query("DELETE FROM [dbo].[TB_REQ_ITEM_LOG] WHERE ID_REQ = @ID_REQ");
    await pool.request()
        .input("ID_REQ", sql.Int, idReq)
        .query("DELETE FROM [dbo].[TB_REQUISICOES] WHERE ID_REQ = @ID_REQ");
    return true;
}

// --- LÓGICA POST ---
async function handlePost(req, res) {
    const { action } = req.body;
    const pool = await getConnection();

    // Criar requisição / upload de itens exige "nova-requisicao"
    if (action === "createHeader" || action === "uploadItems" || action === "createWithItems") {
        if (!(await exigirPermissao(req, res, "nova-requisicao", "Sem permissão para criar nova requisição."))) {
            return;
        }
    }

    if (action === "createWithItems") {
        const { dtNecessidade, prioridade, solicitante, data } = req.body;
        if (!dtNecessidade || !prioridade || !solicitante) {
            return res.status(400).json({ message: "Informe data de necessidade, prioridade e solicitante." });
        }
        const itens = normalizarItensCsv(data);
        if (itens.length === 0) {
            return res.status(400).json({
                message: "Nenhum item válido no arquivo. Use as colunas CODIGO e QNT_REQ (separador ; ou ,)."
            });
        }

        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();
            const idReq = await criarCabecalhoRequisicao(new sql.Request(transaction), {
                solicitante,
                dtNecessidade,
                prioridade,
            });
            await inserirItensRequisicao(() => new sql.Request(transaction), idReq, itens);
            await transaction.commit();
            return res.status(201).json({
                idReq,
                totalItens: itens.length,
                message: `Requisição #${idReq} criada com ${itens.length} item(ns).`
            });
        } catch (err) {
            try { await transaction.rollback(); } catch (_) { /* ignore */ }
            console.error("Erro ao criar requisição com itens:", err);
            return res.status(500).json({
                message: "Erro ao criar requisição. Nenhum cabeçalho vazio foi gravado.",
                details: err.message
            });
        }
    }

    if (action === "createHeader") {
        const { dtNecessidade, prioridade, solicitante } = req.body;
        if (!dtNecessidade || !prioridade || !solicitante) {
            return res.status(400).json({ message: "Informe data de necessidade, prioridade e solicitante." });
        }
        const idReq = await criarCabecalhoRequisicao(pool.request(), {
            solicitante,
            dtNecessidade,
            prioridade,
        });
        return res.status(201).json({ idReq });
    }

    if (action === "uploadItems") {
        const { data, idReq } = req.body;
        if (!idReq) {
            return res.status(400).json({ message: "ID da requisição é obrigatório." });
        }
        const itens = normalizarItensCsv(data);
        if (itens.length === 0) {
            const removida = await removerRequisicaoVazia(pool, idReq);
            return res.status(400).json({
                message: "Nenhum item válido no arquivo. Use as colunas CODIGO e QNT_REQ (separador ; ou ,).",
                headerRemovido: removida
            });
        }
        await inserirItensRequisicao(() => pool.request(), idReq, itens);
        return res.status(201).json({
            message: `Itens inseridos com sucesso (${itens.length})`,
            totalItens: itens.length
        });
    }

    if (action === "atender") {
        return await atenderRequisicao(req, res);
    }
    return res.status(400).json({ message: "Ação POST inválida." });
}

// --- LÓGICA PUT (COM AJUSTE NO LOG) ---
async function handlePut(req, res) {
    const { action } = req.body;
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        if (action === 'updateStatus') {
            const { idReqItem, idReq, novoStatus, statusAntigo, usuario } = req.body;
            await updateSingleItem(transaction, { idReqItem, idReq, novoStatus, statusAntigo, usuario });
        } else if (action === 'bulkUpdateStatus') {
            const { itemIds, idReq, novoStatus, usuario } = req.body;
            for (const idReqItem of itemIds) {
                const getStatusRequest = new sql.Request(transaction);
                const result = await getStatusRequest.input('ID_REQ_ITEM_BULK', sql.Int, idReqItem).query('SELECT STATUS_ITEM FROM TB_REQ_ITEM WHERE ID_REQ_ITEM = @ID_REQ_ITEM_BULK');
                const statusAntigo = result.recordset[0]?.STATUS_ITEM || 'Pendente';
                await updateSingleItem(transaction, { idReqItem, idReq, novoStatus, statusAntigo, usuario });
            }
        } else {
            await transaction.rollback();
            return res.status(400).json({ message: "Ação PUT inválida." });
        }
        await updateHeaderStatus(transaction, req.body.idReq);
        await transaction.commit();
        res.status(200).json({ message: `Operação concluída com sucesso!` });
    } catch (err) {
        await transaction.rollback();
        console.error("Erro na transação de atualização:", err);
        res.status(500).json({ message: "Erro interno do servidor ao atualizar." });
    }
}

async function updateSingleItem(transaction, { idReqItem, idReq, novoStatus, statusAntigo, usuario }) {
    const request = new sql.Request(transaction);
    let queryUpdateItem = `UPDATE TB_REQ_ITEM SET STATUS_ITEM = @NOVO_STATUS_ITEM`;
    if (novoStatus === 'Finalizado') queryUpdateItem += `, QNT_PAGA = QNT_REQ, SALDO = 0`;
    else if (novoStatus === 'Pendente') queryUpdateItem += `, QNT_PAGA = 0, SALDO = QNT_REQ`;
    queryUpdateItem += ` WHERE ID_REQ_ITEM = @ID_REQ_ITEM AND ID_REQ = @ID_REQ;`;
    await request.input('NOVO_STATUS_ITEM', sql.NVarChar, novoStatus).input('ID_REQ_ITEM', sql.Int, idReqItem).input('ID_REQ', sql.Int, idReq).query(queryUpdateItem);

    // CORREÇÃO: Salva nas colunas antigas E na nova coluna
    const dataHoraAtual = new Date();
    await request
        .input('STATUS_ANTERIOR_LOG', sql.NVarChar, statusAntigo)
        .input('STATUS_NOVO_LOG', sql.NVarChar, novoStatus)
        .input('RESPONSAVEL_LOG', sql.NVarChar, usuario)
        .input('DT_ALTERACAO_LOG', sql.Date, dataHoraAtual)       // Coluna antiga
        .input('HR_ALTERACAO_LOG', sql.Time, dataHoraAtual)       // Coluna antiga
        .input('DT_HR_ALTERACAO_LOG', sql.DateTime2, dataHoraAtual) // Nova coluna
        .query(`
            INSERT INTO TB_REQ_ITEM_LOG 
            (ID_REQ, ID_REQ_ITEM, STATUS_ANTERIOR, STATUS_NOVO, RESPONSAVEL, DT_ALTERACAO, HR_ALTERACAO, DT_HR_ALTERACAO) 
            VALUES 
            (@ID_REQ, @ID_REQ_ITEM, @STATUS_ANTERIOR_LOG, @STATUS_NOVO_LOG, @RESPONSAVEL_LOG, @DT_ALTERACAO_LOG, @HR_ALTERACAO_LOG, @DT_HR_ALTERACAO_LOG)
        `);
}

async function updateHeaderStatus(transaction, idReq) {
    const request = new sql.Request(transaction);
    const checkStatusQuery = `SELECT STATUS_ITEM FROM TB_REQ_ITEM WHERE ID_REQ = @ID_REQ_HEADER`;
    const allItemsResult = await request.input('ID_REQ_HEADER', sql.Int, idReq).query(checkStatusQuery);
    const allStatuses = allItemsResult.recordset.map(item => (item.STATUS_ITEM || 'Pendente').trim().toUpperCase());
    let novoStatusHeader;
    if (allStatuses.length > 0 && allStatuses.every(s => s === 'FINALIZADO')) {
        novoStatusHeader = 'Concluído';
    } else if (allStatuses.length > 0 && allStatuses.every(s => s === 'PENDENTE')) {
        novoStatusHeader = 'Pendente';
    } else {
        novoStatusHeader = 'Parcial';
    }
    const dataConclusao = novoStatusHeader === 'Concluído' ? new Date() : null;
    await request
        .input('STATUS_HEADER', sql.NVarChar, novoStatusHeader)
        .input('DT_CONCLUSAO', sql.DateTime2, dataConclusao)
        .query("UPDATE TB_REQUISICOES SET STATUS = @STATUS_HEADER, DT_CONCLUSAO = @DT_CONCLUSAO WHERE ID_REQ = @ID_REQ_HEADER");
}

async function atenderRequisicao(req, res) {
    const { idReqItem, idReq, quantidadeAtendida, usuario } = req.body;

    if (!idReqItem || !idReq || quantidadeAtendida === undefined || !usuario) {
        return res.status(400).json({ message: "Todos os campos (ID do Item, ID da Requisição, Quantidade, Usuário) são obrigatórios." });
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // 1. Atualiza o item específico
        const itemRequest = new sql.Request(transaction);
        await itemRequest
            .input('ID_REQ_ITEM', sql.Int, idReqItem)
            .input('QNT_PAGA', sql.Decimal(10, 2), quantidadeAtendida)
            .query(`
                UPDATE TB_REQ_ITEM
                SET 
                    QNT_PAGA = @QNT_PAGA,
                    SALDO = QNT_REQ - @QNT_PAGA,
                    STATUS_ITEM = CASE 
                                    WHEN (QNT_REQ - @QNT_PAGA) <= 0 THEN 'PAGO'
                                    ELSE 'PARCIAL'
                                END
                WHERE ID_REQ_ITEM = @ID_REQ_ITEM;
            `);

        // 2. Verifica o status de todos os outros itens da mesma requisição
        const checkStatusRequest = new sql.Request(transaction);
        const allItemsResult = await checkStatusRequest
            .input('ID_REQ', sql.Int, idReq)
            .query("SELECT COUNT(*) as total, SUM(CASE WHEN STATUS_ITEM = 'PAGO' THEN 1 ELSE 0 END) as pagos FROM TB_REQ_ITEM WHERE ID_REQ = @ID_REQ");

        const { total, pagos } = allItemsResult.recordset[0];

        // 3. Se todos os itens estiverem pagos, atualiza o cabeçalho da requisição
        if (total === pagos) {
            const updateHeaderRequest = new sql.Request(transaction);
            await updateHeaderRequest
                .input('ID_REQ', sql.Int, idReq)
                .input('STATUS', sql.NVarChar, 'CONCLUIDO')
                .input('DT_CONCLUSAO', sql.DateTime2, new Date())
                .query("UPDATE TB_REQUISICOES SET STATUS = @STATUS, DT_CONCLUSAO = @DT_CONCLUSAO WHERE ID_REQ = @ID_REQ");
        }

        await transaction.commit();
        return res.status(200).json({ message: "Item atualizado com sucesso!" });

    } catch (err) {
        await transaction.rollback();
        console.error("Erro na transação de atendimento:", err);
        return res.status(500).json({ message: "Erro no servidor ao tentar atender o item.", error: err.message });
    }
}

async function usuarioEhAdmin(pool, usuarioCodigo) {
    if (!usuarioCodigo) return false;

    const result = await pool.request()
        .input('USUARIO_CODIGO', sql.NVarChar, usuarioCodigo)
        .query("SELECT TOP 1 NIVEL FROM [dbo].[CAD_USUARIO] WHERE USUARIO = @USUARIO_CODIGO");

    if (result.recordset.length === 0) return false;

    // Aceita cargo 'adm' (novo) e legado numérico '1'
    const raw = String(result.recordset[0].NIVEL ?? '').trim().toLowerCase();
    return raw === 'adm' || raw === '1' || raw === 'administrador' || raw === 'admin';
}

async function handleDelete(req, res) {
    const { idReq, usuario, usuarioCodigo, motivo } = req.body || {};

    if (!idReq || !usuario || !usuarioCodigo) {
        return res.status(400).json({ message: "Campos obrigatórios: idReq, usuario e usuarioCodigo." });
    }

    const pool = await getConnection();
    const admin = await usuarioEhAdmin(pool, usuarioCodigo);
    if (!admin) {
        return res.status(403).json({ message: "Apenas usuários ADMIN podem excluir requisições." });
    }

    const tabelaLogExiste = await pool.request().query(`
        SELECT COUNT(*) AS TOTAL
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'TB_REQ_DELETE_LOG'
    `);

    if (Number(tabelaLogExiste.recordset[0]?.TOTAL || 0) === 0) {
        return res.status(400).json({
            message: "Tabela de auditoria não encontrada. Execute o script sql/embalagem/create_tb_req_delete_log.sql antes de excluir requisições."
        });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        const headerResult = await request
            .input('ID_REQ', sql.Int, idReq)
            .query("SELECT TOP 1 ID_REQ, SOLICITANTE, STATUS, PRIORIDADE, DT_REQUISICAO, HR_REQUSICAO, DT_NECESSIDADE, DT_CONCLUSAO FROM [dbo].[TB_REQUISICOES] WHERE ID_REQ = @ID_REQ");

        if (headerResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: "Requisição não encontrada." });
        }

        const header = headerResult.recordset[0];

        const itensResult = await new sql.Request(transaction)
            .input('ID_REQ', sql.Int, idReq)
            .query("SELECT COUNT(1) AS TOTAL_ITENS FROM [dbo].[TB_REQ_ITEM] WHERE ID_REQ = @ID_REQ");

        const totalItens = Number(itensResult.recordset[0]?.TOTAL_ITENS || 0);
        const horaRequisicaoSnapshot = normalizarHoraRequisicao(header.HR_REQUSICAO);

        await new sql.Request(transaction)
            .input('ID_REQ', sql.Int, idReq)
            .input('SOLICITANTE', sql.NVarChar, header.SOLICITANTE || null)
            .input('STATUS_ANTERIOR', sql.NVarChar, header.STATUS || null)
            .input('PRIORIDADE', sql.NVarChar, header.PRIORIDADE || null)
            .input('DT_REQUISICAO', sql.Date, header.DT_REQUISICAO || null)
            .input('HR_REQUSICAO', sql.NVarChar, horaRequisicaoSnapshot)
            .input('DT_NECESSIDADE', sql.Date, header.DT_NECESSIDADE || null)
            .input('DT_CONCLUSAO', sql.DateTime2, header.DT_CONCLUSAO || null)
            .input('TOTAL_ITENS', sql.Int, totalItens)
            .input('USUARIO_EXCLUSAO', sql.NVarChar, usuario)
            .input('USUARIO_CODIGO_EXCLUSAO', sql.NVarChar, usuarioCodigo)
            .input('MOTIVO', sql.NVarChar, motivo || null)
            .query(`
                INSERT INTO [dbo].[TB_REQ_DELETE_LOG]
                    (ID_REQ, SOLICITANTE, STATUS_ANTERIOR, PRIORIDADE, DT_REQUISICAO, HR_REQUSICAO, DT_NECESSIDADE, DT_CONCLUSAO, TOTAL_ITENS, USUARIO_EXCLUSAO, USUARIO_CODIGO_EXCLUSAO, MOTIVO)
                VALUES
                    (@ID_REQ, @SOLICITANTE, @STATUS_ANTERIOR, @PRIORIDADE, @DT_REQUISICAO, @HR_REQUSICAO, @DT_NECESSIDADE, @DT_CONCLUSAO, @TOTAL_ITENS, @USUARIO_EXCLUSAO, @USUARIO_CODIGO_EXCLUSAO, @MOTIVO)
            `);

        await new sql.Request(transaction)
            .input('ID_REQ', sql.Int, idReq)
            .query("DELETE FROM [dbo].[TB_REQ_ITEM_LOG] WHERE ID_REQ = @ID_REQ");

        await new sql.Request(transaction)
            .input('ID_REQ', sql.Int, idReq)
            .query("DELETE FROM [dbo].[TB_REQ_ITEM] WHERE ID_REQ = @ID_REQ");

        await new sql.Request(transaction)
            .input('ID_REQ', sql.Int, idReq)
            .query("DELETE FROM [dbo].[TB_REQUISICOES] WHERE ID_REQ = @ID_REQ");

        await transaction.commit();
        return res.status(200).json({ message: `Requisição #${idReq} excluída com sucesso.` });
    } catch (err) {
        await transaction.rollback();
        console.error("Erro ao excluir requisição:", err);
        return res.status(500).json({
            message: "Erro interno ao excluir requisição.",
            details: err.message
        });
    }
}

function normalizarHoraRequisicao(valorHora) {
    if (valorHora === null || valorHora === undefined) return null;

    if (valorHora instanceof Date && !Number.isNaN(valorHora.getTime())) {
        return valorHora.toTimeString().slice(0, 8);
    }

    if (typeof valorHora === 'string') {
        const match = valorHora.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return valorHora.trim().slice(0, 30) || null;

        const hh = String(Number(match[1])).padStart(2, '0');
        const mm = match[2];
        const ss = String(Number(match[3] || '0')).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    if (typeof valorHora === 'object') {
        const hh = Number(valorHora.hours ?? valorHora.hour ?? valorHora.h ?? NaN);
        const mm = Number(valorHora.minutes ?? valorHora.minute ?? valorHora.m ?? NaN);
        const ss = Number(valorHora.seconds ?? valorHora.second ?? valorHora.s ?? 0);
        if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)) {
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }
    }

    const texto = String(valorHora).trim();
    return texto ? texto.slice(0, 30) : null;
}