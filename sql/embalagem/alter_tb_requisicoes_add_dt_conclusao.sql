-- =====================================================================
-- ALTER TB_REQUISICOES: adiciona coluna DT_CONCLUSAO
-- Registra a data/hora em que a requisição foi totalmente finalizada
-- para permitir cálculo confiável de lead time de atendimento.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'DT_CONCLUSAO'
      AND Object_ID = Object_ID(N'dbo.TB_REQUISICOES')
)
BEGIN
    ALTER TABLE [dbo].[TB_REQUISICOES]
        ADD [DT_CONCLUSAO] DATETIME2 NULL;

    PRINT 'Coluna DT_CONCLUSAO adicionada com sucesso.';
END
ELSE
BEGIN
    PRINT 'Coluna DT_CONCLUSAO já existe — nada a fazer.';
END
GO