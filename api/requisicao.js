import { getConnection, sql } from "../db.js";

// Função Principal que decide o que fazer
export default async function handler(req, res) {
    const { method } = req;
    try {
        switch (method) {
            case "GET": await handleGet(req, res); break;
            case "POST": await handlePost(req, res); break;
            case "PUT": await handlePut(req, res); break;
            default:
                res.setHeader("Allow", ["GET", "POST", "PUT"]);
                res.status(405).end(`Method ${method} Not Allowed`);
        }
    } catch (err) {
        console.error("Erro geral no handler de /api/requisicao:", err);
        res.status(500).json({ message: "Erro interno do servidor." });
    }
}

// --- LÓGICA GET (COM AJUSTE NA BUSCA DO LOG) ---
async function handleGet(req, res) {
    const { id, idReqItemLog } = req.query;
    const pool = await getConnection();
    if (id) {
        const headerResult = await pool.request().input('idReq', sql.Int, id).query("SELECT * FROM [dbo].[TB_REQUISICOES] WHERE ID_REQ = @idReq");
        if (headerResult.recordset.length === 0) return res.status(404).json({ message: "Requisição não encontrada" });
        const itemsResult = await pool.request().input('idReqItems', sql.Int, id).query(`SELECT I.*, P.DESCRICAO AS DESCRICAO_PRODUTO FROM [dbo].[TB_REQ_ITEM] I LEFT JOIN [dbo].[CAD_PROD] P ON I.CODIGO = P.CODIGO WHERE I.ID_REQ = @idReqItems ORDER BY I.ID_REQ_ITEM`);
        return res.status(200).json({ header: headerResult.recordset[0], items: itemsResult.recordset });
    } else if (idReqItemLog) {
        // CORREÇÃO: Busca a nova coluna DT_HR_ALTERACAO para a conversão de fuso
        const result = await pool.request().input('ID_REQ_ITEM', sql.Int, idReqItemLog).query("SELECT STATUS_ANTERIOR, STATUS_NOVO, RESPONSAVEL, DT_HR_ALTERACAO FROM TB_REQ_ITEM_LOG WHERE ID_REQ_ITEM = @ID_REQ_ITEM ORDER BY DT_HR_ALTERACAO DESC;");
        return res.status(200).json(result.recordset);
    } else {
        const result = await pool.request().query("SELECT H.ID_REQ, H.DT_REQUISICAO, H.DT_NECESSIDADE, H.STATUS, H.PRIORIDADE, H.SOLICITANTE, (SELECT COUNT(*) FROM [dbo].[TB_REQ_ITEM] I WHERE I.ID_REQ = H.ID_REQ) AS TOTAL_ITENS FROM [dbo].[TB_REQUISICOES] H ORDER BY H.ID_REQ DESC;");
        return res.status(200).json(result.recordset);
    }
}

// --- LÓGICA POST (sem alterações) ---
async function handlePost(req, res) {
    const { action } = req.body;
    const pool = await getConnection();
    
    if (action === 'createHeader') {
        const { dtNecessidade, prioridade, solicitante } = req.body;
        const result = await pool.request().input('SOLICITANTE', sql.NVarChar, solicitante).input('DT_REQUISICAO', sql.Date, new Date()).input('HR_REQUSICAO', sql.NVarChar, new Date().toLocaleTimeString()).input('STATUS', sql.NVarChar, 'Pendente').input('DT_NECESSIDADE', sql.Date, dtNecessidade).input('PRIORIDADE', sql.NVarChar, prioridade).query("INSERT INTO [dbo].[TB_REQUISICOES] (SOLICITANTE, DT_REQUISICAO, HR_REQUSICAO, STATUS, DT_NECESSIDADE, PRIORIDADE) OUTPUT INSERTED.ID_REQ VALUES (@SOLICITANTE, @DT_REQUISICAO, @HR_REQUSICAO, @STATUS, @DT_NECESSIDADE, @PRIORIDADE);");
        return res.status(201).json({ idReq: result.recordset[0].ID_REQ });
    } else if (action === 'uploadItems') {
        const { data, idReq } = req.body;
        let idReqItem = 1;
        for (let row of data) {
            const { CODIGO, QNT_REQ } = row;
            if (!CODIGO || isNaN(parseFloat(QNT_REQ))) continue;
            await pool.request().input('ID_REQ', sql.Int, idReq).input('ID_REQ_ITEM', sql.Int, idReqItem++).input('CODIGO', sql.NVarChar, CODIGO).input('QNT_REQ', sql.Float, QNT_REQ).input('QNT_PAGA', sql.Float, 0).input('SALDO', sql.Float, QNT_REQ).input('STATUS_ITEM', sql.NVarChar, 'Pendente').query("INSERT INTO [dbo].[TB_REQ_ITEM] (ID_REQ, ID_REQ_ITEM, CODIGO, QNT_REQ, QNT_PAGA, SALDO, STATUS_ITEM) VALUES (@ID_REQ, @ID_REQ_ITEM, @CODIGO, @QNT_REQ, @QNT_PAGA, @SALDO, @STATUS_ITEM)");
        }
        return res.status(201).json({ message: "Itens inseridos com sucesso" });
    } else if (action === 'atender') {
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
    await request.input('STATUS_HEADER', sql.NVarChar, novoStatusHeader).query("UPDATE TB_REQUISICOES SET STATUS = @STATUS_HEADER WHERE ID_REQ = @ID_REQ_HEADER");
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
                .query("UPDATE TB_REQUISICOES SET STATUS = @STATUS WHERE ID_REQ = @ID_REQ");
        }

        await transaction.commit();
        return res.status(200).json({ message: "Item atualizado com sucesso!" });

    } catch (err) {
        await transaction.rollback();
        console.error("Erro na transação de atendimento:", err);
        return res.status(500).json({ message: "Erro no servidor ao tentar atender o item.", error: err.message });
    }
}