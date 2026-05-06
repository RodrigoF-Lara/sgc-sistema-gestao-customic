import { getConnection, sql } from "../db.js";

export default async function handler(req, res) {
    const { acao } = req.query;

    // GET: Gerar, Listar ou Abrir inventário
    if (req.method === "GET") {
        if (acao === 'gerarLista') {
            return await gerarListaInventario(req, res);
        } else if (acao === 'listar') {
            return await listarInventarios(req, res);
        } else if (acao === 'abrir') {
            return await abrirInventario(req, res);
        } else if (acao === 'buscarProduto') {
            return await buscarProduto(req, res);
        }
    }

    // POST: Salvar, Finalizar ou Salvar Contagem
    if (req.method === "POST") {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { acao } = body;
        if (acao === 'salvar') {
            return await salvarInventario(req, res);
        } else if (acao === 'finalizar') {
            return await finalizarInventario(req, res);
        } else if (acao === 'salvarContagem') {
            return await salvarContagemIndividual(req, res);
        } else if (acao === 'adicionarItem') {
            return await adicionarItemInventario(req, res);
        } else if (acao === 'removerItem') {
            return await removerItemInventario(req, res);
        }
    }

    return res.status(400).json({ message: "Ação não especificada ou inválida" });
}

// Gera uma nova lista de inventário com 3 blocos
async function gerarListaInventario(req, res) {
    try {
        const pool = await getConnection();
        let todosItens = [];
        
        // BUSCA AS CONFIGURAÇÕES SALVAS
        const configResult = await pool.request().query(`
            SELECT TOP 1 *
            FROM [dbo].[TB_CONFIG_INVENTARIO]
            ORDER BY ID_CONFIG DESC;
        `);

        if (configResult.recordset.length === 0) {
            return res.status(500).json({ 
                message: "Configurações de inventário não encontradas. Configure primeiro em Configurações." 
            });
        }

        const config = configResult.recordset[0];
        const BLOCO1_QTD = config.BLOCO1_QTD_ITENS;
        const BLOCO1_DIAS = config.BLOCO1_DIAS_MOVIMENTACAO;
        const BLOCO2_QTD = config.BLOCO2_QTD_ITENS;
        const BLOCO2_ACURACIDADE = config.BLOCO2_ACURACIDADE_MIN;
        const BLOCO3_QTD = config.BLOCO3_QTD_ITENS;
        const BLOCO4_QTD = config.BLOCO4_QTD_ITENS || 5;
        const BLOCO5_QTD = config.BLOCO5_QTD_ITENS || 10;
        const BLOCO5_INV_ATRAS = config.BLOCO5_INVENTARIOS_ATRAS || 3;

        console.log('📋 Configurações carregadas:', {
            BLOCO1_QTD, BLOCO1_DIAS, BLOCO2_QTD, BLOCO2_ACURACIDADE, 
            BLOCO3_QTD, BLOCO4_QTD, BLOCO5_QTD, BLOCO5_INV_ATRAS
        });

        // ── BLOCO 2 roda PRIMEIRO (tem prioridade sobre movimentação) ──────────
        // Itens com baixa acuracidade no último inventário FINALIZADO
        const debugBloco2 = { etapa: 'nao_iniciado' };
        try {
            const ultimoInv = await pool.request().query(`
                SELECT TOP 1 ID_INVENTARIO, STATUS, DT_CRIACAO
                FROM [dbo].[TB_INVENTARIO_CICLICO]
                WHERE STATUS = 'FINALIZADO'
                ORDER BY ID_INVENTARIO DESC;
            `);

            console.log('🔍 Último inventário FINALIZADO encontrado:', ultimoInv.recordset);

            if (ultimoInv.recordset.length === 0) {
                console.log('⚠️ Nenhum inventário FINALIZADO encontrado. Pulando Bloco 2.');
                debugBloco2.etapa = 'sem_inventario_finalizado';
            } else {
                const idUltimoInventario = ultimoInv.recordset[0].ID_INVENTARIO;
                debugBloco2.idInventarioFinalizado = idUltimoInventario;
                debugBloco2.acuracidadeMinima = BLOCO2_ACURACIDADE;
                debugBloco2.qtdMaxima = BLOCO2_QTD;
                console.log(`📋 Buscando itens com acuracidade < ${BLOCO2_ACURACIDADE}% do inventário #${idUltimoInventario}`);

                // Diagnóstico completo
                const todosItensInv = await pool.request()
                    .input('ID_INV_DEBUG', sql.Int, idUltimoInventario)
                    .query(`
                        SELECT CODIGO, ACURACIDADE, ISNULL(ACURACIDADE, 0) AS ACURACIDADE_TRATADA
                        FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                        WHERE ID_INVENTARIO = @ID_INV_DEBUG
                        ORDER BY ACURACIDADE ASC;
                    `);
                debugBloco2.totalItensNoInventarioFinalizado = todosItensInv.recordset.length;
                debugBloco2.itensComAcuracidadeNull = todosItensInv.recordset.filter(i => i.ACURACIDADE === null).length;
                debugBloco2.itensBaixaAcuracidadeSemFiltro = todosItensInv.recordset
                    .filter(i => (i.ACURACIDADE === null ? 0 : i.ACURACIDADE) < BLOCO2_ACURACIDADE)
                    .map(i => ({ CODIGO: i.CODIGO, ACURACIDADE: i.ACURACIDADE }));
                debugBloco2.etapa = 'filtro_aplicado';

                const bloco2 = await pool.request()
                    .input('ID_INV', sql.Int, idUltimoInventario)
                    .input('ACURACIDADE_MIN', sql.Float, BLOCO2_ACURACIDADE)
                    .input('QTD_ITENS', sql.Int, BLOCO2_QTD)
                    .query(`
                    WITH ItensBaixaAcuracidade AS (
                        SELECT 
                            i.CODIGO,
                            i.DESCRICAO,
                            ISNULL(i.ACURACIDADE, 0) AS ACURACIDADE,
                            i.SALDO_SISTEMA
                        FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
                        WHERE i.ID_INVENTARIO = @ID_INV
                            AND ISNULL(i.ACURACIDADE, 0) < @ACURACIDADE_MIN
                    ),
                    SaldoAtual AS (
                        SELECT 
                            CODIGO,
                            ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                        FROM [dbo].[KARDEX_2026_EMBALAGEM]
                        WHERE D_E_L_E_T_ <> '*'
                        GROUP BY CODIGO
                    ),
                    CustoUnitario AS (
                        SELECT 
                            np.PROD_COD_PROD AS CODIGO,
                            np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNIT,
                            ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                        FROM [dbo].[NF_PRODUTOS] np
                        INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                        WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                            AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                    )
                    SELECT TOP (@QTD_ITENS)
                        iba.CODIGO,
                        iba.DESCRICAO,
                        iba.ACURACIDADE AS ACURACIDADE_ANTERIOR,
                        ISNULL(s.SALDO_ATUAL, 0) AS SALDO_ATUAL,
                        ISNULL(cu.CUSTO_UNIT, 0) AS CUSTO_UNITARIO,
                        ISNULL(s.SALDO_ATUAL, 0) * ISNULL(cu.CUSTO_UNIT, 0) AS VALOR_TOTAL_ESTOQUE,
                        'BAIXA_ACURACIDADE' AS BLOCO
                    FROM ItensBaixaAcuracidade iba
                    LEFT JOIN SaldoAtual s ON iba.CODIGO = s.CODIGO
                    LEFT JOIN CustoUnitario cu ON iba.CODIGO = cu.CODIGO AND cu.RN = 1
                    ORDER BY iba.ACURACIDADE ASC;
                `);

                debugBloco2.retornouDaQuery = bloco2.recordset.length;
                console.log(`✅ Bloco 2 retornou ${bloco2.recordset.length} itens`);
                todosItens.push(...bloco2.recordset);
            }
        } catch (err) {
            debugBloco2.erro = err.message;
            console.error('❌ Erro COMPLETO ao buscar bloco 2:', err);
        }

        const codigosBloco2 = todosItens.map(item => item.CODIGO);

        // ── BLOCO 1: Mais movimentados (exclui o que bloco 2 já pegou) ──────────
        try {
            const bloco1 = await pool.request()
                .input('DIAS', sql.Int, BLOCO1_DIAS)
                .input('QTD_ITENS', sql.Int, BLOCO1_QTD)
                .query(`
                WITH Movimentacoes AS (
                    SELECT 
                        k.CODIGO,
                        COUNT(*) AS TOTAL_MOVIMENTACOES,
                        SUM(ABS(k.QNT)) AS TOTAL_QUANTIDADE_MOVIMENTADA
                    FROM [dbo].[KARDEX_2026] k
                    WHERE 
                        k.DT >= DATEADD(DAY, -@DIAS, GETDATE())
                        AND k.D_E_L_E_T_ <> '*'
                    GROUP BY k.CODIGO
                ),
                SaldoAtual AS (
                    SELECT 
                        CODIGO,
                        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                    GROUP BY CODIGO
                ),
                CustoUnitario AS (
                    SELECT 
                        np.PROD_COD_PROD AS CODIGO,
                        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNIT,
                        ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                    FROM [dbo].[NF_PRODUTOS] np
                    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                )
                SELECT TOP (@QTD_ITENS)
                    m.CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    m.TOTAL_MOVIMENTACOES,
                    m.TOTAL_QUANTIDADE_MOVIMENTADA,
                    ISNULL(s.SALDO_ATUAL, 0) AS SALDO_ATUAL,
                    ISNULL(cu.CUSTO_UNIT, 0) AS CUSTO_UNITARIO,
                    ISNULL(s.SALDO_ATUAL, 0) * ISNULL(cu.CUSTO_UNIT, 0) AS VALOR_TOTAL_ESTOQUE,
                    'MOVIMENTACAO' AS BLOCO
                FROM Movimentacoes m
                LEFT JOIN [dbo].[CAD_PROD] cp ON m.CODIGO = cp.CODIGO
                LEFT JOIN SaldoAtual s ON m.CODIGO = s.CODIGO
                LEFT JOIN CustoUnitario cu ON m.CODIGO = cu.CODIGO AND cu.RN = 1
                ${codigosBloco2.length > 0 ? `WHERE m.CODIGO NOT IN ('${codigosBloco2.join("','")}')` : ''}
                ORDER BY m.TOTAL_MOVIMENTACOES DESC, m.TOTAL_QUANTIDADE_MOVIMENTADA DESC;
            `);
            console.log(`✅ Bloco 1 retornou ${bloco1.recordset.length} itens`);
            todosItens.push(...bloco1.recordset);
        } catch (err) {
            console.warn('Erro ao buscar bloco 1 (movimentação):', err.message);
        }

        const codigosBloco1e2 = todosItens.map(item => item.CODIGO);

        // BLOCO 3: Maior valor em estoque (usando configuração)
        try {
            const bloco3 = await pool.request()
                .input('QTD_ITENS', sql.Int, BLOCO3_QTD)
                .query(`
                WITH UltimaNFPorProduto AS (
                    SELECT 
                        np.PROD_COD_PROD AS CODIGO,
                        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNITARIO,
                        nc.CAB_DT_EMISSAO,
                        ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                    FROM [dbo].[NF_PRODUTOS] np
                    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                ),
                CustoMaisRecente AS (
                    SELECT CODIGO, CUSTO_UNITARIO
                    FROM UltimaNFPorProduto
                    WHERE RN = 1
                ),
                SaldoAtual AS (
                    SELECT 
                        CODIGO,
                        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                    GROUP BY CODIGO
                    HAVING ISNULL(SUM(SALDO), 0) > 0
                ),
                SaldoValorizado AS (
                    SELECT 
                        s.CODIGO,
                        s.SALDO_ATUAL,
                        ISNULL(c.CUSTO_UNITARIO, 0) AS CUSTO_UNITARIO,
                        s.SALDO_ATUAL * ISNULL(c.CUSTO_UNITARIO, 0) AS VALOR_TOTAL_ESTOQUE
                    FROM SaldoAtual s
                    LEFT JOIN CustoMaisRecente c ON s.CODIGO = c.CODIGO
                    WHERE c.CUSTO_UNITARIO IS NOT NULL
                        ${codigosBloco1e2.length > 0 ? `AND s.CODIGO NOT IN ('${codigosBloco1e2.join("','")}')`  : ''}
                )
                SELECT TOP (@QTD_ITENS)
                    sv.CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    sv.SALDO_ATUAL,
                    sv.CUSTO_UNITARIO AS PRECO_UNITARIO,
                    sv.VALOR_TOTAL_ESTOQUE,
                    'MAIOR_VALOR' AS BLOCO
                FROM SaldoValorizado sv
                LEFT JOIN [dbo].[CAD_PROD] cp ON sv.CODIGO = cp.CODIGO
                ORDER BY sv.VALOR_TOTAL_ESTOQUE DESC;
            `);
            
            console.log(`✅ Bloco 3 retornou ${bloco3.recordset.length} itens`);
            todosItens.push(...bloco3.recordset);
        } catch (err) {
            console.error('❌ Erro ao buscar bloco 3:', err);
        }

        const codigosBloco1e2e3 = todosItens.map(item => item.CODIGO);

        // BLOCO 4: Maior valor unitário
        try {
            const bloco4 = await pool.request()
                .input('QTD_ITENS', sql.Int, BLOCO4_QTD)
                .query(`
                WITH UltimaNFPorProduto AS (
                    SELECT 
                        np.PROD_COD_PROD AS CODIGO,
                        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNITARIO,
                        nc.CAB_DT_EMISSAO,
                        ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                    FROM [dbo].[NF_PRODUTOS] np
                    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                ),
                CustoMaisRecente AS (
                    SELECT CODIGO, CUSTO_UNITARIO
                    FROM UltimaNFPorProduto
                    WHERE RN = 1
                ),
                SaldoAtual AS (
                    SELECT 
                        CODIGO,
                        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                    GROUP BY CODIGO
                )
                SELECT TOP (@QTD_ITENS)
                    c.CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    ISNULL(s.SALDO_ATUAL, 0) AS SALDO_ATUAL,
                    c.CUSTO_UNITARIO AS CUSTO_UNITARIO,
                    c.CUSTO_UNITARIO AS PRECO_UNITARIO,
                    ISNULL(s.SALDO_ATUAL, 0) * c.CUSTO_UNITARIO AS VALOR_TOTAL_ESTOQUE,
                    'MAIOR_VALOR_UNITARIO' AS BLOCO,
                    0 AS TOTAL_MOVIMENTACOES
                FROM CustoMaisRecente c
                LEFT JOIN SaldoAtual s ON c.CODIGO = s.CODIGO
                LEFT JOIN [dbo].[CAD_PROD] cp ON c.CODIGO = cp.CODIGO
                WHERE ${codigosBloco1e2e3.length > 0 ? `c.CODIGO NOT IN ('${codigosBloco1e2e3.join("','")}')`  : '1=1'}
                    AND ISNULL(s.SALDO_ATUAL, 0) > 0
                ORDER BY c.CUSTO_UNITARIO DESC;
            `);
            
            console.log(`✅ Bloco 4 retornou ${bloco4.recordset.length} itens`);
            todosItens.push(...bloco4.recordset);
        } catch (err) {
            console.error('❌ Erro ao buscar bloco 4:', err);
        }

        const codigosBloco1e2e3e4 = todosItens.map(item => item.CODIGO);

        // BLOCO 5: Não contados nos últimos N inventários
        try {
            const bloco5 = await pool.request()
                .input('QTD_ITENS', sql.Int, BLOCO5_QTD)
                .input('INVENTARIOS_ATRAS', sql.Int, BLOCO5_INV_ATRAS)
                .query(`
                WITH UltimosInventarios AS (
                    SELECT TOP (@INVENTARIOS_ATRAS) ID_INVENTARIO
                    FROM [dbo].[TB_INVENTARIO_CICLICO]
                    WHERE STATUS = 'FINALIZADO'
                    ORDER BY ID_INVENTARIO DESC
                ),
                ItensContadosRecentemente AS (
                    SELECT DISTINCT ici.CODIGO
                    FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] ici
                    WHERE ici.ID_INVENTARIO IN (SELECT ID_INVENTARIO FROM UltimosInventarios)
                        AND ici.CONTAGEM_FISICA IS NOT NULL
                        AND ici.CONTAGEM_FISICA >= 0
                ),
                SaldoAtual AS (
                    SELECT 
                        CODIGO,
                        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                    GROUP BY CODIGO
                    HAVING ISNULL(SUM(SALDO), 0) > 0
                ),
                CustoUnitario AS (
                    SELECT 
                        np.PROD_COD_PROD AS CODIGO,
                        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNIT,
                        ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                    FROM [dbo].[NF_PRODUTOS] np
                    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                )
                SELECT TOP (@QTD_ITENS)
                    s.CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    s.SALDO_ATUAL,
                    ISNULL(cu.CUSTO_UNIT, 0) AS PRECO_UNITARIO,
                    s.SALDO_ATUAL * ISNULL(cu.CUSTO_UNIT, 0) AS VALOR_TOTAL_ESTOQUE,
                    'NAO_CONTADO' AS BLOCO,
                    0 AS TOTAL_MOVIMENTACOES
                FROM SaldoAtual s
                LEFT JOIN [dbo].[CAD_PROD] cp ON s.CODIGO = cp.CODIGO
                LEFT JOIN CustoUnitario cu ON s.CODIGO = cu.CODIGO AND cu.RN = 1
                WHERE s.CODIGO NOT IN (SELECT CODIGO FROM ItensContadosRecentemente)
                    AND ${codigosBloco1e2e3e4.length > 0 ? `s.CODIGO NOT IN ('${codigosBloco1e2e3e4.join("','")}')`  : '1=1'}
                ORDER BY s.SALDO_ATUAL * ISNULL(cu.CUSTO_UNIT, 0) DESC;
            `);
            
            console.log(`✅ Bloco 5 retornou ${bloco5.recordset.length} itens`);
            todosItens.push(...bloco5.recordset);
        } catch (err) {
            console.error('❌ Erro ao buscar bloco 5:', err);
        }

        // Conta itens por bloco
        const blocosCont = {
            movimentacao: todosItens.filter(i => i.BLOCO === 'MOVIMENTACAO').length,
            baixaAcuracidade: todosItens.filter(i => i.BLOCO === 'BAIXA_ACURACIDADE').length,
            maiorValor: todosItens.filter(i => i.BLOCO === 'MAIOR_VALOR').length,
            maiorValorUnitario: todosItens.filter(i => i.BLOCO === 'MAIOR_VALOR_UNITARIO').length,
            naoContado: todosItens.filter(i => i.BLOCO === 'NAO_CONTADO').length
        };

        if (todosItens.length === 0) {
            return res.status(400).json({ 
                message: "Nenhum item encontrado para inventário. Verifique se há dados no sistema." 
            });
        }

        // Busca localizações (ARMAZEM + ENDERECO) de todos os itens de uma vez
        const todosCodigosUnicos = [...new Set(todosItens.map(i => i.CODIGO))];
        let localizacoesPorCodigo = {};
        if (todosCodigosUnicos.length > 0) {
            try {
                const codigosParam = todosCodigosUnicos.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
                const locResult = await pool.request().query(`
                    SELECT CODIGO,
                           STRING_AGG(CAST(ARMAZEM AS NVARCHAR(MAX)) + ' / ' + CAST(ENDERECO AS NVARCHAR(MAX)), ' | ')
                               WITHIN GROUP (ORDER BY ARMAZEM, ENDERECO) AS LOCALIZACAO
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                      AND CODIGO IN (${codigosParam})
                      AND ISNULL(ENDERECO,'') <> ''
                      AND SALDO > 0
                    GROUP BY CODIGO
                `);
                locResult.recordset.forEach(r => {
                    localizacoesPorCodigo[r.CODIGO] = r.LOCALIZACAO;
                });
            } catch (err) {
                console.warn('Aviso: não foi possível buscar localizações:', err.message);
            }
        }

        // Mescla localização em cada item
        todosItens = todosItens.map(item => ({
            ...item,
            LOCALIZACAO: localizacoesPorCodigo[item.CODIGO] || ''
        }));

        // Calcula valor total geral
        const valorTotalGeral = todosItens.reduce((sum, item) => sum + (item.VALOR_TOTAL_ESTOQUE || 0), 0);

        console.log('📊 Resumo dos blocos:', blocosCont);
        console.log('💰 Valor total em estoque:', valorTotalGeral.toFixed(2));

        return res.status(200).json({
            itens: todosItens,
            dataGeracao: new Date().toISOString(),
            criterio: `Bloco 1: ${blocosCont.movimentacao} movimentados | Bloco 2: ${blocosCont.baixaAcuracidade} acurac.<${BLOCO2_ACURACIDADE}% | Bloco 3: ${blocosCont.maiorValor} maior valor | Bloco 4: ${blocosCont.maiorValorUnitario} maior vlr unit. | Bloco 5: ${blocosCont.naoContado} não contados`,
            blocos: blocosCont,
            valorTotalGeral: valorTotalGeral,
            debugBloco2: debugBloco2,
            configuracao: {
                bloco1Qtd: BLOCO1_QTD,
                bloco1Dias: BLOCO1_DIAS,
                bloco2Qtd: BLOCO2_QTD,
                bloco2Acuracidade: BLOCO2_ACURACIDADE,
                bloco3Qtd: BLOCO3_QTD,
                bloco4Qtd: BLOCO4_QTD,
                bloco5Qtd: BLOCO5_QTD,
                bloco5InventariosAtras: BLOCO5_INV_ATRAS
            }
        });

    } catch (err) {
        console.error("ERRO DETALHADO ao gerar lista:", err);
        return res.status(500).json({ 
            message: "Erro ao gerar lista de inventário", 
            error: err.message,
            stack: err.stack 
        });
    }
}

// Salva um novo inventário
async function salvarInventario(req, res) {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { inventario, usuario } = body;
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        // Calcula valor total geral
        const valorTotalGeral = inventario.itens.reduce((sum, item) => sum + (item.VALOR_TOTAL_ESTOQUE || 0), 0);

        // Insere o cabeçalho do inventário
        const headerResult = await transaction.request()
            .input('DT_GERACAO', sql.DateTime, new Date(inventario.dataGeracao))
            .input('CRITERIO', sql.NVarChar, inventario.criterio)
            .input('STATUS', sql.NVarChar, 'EM_ANDAMENTO')
            .input('TOTAL_ITENS', sql.Int, inventario.itens.length)
            .input('VALOR_TOTAL_GERAL', sql.Float, valorTotalGeral)
            .input('USUARIO_CRIACAO', sql.NVarChar, usuario)
            .query(`
                INSERT INTO [dbo].[TB_INVENTARIO_CICLICO] 
                (DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS, VALOR_TOTAL_GERAL, USUARIO_CRIACAO, DT_CRIACAO)
                OUTPUT INSERTED.ID_INVENTARIO
                VALUES (@DT_GERACAO, @CRITERIO, @STATUS, @TOTAL_ITENS, @VALOR_TOTAL_GERAL, @USUARIO_CRIACAO, GETDATE());
            `);

        const idInventario = headerResult.recordset[0].ID_INVENTARIO;

        // Insere os itens do inventário
        for (const item of inventario.itens) {
            await transaction.request()
                .input('ID_INVENTARIO', sql.Int, idInventario)
                .input('CODIGO', sql.NVarChar, item.CODIGO)
                .input('DESCRICAO', sql.NVarChar, item.DESCRICAO)
                .input('SALDO_SISTEMA', sql.Float, item.SALDO_ATUAL || 0)
                .input('CONTAGEM_FISICA', sql.Float, item.CONTAGEM_FISICA || 0)
                .input('TOTAL_MOVIMENTACOES', sql.Int, item.TOTAL_MOVIMENTACOES || 0)
                .input('BLOCO', sql.NVarChar, item.BLOCO || 'MOVIMENTACAO')
                .input('CUSTO_UNITARIO', sql.Float, item.CUSTO_UNITARIO || 0)
                .input('VALOR_TOTAL_ESTOQUE', sql.Float, item.VALOR_TOTAL_ESTOQUE || 0)
                .query(`
                    INSERT INTO [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                    (ID_INVENTARIO, CODIGO, DESCRICAO, SALDO_SISTEMA, CONTAGEM_FISICA, TOTAL_MOVIMENTACOES, BLOCO, CUSTO_UNITARIO, VALOR_TOTAL_ESTOQUE)
                    VALUES (@ID_INVENTARIO, @CODIGO, @DESCRICAO, @SALDO_SISTEMA, @CONTAGEM_FISICA, @TOTAL_MOVIMENTACOES, @BLOCO, @CUSTO_UNITARIO, @VALOR_TOTAL_ESTOQUE);
                `);
        }

        await transaction.commit();

        return res.status(200).json({ 
            message: "Inventário salvo com sucesso",
            idInventario: idInventario
        });

    } catch (err) {
        console.error("ERRO ao salvar inventário:", err);
        return res.status(500).json({ 
            message: "Erro ao salvar inventário", 
            error: err.message 
        });
    }
}

// Lista todos os inventários
async function listarInventarios(req, res) {
    try {
        const pool = await getConnection();
        
        const result = await pool.request().query(`
            SELECT 
                ic.ID_INVENTARIO,
                ic.DT_GERACAO,
                ic.CRITERIO,
                ic.STATUS,
                ic.TOTAL_ITENS,
                ic.ACURACIDADE,
                ic.VALOR_TOTAL_GERAL,
                ic.USUARIO_CRIACAO,
                ic.DT_CRIACAO,
                ic.USUARIO_FINALIZACAO,
                ic.DT_FINALIZACAO,
                -- Calcula itens com divergência (diferença != 0)
                (SELECT COUNT(*) 
                 FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] ici
                 WHERE ici.ID_INVENTARIO = ic.ID_INVENTARIO 
                 AND ici.DIFERENCA != 0) AS ITENS_DIVERGENTES
            FROM [dbo].[TB_INVENTARIO_CICLICO] ic
            ORDER BY ic.ID_INVENTARIO DESC;
        `);

        return res.status(200).json({ inventarios: result.recordset });

    } catch (err) {
        console.error("ERRO ao listar inventários:", err);
        return res.status(500).json({ 
            message: "Erro ao listar inventários", 
            error: err.message 
        });
    }
}

// Abre um inventário específico
async function abrirInventario(req, res) {
    try {
        const { id } = req.query;
        const pool = await getConnection();

        // Busca o cabeçalho
        const headerResult = await pool.request()
            .input('ID_INVENTARIO', sql.Int, id)
            .query(`
                SELECT * FROM [dbo].[TB_INVENTARIO_CICLICO]
                WHERE ID_INVENTARIO = @ID_INVENTARIO;
            `);

        if (headerResult.recordset.length === 0) {
            return res.status(404).json({ message: "Inventário não encontrado" });
        }

        const header = headerResult.recordset[0];

        // Busca os itens
        const itemsResult = await pool.request()
            .input('ID_INVENTARIO', sql.Int, id)
            .query(`
                SELECT CODIGO, DESCRICAO, SALDO_SISTEMA, CONTAGEM_FISICA, TOTAL_MOVIMENTACOES, BLOCO, USUARIO_CONTAGEM, DT_CONTAGEM, CUSTO_UNITARIO, VALOR_TOTAL_ESTOQUE
                FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                WHERE ID_INVENTARIO = @ID_INVENTARIO
                ORDER BY CODIGO;
            `);

        // Calcula o total a partir dos itens para garantir consistência com as linhas exibidas
        const valorTotalGeralCalculado = itemsResult.recordset.reduce((sum, item) => sum + (item.VALOR_TOTAL_ESTOQUE || 0), 0);

        // Busca localizações com saldo > 0 para os itens do inventário
        let localizacoesPorCodigo = {};
        const codigos = itemsResult.recordset.map(i => i.CODIGO);
        if (codigos.length > 0) {
            try {
                const codigosParam = codigos.map(c => `'${String(c).replace(/'/g, "''")}'`).join(',');
                const locResult = await pool.request().query(`
                    SELECT CODIGO,
                           STRING_AGG(CAST(ARMAZEM AS NVARCHAR(MAX)) + ' / ' + CAST(ENDERECO AS NVARCHAR(MAX)), ' | ')
                               WITHIN GROUP (ORDER BY ARMAZEM, ENDERECO) AS LOCALIZACAO
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*'
                      AND CODIGO IN (${codigosParam})
                      AND ISNULL(ENDERECO,'') <> ''
                      AND SALDO > 0
                    GROUP BY CODIGO
                `);
                locResult.recordset.forEach(r => {
                    localizacoesPorCodigo[r.CODIGO] = r.LOCALIZACAO;
                });
            } catch (err) {
                console.warn('Aviso: não foi possível buscar localizações:', err.message);
            }
        }

        // Monta o objeto inventário
        const inventario = {
            id: header.ID_INVENTARIO,
            status: header.STATUS,
            dataGeracao: header.DT_GERACAO,
            criterio: header.CRITERIO,
            acuracidade: header.ACURACIDADE,
            valorTotalGeral: valorTotalGeralCalculado,
            itens: itemsResult.recordset.map(item => ({
                CODIGO: item.CODIGO,
                DESCRICAO: item.DESCRICAO,
                SALDO_ATUAL: item.SALDO_SISTEMA,
                CONTAGEM_FISICA: item.CONTAGEM_FISICA,
                TOTAL_MOVIMENTACOES: item.TOTAL_MOVIMENTACOES,
                USUARIO_CONTAGEM: item.USUARIO_CONTAGEM,
                DT_CONTAGEM: item.DT_CONTAGEM,
                BLOCO: item.BLOCO,
                CUSTO_UNITARIO: item.CUSTO_UNITARIO || 0,
                VALOR_TOTAL_ESTOQUE: item.VALOR_TOTAL_ESTOQUE || 0,
                LOCALIZACAO: localizacoesPorCodigo[item.CODIGO] || ''
            }))
        };

        return res.status(200).json({ inventario });

    } catch (err) {
        console.error("ERRO ao abrir inventário:", err);
        return res.status(500).json({ 
            message: "Erro ao abrir inventário", 
            error: err.message 
        });
    }
}

// Finaliza um inventário e calcula acuracidade
async function finalizarInventario(req, res) {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { idInventario, itens, usuario } = body;
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        // Atualiza as contagens físicas dos itens
        for (const item of itens) {
            await transaction.request()
                .input('ID_INVENTARIO', sql.Int, idInventario)
                .input('CODIGO', sql.NVarChar, item.CODIGO)
                .input('CONTAGEM_FISICA', sql.Float, item.CONTAGEM_FISICA || 0)
                .query(`
                    UPDATE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                    SET CONTAGEM_FISICA = @CONTAGEM_FISICA,
                        DIFERENCA = @CONTAGEM_FISICA - SALDO_SISTEMA,
                        ACURACIDADE = CASE 
                            WHEN SALDO_SISTEMA = 0 AND @CONTAGEM_FISICA = 0 THEN 100
                            WHEN SALDO_SISTEMA = 0 OR @CONTAGEM_FISICA = 0 THEN 0
                            ELSE (CAST(CASE WHEN @CONTAGEM_FISICA < SALDO_SISTEMA THEN @CONTAGEM_FISICA ELSE SALDO_SISTEMA END AS FLOAT) / 
                                  CAST(CASE WHEN @CONTAGEM_FISICA > SALDO_SISTEMA THEN @CONTAGEM_FISICA ELSE SALDO_SISTEMA END AS FLOAT)) * 100
                        END
                    WHERE ID_INVENTARIO = @ID_INVENTARIO AND CODIGO = @CODIGO;
                `);
        }

        // Calcula a acuracidade geral
        const acuracidadeResult = await transaction.request()
            .input('ID_INVENTARIO', sql.Int, idInventario)
            .query(`
                SELECT 
                    AVG(ACURACIDADE) AS ACURACIDADE_GERAL,
                    COUNT(*) AS TOTAL_ITENS,
                    SUM(CASE WHEN DIFERENCA = 0 THEN 1 ELSE 0 END) AS ITENS_CORRETOS,
                    SUM(CASE WHEN DIFERENCA <> 0 THEN 1 ELSE 0 END) AS ITENS_DIVERGENTES
                FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                WHERE ID_INVENTARIO = @ID_INVENTARIO;
            `);

        const stats = acuracidadeResult.recordset[0];

        // Atualiza o cabeçalho do inventário
        await transaction.request()
            .input('ID_INVENTARIO', sql.Int, idInventario)
            .input('STATUS', sql.NVarChar, 'FINALIZADO')
            .input('ACURACIDADE', sql.Float, stats.ACURACIDADE_GERAL)
            .input('USUARIO_FINALIZACAO', sql.NVarChar, usuario)
            .query(`
                UPDATE [dbo].[TB_INVENTARIO_CICLICO]
                SET STATUS = @STATUS,
                    ACURACIDADE = @ACURACIDADE,
                    USUARIO_FINALIZACAO = @USUARIO_FINALIZACAO,
                    DT_FINALIZACAO = GETDATE()
                WHERE ID_INVENTARIO = @ID_INVENTARIO;
            `);

        await transaction.commit();

        return res.status(200).json({ 
            message: "Inventário finalizado com sucesso",
            acuracidadeGeral: stats.ACURACIDADE_GERAL,
            totalItens: stats.TOTAL_ITENS,
            itensCorretos: stats.ITENS_CORRETOS,
            itensDivergentes: stats.ITENS_DIVERGENTES
        });

    } catch (err) {
        console.error("ERRO ao finalizar inventário:", err);
        return res.status(500).json({ 
            message: "Erro ao finalizar inventário", 
            error: err.message 
        });
    }
}

// Salva contagem individual com usuário e data/hora
async function salvarContagemIndividual(req, res) {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { idInventario, codigo, contagemFisica, usuario } = body;
        const pool = await getConnection();

        await pool.request()
            .input('ID_INVENTARIO', sql.Int, idInventario)
            .input('CODIGO', sql.NVarChar, codigo)
            .input('CONTAGEM_FISICA', sql.Float, contagemFisica)
            .input('USUARIO_CONTAGEM', sql.NVarChar, usuario)
            .input('DT_CONTAGEM', sql.DateTime, new Date())
            .query(`
                UPDATE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                SET CONTAGEM_FISICA = @CONTAGEM_FISICA,
                    USUARIO_CONTAGEM = @USUARIO_CONTAGEM,
                    DT_CONTAGEM = @DT_CONTAGEM
                WHERE ID_INVENTARIO = @ID_INVENTARIO AND CODIGO = @CODIGO;
            `);

        return res.status(200).json({ 
            message: "Contagem salva com sucesso",
            usuario: usuario,
            dataContagem: new Date().toISOString()
        });

    } catch (err) {
        console.error("ERRO ao salvar contagem individual:", err);
        return res.status(500).json({ 
            message: "Erro ao salvar contagem", 
            error: err.message 
        });
    }
}

// Busca informações de um produto específico
async function buscarProduto(req, res) {
    try {
        const { codigo } = req.query;
        const pool = await getConnection();

        const result = await pool.request()
            .input('CODIGO', sql.NVarChar, codigo)
            .query(`
                WITH UltimaNFPorProduto AS (
                    SELECT 
                        np.PROD_COD_PROD AS CODIGO,
                        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNITARIO,
                        nc.CAB_DT_EMISSAO,
                        ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                    FROM [dbo].[NF_PRODUTOS] np
                    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                        AND np.PROD_COD_PROD = @CODIGO
                ),
                SaldoAtual AS (
                    SELECT 
                        CODIGO,
                        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                    FROM [dbo].[KARDEX_2026_EMBALAGEM]
                    WHERE D_E_L_E_T_ <> '*' AND CODIGO = @CODIGO
                    GROUP BY CODIGO
                )
                SELECT 
                    @CODIGO AS CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    ISNULL(s.SALDO_ATUAL, 0) AS SALDO_ATUAL,
                    ISNULL(u.CUSTO_UNITARIO, 0) AS CUSTO_UNITARIO
                FROM (SELECT @CODIGO AS CODIGO) base
                LEFT JOIN [dbo].[CAD_PROD] cp ON base.CODIGO = cp.CODIGO
                LEFT JOIN SaldoAtual s ON base.CODIGO = s.CODIGO
                LEFT JOIN UltimaNFPorProduto u ON base.CODIGO = u.CODIGO AND u.RN = 1;
            `);

        if (result.recordset.length === 0 || result.recordset[0].DESCRICAO === 'SEM DESCRIÇÃO') {
            return res.status(404).json({ message: "Produto não encontrado no cadastro" });
        }

        return res.status(200).json({ produto: result.recordset[0] });

    } catch (err) {
        console.error("ERRO ao buscar produto:", err);
        return res.status(500).json({ 
            message: "Erro ao buscar produto", 
            error: err.message 
        });
    }
}

// Adiciona um item a um inventário já salvo (EM_ANDAMENTO)
async function adicionarItemInventario(req, res) {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { idInventario, item } = body;

        if (!idInventario || !item || !item.CODIGO) {
            return res.status(400).json({ message: "idInventario e item.CODIGO são obrigatórios." });
        }

        const pool = await getConnection();

        // Verifica se inventário existe e está EM_ANDAMENTO
        const inv = await pool.request()
            .input('ID', sql.Int, idInventario)
            .query(`SELECT STATUS FROM [dbo].[TB_INVENTARIO_CICLICO] WHERE ID_INVENTARIO = @ID`);

        if (inv.recordset.length === 0)
            return res.status(404).json({ message: "Inventário não encontrado." });
        if (inv.recordset[0].STATUS === 'FINALIZADO')
            return res.status(409).json({ message: "Não é possível alterar um inventário finalizado." });

        // Verifica se item já está no inventário
        const existe = await pool.request()
            .input('ID', sql.Int, idInventario)
            .input('CODIGO', sql.NVarChar, item.CODIGO)
            .query(`SELECT 1 FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID AND CODIGO = @CODIGO`);

        if (existe.recordset.length > 0)
            return res.status(409).json({ message: "Item já está no inventário." });

        const valorTotalEstoque = (item.SALDO_ATUAL || 0) * (item.CUSTO_UNITARIO || 0);

        await pool.request()
            .input('ID_INVENTARIO', sql.Int, idInventario)
            .input('CODIGO', sql.NVarChar, item.CODIGO)
            .input('DESCRICAO', sql.NVarChar, item.DESCRICAO || '')
            .input('SALDO_SISTEMA', sql.Float, item.SALDO_ATUAL || 0)
            .input('CONTAGEM_FISICA', sql.Float, 0)
            .input('TOTAL_MOVIMENTACOES', sql.Int, 0)
            .input('BLOCO', sql.NVarChar, item.BLOCO || 'MANUAL')
            .input('CUSTO_UNITARIO', sql.Float, item.CUSTO_UNITARIO || 0)
            .input('VALOR_TOTAL_ESTOQUE', sql.Float, valorTotalEstoque)
            .query(`
                INSERT INTO [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                (ID_INVENTARIO, CODIGO, DESCRICAO, SALDO_SISTEMA, CONTAGEM_FISICA, TOTAL_MOVIMENTACOES, BLOCO, CUSTO_UNITARIO, VALOR_TOTAL_ESTOQUE)
                VALUES (@ID_INVENTARIO, @CODIGO, @DESCRICAO, @SALDO_SISTEMA, @CONTAGEM_FISICA, @TOTAL_MOVIMENTACOES, @BLOCO, @CUSTO_UNITARIO, @VALOR_TOTAL_ESTOQUE)
            `);

        // Atualiza TOTAL_ITENS e VALOR_TOTAL_GERAL no cabeçalho
        await pool.request()
            .input('ID', sql.Int, idInventario)
            .query(`
                UPDATE [dbo].[TB_INVENTARIO_CICLICO]
                SET TOTAL_ITENS = (SELECT COUNT(*) FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID),
                    VALOR_TOTAL_GERAL = (SELECT ISNULL(SUM(VALOR_TOTAL_ESTOQUE), 0) FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID)
                WHERE ID_INVENTARIO = @ID
            `);

        return res.status(200).json({ message: "Item adicionado com sucesso." });

    } catch (err) {
        console.error("ERRO ao adicionar item:", err);
        return res.status(500).json({ message: "Erro ao adicionar item", error: err.message });
    }
}

// Remove um item de um inventário já salvo (EM_ANDAMENTO)
async function removerItemInventario(req, res) {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { idInventario, codigo } = body;

        if (!idInventario || !codigo) {
            return res.status(400).json({ message: "idInventario e codigo são obrigatórios." });
        }

        const pool = await getConnection();

        // Verifica se inventário existe e está EM_ANDAMENTO
        const inv = await pool.request()
            .input('ID', sql.Int, idInventario)
            .query(`SELECT STATUS FROM [dbo].[TB_INVENTARIO_CICLICO] WHERE ID_INVENTARIO = @ID`);

        if (inv.recordset.length === 0)
            return res.status(404).json({ message: "Inventário não encontrado." });
        if (inv.recordset[0].STATUS === 'FINALIZADO')
            return res.status(409).json({ message: "Não é possível alterar um inventário finalizado." });

        await pool.request()
            .input('ID', sql.Int, idInventario)
            .input('CODIGO', sql.NVarChar, codigo)
            .query(`DELETE FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID AND CODIGO = @CODIGO`);

        // Atualiza TOTAL_ITENS e VALOR_TOTAL_GERAL no cabeçalho
        await pool.request()
            .input('ID', sql.Int, idInventario)
            .query(`
                UPDATE [dbo].[TB_INVENTARIO_CICLICO]
                SET TOTAL_ITENS = (SELECT COUNT(*) FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID),
                    VALOR_TOTAL_GERAL = (SELECT ISNULL(SUM(VALOR_TOTAL_ESTOQUE), 0) FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO = @ID)
                WHERE ID_INVENTARIO = @ID
            `);

        return res.status(200).json({ message: "Item removido com sucesso." });

    } catch (err) {
        console.error("ERRO ao remover item:", err);
        return res.status(500).json({ message: "Erro ao remover item", error: err.message });
    }
}
