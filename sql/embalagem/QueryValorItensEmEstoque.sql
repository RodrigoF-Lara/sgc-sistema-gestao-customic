-- Query para verificar o valor do produto 305737 no inventário cíclico
-- Execute no SSMS (SQL Server Management Studio)

WITH UltimaNFPorProduto AS (
    -- Busca o custo unitário de todas as notas fiscais do produto
    SELECT 
        np.PROD_COD_PROD AS CODIGO,
        np.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO_UNITARIO,
        nc.CAB_DT_EMISSAO,
        ROW_NUMBER() OVER (
            PARTITION BY np.PROD_COD_PROD 
            ORDER BY nc.CAB_DT_EMISSAO DESC
        ) AS RN
    FROM [dbo].[NF_PRODUTOS] np
    INNER JOIN [dbo].[NF_CABECALHO] nc ON np.PROD_ID_NF = nc.CAB_ID_NF
    WHERE np.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL 
        AND np.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
        AND np.PROD_COD_PROD IN ('307992',
                                '303874',
                                '303830',
                                '300982',
                                '307640',
                                '288793',
                                '305737')
),
CustoMaisRecente AS (
    -- Pega apenas o custo da nota fiscal mais recente
    SELECT CODIGO, CUSTO_UNITARIO, CAB_DT_EMISSAO
    FROM UltimaNFPorProduto
    WHERE RN = 1
),
SaldoAtual AS (
    -- Calcula o saldo atual do produto
    SELECT 
        CODIGO,
        ISNULL(SUM(SALDO), 0) AS SALDO_ATUAL
    FROM [dbo].[KARDEX_2026_EMBALAGEM]
    WHERE D_E_L_E_T_ <> '*'
        AND CODIGO IN ('307992',
                       '303874',
                       '303830',
                       '300982',
                       '307640',
                       '288793',
                       '305737')
    GROUP BY CODIGO
    HAVING ISNULL(SUM(SALDO), 0) > 0
),
SaldoValorizado AS (
    -- Calcula o valor total em estoque
    SELECT 
        s.CODIGO,
        s.SALDO_ATUAL,
        ISNULL(c.CUSTO_UNITARIO, 0) AS CUSTO_UNITARIO,
        c.CAB_DT_EMISSAO AS DATA_ULTIMA_NF,
        s.SALDO_ATUAL * ISNULL(c.CUSTO_UNITARIO, 0) AS VALOR_TOTAL_ESTOQUE
    FROM SaldoAtual s
    LEFT JOIN CustoMaisRecente c ON s.CODIGO = c.CODIGO
    WHERE c.CUSTO_UNITARIO IS NOT NULL
)
-- Resultado final com descrição do produto
SELECT 
    sv.CODIGO,
    ISNULL(cp.DESCRICAO, 'SEM DESCRIÇÃO') AS DESCRICAO,
    sv.SALDO_ATUAL,
    sv.CUSTO_UNITARIO AS PRECO_UNITARIO,
    sv.DATA_ULTIMA_NF,
    sv.VALOR_TOTAL_ESTOQUE,
    'MAIOR_VALOR' AS BLOCO
FROM SaldoValorizado sv
LEFT JOIN [dbo].[CAD_PROD] cp ON sv.CODIGO = cp.CODIGO
ORDER BY sv.VALOR_TOTAL_ESTOQUE DESC; 