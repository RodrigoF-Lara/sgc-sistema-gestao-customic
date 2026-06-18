-- =====================================================================
-- ALTER TB_SAVING_META: adiciona coluna ANO_MES_CUSTO_BASE
-- Armazena o mês da NF que originou o CUSTO_BASE (ex: '2025-07')
-- Permite exibir ao usuário qual foi o mês de referência do custo
-- mesmo quando consultar em períodos futuros.
--
-- Nome claro: ANO_MES_CUSTO_BASE = mês de referência do CUSTO_BASE.
-- (não confundir com ANO_MES, que é o mês-meta do plano)
-- =====================================================================

-- Se existe versão antiga ANO_MES_BASE, renomeia (migração)
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE Name = N'ANO_MES_BASE'
      AND Object_ID = Object_ID(N'dbo.TB_SAVING_META')
)
BEGIN
    EXEC sp_rename 'dbo.TB_SAVING_META.ANO_MES_BASE', 'ANO_MES_CUSTO_BASE', 'COLUMN';
    PRINT 'Coluna ANO_MES_BASE renomeada para ANO_MES_CUSTO_BASE.';
END
ELSE IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE Name = N'ANO_MES_CUSTO_BASE'
      AND Object_ID = Object_ID(N'dbo.TB_SAVING_META')
)
BEGIN
    ALTER TABLE [dbo].[TB_SAVING_META]
    ADD [ANO_MES_CUSTO_BASE] CHAR(7) NULL;  -- formato 'YYYY-MM', ex: '2025-07'

    PRINT 'Coluna ANO_MES_CUSTO_BASE adicionada à TB_SAVING_META.';
END
ELSE
BEGIN
    PRINT 'Coluna ANO_MES_CUSTO_BASE já existe em TB_SAVING_META — nada a fazer.';
END
GO
