import { getConnection, sql } from "../db.js";

// Habilitar CORS
const setCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
    setCorsHeaders(res);

    // Tratamento de OPTIONS para preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return await listarProdutos(req, res);
    } else if (req.method === 'POST') {
        return await atualizarProdutos(req, res);
    }

    return res.status(405).json({ message: "Método não permitido" });
}

async function listarProdutos(req, res) {
    try {
        const { acao, codigo, descricao, curva, ativo } = req.query;

        if (acao !== 'listar') {
            return res.status(400).json({ message: "Ação inválida" });
        }

        const pool = await getConnection();

        // Query base
        let query = `
            SELECT 
                CODIGO,
                DESCRICAO,
                TIPO,
                CURVA_A_B_C,
                ISNULL(ATIVO, 'S') AS ATIVO
            FROM [dbo].[CAD_PROD]
            WHERE 1=1
        `;

        const request = pool.request();

        // Adiciona filtros dinâmicos
        if (codigo && codigo.trim()) {
            query += ` AND CODIGO LIKE '%' + @CODIGO + '%'`;
            request.input('CODIGO', sql.NVarChar, codigo.trim());
        }

        if (descricao && descricao.trim()) {
            query += ` AND DESCRICAO LIKE '%' + @DESCRICAO + '%'`;
            request.input('DESCRICAO', sql.NVarChar, descricao.trim());
        }

        if (curva && curva.trim()) {
            if (curva === 'C') {
                // C inclui NULL, '', e 'C'
                query += ` AND (CURVA_A_B_C IS NULL OR CURVA_A_B_C = '' OR CURVA_A_B_C = 'C')`;
            } else {
                query += ` AND CURVA_A_B_C = @CURVA`;
                request.input('CURVA', sql.NVarChar(1), curva.trim());
            }
        }

        if (ativo && ativo.trim()) {
            query += ` AND ISNULL(ATIVO, 'S') = @ATIVO`;
            request.input('ATIVO', sql.NVarChar(1), ativo.trim());
        }

        query += ` ORDER BY CODIGO`;

        console.log('📦 Query de busca de produtos:', query);

        const result = await request.query(query);

        console.log('✅ Produtos encontrados:', result.recordset.length);

        return res.status(200).json({
            produtos: result.recordset
        });

    } catch (err) {
        console.error("❌ Erro ao listar produtos:", err);
        return res.status(500).json({ 
            message: "Erro ao listar produtos", 
            error: err.message 
        });
    }
}

async function atualizarProdutos(req, res) {
    try {
        const { acao, alteracoes } = req.body;

        if (acao !== 'atualizar') {
            return res.status(400).json({ message: "Ação inválida" });
        }

        if (!alteracoes || !Array.isArray(alteracoes) || alteracoes.length === 0) {
            return res.status(400).json({ message: "Nenhuma alteração fornecida" });
        }

        console.log('💾 Atualizando produtos:', alteracoes);

        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);

        try {
            await transaction.begin();

            let atualizados = 0;

            for (const item of alteracoes) {
                const { codigo, curva, ativo } = item;

                if (!codigo) {
                    console.warn('⚠️ Item inválido ignorado (sem código):', item);
                    continue;
                }

                // Valida valor da curva (se fornecido)
                if (curva && !['A', 'B', 'C'].includes(curva)) {
                    console.warn('⚠️ Valor de curva inválido:', curva);
                    continue;
                }

                // Valida valor do ativo (se fornecido)
                if (ativo && !['S', 'N'].includes(ativo)) {
                    console.warn('⚠️ Valor de ativo inválido:', ativo);
                    continue;
                }

                const request = new sql.Request(transaction);
                
                // Monta UPDATE dinâmico
                let setClauses = [];
                if (curva) {
                    setClauses.push('CURVA_A_B_C = @CURVA');
                    request.input('CURVA', sql.NVarChar(1), curva);
                }
                if (ativo) {
                    setClauses.push('ATIVO = @ATIVO');
                    request.input('ATIVO', sql.NVarChar(1), ativo);
                }

                if (setClauses.length === 0) {
                    console.warn('⚠️ Nenhum campo para atualizar:', item);
                    continue;
                }

                request.input('CODIGO', sql.NVarChar, codigo);
                
                await request.query(`
                    UPDATE [dbo].[CAD_PROD]
                    SET ${setClauses.join(', ')}
                    WHERE CODIGO = @CODIGO
                `);

                atualizados++;
                console.log(`✅ Produto ${codigo} atualizado${curva ? ` (curva: ${curva})` : ''}${ativo ? ` (ativo: ${ativo})` : ''}`);
            }

            await transaction.commit();

            console.log(`✅ Total de produtos atualizados: ${atualizados}`);

            return res.status(200).json({
                message: `${atualizados} produto(s) atualizado(s) com sucesso`,
                atualizados: atualizados
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        console.error("❌ Erro ao atualizar produtos:", err);
        return res.status(500).json({ 
            message: "Erro ao atualizar produtos", 
            error: err.message 
        });
    }
}
