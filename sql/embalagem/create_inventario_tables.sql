-- =====================================================
-- Script de criação das tabelas de Inventário Cíclico
-- Data: 2025-12-25
-- =====================================================

-- Tabela de cabeçalho de inventário
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TB_INVENTARIO_CICLICO] (
        [ID_INVENTARIO] INT IDENTITY(1,1) PRIMARY KEY,
        [DT_GERACAO] DATETIME NOT NULL,
        [CRITERIO] NVARCHAR(255),
        [STATUS] NVARCHAR(50) NOT NULL DEFAULT 'EM_ANDAMENTO',
        [TOTAL_ITENS] INT,
        [ACURACIDADE] FLOAT,
        [USUARIO_CRIACAO] NVARCHAR(100),
        [DT_CRIACAO] DATETIME DEFAULT GETDATE(),
        [USUARIO_FINALIZACAO] NVARCHAR(100),
        [DT_FINALIZACAO] DATETIME
    );
    
    PRINT 'Tabela TB_INVENTARIO_CICLICO criada com sucesso!';
END
ELSE
BEGIN
    PRINT 'Tabela TB_INVENTARIO_CICLICO já existe.';
END
GO

-- Tabela de itens do inventário
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM] (
        [ID_ITEM] INT IDENTITY(1,1) PRIMARY KEY,
        [ID_INVENTARIO] INT NOT NULL,
        [CODIGO] NVARCHAR(50) NOT NULL,
        [DESCRICAO] NVARCHAR(255),
        [SALDO_SISTEMA] FLOAT DEFAULT 0,
        [CONTAGEM_FISICA] FLOAT DEFAULT 0,
        [DIFERENCA] FLOAT DEFAULT 0,
        [ACURACIDADE] FLOAT,
        [TOTAL_MOVIMENTACOES] INT,
        CONSTRAINT [FK_INVENTARIO_ITEM] FOREIGN KEY ([ID_INVENTARIO]) 
            REFERENCES [dbo].[TB_INVENTARIO_CICLICO]([ID_INVENTARIO])
            ON DELETE CASCADE
    );
    
    PRINT 'Tabela TB_INVENTARIO_CICLICO_ITEM criada com sucesso!';
END
ELSE
BEGIN
    PRINT 'Tabela TB_INVENTARIO_CICLICO_ITEM já existe.';
END
GO

-- Criar índices para melhor performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_INVENTARIO_STATUS' AND object_id = OBJECT_ID('TB_INVENTARIO_CICLICO'))
BEGIN
    CREATE INDEX IDX_INVENTARIO_STATUS ON [dbo].[TB_INVENTARIO_CICLICO]([STATUS]);
    PRINT 'Índice IDX_INVENTARIO_STATUS criado com sucesso!';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_INVENTARIO_ITEM_CODIGO' AND object_id = OBJECT_ID('TB_INVENTARIO_CICLICO_ITEM'))
BEGIN
    CREATE INDEX IDX_INVENTARIO_ITEM_CODIGO ON [dbo].[TB_INVENTARIO_CICLICO_ITEM]([CODIGO]);
    PRINT 'Índice IDX_INVENTARIO_ITEM_CODIGO criado com sucesso!';
END
GO

PRINT '';
PRINT '=====================================================';
PRINT 'Script executado com sucesso!';
PRINT 'Tabelas de Inventário Cíclico prontas para uso.';
PRINT '=====================================================';
