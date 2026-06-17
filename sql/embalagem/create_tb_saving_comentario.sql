-- =====================================================================
-- TB_SAVING_COMENTARIO: histórico de comentários por item/mês da meta
-- Permite múltiplos comentários por (CODIGO, ANO_MES), cada um com
-- usuário e data de cadastro. Independente de TB_SAVING_META — um item
-- pode ter comentários mesmo sem meta cadastrada.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE Object_ID = Object_ID(N'dbo.TB_SAVING_COMENTARIO')
      AND type IN (N'U')
)
BEGIN
    CREATE TABLE [dbo].[TB_SAVING_COMENTARIO] (
        [ID]            INT IDENTITY(1,1) NOT NULL,
        [CODIGO]        NVARCHAR(50)      NOT NULL,
        [ANO_MES]       CHAR(7)           NOT NULL,
        [COMENTARIO]    NVARCHAR(MAX)     NOT NULL,
        [USUARIO]       NVARCHAR(100)     NULL,
        [DT_CADASTRO]   DATETIME          NOT NULL CONSTRAINT DF_TB_SAVING_COMENTARIO_DT DEFAULT (GETDATE()),
        CONSTRAINT PK_TB_SAVING_COMENTARIO PRIMARY KEY CLUSTERED ([ID] ASC)
    );

    CREATE INDEX IX_TB_SAVING_COMENTARIO_COD_MES
        ON [dbo].[TB_SAVING_COMENTARIO] ([CODIGO], [ANO_MES]);

    PRINT 'Tabela TB_SAVING_COMENTARIO criada.';
END
ELSE
BEGIN
    PRINT 'Tabela TB_SAVING_COMENTARIO já existe — nada a fazer.';
END
GO
