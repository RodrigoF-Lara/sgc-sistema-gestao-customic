-- =====================================================================
-- ALTER TB_SAVING_META: adiciona coluna ANO_MES_BASE
-- Armazena o mês da NF que originou o CUSTO_BASE (ex: '2025-07')
-- Permite exibir ao usuário qual foi o mês-base original da meta,
-- mesmo quando consultar em períodos futuros.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE Name = N'ANO_MES_BASE'
      AND Object_ID = Object_ID(N'dbo.TB_SAVING_META')
)
BEGIN
    ALTER TABLE [dbo].[TB_SAVING_META]
    ADD [ANO_MES_BASE] CHAR(7) NULL;  -- formato 'YYYY-MM', ex: '2025-07'

    PRINT 'Coluna ANO_MES_BASE adicionada à TB_SAVING_META.';
END
ELSE
BEGIN
    PRINT 'Coluna ANO_MES_BASE já existe em TB_SAVING_META — nada a fazer.';
END
GO
