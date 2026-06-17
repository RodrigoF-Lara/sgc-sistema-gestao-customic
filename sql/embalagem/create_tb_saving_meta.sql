-- =====================================================================
-- TB_SAVING_META
-- Armazena metas de redução de custo (%) por item de curva A, granular
-- por ano/mês de referência. Usada pelo módulo "Saving de Compras".
--
-- Regra de cálculo (frontend/backend):
--   custoBase    = custo da última NF do mês de referência (ANO_MES)
--   savingValor  = custoBase * (META_PCT / 100)
--   custoTarget  = custoBase - savingValor
--
-- Saving Planejado: META_PCT aplicada sobre o custoBase
-- Saving Realizado: (custoBase - custoRealMesPosterior) * volumeComprado
-- =====================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_SAVING_META]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TB_SAVING_META] (
        [CODIGO]        NVARCHAR(50)   NOT NULL,
        [ANO_MES]       CHAR(7)        NOT NULL,  -- formato 'YYYY-MM' (ex: '2026-06')
        [META_PCT]      DECIMAL(5,2)   NOT NULL,  -- ex: 5.00 = -5% de redução
        [CUSTO_BASE]    DECIMAL(18,6)  NULL,      -- snapshot do custo no momento do cadastro
        [COMENTARIO]    NVARCHAR(MAX)  NULL,      -- observação livre por item/mês
        [USUARIO]       NVARCHAR(100)  NULL,
        [DT_CADASTRO]   DATETIME       NOT NULL DEFAULT (GETDATE()),
        [DT_ATUALIZACAO] DATETIME      NULL,
        CONSTRAINT [PK_TB_SAVING_META] PRIMARY KEY CLUSTERED ([CODIGO] ASC, [ANO_MES] ASC)
    );

    CREATE INDEX [IX_TB_SAVING_META_ANO_MES] ON [dbo].[TB_SAVING_META] ([ANO_MES]);

    PRINT 'Tabela TB_SAVING_META criada com sucesso.';
END
ELSE
BEGIN
    PRINT 'Tabela TB_SAVING_META já existe — nada a fazer.';
END
GO
