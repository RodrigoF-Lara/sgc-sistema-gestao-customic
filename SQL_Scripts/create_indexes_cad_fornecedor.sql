-- =====================================================================
-- Índices para acelerar listagem/busca de Fornecedores
-- Tabela: dbo.CAD_FORNECEDOR
-- =====================================================================
-- Execute UMA VEZ no SQL Server Management Studio conectado ao banco.
-- Tempo estimado: alguns segundos por índice (depende do volume).
-- Os índices ocupam espaço extra em disco mas aceleram MUITO as
-- consultas de listagem, ordenação e busca.
-- =====================================================================

USE [SEU_BANCO_AQUI];  -- ⚠️ AJUSTE para o nome do seu banco antes de rodar
GO

-- ---------------------------------------------------------------------
-- 1) Índice na RAZAO_SOCIAL
--    Acelera: ORDER BY RAZAO_SOCIAL (paginação) e LIKE 'termo%'
--    Observação: LIKE '%termo%' (com % no início) NÃO usa este índice,
--    mas LIKE 'termo%' usa. Mesmo assim, o ORDER BY se beneficia muito.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CAD_FORNECEDOR_RAZAO_SOCIAL' AND object_id = OBJECT_ID('dbo.CAD_FORNECEDOR'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_CAD_FORNECEDOR_RAZAO_SOCIAL
        ON [dbo].[CAD_FORNECEDOR] (RAZAO_SOCIAL ASC)
        INCLUDE (COD_FORNECEDOR, CNPJ)
        WITH (ONLINE = OFF, FILLFACTOR = 90);
    PRINT '✅ Índice IX_CAD_FORNECEDOR_RAZAO_SOCIAL criado.';
END
ELSE
    PRINT 'ℹ️ Índice IX_CAD_FORNECEDOR_RAZAO_SOCIAL já existe.';
GO

-- ---------------------------------------------------------------------
-- 2) Índice no CNPJ
--    Acelera buscas exatas por CNPJ e LIKE 'numero%'
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CAD_FORNECEDOR_CNPJ' AND object_id = OBJECT_ID('dbo.CAD_FORNECEDOR'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_CAD_FORNECEDOR_CNPJ
        ON [dbo].[CAD_FORNECEDOR] (CNPJ ASC)
        INCLUDE (COD_FORNECEDOR, RAZAO_SOCIAL)
        WITH (ONLINE = OFF, FILLFACTOR = 90);
    PRINT '✅ Índice IX_CAD_FORNECEDOR_CNPJ criado.';
END
ELSE
    PRINT 'ℹ️ Índice IX_CAD_FORNECEDOR_CNPJ já existe.';
GO

-- ---------------------------------------------------------------------
-- 3) Verifica se COD_FORNECEDOR já é Primary Key/índice clusterizado
--    (Normalmente é. Se NÃO for, descomente o bloco abaixo.)
-- ---------------------------------------------------------------------
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CAD_FORNECEDOR_COD' AND object_id = OBJECT_ID('dbo.CAD_FORNECEDOR'))
-- BEGIN
--     CREATE UNIQUE NONCLUSTERED INDEX IX_CAD_FORNECEDOR_COD
--         ON [dbo].[CAD_FORNECEDOR] (COD_FORNECEDOR ASC);
--     PRINT '✅ Índice IX_CAD_FORNECEDOR_COD criado.';
-- END
-- GO

-- ---------------------------------------------------------------------
-- 4) Atualiza estatísticas para o otimizador escolher o melhor plano
-- ---------------------------------------------------------------------
UPDATE STATISTICS [dbo].[CAD_FORNECEDOR] WITH FULLSCAN;
PRINT '✅ Estatísticas atualizadas.';
GO

-- =====================================================================
-- VERIFICAÇÃO: listar índices existentes na tabela
-- =====================================================================
SELECT 
    i.name AS IndexName,
    i.type_desc AS IndexType,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') AS KeyColumns,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') AS IncludedColumns
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.CAD_FORNECEDOR')
  AND i.type > 0
ORDER BY i.type, i.name;
GO
