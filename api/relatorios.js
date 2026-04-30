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
        }
        return res.status(400).json({ message: "Ação não reconhecida" });
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
        
        console.log('📅 Data Início (recebida):', dataInicio);
        console.log('📅 Data Fim (recebida):', dataFim);
        console.log('🏷️ Tipo de Produto:', tipoProduto || 'Todos');
        console.log('📅 Data Início (processada):', dataInicioObj.toISOString());
        console.log('📅 Data Fim Ajustada (processada):', dataFimAjustada.toISOString());
        
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

        console.log('📊 Total de registros encontrados:', verificacao.recordset[0].TOTAL);
        
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

        console.log('📦 Produtos agrupados:', result.recordset.length);

        const totalSaidas = result.recordset.reduce((acc, item) => acc + item.TOTAL_SAIDAS, 0);
        const totalProdutos = result.recordset.length;
        const totalMovimentacoes = result.recordset.reduce((acc, item) => acc + item.QUANTIDADE_MOVIMENTACOES, 0);

        console.log('💰 Total de saídas:', totalSaidas);

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
        console.error("❌ Erro ao gerar relatório de baixa:", err);
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

        console.log('📊 Gerando relatório de consumo para:', { ano, mes });

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

        console.log('📦 Produtos encontrados:', result.recordset.length);
        if (result.recordset.length > 0) {
            console.log('🔍 DEBUG - Primeiros registros:', result.recordset.slice(0, 3));
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

        console.log('💰 Totais calculados:', totalizadores);

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: totalizadores
        });

    } catch (error) {
        console.error('❌ Erro ao gerar relatório de consumo:', error);
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
        console.error('❌ Erro ao buscar movimentações:', error);
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

        console.log('🏷️ Tipos de produto encontrados:', result.recordset.length);

        return res.status(200).json({
            tipos: result.recordset.map(r => r.TIPO)
        });

    } catch (err) {
        console.error("❌ Erro ao buscar tipos de produto:", err);
        return res.status(500).json({ 
            message: "Erro ao buscar tipos de produto", 
            error: err.message
        });
    }
}

async function relatorioSaldoEstoque(req, res) {
    try {
        const { curvaABC, tipoProduto, incluirSaldoZero } = req.query;

        const pool = await getConnection();
        
        console.log('📊 Relatório de Saldo - Filtros:', { curvaABC: curvaABC || 'Todas', tipoProduto: tipoProduto || 'Todos', incluirSaldoZero });
        
        // Query principal
        let query = `
            SELECT 
                cp.CODIGO,
                cp.DESCRICAO,
                cp.TIPO,
                ISNULL(cp.CURVA_A_B_C, 'C') AS CURVA_A_B_C,
                ISNULL(k.SALDO, 0) AS SALDO
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
            WHERE ISNULL(cp.ATIVO, 'S') = 'S'`;
        
        const request = pool.request();
        
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
        
        // Filtro por saldo
        if (incluirSaldoZero !== 'sim') {
            query += ` AND ISNULL(k.SALDO, 0) > 0`;
        }
        
        query += ` ORDER BY CURVA_A_B_C, cp.CODIGO`;

        console.log('🔍 Query executada:', query);

        const result = await request.query(query);

        console.log('📦 Produtos encontrados:', result.recordset.length);

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
        console.error("❌ Erro ao gerar relatório de saldo:", err);
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
        
        console.log('📅 Relatório de Requisições - Data Início:', dataInicioObj.toISOString());
        console.log('📅 Relatório de Requisições - Data Fim:', dataFimAjustada.toISOString());
        
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

        console.log('📦 Requisições encontradas:', result.recordset.length);

        // Calcula totalizadores
        const totalRequisicoes = result.recordset.length;
        const totalItens = result.recordset.reduce((acc, item) => acc + (item.TOTAL_ITENS || 0), 0);
        const totalConcluidas = result.recordset.filter(r => r.STATUS === 'Concluído').length;
        const totalPendentes = result.recordset.filter(r => r.STATUS === 'Pendente').length;
        const totalParciais = result.recordset.filter(r => r.STATUS === 'Parcial').length;

        return res.status(200).json({
            dados: result.recordset,
            totalizadores: {
                totalRequisicoes,
                totalItens,
                totalConcluidas,
                totalPendentes,
                totalParciais,
                periodo: {
                    inicio: dataInicio,
                    fim: dataFim
                }
            }
        });

    } catch (err) {
        console.error("❌ Erro ao gerar relatório de requisições:", err);
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
        
        console.log('📊 Relatório de Acuracidade - Data Início:', dataInicioObj.toISOString());
        console.log('📊 Relatório de Acuracidade - Data Fim:', dataFimAjustada.toISOString());
        
        // Query principal para buscar inventários
        const request = pool.request();
        
        request.input('dataInicio', sql.DateTime, dataInicioObj);
        request.input('dataFim', sql.DateTime, dataFimAjustada);
        
        let query = `
            SELECT 
                ID_INVENTARIO,
                DT_GERACAO,
                DT_FINALIZACAO,
                CRITERIO,
                STATUS,
                TOTAL_ITENS,
                ACURACIDADE,
                USUARIO_CRIACAO,
                USUARIO_FINALIZACAO
            FROM [dbo].[TB_INVENTARIO_CICLICO]
            WHERE DT_GERACAO >= @dataInicio 
                AND DT_GERACAO < @dataFim
        `;
        
        if (status) {
            request.input('status', sql.NVarChar, status);
            query += ` AND STATUS = @status`;
        }
        
        query += ` ORDER BY DT_GERACAO DESC`;

        console.log('🔍 Query executada:', query);

        const result = await request.query(query);

        console.log('📋 Inventários encontrados:', result.recordset.length);

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
        console.error("❌ Erro ao gerar relatório de acuracidade:", err);
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

        console.log(`📦 Detalhes do inventário #${idInventario}: ${itensResult.recordset.length} itens`);

        return res.status(200).json({
            inventario,
            itens: itensResult.recordset
        });

    } catch (err) {
        console.error("❌ Erro ao buscar detalhes do inventário:", err);
        return res.status(500).json({ 
            message: "Erro ao buscar detalhes", 
            error: err.message,
            stack: err.stack
        });
    }
}

