-- =====================================================================
-- ALTER TB_SAVING_META: adiciona coluna COMENTARIO
-- Permite registrar observações por item e por mês da meta
-- (estratégia de negociação, motivo da meta, justificativa de
--  não-cadastro, etc.).
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'COMENTARIO'
      AND Object_ID = Object_ID(N'dbo.TB_SAVING_META')
)
BEGIN
    ALTER TABLE [dbo].[TB_SAVING_META]
        ADD [COMENTARIO] NVARCHAR(MAX) NULL;
    PRINT 'Coluna COMENTARIO adicionada com sucesso.';
END
ELSE
BEGIN
    PRINT 'Coluna COMENTARIO já existe — nada a fazer.';
END
GO
