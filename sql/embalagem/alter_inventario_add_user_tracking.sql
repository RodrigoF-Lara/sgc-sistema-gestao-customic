-- =====================================================
-- Script para adicionar rastreamento de usuário
-- nas contagens de inventário cíclico
-- Data: 2025-12-25
-- =====================================================

-- Adiciona colunas para rastrear quem fez a contagem e quando
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') 
    AND name = 'USUARIO_CONTAGEM'
)
BEGIN
    ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
    ADD [USUARIO_CONTAGEM] NVARCHAR(100);
    
    PRINT 'Coluna USUARIO_CONTAGEM adicionada com sucesso!';
END
ELSE
BEGIN
    PRINT 'Coluna USUARIO_CONTAGEM já existe.';
END
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') 
    AND name = 'DT_CONTAGEM'
)
BEGIN
    ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
    ADD [DT_CONTAGEM] DATETIME;
    
    PRINT 'Coluna DT_CONTAGEM adicionada com sucesso!';
END
ELSE
BEGIN
    PRINT 'Coluna DT_CONTAGEM já existe.';
END
GO

PRINT '';
PRINT '=====================================================';
PRINT 'Colunas de rastreamento adicionadas com sucesso!';
PRINT 'Agora o sistema registra quem fez cada contagem.';
PRINT '=====================================================';
