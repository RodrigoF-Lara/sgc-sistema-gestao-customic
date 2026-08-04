-- =============================================================================
-- MIGRAÇÃO OBRIGATÓRIA: CAD_USUARIO.NIVEL de INT → VARCHAR(50)
--
-- Erro típico sem este script:
--   Conversion failed when converting the varchar value 'coordenador_estoque'
--   to data type int.
--
-- Execute no Azure SQL / SSMS uma vez. Idempotente.
-- =============================================================================

PRINT '=== Migração CAD_USUARIO.NIVEL (INT → VARCHAR) ===';

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL'
)
BEGIN
    PRINT 'ERRO: coluna CAD_USUARIO.NIVEL não existe.';
    RETURN;
END
GO

DECLARE @tipo NVARCHAR(128);
SELECT @tipo = DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL';

PRINT 'Tipo atual de NIVEL: ' + ISNULL(@tipo, '?');

IF @tipo IN ('int', 'smallint', 'tinyint', 'bigint', 'decimal', 'numeric')
BEGIN
    -- 1) Coluna auxiliar texto
    IF COL_LENGTH('dbo.CAD_USUARIO', 'NIVEL_TXT') IS NULL
        ALTER TABLE dbo.CAD_USUARIO ADD NIVEL_TXT VARCHAR(50) NULL;

    -- 2) Mapeia legados numéricos → cargos
    EXEC(N'
        UPDATE dbo.CAD_USUARIO
        SET NIVEL_TXT = CASE CAST(NIVEL AS VARCHAR(20))
            WHEN ''1'' THEN ''adm''
            WHEN ''2'' THEN ''gerente_estoque''
            WHEN ''3'' THEN ''assistente_estoque''
            WHEN ''4'' THEN ''auxiliar_estoque''
            ELSE LOWER(REPLACE(LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))), '' '', ''_''))
        END
    ');

    -- 3) Remove coluna INT e renomeia a textual
    ALTER TABLE dbo.CAD_USUARIO DROP COLUMN NIVEL;
    EXEC sp_rename 'dbo.CAD_USUARIO.NIVEL_TXT', 'NIVEL', 'COLUMN';

    PRINT 'OK: NIVEL convertido para VARCHAR(50) com mapeamento 1→adm, 2→gerente_estoque, 3→assistente_estoque, 4→auxiliar_estoque.';
END
ELSE IF @tipo IN ('varchar', 'nvarchar', 'char', 'nchar')
BEGIN
    -- Já é texto: normaliza legados que ainda estejam como '1'..'4'
    UPDATE dbo.CAD_USUARIO SET NIVEL = 'adm' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('1', '01');
    UPDATE dbo.CAD_USUARIO SET NIVEL = 'gerente_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('2', '02');
    UPDATE dbo.CAD_USUARIO SET NIVEL = 'assistente_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('3', '03');
    UPDATE dbo.CAD_USUARIO SET NIVEL = 'auxiliar_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('4', '04');

    -- Garante largura
    IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL'
          AND (CHARACTER_MAXIMUM_LENGTH IS NULL OR CHARACTER_MAXIMUM_LENGTH < 50)
    )
        ALTER TABLE dbo.CAD_USUARIO ALTER COLUMN NIVEL VARCHAR(50) NULL;

    PRINT 'OK: NIVEL já era texto; legados 1-4 normalizados se existiam.';
END
ELSE
BEGIN
    PRINT 'AVISO: tipo de NIVEL não reconhecido (' + ISNULL(@tipo, 'NULL') + '). Verifique manualmente.';
END
GO

-- Conferência
SELECT NIVEL, COUNT(*) AS QTD
FROM dbo.CAD_USUARIO
GROUP BY NIVEL
ORDER BY QTD DESC;
GO

PRINT '=== Fim da migração ===';
GO
