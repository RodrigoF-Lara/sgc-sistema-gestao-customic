import { getConnection, sql } from "../../db.js";

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

    const { acao } = req.query;

    if (req.method === "GET") {
        if (acao === 'baixaPorPeriodo') {
            return await relatorioBaixaPorPeriodo(req, res);
        } else if (acao === 'consumoMedio') {
            return await gerarRelatorioConsumo(req, res);
        } else if (acao === 'movimentacoesProduto') {
            return await movimentacoesProduto(req, res);
        } else if (acao === 'requisicoes') {
            return await relatorioRequisicoes(req, res);
        } else if (acao === 'tiposProduto') {
            return await buscarTiposProduto(req, res);
        } else if (acao === 'saldoEstoque') {
            return await relatorioSaldoEstoque(req, res);
        } else if (acao === 'acuracidade') {
            return await relatorioAcuracidade(req, res);
        } else if (acao === 'detalhesInventario') {
            return await detalhesInventario(req, res);
        } else if (acao === 'movimentoDiario') {
            return await relatorioMovimentoDiario(req, res);
        } else if (acao === 'savingList') {
            return await savingList(req, res);
        } else if (acao === 'savingIndicador') {
            return await savingIndicador(req, res);
        } else if (acao === 'savingResumoMeses') {
            return await savingResumoMeses(req, res);
        } else if (acao === 'savingListComentarios') {
            return await savingListComentarios(req, res);
        }
        return res.status(400).json({ message: "Ação não reconhecida" });
    }

    if (req.method === "POST") {
        if (acao === 'savingSaveMeta')        return await savingSaveMeta(req, res);
        if (acao === 'savingSaveMetasBatch')  return await savingSaveMetasBatch(req, res);
        if (acao === 'savingAddComentario')   return await savingAddComentario(req, res);
        return res.status(400).json({ message: "Ação POST não reconhecida" });
    }

    if (req.method === "DELETE") {
        if (acao === 'savingDeleteMeta')        return await savingDeleteMeta(req, res);
        if (acao === 'savingDeleteComentario')  return await savingDeleteComentario(req, res);
        return res.status(400).json({ message: "Ação DELETE não reconhecida" });
    }

    return res.status(405).json({ message: "Método não permitido" });
}

async function relatorioBaixaPorPeriodo(req, res) {
    try {
        const { dataInicio, dataFim, tipoProduto } = req.query;

        if (!dataInicio || !dataFim) {
            return res.status(400).json({ 
                message: "Data de início e fim são obrigatórias" 
            });
        }

        const pool = await getConnection();
        
        // Converte strings para Date corretamente SEM subtrair dias
        const dataInicioObj = new Date(dataInicio + 'T00:00:00Z');
        const dataFimObj = new Date(dataFim + 'T00:00:00Z');
        
        // Apenas adiciona 1 dia ao dataFim para incluir todo o último dia (até 23:59:59)
        const dataFimAjustada = new Date(dataFimObj);
        dataFimAjustada.setDate(dataFimAjustada.getDate() + 1);
        
        console.log('?? Data Início (recebida):', dataInicio);
        console.log('?? Data Fim (recebida):', dataFim);
        console.log('??? Tipo de Produto:', tipoProduto || 'Todos');
        console.log('?? Data Início (processada):', dataInicioObj.toISOString());
        console.log('?? Data Fim Ajustada (processada):', dataFimAjustada.toISOString());
        
        // Query base para verificação
        let queryVerificacao = `
            SELECT COUNT(*) as TOTAL
            FROM [dbo].[KARDEX_2026] k
            LEFT JOIN [dbo].[CAD_PROD] cp ON k.CODIGO = cp.CODIGO
            WHERE k.OPERACAO = 'SAÍDA'
                AND k.USUARIO <> 'BEATRIZ JULHAO'
                AND k.DT >= @DATA_INICIO
                AND k.DT < @DATA_FIM`;
        
        // Adiciona filtro de tipo se especificado
        if (tipoProduto && tipoProduto.trim()) {
            queryVerificacao += ` AND cp.TIPO = @TIPO_PRODUTO`;
        }
        
        const requestVerificacao = pool.request()
            .input('DATA_INICIO', sql.Date, dataInicioObj)
            .input('DATA_FIM', sql.Date, dataFimAjustada);
        
        if (tipoProduto && tipoProduto.trim()) {
            requestVerificacao.input('TIPO_PRODUTO', sql.NVarChar, tipoProduto);
        }
        
        const verificacao = await requestVerificacao.query(queryVerificacao);

        console.log('?? Total de registros encontrados:', verificacao.recordset[0].TOTAL);
        
        // Query principal
        let query = `
                SELECT 
                    k.CODIGO,
                    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                    ISNULL(cp.TIPO, 'NÃO INFORMADO') AS TIPO,
                    SUM(ABS(k.QNT)) AS TOTAL_SAIDAS,
                    COUNT(*) AS QUANTIDADE_MOVIMENTACOES,
                    MIN(k.DT) AS PRIMEIRA_BAIXA,
                    MAX(k.DT) AS ULTIMA_BAIXA
                FROM [dbo].[KARDEX_2026] k
                LEFT JOIN [dbo].[CAD_PROD] cp ON k.CODIGO = cp.CODIGO
                WHERE k.OPERACAO = 'SAÍDA'
                    AND k.USUARIO <> 'BEATRIZ JULHAO'
                    AND k.DT >= @DATA_INICIO
                    AND k.DT < @DATA_FIM`;
        
        // Adiciona filtro de tipo se especificado
        if (tipoProduto && tipoProduto.trim()) {
            query += ` AND cp.TIPO = @TIPO_PRODUTO`;
        }
        
        query += `
                GROUP BY k.CODIGO, cp.DESCRICAO, cp.TIPO
                ORDER BY TOTAL_SAIDAS DESC`;
        
        const request = pool.request()
            .input('DATA_INICIO', sql.Date, dataInicioObj)
            .input('DATA_FIM', sql.Date, dataFimAjustada);
        
        if (tipoProduto && tipoProduto.trim()) {
            request.input('TIPO_PRODUTO', sql.NVarChar, tipoProduto);
        }
        
        const result = await request.query(query);

        console.log('?? Produtos agrupados:', result.recordset.length);

        const totalSaidas = result.recordset.reduce((acc, item) => acc + item.TOTAL_SAIDAS, 0);
        const totalProdutos = result.recordset.length;
        const totalMovimentacoes = result.recordset.reduce((acc, item) => acc + item.QUANTIDADE_MOVIMENTACOES, 0);

        console.log('?? Total de saídas:', totalSaidas);

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: {
                totalSaidas,
                totalProdutos,
                totalMovimentacoes,
                periodo: {
                    inicio: dataInicio,
                    fim: dataFim
                }
            },
            debug: {
                totalRegistros: verificacao.recordset[0].TOTAL,
                dataInicioRecebida: dataInicio,
                dataFimRecebida: dataFim,
                dataInicioProcessada: dataInicioObj.toISOString(),
                dataFimProcessada: dataFimAjustada.toISOString()
            }
        });

    } catch (err) {
        console.error("? Erro ao gerar relatório de baixa:", err);
        return res.status(500).json({ 
            message: "Erro ao gerar relatório", 
            error: err.message,
            stack: err.stack
        });
    }
}

async function gerarRelatorioConsumo(req, res) {
    try {
        const { periodo, fornecedor } = req.query;

        if (!periodo) {
            return res.status(400).json({ 
                message: "Período é obrigatório (formato: YYYY-MM)" 
            });
        }

        // Extrai ano e mês
        const [ano, mes] = periodo.split('-');
        
        if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ 
                message: "Período inválido (use formato YYYY-MM)" 
            });
        }

        console.log('?? Gerando relatório de consumo para:', { ano, mes });

        const pool = await getConnection();
        
        // Query para buscar saldo atual, preço da última NF e fornecedor
        // Data de corte: apenas movimentações a partir de Abril/2026
        const DATA_CORTE = '2026-04-01';

        let query = `
            WITH SaldoAtual AS (
                SELECT 
                    CODIGO,
                    ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
                FROM [dbo].[KARDEX_2026_EMBALAGEM]
                WHERE D_E_L_E_T_ <> '*'
                    AND KARDEX = 2026
                GROUP BY CODIGO
                HAVING ISNULL(SUM(SALDO), 0) > 0
            ),
            UltimaNFPorProduto AS (
                SELECT 
                    np.PROD_COD_PROD AS CODIGO,
                    np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS PRECO_UNITARIO,
                    nc.CAB_NUM_FORN AS COD_FORNECEDOR,
                    nc.CAB_DT_EMISSAO,
                    ROW_NUMBER() OVER (PARTITION BY np.PROD_COD_PROD ORDER BY nc.CAB_DT_EMISSAO DESC) AS RN
                FROM [dbo].[NF_PRODUTOS] np
                INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
                    AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
            ),
            UltimaFornecedor AS (
                SELECT 
                    unf.CODIGO,
                    unf.PRECO_UNITARIO,
                    unf.COD_FORNECEDOR,
                    ISNULL(cf.RAZAO_SOCIAL, 'NÃO INFORMADO') AS FORNECEDOR,
                    unf.CAB_DT_EMISSAO
                FROM UltimaNFPorProduto unf
                LEFT JOIN [dbo].[CAD_FORNECEDOR] cf ON unf.COD_FORNECEDOR = cf.COD_FORNECEDOR
                WHERE unf.RN = 1
            ),
            ConsumoMedio AS (
                SELECT 
                    k.CODIGO,
                    -- Consumo médio MENSAL: total de saídas no período ÷ número de meses da janela
                    -- 1 mês (30 dias): total / 1  = o próprio total consumido no mês
                    ISNULL(SUM(CASE WHEN k.DT >= DATEADD(DAY, -30, GETDATE()) AND k.DT >= '2026-04-01' THEN ABS(k.QNT) ELSE 0 END) * 30.0 / 30, 0) AS CONSUMO_1MES,
                    -- Bimestral (60 dias): total / 2 meses
                    ISNULL(SUM(CASE WHEN k.DT >= DATEADD(DAY, -60, GETDATE()) AND k.DT >= '2026-04-01' THEN ABS(k.QNT) ELSE 0 END) * 30.0 / 60, 0) AS CONSUMO_BIMESTRAL,
                    -- Semestral (180 dias): total / 6 meses
                    ISNULL(SUM(CASE WHEN k.DT >= DATEADD(DAY, -180, GETDATE()) AND k.DT >= '2026-04-01' THEN ABS(k.QNT) ELSE 0 END) * 30.0 / 180, 0) AS CONSUMO_SEMESTRAL,
                    -- Anual (365 dias): total / 12.17 meses
                    ISNULL(SUM(CASE WHEN k.DT >= DATEADD(DAY, -365, GETDATE()) AND k.DT >= '2026-04-01' THEN ABS(k.QNT) ELSE 0 END) * 30.0 / 365, 0) AS CONSUMO_ANUAL
                FROM [dbo].[KARDEX_2026] k
                WHERE k.OPERACAO = 'SAÍDA'
                    AND k.USUARIO <> 'BEATRIZ JULHAO'
                    AND k.DT >= '2026-04-01'
                GROUP BY k.CODIGO
            )
            SELECT 
                sa.CODIGO,
                sa.SALDO_ATUAL,
                ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
                ISNULL(uf.PRECO_UNITARIO, 0) AS PRECO_UNITARIO,
                ISNULL(sa.SALDO_ATUAL, 0) * ISNULL(uf.PRECO_UNITARIO, 0) AS VALOR_TOTAL_ESTOQUE,
                ISNULL(uf.FORNECEDOR, 'NÃO INFORMADO') AS FORNECEDOR,
                ISNULL(cm.CONSUMO_1MES, 0) AS CONSUMO_MEDIO_1MES,
                ISNULL(cm.CONSUMO_BIMESTRAL, 0) AS CONSUMO_MEDIO_BIMESTRAL,
                ISNULL(cm.CONSUMO_SEMESTRAL, 0) AS CONSUMO_MEDIO_SEMESTRAL,
                ISNULL(cm.CONSUMO_ANUAL, 0) AS CONSUMO_MEDIO_ANUAL,
                uf.CAB_DT_EMISSAO
            FROM SaldoAtual sa
            LEFT JOIN [dbo].[CAD_PROD] cp ON sa.CODIGO = cp.CODIGO
            LEFT JOIN UltimaFornecedor uf ON sa.CODIGO = uf.CODIGO
            LEFT JOIN ConsumoMedio cm ON sa.CODIGO = cm.CODIGO
            WHERE ISNULL(uf.PRECO_UNITARIO, 0) > 0
        `;

        // Adiciona filtro de fornecedor se especificado
        if (fornecedor && fornecedor.trim()) {
            query += ` AND uf.FORNECEDOR LIKE '%' + @FORNECEDOR + '%'`;
        }

        query += ` ORDER BY VALOR_TOTAL_ESTOQUE DESC`;

        const request = pool.request();
        
        if (fornecedor && fornecedor.trim()) {
            request.input('FORNECEDOR', sql.NVarChar, fornecedor);
        }

        const result = await request.query(query);

        console.log('?? Produtos encontrados:', result.recordset.length);
        if (result.recordset.length > 0) {
            console.log('?? DEBUG - Primeiros registros:', result.recordset.slice(0, 3));
        }

        if (result.recordset.length === 0) {
            return res.status(200).json({
                dados: [],
                totalizadores: {
                    totalItens: 0,
                    valorTotalEstoque: 0,
                    totalFornecedores: 0
                }
            });
        }

        // Calcula totalizadores
        const totalValor = result.recordset.reduce((acc, item) => {
            return acc + ((item.SALDO_ATUAL || 0) * (item.PRECO_UNITARIO || 0));
        }, 0);

        const fornecedoresUnicos = new Set(
            result.recordset
                .map(item => item.FORNECEDOR)
                .filter(f => f && f !== 'NÃO INFORMADO')
        );

        const totalizadores = {
            totalItens: result.recordset.length,
            valorTotalEstoque: totalValor,
            totalFornecedores: fornecedoresUnicos.size
        };

        console.log('?? Totais calculados:', totalizadores);

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: totalizadores
        });

    } catch (error) {
        console.error('? Erro ao gerar relatório de consumo:', error);
        return res.status(500).json({ 
            message: `Erro ao gerar relatório: ${error.message}` 
        });
    }
}

async function movimentacoesProduto(req, res) {
    try {
        const { codigo, janela } = req.query;
        if (!codigo) return res.status(400).json({ message: 'Código é obrigatório' });

        const janelaDias = parseInt(janela) || 30;
        const DATA_CORTE = '2026-04-01';

        const pool = await getConnection();
        const result = await pool.request()
            .input('CODIGO', sql.VarChar(20), codigo)
            .input('JANELA', sql.Int, janelaDias)
            .query(`
                SELECT
                    ID,
                    DT,
                    CONVERT(VARCHAR(8), HR, 108) AS HR,
                    OPERACAO,
                    QNT,
                    USUARIO,
                    MOTIVO
                FROM [dbo].[KARDEX_2026]
                WHERE CODIGO = @CODIGO
                    AND OPERACAO = 'SAÍDA'
                    AND USUARIO <> 'BEATRIZ JULHAO'
                    AND CONVERT(DATE, DT) >= '2026-04-01'
                    AND CONVERT(DATE, DT) >= CONVERT(DATE, DATEADD(DAY, -@JANELA, GETDATE()))
                ORDER BY DT DESC, HR DESC
            `);

        const totalSaidas = result.recordset.reduce((acc, m) => acc + Math.abs(m.QNT || 0), 0);

        return res.status(200).json({
            movimentacoes: result.recordset,
            totalSaidas
        });
    } catch (error) {
        console.error('? Erro ao buscar movimentações:', error);
        return res.status(500).json({ message: `Erro: ${error.message}` });
    }
}

async function buscarTiposProduto(req, res) {
    try {
        const pool = await getConnection();
        
        const result = await pool.request()
            .query(`
                SELECT DISTINCT TIPO
                FROM [dbo].[CAD_PROD]
                WHERE TIPO IS NOT NULL AND TIPO <> ''
                ORDER BY TIPO
            `);

        console.log('??? Tipos de produto encontrados:', result.recordset.length);

        return res.status(200).json({
            tipos: result.recordset.map(r => r.TIPO)
        });

    } catch (err) {
        console.error("? Erro ao buscar tipos de produto:", err);
        return res.status(500).json({ 
            message: "Erro ao buscar tipos de produto", 
            error: err.message
        });
    }
}

async function relatorioSaldoEstoque(req, res) {
    try {
        const { curvaABC, tipoProduto, saldoPositivo, saldoZero, saldoNegativo, ativos, inativos } = req.query;

        const pool = await getConnection();
        
        console.log('?? Relatório de Saldo - Filtros:', { curvaABC: curvaABC || 'Todas', tipoProduto: tipoProduto || 'Todos', saldoPositivo, saldoZero, saldoNegativo, ativos, inativos });
        
        // Query principal
        let query = `
            SELECT 
                cp.CODIGO,
                cp.DESCRICAO,
                cp.TIPO,
                ISNULL(cp.CURVA_A_B_C, 'C') AS CURVA_A_B_C,
                ISNULL(k.SALDO, 0) AS SALDO,
                uf.ULTIMO_FORNECEDOR,
                ISNULL(uf.CUSTO_CONTABIL_MEDIO, 0) AS CUSTO_CONTABIL_MEDIO,
                ISNULL(uf.CUSTO_FISCAL_MEDIO, 0)   AS CUSTO_FISCAL_MEDIO,
                ISNULL(uf.PRECO_UNIT_ULT_NF, 0)    AS PRECO_UNIT_ULT_NF
            FROM [dbo].[CAD_PROD] cp
            LEFT JOIN (
                SELECT 
                    CODIGO,
                    SUM(SALDO) AS SALDO
                FROM [dbo].[KARDEX_2026_EMBALAGEM]
                WHERE D_E_L_E_T_ <> '*'
                    AND KARDEX = 2026
                GROUP BY CODIGO
            ) k ON cp.CODIGO = k.CODIGO
            LEFT JOIN (
                SELECT 
                    np.PROD_COD_PROD AS CODIGO,
                    cf.RAZAO_SOCIAL AS ULTIMO_FORNECEDOR,
                    np.PROD_CUSTO_CONTABIL_MEDIO_NOVO AS CUSTO_CONTABIL_MEDIO,
                    np.PROD_CUSTO_FISCAL_MEDIO_NOVO   AS CUSTO_FISCAL_MEDIO,
                    np.PROD_VALOR_UNIT                AS PRECO_UNIT_ULT_NF
                FROM [dbo].[NF_PRODUTOS] np
                INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
                INNER JOIN [dbo].[CAD_FORNECEDOR] cf ON nc.CAB_NUM_FORN = cf.COD_FORNECEDOR
                INNER JOIN (
                    SELECT 
                        PROD_COD_PROD,
                        MAX(PROD_ID_NF) AS ULTIMA_NF
                    FROM [dbo].[NF_PRODUTOS]
                    GROUP BY PROD_COD_PROD
                ) ultima ON np.PROD_COD_PROD = ultima.PROD_COD_PROD 
                    AND np.PROD_ID_NF = ultima.ULTIMA_NF
            ) uf ON cp.CODIGO = uf.CODIGO
            WHERE (
                (@ATIVOS = 1 AND ISNULL(cp.ATIVO, 1) = 1) OR
                (@INATIVOS = 1 AND ISNULL(cp.ATIVO, 1) = 0)
            )
            AND (
                (@SALDO_POSITIVO = 1 AND ISNULL(k.SALDO, 0) > 0) OR
                (@SALDO_ZERO = 1     AND ISNULL(k.SALDO, 0) = 0) OR
                (@SALDO_NEGATIVO = 1 AND ISNULL(k.SALDO, 0) < 0)
            )`;
        
        const request = pool.request();
        request.input('ATIVOS',          sql.Bit, ativos         === 'sim' ? 1 : 0);
        request.input('INATIVOS',        sql.Bit, inativos       === 'sim' ? 1 : 0);
        request.input('SALDO_POSITIVO',  sql.Bit, saldoPositivo  === 'sim' ? 1 : 0);
        request.input('SALDO_ZERO',      sql.Bit, saldoZero      === 'sim' ? 1 : 0);
        request.input('SALDO_NEGATIVO',  sql.Bit, saldoNegativo  === 'sim' ? 1 : 0);
        
        // Filtro por curva ABC
        if (curvaABC && curvaABC.trim()) {
            if (curvaABC === 'C') {
                // C inclui NULL, '', e 'C'
                query += ` AND (cp.CURVA_A_B_C IS NULL OR cp.CURVA_A_B_C = '' OR cp.CURVA_A_B_C = 'C')`;
            } else {
                query += ` AND cp.CURVA_A_B_C = @CURVA_ABC`;
                request.input('CURVA_ABC', sql.NVarChar(1), curvaABC.trim());
            }
        }
        
        // Filtro por tipo de produto
        if (tipoProduto && tipoProduto.trim()) {
            query += ` AND cp.TIPO = @TIPO_PRODUTO`;
            request.input('TIPO_PRODUTO', sql.NVarChar, tipoProduto.trim());
        }
        
        // Filtro por saldo removido — agora tratado diretamente via params no WHERE
        
        query += ` ORDER BY CURVA_A_B_C, cp.CODIGO`;

        console.log('?? Query executada:', query);

        const result = await request.query(query);

        console.log('?? Produtos encontrados:', result.recordset.length);

        // Calcula totalizadores
        const totalProdutos = result.recordset.length;
        const totalCurvaA = result.recordset.filter(p => p.CURVA_A_B_C === 'A').length;
        const totalCurvaB = result.recordset.filter(p => p.CURVA_A_B_C === 'B').length;
        const totalCurvaC = result.recordset.filter(p => p.CURVA_A_B_C === 'C').length;
        const totalSaldo = result.recordset.reduce((acc, item) => acc + parseFloat(item.SALDO || 0), 0);

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: {
                totalProdutos,
                totalCurvaA,
                totalCurvaB,
                totalCurvaC,
                totalSaldo
            }
        });

    } catch (err) {
        console.error("? Erro ao gerar relatório de saldo:", err);
        return res.status(500).json({ 
            message: "Erro ao gerar relatório", 
            error: err.message,
            stack: err.stack
        });
    }
}

async function relatorioRequisicoes(req, res) {
    try {
        const { dataInicio, dataFim, status } = req.query;

        if (!dataInicio || !dataFim) {
            return res.status(400).json({ 
                message: "Data de início e fim são obrigatórias" 
            });
        }

        const pool = await getConnection();
        
        // Converte strings para Date corretamente
        const dataInicioObj = new Date(dataInicio + 'T00:00:00Z');
        const dataFimObj = new Date(dataFim + 'T00:00:00Z');
        
        // Adiciona 1 dia ao dataFim para incluir todo o último dia
        const dataFimAjustada = new Date(dataFimObj);
        dataFimAjustada.setDate(dataFimAjustada.getDate() + 1);
        
        console.log('?? Relatório de Requisições - Data Início:', dataInicioObj.toISOString());
        console.log('?? Relatório de Requisições - Data Fim:', dataFimAjustada.toISOString());
        
        // Query principal para buscar requisições
        let query = `
            SELECT 
                R.ID_REQ,
                R.DT_REQUISICAO,
                R.DT_NECESSIDADE,
                R.STATUS,
                R.PRIORIDADE,
                R.SOLICITANTE,
                (SELECT COUNT(*) FROM [dbo].[TB_REQ_ITEM] I WHERE I.ID_REQ = R.ID_REQ) AS TOTAL_ITENS,
                (SELECT COUNT(*) FROM [dbo].[TB_REQ_ITEM] I WHERE I.ID_REQ = R.ID_REQ AND I.STATUS_ITEM = 'Finalizado') AS ITENS_FINALIZADOS
            FROM [dbo].[TB_REQUISICOES] R
            WHERE R.DT_REQUISICAO >= @DATA_INICIO
                AND R.DT_REQUISICAO < @DATA_FIM
        `;

        // Adiciona filtro de status se especificado
        if (status && status.trim()) {
            query += ` AND R.STATUS = @STATUS`;
        }

        query += ` ORDER BY R.DT_REQUISICAO DESC, R.ID_REQ DESC`;

        const request = pool.request()
            .input('DATA_INICIO', sql.Date, dataInicioObj)
            .input('DATA_FIM', sql.Date, dataFimAjustada);
        
        if (status && status.trim()) {
            request.input('STATUS', sql.NVarChar, status);
        }

        const result = await request.query(query);

        console.log('?? Requisições encontradas:', result.recordset.length);

        // Calcula totalizadores
        const totalRequisicoes = result.recordset.length;
        const totalItens = result.recordset.reduce((acc, item) => acc + (item.TOTAL_ITENS || 0), 0);
        const totalConcluidas = result.recordset.filter(r => r.STATUS === 'Concluído').length;
        const totalPendentes = result.recordset.filter(r => r.STATUS === 'Pendente').length;
        const totalParciais = result.recordset.filter(r => r.STATUS === 'Parcial').length;
        
        // Totalizadores por prioridade (os valores no banco estão em MAIÚSCULAS)
        const totalPrioridadeAlta = result.recordset.filter(r => 
            r.PRIORIDADE === 'ALTA' || r.PRIORIDADE === 'Alta'
        ).length;
        const totalPrioridadeNormal = result.recordset.filter(r => 
            r.PRIORIDADE === 'NORMAL' || r.PRIORIDADE === 'Normal'
        ).length;
        const totalPrioridadeBaixa = result.recordset.filter(r => 
            r.PRIORIDADE === 'BAIXA' || r.PRIORIDADE === 'Baixa'
        ).length;

        console.log('?? Totalizadores calculados:', {
            totalRequisicoes,
            totalItens,
            totalConcluidas,
            totalPendentes,
            totalParciais,
            totalPrioridadeAlta,
            totalPrioridadeNormal,
            totalPrioridadeBaixa
        });

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: {
                totalRequisicoes,
                totalItens,
                totalConcluidas,
                totalPendentes,
                totalParciais,
                totalPrioridadeAlta,
                totalPrioridadeNormal,
                totalPrioridadeBaixa,
                periodo: {
                    inicio: dataInicio,
                    fim: dataFim
                }
            }
        });

    } catch (err) {
        console.error("? Erro ao gerar relatório de requisições:", err);
        return res.status(500).json({ 
            message: "Erro ao gerar relatório", 
            error: err.message,
            stack: err.stack
        });
    }
}

async function relatorioAcuracidade(req, res) {
    try {
        const { dataInicio, dataFim, status } = req.query;

        if (!dataInicio || !dataFim) {
            return res.status(400).json({ 
                message: "Data de início e fim são obrigatórias" 
            });
        }

        const pool = await getConnection();
        
        // Converte strings para Date corretamente
        const dataInicioObj = new Date(dataInicio + 'T00:00:00Z');
        const dataFimObj = new Date(dataFim + 'T00:00:00Z');
        
        // Adiciona 1 dia ao dataFim para incluir todo o último dia
        const dataFimAjustada = new Date(dataFimObj);
        dataFimAjustada.setDate(dataFimAjustada.getDate() + 1);
        
        console.log('?? Relatório de Acuracidade - Data Início:', dataInicioObj.toISOString());
        console.log('?? Relatório de Acuracidade - Data Fim:', dataFimAjustada.toISOString());
        
        // Query principal para buscar inventários
        const request = pool.request();
        
        request.input('dataInicio', sql.DateTime, dataInicioObj);
        request.input('dataFim', sql.DateTime, dataFimAjustada);
        
        let query = `
            SELECT 
                inv.ID_INVENTARIO,
                inv.DT_GERACAO,
                inv.DT_FINALIZACAO,
                inv.CRITERIO,
                inv.STATUS,
                inv.TOTAL_ITENS,
                inv.ACURACIDADE,
                inv.USUARIO_CRIACAO,
                inv.USUARIO_FINALIZACAO,
                maiorDivPerc.CODIGO       AS MAIOR_DIV_PERC_CODIGO,
                maiorDivPerc.DESCRICAO    AS MAIOR_DIV_PERC_DESCRICAO,
                maiorDivPerc.ACURACIDADE  AS MAIOR_DIV_PERC_ACURACIDADE,
                maiorDivQtd.CODIGO        AS MAIOR_DIV_QTD_CODIGO,
                maiorDivQtd.DESCRICAO     AS MAIOR_DIV_QTD_DESCRICAO,
                maiorDivQtd.DIFERENCA     AS MAIOR_DIV_QTD_VALOR
            FROM [dbo].[TB_INVENTARIO_CICLICO] inv
            OUTER APPLY (
                SELECT TOP 1 CODIGO, DESCRICAO, ACURACIDADE
                FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                WHERE ID_INVENTARIO = inv.ID_INVENTARIO
                  AND ACURACIDADE IS NOT NULL
                ORDER BY ACURACIDADE ASC
            ) maiorDivPerc
            OUTER APPLY (
                SELECT TOP 1 CODIGO, DESCRICAO, DIFERENCA
                FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                WHERE ID_INVENTARIO = inv.ID_INVENTARIO
                  AND DIFERENCA IS NOT NULL
                ORDER BY ABS(DIFERENCA) DESC
            ) maiorDivQtd
            WHERE inv.DT_GERACAO >= @dataInicio 
                AND inv.DT_GERACAO < @dataFim
        `;
        
        if (status) {
            request.input('status', sql.NVarChar, status);
            query += ` AND inv.STATUS = @status`;
        }
        
        query += ` ORDER BY inv.DT_GERACAO DESC`;

        console.log('?? Query executada:', query);

        const result = await request.query(query);

        console.log('?? Inventários encontrados:', result.recordset.length);

        // Calcula totalizadores
        const totalInventarios = result.recordset.length;
        
        const inventariosComAcuracidade = result.recordset.filter(i => i.ACURACIDADE !== null);
        
        const acuracidadeMedia = inventariosComAcuracidade.length > 0
            ? inventariosComAcuracidade.reduce((acc, item) => acc + parseFloat(item.ACURACIDADE || 0), 0) / inventariosComAcuracidade.length
            : null;
        
        const totalItens = result.recordset.reduce((acc, item) => acc + parseInt(item.TOTAL_ITENS || 0), 0);
        
        const acuracidadeMinima = inventariosComAcuracidade.length > 0
            ? Math.min(...inventariosComAcuracidade.map(i => parseFloat(i.ACURACIDADE)))
            : null;
        
        const acuracidadeMaxima = inventariosComAcuracidade.length > 0
            ? Math.max(...inventariosComAcuracidade.map(i => parseFloat(i.ACURACIDADE)))
            : null;

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: {
                totalInventarios,
                acuracidadeMedia,
                totalItens,
                acuracidadeMinima,
                acuracidadeMaxima
            }
        });

    } catch (err) {
        console.error("? Erro ao gerar relatório de acuracidade:", err);
        return res.status(500).json({ 
            message: "Erro ao gerar relatório", 
            error: err.message,
            stack: err.stack
        });
    }
}

async function detalhesInventario(req, res) {
    try {
        const { idInventario } = req.query;

        if (!idInventario) {
            return res.status(400).json({ 
                message: "ID do inventário é obrigatório" 
            });
        }

        const pool = await getConnection();
        
        // Busca informações do inventário
        const inventarioResult = await pool.request()
            .input('idInventario', sql.Int, idInventario)
            .query(`
                SELECT 
                    ID_INVENTARIO,
                    DT_GERACAO,
                    DT_FINALIZACAO,
                    CRITERIO,
                    STATUS,
                    TOTAL_ITENS,
                    ACURACIDADE,
                    USUARIO_CRIACAO,
                    DT_CRIACAO,
                    USUARIO_FINALIZACAO
                FROM [dbo].[TB_INVENTARIO_CICLICO]
                WHERE ID_INVENTARIO = @idInventario
            `);

        if (inventarioResult.recordset.length === 0) {
            return res.status(404).json({ 
                message: "Inventário não encontrado" 
            });
        }

        const inventario = inventarioResult.recordset[0];

        // Busca itens do inventário
        const itensResult = await pool.request()
            .input('idInventario', sql.Int, idInventario)
            .query(`
                SELECT 
                    ID_ITEM,
                    CODIGO,
                    DESCRICAO,
                    SALDO_SISTEMA,
                    CONTAGEM_FISICA,
                    DIFERENCA,
                    ACURACIDADE,
                    TOTAL_MOVIMENTACOES
                FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                WHERE ID_INVENTARIO = @idInventario
                ORDER BY CODIGO
            `);

        console.log(`?? Detalhes do inventário #${idInventario}: ${itensResult.recordset.length} itens`);

        return res.status(200).json({
            inventario,
            itens: itensResult.recordset
        });

    } catch (err) {
        console.error("? Erro ao buscar detalhes do inventário:", err);
        return res.status(500).json({ 
            message: "Erro ao buscar detalhes", 
            error: err.message,
            stack: err.stack
        });
    }
}



async function relatorioMovimentoDiario(req, res) {
    try {
        const { data, tipoProduto } = req.query;

        if (!data) {
            return res.status(400).json({ message: "Data é obrigatória" });
        }

        const pool = await getConnection();
        const dataObj = new Date(data + 'T00:00:00Z');

        console.log('?? Movimento Diário - Data:', data, '| Tipo:', tipoProduto || 'EMBALAGEM');

        // Query principal: movimentações do dia + custos (último PROD_DT_EMISSAO <= data)
        // Usa STRING_AGG para concatenar fornecedores em uma única query (evita N+1)
        let query = `
            WITH MOV AS (
                SELECT 
                    A.CODIGO,
                    A.QNT,
                    B.DESCRICAO,
                    B.TIPO,
                    A.ARMAZEM,
                    A.ENDERECO,
                    A.USUARIO,
                    A.DT,
                    CONVERT(VARCHAR(8), A.HR) AS HR,
                    A.OPERACAO,
                    (
                        SELECT TOP (1) D.PROD_CUSTO_CONTABIL_MEDIO_NOVO
                        FROM [dbo].[NF_PRODUTOS] D
                        WHERE A.CODIGO = D.PROD_COD_PROD
                          AND D.PROD_DT_EMISSAO <= @DT_POS
                        ORDER BY D.PROD_DT_EMISSAO DESC
                    ) AS CUSTO_CONTABIL_MEDIO,
                    (
                        SELECT TOP (1) D.PROD_CUSTO_FISCAL_MEDIO_NOVO
                        FROM [dbo].[NF_PRODUTOS] D
                        WHERE A.CODIGO = D.PROD_COD_PROD
                          AND D.PROD_DT_EMISSAO <= @DT_POS
                        ORDER BY D.PROD_DT_EMISSAO DESC
                    ) AS CUSTO_FISCAL_MEDIO,
                    (
                        SELECT TOP (1) D.PROD_CUSTO_PAGO
                        FROM [dbo].[NF_PRODUTOS] D
                        WHERE A.CODIGO = D.PROD_COD_PROD
                          AND D.PROD_DT_EMISSAO <= @DT_POS
                        ORDER BY D.PROD_DT_EMISSAO DESC
                    ) AS CUSTO_PAGO
                FROM [dbo].[KARDEX_2026] A
                INNER JOIN [dbo].[CAD_PROD] B ON B.CODIGO = A.CODIGO
                WHERE A.DT = @DT_POS
        `;

        if (tipoProduto && tipoProduto.trim()) {
            query += ` AND B.TIPO = @TIPO `;
        } else {
            query += ` AND B.TIPO = 'EMBALAGEM' `;
        }

        query += `
            ),
            FORN AS (
                SELECT 
                    A.CODIGO,
                    STRING_AGG(D.RAZAO_SOCIAL, '; ') AS FORNECEDORES
                FROM (
                    SELECT DISTINCT M.CODIGO, C.CAB_NUM_FORN
                    FROM MOV M
                    LEFT JOIN [dbo].[NF_PRODUTOS] B ON B.PROD_COD_PROD = M.CODIGO
                    LEFT JOIN [dbo].[NF_CABECALHO] C ON C.CAB_ID_NF = B.PROD_ID_NF
                    WHERE C.CAB_NUM_FORN IS NOT NULL
                ) A
                INNER JOIN [dbo].[CAD_FORNECEDOR] D ON D.COD_FORNECEDOR = A.CAB_NUM_FORN
                GROUP BY A.CODIGO
            )
            SELECT 
                M.CODIGO,
                M.QNT,
                M.DESCRICAO,
                M.TIPO,
                M.CUSTO_CONTABIL_MEDIO,
                M.CUSTO_FISCAL_MEDIO,
                M.CUSTO_PAGO,
                M.ARMAZEM,
                M.ENDERECO,
                ISNULL(F.FORNECEDORES, '') AS FORNECEDOR,
                M.USUARIO,
                M.DT,
                M.HR,
                M.OPERACAO
            FROM MOV M
            LEFT JOIN FORN F ON F.CODIGO = M.CODIGO
            ORDER BY M.CODIGO, M.ARMAZEM, M.ENDERECO;
        `;

        const request = pool.request().input('DT_POS', sql.Date, dataObj);
        if (tipoProduto && tipoProduto.trim()) {
            request.input('TIPO', sql.NVarChar, tipoProduto);
        }

        const result = await request.query(query);
        const dados = result.recordset;

        // Totalizadores
        const totalItens = dados.length;
        const totalQnt = dados.reduce((acc, r) => acc + Number(r.QNT || 0), 0);
        const valorContabilTotal = dados.reduce((acc, r) => acc + (Number(r.QNT || 0) * Number(r.CUSTO_CONTABIL_MEDIO || 0)), 0);
        const valorFiscalTotal = dados.reduce((acc, r) => acc + (Number(r.QNT || 0) * Number(r.CUSTO_FISCAL_MEDIO || 0)), 0);

        return res.status(200).json({
            dados,
            totalizadores: {
                totalItens,
                totalQnt,
                valorContabilTotal,
                valorFiscalTotal,
                data
            }
        });

    } catch (err) {
        console.error("? Erro no relatório de movimento diário:", err);
        return res.status(500).json({
            message: "Erro ao gerar relatório de movimento diário",
            error: err.message,
            stack: err.stack
        });
    }
}

// =====================================================================
// SAVING DE COMPRAS
// =====================================================================
// Endpoints (todos via /api/embalagem/relatorios):
//   GET  ?acao=savingList&dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD&anoMesMeta=YYYY-MM
//   GET  ?acao=savingIndicador&anoMes=YYYY-MM   (anoMes = mês da meta)
//   POST ?acao=savingSaveMeta             body: { codigo, anoMes, metaPct, custoBase, usuario }
//   POST ?acao=savingSaveMetasBatch       body: { itens: [...], usuario }
//   DELETE ?acao=savingDeleteMeta&codigo=...&anoMes=YYYY-MM
//   GET  ?acao=savingListComentarios&codigo=...&anoMes=YYYY-MM
//   POST ?acao=savingAddComentario        body: { codigo, anoMes, comentario, usuario }
//   DELETE ?acao=savingDeleteComentario&id=N
//
//
// Conceito:
//   - "Mês da Meta" (anoMesMeta) é o mês-alvo onde se quer reduzir o custo.
//   - Custo Base = custo da ÚLTIMA NF lançada ANTES do mês-meta para o item
//     (busca dentro do período visualizado, mas ignora NFs no próprio mês-meta).
//   - Saving Planejado = Custo Base × Meta%
//   - Custo Target = Custo Base − Saving Planejado
//   - Saving Realizado = Custo Base − última NF DENTRO do mês-meta
//   - Atingimento % = Saving Realizado / Saving Planejado × 100
//   - A meta é salva em TB_SAVING_META com ANO_MES = anoMesMeta (igual p/ todos).
// =====================================================================

async function savingList(req, res) {
    try {
        const { dtIni, dtFim, anoMesMeta } = req.query;
        if (!dtIni || !dtFim) {
            return res.status(400).json({ message: "Parâmetros 'dtIni' e 'dtFim' são obrigatórios (YYYY-MM-DD)." });
        }
        if (!anoMesMeta || !/^\d{4}-\d{2}$/.test(anoMesMeta)) {
            return res.status(400).json({ message: "Parâmetro 'anoMesMeta' obrigatório no formato YYYY-MM." });
        }
        const pool = await getConnection();

        const itensResult = await pool.request().query(`
            SELECT CODIGO, DESCRICAO
            FROM [dbo].[CAD_PROD]
            WHERE CURVA_A_B_C = 'A' AND ATIVO = 1
            ORDER BY DESCRICAO
        `);
        const itens = itensResult.recordset;
        if (itens.length === 0) {
            return res.status(200).json({
                anoMesMeta,
                itens: [],
                meses: savingGerarMeses(dtIni, dtFim)
            });
        }

        const custosResult = await pool.request()
            .input("dtIni", sql.Date, dtIni)
            .input("dtFim", sql.Date, dtFim)
            .query(`
                ;WITH BaseNF AS (
                    SELECT
                        p.PROD_COD_PROD AS CODIGO,
                        YEAR(c.CAB_DT_EMISSAO) AS ANO,
                        MONTH(c.CAB_DT_EMISSAO) AS MES,
                        p.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO,
                        ROW_NUMBER() OVER (
                            PARTITION BY p.PROD_COD_PROD, YEAR(c.CAB_DT_EMISSAO), MONTH(c.CAB_DT_EMISSAO)
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
                SELECT CODIGO, ANO, MES, CUSTO FROM BaseNF WHERE rn = 1
                ORDER BY CODIGO, ANO, MES
            `);

        // Indexa custos por (codigo, anoMes) e determina anoMesBase por item
        // anoMesBase = último mês com NF ESTRITAMENTE ANTES de anoMesMeta
        const custosPorItem = {};
        const anoMesBasePorItem = {};
        for (const row of custosResult.recordset) {
            const key = String(row.CODIGO);
            const ym = `${row.ANO}-${String(row.MES).padStart(2, "0")}`;
            if (!custosPorItem[key]) custosPorItem[key] = {};
            custosPorItem[key][ym] = Number(row.CUSTO);
            // ORDER BY garante ordem cronológica crescente; só conta se < mês-meta
            if (ym < anoMesMeta) {
                anoMesBasePorItem[key] = ym;
            }
        }

        // Carrega metas cadastradas para o mês-meta selecionado
        const metasResult = await pool.request()
            .input("anoMes", sql.Char(7), anoMesMeta)
            .query(`
                SELECT m.CODIGO, m.ANO_MES, m.META_PCT, m.CUSTO_BASE, m.ANO_MES_CUSTO_BASE, m.USUARIO,
                       m.DT_CADASTRO, m.DT_ATUALIZACAO
                FROM [dbo].[TB_SAVING_META] m
                INNER JOIN [dbo].[CAD_PROD] cp ON cp.CODIGO = m.CODIGO
                WHERE cp.CURVA_A_B_C = 'A' AND cp.ATIVO = 1
                  AND m.ANO_MES = @anoMes
            `);

        const metasPorItem = {};
        for (const m of metasResult.recordset) {
            metasPorItem[String(m.CODIGO)] = {
                metaPct: Number(m.META_PCT),
                custoBase: m.CUSTO_BASE != null ? Number(m.CUSTO_BASE) : null,
                anoMesCustoBase: m.ANO_MES_CUSTO_BASE != null ? String(m.ANO_MES_CUSTO_BASE) : null
            };
        }

        // Contagem de comentários por item (para o mês-meta) + último comentário (preview)
        // Resiliente: se TB_SAVING_COMENTARIO ainda não existir, ignora.
        const comentPorItem = {};
        try {
            const comentResult = await pool.request()
                .input("anoMes", sql.Char(7), anoMesMeta)
                .query(`
                    IF OBJECT_ID(N'dbo.TB_SAVING_COMENTARIO', N'U') IS NULL
                    BEGIN
                        SELECT TOP 0
                            CAST(NULL AS NVARCHAR(50)) AS CODIGO,
                            CAST(0 AS INT) AS QTD,
                            CAST(NULL AS NVARCHAR(MAX)) AS ULTIMO_COMENTARIO,
                            CAST(NULL AS NVARCHAR(100)) AS ULTIMO_USUARIO,
                            CAST(NULL AS DATETIME) AS ULTIMO_DT;
                        RETURN;
                    END

                    ;WITH UltimoComent AS (
                        SELECT CODIGO, ANO_MES, COMENTARIO, USUARIO, DT_CADASTRO,
                               ROW_NUMBER() OVER (PARTITION BY CODIGO, ANO_MES ORDER BY DT_CADASTRO DESC, ID DESC) AS rn
                        FROM [dbo].[TB_SAVING_COMENTARIO]
                        WHERE ANO_MES = @anoMes
                    ),
                    Cont AS (
                        SELECT CODIGO, COUNT(*) AS QTD
                        FROM [dbo].[TB_SAVING_COMENTARIO]
                        WHERE ANO_MES = @anoMes
                        GROUP BY CODIGO
                    )
                    SELECT c.CODIGO, c.QTD,
                           uc.COMENTARIO AS ULTIMO_COMENTARIO,
                           uc.USUARIO    AS ULTIMO_USUARIO,
                           uc.DT_CADASTRO AS ULTIMO_DT
                    FROM Cont c
                    LEFT JOIN UltimoComent uc ON uc.CODIGO = c.CODIGO AND uc.rn = 1
                `);
            for (const r of comentResult.recordset) {
                comentPorItem[String(r.CODIGO)] = {
                    qtd: Number(r.QTD) || 0,
                    ultimo: r.ULTIMO_COMENTARIO != null ? String(r.ULTIMO_COMENTARIO) : null,
                    ultimoUsuario: r.ULTIMO_USUARIO != null ? String(r.ULTIMO_USUARIO) : null,
                    ultimoDt: r.ULTIMO_DT != null ? r.ULTIMO_DT : null
                };
            }
        } catch (errComent) {
            console.warn("Aviso savingList: não foi possível ler TB_SAVING_COMENTARIO:", errComent.message);
        }

        // Consumo médio mensal por item (saídas dos últimos 365 dias × 30/365)
        // mesmo critério usado em /api/embalagem/relatorios?acao=consumoMedio
        const consumoResult = await pool.request().query(`
            SELECT
                k.CODIGO,
                ISNULL(SUM(ABS(k.QNT)) * 30.0 / 365, 0) AS CONSUMO_MENSAL
            FROM [dbo].[KARDEX_2026] k
            INNER JOIN [dbo].[CAD_PROD] cp ON cp.CODIGO = k.CODIGO
            WHERE k.OPERACAO = 'SAÍDA'
              AND k.USUARIO <> 'BEATRIZ JULHAO'
              AND k.DT >= DATEADD(DAY, -365, GETDATE())
              AND k.DT >= '2026-04-01'
              AND cp.CURVA_A_B_C = 'A' AND cp.ATIVO = 1
            GROUP BY k.CODIGO
        `);
        const consumoPorItem = {};
        for (const r of consumoResult.recordset) {
            consumoPorItem[String(r.CODIGO)] = Number(r.CONSUMO_MENSAL) || 0;
        }

        const meses = savingGerarMeses(dtIni, dtFim);
        const resposta = itens.map(it => {
            const cod = String(it.CODIGO);
            const custos = custosPorItem[cod] || {};
            const anoMesBaseNF = anoMesBasePorItem[cod] || null; // mês base das NFs do período
            const meta = metasPorItem[cod] || null;
            
            // IMPORTANTE: prioriza custoBase SALVO na meta (fixo), senão calcula da NF
            let custoBase, anoMesBase, custoBaseOrigem;
            if (meta && meta.custoBase != null) {
                // Meta salva tem prioridade — custo fixo histórico
                custoBase = meta.custoBase;
                // Usa o mês do custo base salvo na meta; se não houver (meta legada), retorna null
                anoMesBase = meta.anoMesCustoBase || null;
                custoBaseOrigem = 'meta'; // indica que veio da meta salva
            } else if (anoMesBaseNF != null) {
                // Calcula das NFs do período
                custoBase = custos[anoMesBaseNF];
                anoMesBase = anoMesBaseNF;
                custoBaseOrigem = 'nf';
            } else {
                // Sem meta e sem NFs
                custoBase = null;
                anoMesBase = null;
                custoBaseOrigem = null;
            }
            
            const metaPct = meta ? meta.metaPct : null;
            const savingValor = (custoBase != null && metaPct != null)
                ? +(custoBase * (metaPct / 100)).toFixed(4) : null;
            const custoTarget = (custoBase != null && metaPct != null)
                ? +(custoBase - savingValor).toFixed(4) : null;
            const consumoMensal = consumoPorItem[cod] || 0;
            const savingProjetado12m = (savingValor != null && consumoMensal > 0)
                ? +(savingValor * consumoMensal * 12).toFixed(2) : null;
            // Custo/mês calculados das NFs do período atual (para permitir re-salvar e atualizar)
            const anoMesCustoBaseNF = anoMesBaseNF; // mês real da última NF antes do mês-meta
            const custoBaseNF = anoMesBaseNF != null ? custos[anoMesBaseNF] : null;
            return {
                codigo: cod,
                descricao: it.DESCRICAO,
                anoMesBase,
                custoBase,
                custoBaseOrigem, // 'meta', 'nf' ou null
                // Mês e custo calculados das NFs do período atual (independente da meta salva).
                // Usado pelo frontend ao re-salvar uma meta para atualizar a referência no banco.
                anoMesCustoBaseNF,
                custoBaseNF,
                metaPct,
                savingValor,
                custoTarget,
                consumoMensal,
                savingProjetado12m,
                qtdComentarios:   comentPorItem[cod] ? comentPorItem[cod].qtd : 0,
                ultimoComentario: comentPorItem[cod] ? comentPorItem[cod].ultimo : null,
                ultimoComentUser: comentPorItem[cod] ? comentPorItem[cod].ultimoUsuario : null,
                ultimoComentDt:   comentPorItem[cod] ? comentPorItem[cod].ultimoDt : null,
                custos
            };
        });

        return res.status(200).json({ anoMesMeta, meses, itens: resposta });
    } catch (err) {
        console.error("Erro savingList:", err);
        return res.status(500).json({ message: "Erro ao listar saving.", error: err.message });
    }
}

async function savingIndicador(req, res) {
    try {
        const { anoMes } = req.query;
        if (!anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
            return res.status(400).json({ message: "Parâmetro 'anoMes' obrigatório no formato YYYY-MM." });
        }
        const pool = await getConnection();
        const [ano, mes] = anoMes.split("-").map(Number);

        console.log(`[savingIndicador] Processando anoMes=${anoMes}, ano=${ano}, mes=${mes}`);

        // Calcula range de datas do mês (para usar índices em vez de YEAR/MONTH functions)
        const dtInicio = new Date(ano, mes - 1, 1);
        const dtFim = new Date(ano, mes, 0, 23, 59, 59, 999);

        // Custo Real = última NF lançada DENTRO do mês-meta
        let result;
        try {
            const request = pool.request()
                .input("anoMes", sql.Char(7), anoMes)
                .input("dtInicio", sql.DateTime, dtInicio)
                .input("dtFim", sql.DateTime, dtFim);
            
            request.timeout = 60000; // 60 segundos (padrão é 15s)
            
            result = await request.query(`
                ;WITH UltimaNFMesMeta AS (
                    SELECT
                        p.PROD_COD_PROD AS CODIGO,
                        p.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_REAL,
                        ROW_NUMBER() OVER (
                            PARTITION BY p.PROD_COD_PROD
                            ORDER BY c.CAB_DT_EMISSAO DESC, c.CAB_ID_NF DESC
                        ) AS rn
                    FROM [dbo].[NF_PRODUTOS] p
                    INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                    WHERE c.CAB_DT_EMISSAO >= @dtInicio
                      AND c.CAB_DT_EMISSAO <= @dtFim
                      AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL
                      AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                ),
                ConsumoMensal AS (
                    SELECT
                        k.CODIGO,
                        ISNULL(SUM(ABS(k.QNT)) * 30.0 / 365, 0) AS CONSUMO_MENSAL
                    FROM [dbo].[KARDEX_2026] k
                    WHERE k.OPERACAO = 'SAÍDA'
                      AND k.USUARIO <> 'BEATRIZ JULHAO'
                      AND k.DT >= DATEADD(DAY, -365, GETDATE())
                      AND k.DT >= '2026-04-01'
                    GROUP BY k.CODIGO
                ),
                ComprasMesMeta AS (
                    SELECT
                        p.PROD_COD_PROD AS CODIGO,
                        SUM(ISNULL(p.PROD_QNT, 0)) AS QTD_COMPRADA
                    FROM [dbo].[NF_PRODUTOS] p
                    INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                    WHERE c.CAB_DT_EMISSAO >= @dtInicio
                      AND c.CAB_DT_EMISSAO <= @dtFim
                    GROUP BY p.PROD_COD_PROD
                )
                SELECT m.CODIGO, cp.DESCRICAO, m.META_PCT, m.CUSTO_BASE,
                       u.CUSTO_REAL, ISNULL(cm.CONSUMO_MENSAL, 0) AS CONSUMO_MENSAL,
                       ISNULL(cc.QTD_COMPRADA, 0) AS QTD_COMPRADA_MES
                FROM [dbo].[TB_SAVING_META] m
                LEFT JOIN [dbo].[CAD_PROD] cp ON cp.CODIGO = m.CODIGO
                LEFT JOIN UltimaNFMesMeta u ON u.CODIGO = m.CODIGO AND u.rn = 1
                LEFT JOIN ConsumoMensal cm ON cm.CODIGO = m.CODIGO
                LEFT JOIN ComprasMesMeta cc ON cc.CODIGO = m.CODIGO
                WHERE m.ANO_MES = @anoMes
                ORDER BY cp.DESCRICAO
            `);
        } catch (queryErr) {
            console.error("[savingIndicador] Erro na query principal:", queryErr.message);
            console.error("Stack:", queryErr.stack);
            return res.status(500).json({
                message: "Erro na consulta SQL do indicador.",
                error: queryErr.message,
                details: queryErr.originalError ? queryErr.originalError.info : null
            });
        }

        console.log(`[savingIndicador] Query retornou ${result.recordset.length} itens`);

        const itens = result.recordset.map(r => {
            const custoBase = r.CUSTO_BASE != null ? Number(r.CUSTO_BASE) : null;
            const metaPct = Number(r.META_PCT);
            const custoReal = r.CUSTO_REAL != null ? Number(r.CUSTO_REAL) : null;
            const consumoMensal = r.CONSUMO_MENSAL != null ? Number(r.CONSUMO_MENSAL) : 0;
            const qtdCompradaMes = r.QTD_COMPRADA_MES != null ? Number(r.QTD_COMPRADA_MES) : 0;
            const savingPlanejado = (custoBase != null)
                ? +(custoBase * (metaPct / 100)).toFixed(4) : null;
            const savingRealizado = (custoBase != null && custoReal != null)
                ? +(custoBase - custoReal).toFixed(4) : null;
            const savingRealizadoMes = (savingRealizado != null && qtdCompradaMes > 0)
                ? +(savingRealizado * qtdCompradaMes).toFixed(2) : null;
            const atingimentoPct = (savingPlanejado && savingRealizado != null)
                ? +(savingRealizado / savingPlanejado * 100).toFixed(2) : null;
            const savingProjetado12m = (savingPlanejado != null && consumoMensal > 0)
                ? +(savingPlanejado * consumoMensal * 12).toFixed(2) : null;
            const savingRealizado12m = (savingRealizado != null && consumoMensal > 0)
                ? +(savingRealizado * consumoMensal * 12).toFixed(2) : null;
            return {
                codigo: r.CODIGO,
                descricao: r.DESCRICAO,
                metaPct, custoBase, custoReal,
                consumoMensal, savingProjetado12m, savingRealizado12m,
                qtdCompradaMes, savingRealizadoMes,
                savingPlanejado, savingRealizado, atingimentoPct,
                qtdComentarios: 0,
                ultimoComentario: null,
                ultimoComentUser: null,
                ultimoComentDt: null
            };
        });

        // Anexa contagem + último comentário (resiliente caso TB_SAVING_COMENTARIO ainda não exista)
        try {
            const comentResult = await pool.request()
                .input("anoMes", sql.Char(7), anoMes)
                .query(`
                    IF OBJECT_ID(N'dbo.TB_SAVING_COMENTARIO', N'U') IS NOT NULL
                    BEGIN
                        ;WITH UltimoComent AS (
                            SELECT CODIGO, COMENTARIO, USUARIO, DT_CADASTRO,
                                   ROW_NUMBER() OVER (PARTITION BY CODIGO ORDER BY DT_CADASTRO DESC, ID DESC) AS rn
                            FROM [dbo].[TB_SAVING_COMENTARIO]
                            WHERE ANO_MES = @anoMes
                        ),
                        Cont AS (
                            SELECT CODIGO, COUNT(*) AS QTD
                            FROM [dbo].[TB_SAVING_COMENTARIO]
                            WHERE ANO_MES = @anoMes
                            GROUP BY CODIGO
                        )
                        SELECT c.CODIGO, c.QTD,
                               uc.COMENTARIO AS ULTIMO_COMENTARIO,
                               uc.USUARIO    AS ULTIMO_USUARIO,
                               uc.DT_CADASTRO AS ULTIMO_DT
                        FROM Cont c
                        LEFT JOIN UltimoComent uc ON uc.CODIGO = c.CODIGO AND uc.rn = 1
                    END
                    ELSE
                    BEGIN
                        SELECT TOP 0
                            CAST(NULL AS NVARCHAR(50)) AS CODIGO,
                            CAST(0 AS INT) AS QTD,
                            CAST(NULL AS NVARCHAR(MAX)) AS ULTIMO_COMENTARIO,
                            CAST(NULL AS NVARCHAR(100)) AS ULTIMO_USUARIO,
                            CAST(NULL AS DATETIME) AS ULTIMO_DT
                    END
                `);
            const mapComent = {};
            for (const r of comentResult.recordset) {
                mapComent[String(r.CODIGO)] = {
                    qtd: Number(r.QTD) || 0,
                    ultimo: r.ULTIMO_COMENTARIO != null ? String(r.ULTIMO_COMENTARIO) : null,
                    user:   r.ULTIMO_USUARIO    != null ? String(r.ULTIMO_USUARIO)    : null,
                    dt:     r.ULTIMO_DT
                };
            }
            for (const it of itens) {
                const c = mapComent[String(it.codigo)];
                if (c) {
                    it.qtdComentarios   = c.qtd;
                    it.ultimoComentario = c.ultimo;
                    it.ultimoComentUser = c.user;
                    it.ultimoComentDt   = c.dt;
                }
            }
        } catch (errComent) {
            console.warn("Aviso savingIndicador: TB_SAVING_COMENTARIO indisponível:", errComent.message);
        }

        const totais = itens.reduce((acc, it) => {
            if (it.savingPlanejado != null) acc.planejado += it.savingPlanejado;
            if (it.savingRealizado != null) acc.realizado += it.savingRealizado;
            if (it.savingProjetado12m != null) acc.projetado12m += it.savingProjetado12m;
            if (it.savingRealizado12m != null) acc.realizado12m += it.savingRealizado12m;
            if (it.savingRealizadoMes != null) acc.realizadoMes += it.savingRealizadoMes;
            if (it.qtdCompradaMes != null)    acc.qtdCompradaMes += it.qtdCompradaMes;
            return acc;
        }, { planejado: 0, realizado: 0, projetado12m: 0, realizado12m: 0, realizadoMes: 0, qtdCompradaMes: 0 });
        totais.planejado    = +totais.planejado.toFixed(4);
        totais.realizado    = +totais.realizado.toFixed(4);
        totais.projetado12m = +totais.projetado12m.toFixed(2);
        totais.realizado12m = +totais.realizado12m.toFixed(2);
        totais.realizadoMes = +totais.realizadoMes.toFixed(2);
        totais.qtdCompradaMes = +totais.qtdCompradaMes.toFixed(2);
        totais.atingimentoPct = totais.planejado > 0
            ? +(totais.realizado / totais.planejado * 100).toFixed(2) : null;

        return res.status(200).json({
            anoMes,
            anoMesComparacao: anoMes, // mesmo mês — apenas para compatibilidade
            itens, totais
        });
    } catch (err) {
        console.error("[savingIndicador] Erro geral:", err.message);
        console.error("Stack completo:", err.stack);
        return res.status(500).json({
            message: "Erro ao gerar indicador.",
            error: err.message,
            stack: err.stack
        });
    }
}

// GET ?acao=savingResumoMeses
// Lista todos os meses (ANO_MES) que possuem metas cadastradas,
// com totais consolidados Planejado/Realizado/Atingimento + Projeção 12 meses.
async function savingResumoMeses(req, res) {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            ;WITH ConsumoMensal AS (
                SELECT
                    k.CODIGO,
                    ISNULL(SUM(ABS(k.QNT)) * 30.0 / 365, 0) AS CONSUMO_MENSAL
                FROM [dbo].[KARDEX_2026] k
                WHERE k.OPERACAO = 'SAÍDA'
                  AND k.USUARIO <> 'BEATRIZ JULHAO'
                  AND k.DT >= DATEADD(DAY, -365, GETDATE())
                  AND k.DT >= '2026-04-01'
                GROUP BY k.CODIGO
            ),
            MetasComReal AS (
                SELECT
                    m.ANO_MES,
                    m.CODIGO,
                    m.META_PCT,
                    m.CUSTO_BASE,
                    ISNULL(cm.CONSUMO_MENSAL, 0) AS CONSUMO_MENSAL,
                    (
                        SELECT TOP 1 p.PROD_CUSTO_FISCAL_MEDIO_NOVO
                        FROM [dbo].[NF_PRODUTOS] p
                        INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                        WHERE p.PROD_COD_PROD = m.CODIGO
                          AND YEAR(c.CAB_DT_EMISSAO)  = CAST(LEFT(m.ANO_MES, 4)     AS INT)
                          AND MONTH(c.CAB_DT_EMISSAO) = CAST(SUBSTRING(m.ANO_MES, 6, 2) AS INT)
                          AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL
                          AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
                        ORDER BY c.CAB_DT_EMISSAO DESC, c.CAB_ID_NF DESC
                    ) AS CUSTO_REAL,
                    (
                        SELECT ISNULL(SUM(p.PROD_QNT), 0)
                        FROM [dbo].[NF_PRODUTOS] p
                        INNER JOIN [dbo].[NF_CABECALHO] c ON c.CAB_ID_NF = p.PROD_ID_NF
                        WHERE p.PROD_COD_PROD = m.CODIGO
                          AND YEAR(c.CAB_DT_EMISSAO)  = CAST(LEFT(m.ANO_MES, 4)     AS INT)
                          AND MONTH(c.CAB_DT_EMISSAO) = CAST(SUBSTRING(m.ANO_MES, 6, 2) AS INT)
                    ) AS QTD_COMPRADA_MES
                FROM [dbo].[TB_SAVING_META] m
                LEFT JOIN ConsumoMensal cm ON cm.CODIGO = m.CODIGO
            )
            SELECT
                ANO_MES,
                COUNT(*) AS QTD_METAS,
                SUM(CASE WHEN CUSTO_BASE IS NOT NULL
                         THEN CUSTO_BASE * META_PCT / 100.0 ELSE 0 END) AS PLANEJADO,
                SUM(CASE WHEN CUSTO_REAL IS NOT NULL AND CUSTO_BASE IS NOT NULL
                         THEN CUSTO_BASE - CUSTO_REAL ELSE 0 END) AS REALIZADO,
                SUM(CASE WHEN CUSTO_BASE IS NOT NULL AND CONSUMO_MENSAL > 0
                         THEN (CUSTO_BASE * META_PCT / 100.0) * CONSUMO_MENSAL * 12
                         ELSE 0 END) AS PROJETADO_12M,
                SUM(CASE WHEN CUSTO_REAL IS NOT NULL AND CUSTO_BASE IS NOT NULL AND CONSUMO_MENSAL > 0
                         THEN (CUSTO_BASE - CUSTO_REAL) * CONSUMO_MENSAL * 12
                         ELSE 0 END) AS REALIZADO_12M,
                SUM(CASE WHEN CUSTO_REAL IS NOT NULL AND CUSTO_BASE IS NOT NULL AND QTD_COMPRADA_MES > 0
                         THEN (CUSTO_BASE - CUSTO_REAL) * QTD_COMPRADA_MES
                         ELSE 0 END) AS REALIZADO_MES,
                SUM(ISNULL(QTD_COMPRADA_MES, 0)) AS QTD_COMPRADA_MES,
                SUM(CASE WHEN CUSTO_REAL IS NOT NULL THEN 1 ELSE 0 END) AS QTD_COM_NF
            FROM MetasComReal
            GROUP BY ANO_MES
            ORDER BY ANO_MES DESC
        `);

        const meses = result.recordset.map(r => {
            const planejado    = r.PLANEJADO    != null ? +Number(r.PLANEJADO).toFixed(4) : 0;
            const realizado    = r.REALIZADO    != null ? +Number(r.REALIZADO).toFixed(4) : 0;
            const projetado12m = r.PROJETADO_12M != null ? +Number(r.PROJETADO_12M).toFixed(2) : 0;
            const realizado12m = r.REALIZADO_12M != null ? +Number(r.REALIZADO_12M).toFixed(2) : 0;
            const realizadoMes = r.REALIZADO_MES != null ? +Number(r.REALIZADO_MES).toFixed(2) : 0;
            const qtdCompradaMes = r.QTD_COMPRADA_MES != null ? +Number(r.QTD_COMPRADA_MES).toFixed(2) : 0;
            const atingimentoPct = planejado > 0
                ? +(realizado / planejado * 100).toFixed(2) : null;
            return {
                anoMes: r.ANO_MES,
                qtdMetas: Number(r.QTD_METAS) || 0,
                qtdComNf: Number(r.QTD_COM_NF) || 0,
                planejado, realizado, projetado12m, realizado12m,
                realizadoMes, qtdCompradaMes,
                atingimentoPct
            };
        });

        return res.status(200).json({ meses });
    } catch (err) {
        console.error("Erro savingResumoMeses:", err);
        return res.status(500).json({ message: "Erro ao listar meses.", error: err.message });
    }
}

async function savingSaveMeta(req, res) {
    try {
        const { codigo, anoMes, metaPct, custoBase, usuario } = req.body || {};
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
        await savingUpsertMeta(pool.request(), { codigo, anoMes, metaPct: pctNum, custoBase, usuario });
        return res.status(200).json({ message: "Meta salva.", codigo, anoMes, metaPct: pctNum });
    } catch (err) {
        console.error("Erro savingSaveMeta:", err);
        return res.status(500).json({ message: "Erro ao salvar meta.", error: err.message });
    }
}

async function savingSaveMetasBatch(req, res) {
    const { itens, usuario } = req.body || {};
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ message: "Lista 'itens' vazia ou inválida." });
    }
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        let salvos = 0, removidos = 0;
        for (const it of itens) {
            const { codigo, anoMes, metaPct, custoBase } = it;
            if (!codigo || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) continue;

            const metaVazia = (metaPct === null || metaPct === undefined || metaPct === "" || Number(metaPct) <= 0);

            if (metaVazia) {
                await new sql.Request(transaction)
                    .input("codigo", sql.NVarChar(50), String(codigo))
                    .input("anoMes", sql.Char(7), anoMes)
                    .query(`DELETE FROM [dbo].[TB_SAVING_META] WHERE CODIGO = @codigo AND ANO_MES = @anoMes`);
                removidos++;
                continue;
            }

            const pctNum = Number(metaPct);
            if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) continue;

            await savingUpsertMeta(new sql.Request(transaction), {
                codigo, anoMes,
                metaPct: pctNum,
                custoBase,
                anoMesCustoBase: it.anoMesCustoBase || null,
                usuario
            });
            salvos++;
        }
        await transaction.commit();
        return res.status(200).json({ message: "Metas processadas.", salvos, removidos });
    } catch (err) {
        try { await transaction.rollback(); } catch (_) {}
        console.error("Erro savingSaveMetasBatch:", err);
        return res.status(500).json({ message: "Erro ao salvar metas.", error: err.message });
    }
}

async function savingDeleteMeta(req, res) {
    try {
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
    } catch (err) {
        console.error("Erro savingDeleteMeta:", err);
        return res.status(500).json({ message: "Erro ao remover meta.", error: err.message });
    }
}

async function savingUpsertMeta(request, { codigo, anoMes, metaPct, custoBase, anoMesCustoBase, usuario }) {
    request
        .input("codigo", sql.NVarChar(50), String(codigo))
        .input("anoMes", sql.Char(7), anoMes)
        .input("metaPct", sql.Decimal(5, 2), Number(metaPct))
        .input("custoBase", sql.Decimal(18, 6), custoBase != null ? Number(custoBase) : null)
        .input("anoMesCustoBase", sql.Char(7), anoMesCustoBase || null)
        .input("usuario", sql.NVarChar(100), usuario || null);

    // IMPORTANTE: se custoBase vier NULL do frontend, NÃO sobrescreve o valor já salvo
    // Mesma regra para anoMesCustoBase — preserva valor existente se não vier novo
    await request.query(`
        MERGE [dbo].[TB_SAVING_META] AS target
        USING (SELECT @codigo AS CODIGO, @anoMes AS ANO_MES) AS src
           ON target.CODIGO = src.CODIGO AND target.ANO_MES = src.ANO_MES
        WHEN MATCHED THEN
            UPDATE SET META_PCT = @metaPct,
                       CUSTO_BASE = CASE
                           WHEN @custoBase IS NOT NULL THEN @custoBase
                           ELSE target.CUSTO_BASE
                       END,
                       ANO_MES_CUSTO_BASE = CASE
                           WHEN @anoMesCustoBase IS NOT NULL THEN @anoMesCustoBase
                           ELSE target.ANO_MES_CUSTO_BASE
                       END,
                       USUARIO = @usuario,
                       DT_ATUALIZACAO = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (CODIGO, ANO_MES, META_PCT, CUSTO_BASE, ANO_MES_CUSTO_BASE, USUARIO)
            VALUES (@codigo, @anoMes, @metaPct, @custoBase, @anoMesCustoBase, @usuario);
    `);
}

// ----------------------- Comentários (histórico) -----------------------

async function savingListComentarios(req, res) {
    try {
        const { codigo, anoMes } = req.query;
        if (!codigo || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
            return res.status(400).json({ message: "Parâmetros 'codigo' e 'anoMes' (YYYY-MM) obrigatórios." });
        }
        const pool = await getConnection();
        const result = await pool.request()
            .input("codigo", sql.NVarChar(50), String(codigo))
            .input("anoMes", sql.Char(7), anoMes)
            .query(`
                SELECT ID, CODIGO, ANO_MES, COMENTARIO, USUARIO, DT_CADASTRO
                FROM [dbo].[TB_SAVING_COMENTARIO]
                WHERE CODIGO = @codigo AND ANO_MES = @anoMes
                ORDER BY DT_CADASTRO DESC, ID DESC
            `);
        const itens = result.recordset.map(r => ({
            id: Number(r.ID),
            codigo: r.CODIGO,
            anoMes: r.ANO_MES,
            comentario: r.COMENTARIO,
            usuario: r.USUARIO,
            dtCadastro: r.DT_CADASTRO
        }));
        return res.status(200).json({ codigo, anoMes, itens });
    } catch (err) {
        console.error("Erro savingListComentarios:", err);
        return res.status(500).json({ message: "Erro ao listar comentários.", error: err.message });
    }
}

async function savingAddComentario(req, res) {
    try {
        const { codigo, anoMes, comentario, usuario } = req.body || {};
        if (!codigo || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
            return res.status(400).json({ message: "Campos obrigatórios: codigo, anoMes (YYYY-MM)." });
        }
        const texto = (comentario != null ? String(comentario) : "").trim();
        if (texto.length === 0) {
            return res.status(400).json({ message: "Comentário não pode estar vazio." });
        }
        if (texto.length > 4000) {
            return res.status(400).json({ message: "Comentário excede 4000 caracteres." });
        }
        const pool = await getConnection();
        const result = await pool.request()
            .input("codigo", sql.NVarChar(50), String(codigo))
            .input("anoMes", sql.Char(7), anoMes)
            .input("comentario", sql.NVarChar(sql.MAX), texto)
            .input("usuario", sql.NVarChar(100), usuario || null)
            .query(`
                INSERT INTO [dbo].[TB_SAVING_COMENTARIO] (CODIGO, ANO_MES, COMENTARIO, USUARIO)
                OUTPUT INSERTED.ID, INSERTED.CODIGO, INSERTED.ANO_MES,
                       INSERTED.COMENTARIO, INSERTED.USUARIO, INSERTED.DT_CADASTRO
                VALUES (@codigo, @anoMes, @comentario, @usuario);
            `);
        const r = result.recordset[0];
        return res.status(201).json({
            message: "Comentário adicionado.",
            item: {
                id: Number(r.ID),
                codigo: r.CODIGO,
                anoMes: r.ANO_MES,
                comentario: r.COMENTARIO,
                usuario: r.USUARIO,
                dtCadastro: r.DT_CADASTRO
            }
        });
    } catch (err) {
        console.error("Erro savingAddComentario:", err);
        return res.status(500).json({ message: "Erro ao adicionar comentário.", error: err.message });
    }
}

async function savingDeleteComentario(req, res) {
    try {
        const { id } = req.query;
        const idNum = Number(id);
        if (!Number.isFinite(idNum) || idNum <= 0) {
            return res.status(400).json({ message: "Parâmetro 'id' inválido." });
        }
        const pool = await getConnection();
        const result = await pool.request()
            .input("id", sql.Int, idNum)
            .query(`DELETE FROM [dbo].[TB_SAVING_COMENTARIO] WHERE ID = @id`);
        return res.status(200).json({
            message: "Comentário removido.",
            id: idNum,
            rowsAffected: result.rowsAffected[0] || 0
        });
    } catch (err) {
        console.error("Erro savingDeleteComentario:", err);
        return res.status(500).json({ message: "Erro ao remover comentário.", error: err.message });
    }
}

function savingGerarMeses(dtIni, dtFim) {
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