-- =====================================================================
-- CREATE TB_REQ_DELETE_LOG
-- Log de auditoria para exclusão de requisições.
-- Armazena quem excluiu, quando excluiu, motivo e snapshot do cabeçalho.
-- =====================================================================

IF OBJECT_ID(N'dbo.TB_REQ_DELETE_LOG', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[TB_REQ_DELETE_LOG] (
        [ID_LOG] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ID_REQ] INT NOT NULL,
        [SOLICITANTE] NVARCHAR(150) NULL,
        [STATUS_ANTERIOR] NVARCHAR(50) NULL,
        [PRIORIDADE] NVARCHAR(30) NULL,
        [DT_REQUISICAO] DATE NULL,
        [HR_REQUSICAO] NVARCHAR(30) NULL,
        [DT_NECESSIDADE] DATE NULL,
        [DT_CONCLUSAO] DATETIME2 NULL,
        [TOTAL_ITENS] INT NULL,
        [USUARIO_EXCLUSAO] NVARCHAR(150) NOT NULL,
        [USUARIO_CODIGO_EXCLUSAO] NVARCHAR(50) NOT NULL,
        [MOTIVO] NVARCHAR(500) NULL,
        [DT_HR_EXCLUSAO] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );

    CREATE INDEX [IX_TB_REQ_DELETE_LOG_ID_REQ]
        ON [dbo].[TB_REQ_DELETE_LOG] ([ID_REQ]);

    CREATE INDEX [IX_TB_REQ_DELETE_LOG_DT_HR_EXCLUSAO]
        ON [dbo].[TB_REQ_DELETE_LOG] ([DT_HR_EXCLUSAO] DESC);

    PRINT 'Tabela TB_REQ_DELETE_LOG criada com sucesso.';
END
ELSE
BEGIN
    PRINT 'Tabela TB_REQ_DELETE_LOG já existe — nada a fazer.';
END
GO