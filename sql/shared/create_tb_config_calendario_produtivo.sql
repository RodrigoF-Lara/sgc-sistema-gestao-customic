-- =====================================================================
-- CREATE TB_CONFIG_CALENDARIO_PRODUTIVO
-- Configuração padrão de dias/horas produtivas para cálculo de lead time.
-- =====================================================================

IF OBJECT_ID(N'dbo.TB_CONFIG_CALENDARIO_PRODUTIVO', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[TB_CONFIG_CALENDARIO_PRODUTIVO] (
        [ID_CONFIG] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [HORA_INICIO] NVARCHAR(5) NOT NULL DEFAULT '08:00',
        [HORA_FIM] NVARCHAR(5) NOT NULL DEFAULT '18:00',
        [SEG] BIT NOT NULL DEFAULT 1,
        [TER] BIT NOT NULL DEFAULT 1,
        [QUA] BIT NOT NULL DEFAULT 1,
        [QUI] BIT NOT NULL DEFAULT 1,
        [SEX] BIT NOT NULL DEFAULT 1,
        [SAB] BIT NOT NULL DEFAULT 0,
        [DOM] BIT NOT NULL DEFAULT 0,
        [USUARIO_ALTERACAO] NVARCHAR(150) NULL,
        [DT_ALTERACAO] DATETIME NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Tabela TB_CONFIG_CALENDARIO_PRODUTIVO criada com sucesso.';
END
ELSE
BEGIN
    PRINT 'Tabela TB_CONFIG_CALENDARIO_PRODUTIVO já existe — nada a fazer.';
END
GO