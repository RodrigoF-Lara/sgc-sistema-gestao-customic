-- =====================================================
-- Reenumera ID_INVENTARIO sequencialmente (sem buracos)
-- Ex.: #10, #14, #15...  →  #10, #11, #12...
--
-- Atualiza FK em TB_INVENTARIO_CICLICO_ITEM e o IDENTITY seed.
--
-- COMO USAR (SSMS / Azure Data Studio):
--  1) Rode só o bloco PARTE 1 e confira
--  2) Rode só o bloco PARTE 2 (correção)
--  3) Rode só o bloco PARTE 3 (conferência)
--
-- Ou rode o arquivo inteiro de uma vez (as partes são separadas por GO).
-- =====================================================

/* =====================================================
   PARTE 1 — DIAGNÓSTICO (somente leitura)
   ===================================================== */

PRINT '=== Inventários atuais (ordem de ID) ===';
SELECT
    ID_INVENTARIO,
    DT_CRIACAO,
    DT_GERACAO,
    STATUS,
    TOTAL_ITENS,
    USUARIO_CRIACAO
FROM [dbo].[TB_INVENTARIO_CICLICO]
ORDER BY ID_INVENTARIO;

PRINT '=== Buracos na sequência de ID ===';
;WITH Seq AS (
    SELECT
        ID_INVENTARIO,
        LAG(ID_INVENTARIO) OVER (ORDER BY ID_INVENTARIO) AS ID_ANTERIOR
    FROM [dbo].[TB_INVENTARIO_CICLICO]
)
SELECT
    ID_ANTERIOR AS Depois_Do_ID,
    ID_INVENTARIO AS Antes_Do_ID,
    (ID_INVENTARIO - ID_ANTERIOR - 1) AS Quantidade_Faltando,
    CONCAT('Faltam IDs entre ', ID_ANTERIOR, ' e ', ID_INVENTARIO) AS Observacao
FROM Seq
WHERE ID_ANTERIOR IS NOT NULL
  AND ID_INVENTARIO - ID_ANTERIOR > 1
ORDER BY ID_ANTERIOR;

PRINT '=== Prévia do mapeamento OLD → NEW ===';
SELECT
    ID_INVENTARIO AS ID_ATUAL,
    ROW_NUMBER() OVER (ORDER BY ID_INVENTARIO) AS ID_NOVO,
    CASE
        WHEN ID_INVENTARIO = ROW_NUMBER() OVER (ORDER BY ID_INVENTARIO)
            THEN 'mantém'
        ELSE 'renomeia'
    END AS Acao
FROM [dbo].[TB_INVENTARIO_CICLICO]
ORDER BY ID_INVENTARIO;

PRINT '=== Contagem de itens por inventário ===';
SELECT
    h.ID_INVENTARIO,
    COUNT(i.ID_ITEM) AS QTD_ITENS
FROM [dbo].[TB_INVENTARIO_CICLICO] h
LEFT JOIN [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
    ON i.ID_INVENTARIO = h.ID_INVENTARIO
GROUP BY h.ID_INVENTARIO
ORDER BY h.ID_INVENTARIO;
GO

/* =====================================================
   PARTE 2 — CORREÇÃO
   ===================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 2.1 Mapa OLD_ID → NEW_ID
    ------------------------------------------------------------
    IF OBJECT_ID('tempdb..#MapInv') IS NOT NULL DROP TABLE #MapInv;

    SELECT
        ID_INVENTARIO AS OLD_ID,
        ROW_NUMBER() OVER (ORDER BY ID_INVENTARIO ASC) AS NEW_ID
    INTO #MapInv
    FROM [dbo].[TB_INVENTARIO_CICLICO];

    IF NOT EXISTS (SELECT 1 FROM #MapInv WHERE OLD_ID <> NEW_ID)
    BEGIN
        PRINT 'Nenhum buraco encontrado. Nada a renumerar.';
        ROLLBACK TRANSACTION;
        -- evita cair no CATCH com erro artificial
    END
    ELSE
    BEGIN
        PRINT 'Mapeamento a aplicar:';
        SELECT OLD_ID, NEW_ID
        FROM #MapInv
        WHERE OLD_ID <> NEW_ID
        ORDER BY OLD_ID;

        ------------------------------------------------------------
        -- 2.2 Nome da FK
        ------------------------------------------------------------
        DECLARE @FkName SYSNAME;
        SELECT @FkName = fk.name
        FROM sys.foreign_keys fk
        WHERE fk.parent_object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]')
          AND fk.referenced_object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO]');

        IF @FkName IS NULL
            THROW 50001, 'FK de TB_INVENTARIO_CICLICO_ITEM → TB_INVENTARIO_CICLICO não encontrada.', 1;

        DECLARE @SqlDrop NVARCHAR(500) =
            N'ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM] DROP CONSTRAINT [' + @FkName + N'];';
        EXEC sp_executesql @SqlDrop;
        PRINT 'FK removida temporariamente: ' + @FkName;

        ------------------------------------------------------------
        -- 2.3 Snapshot do cabeçalho com o NOVO ID
        --     CREATE TABLE + INSERT (evita erro 2714 do SELECT INTO em IF/ELSE)
        ------------------------------------------------------------
        IF OBJECT_ID('tempdb..#HeaderNew') IS NOT NULL DROP TABLE #HeaderNew;

        CREATE TABLE #HeaderNew (
            ID_INVENTARIO       INT NOT NULL,
            DT_GERACAO          DATETIME NULL,
            CRITERIO            NVARCHAR(255) NULL,
            STATUS              NVARCHAR(50) NULL,
            TOTAL_ITENS         INT NULL,
            ACURACIDADE         FLOAT NULL,
            USUARIO_CRIACAO     NVARCHAR(100) NULL,
            DT_CRIACAO          DATETIME NULL,
            USUARIO_FINALIZACAO NVARCHAR(100) NULL,
            DT_FINALIZACAO      DATETIME NULL,
            VALOR_TOTAL_GERAL   FLOAT NULL
        );

        -- Monta INSERT dinamicamente se VALOR_TOTAL_GERAL existir
        IF COL_LENGTH('dbo.TB_INVENTARIO_CICLICO', 'VALOR_TOTAL_GERAL') IS NOT NULL
        BEGIN
            INSERT INTO #HeaderNew (
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO, VALOR_TOTAL_GERAL
            )
            SELECT
                m.NEW_ID,
                h.DT_GERACAO,
                h.CRITERIO,
                h.STATUS,
                h.TOTAL_ITENS,
                h.ACURACIDADE,
                h.USUARIO_CRIACAO,
                h.DT_CRIACAO,
                h.USUARIO_FINALIZACAO,
                h.DT_FINALIZACAO,
                h.VALOR_TOTAL_GERAL
            FROM [dbo].[TB_INVENTARIO_CICLICO] h
            INNER JOIN #MapInv m ON m.OLD_ID = h.ID_INVENTARIO;
        END
        ELSE
        BEGIN
            INSERT INTO #HeaderNew (
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO, VALOR_TOTAL_GERAL
            )
            SELECT
                m.NEW_ID,
                h.DT_GERACAO,
                h.CRITERIO,
                h.STATUS,
                h.TOTAL_ITENS,
                h.ACURACIDADE,
                h.USUARIO_CRIACAO,
                h.DT_CRIACAO,
                h.USUARIO_FINALIZACAO,
                h.DT_FINALIZACAO,
                NULL
            FROM [dbo].[TB_INVENTARIO_CICLICO] h
            INNER JOIN #MapInv m ON m.OLD_ID = h.ID_INVENTARIO;
        END

        DECLARE @QtdHeader INT;
        SELECT @QtdHeader = COUNT(*) FROM #HeaderNew;
        PRINT 'Snapshot de cabeçalhos: ' + CAST(@QtdHeader AS VARCHAR(20)) + ' linhas.';

        ------------------------------------------------------------
        -- 2.4 Itens → IDs temporários negativos
        ------------------------------------------------------------
        UPDATE i
        SET i.ID_INVENTARIO = -m.OLD_ID
        FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
        INNER JOIN #MapInv m ON m.OLD_ID = i.ID_INVENTARIO;

        PRINT 'Itens movidos para IDs temporários (negativos).';

        ------------------------------------------------------------
        -- 2.5 Recria cabeçalhos com IDs sequenciais
        ------------------------------------------------------------
        DELETE FROM [dbo].[TB_INVENTARIO_CICLICO];

        DBCC CHECKIDENT ('[dbo].[TB_INVENTARIO_CICLICO]', RESEED, 0);

        SET IDENTITY_INSERT [dbo].[TB_INVENTARIO_CICLICO] ON;

        IF COL_LENGTH('dbo.TB_INVENTARIO_CICLICO', 'VALOR_TOTAL_GERAL') IS NOT NULL
        BEGIN
            INSERT INTO [dbo].[TB_INVENTARIO_CICLICO] (
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO, VALOR_TOTAL_GERAL
            )
            SELECT
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO, VALOR_TOTAL_GERAL
            FROM #HeaderNew
            ORDER BY ID_INVENTARIO;
        END
        ELSE
        BEGIN
            INSERT INTO [dbo].[TB_INVENTARIO_CICLICO] (
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO
            )
            SELECT
                ID_INVENTARIO, DT_GERACAO, CRITERIO, STATUS, TOTAL_ITENS,
                ACURACIDADE, USUARIO_CRIACAO, DT_CRIACAO,
                USUARIO_FINALIZACAO, DT_FINALIZACAO
            FROM #HeaderNew
            ORDER BY ID_INVENTARIO;
        END

        SET IDENTITY_INSERT [dbo].[TB_INVENTARIO_CICLICO] OFF;
        PRINT 'Cabeçalhos reinseridos com IDs sequenciais.';

        ------------------------------------------------------------
        -- 2.6 Itens: do temporário (-OLD) para o NEW_ID
        ------------------------------------------------------------
        UPDATE i
        SET i.ID_INVENTARIO = m.NEW_ID
        FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
        INNER JOIN #MapInv m ON i.ID_INVENTARIO = -m.OLD_ID;

        PRINT 'Itens apontando para os novos IDs.';

        -- Segurança: não pode sobrar ID negativo
        IF EXISTS (SELECT 1 FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] WHERE ID_INVENTARIO < 0)
            THROW 50002, 'Ainda existem itens com ID_INVENTARIO negativo. Abortando.', 1;

        ------------------------------------------------------------
        -- 2.7 Recria a FK
        ------------------------------------------------------------
        DECLARE @SqlAdd NVARCHAR(500) = N'
            ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM] WITH CHECK
            ADD CONSTRAINT [' + @FkName + N'] FOREIGN KEY ([ID_INVENTARIO])
                REFERENCES [dbo].[TB_INVENTARIO_CICLICO]([ID_INVENTARIO])
                ON DELETE CASCADE;';
        EXEC sp_executesql @SqlAdd;
        PRINT 'FK recriada: ' + @FkName;

        ------------------------------------------------------------
        -- 2.8 IDENTITY seed = MAX(ID)
        ------------------------------------------------------------
        DECLARE @MaxId INT;
        SELECT @MaxId = ISNULL(MAX(ID_INVENTARIO), 0) FROM [dbo].[TB_INVENTARIO_CICLICO];
        DBCC CHECKIDENT ('[dbo].[TB_INVENTARIO_CICLICO]', RESEED, @MaxId);
        PRINT 'IDENTITY reseed para ' + CAST(@MaxId AS VARCHAR(20))
            + '. Próximo ID será ' + CAST(@MaxId + 1 AS VARCHAR(20)) + '.';

        COMMIT TRANSACTION;
        PRINT '=== Renumeração concluída com sucesso ===';
    END
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @Line INT = ERROR_LINE();
    RAISERROR('Erro na renumeração (linha %d): %s', 16, 1, @Line, @Err);
END CATCH
GO

/* =====================================================
   PARTE 3 — CONFERÊNCIA
   ===================================================== */

PRINT '=== IDs após correção (devem estar sem buracos) ===';
SELECT
    ID_INVENTARIO,
    DT_CRIACAO,
    STATUS,
    TOTAL_ITENS,
    USUARIO_CRIACAO
FROM [dbo].[TB_INVENTARIO_CICLICO]
ORDER BY ID_INVENTARIO;

PRINT '=== Ainda há buracos? (deve retornar 0 linhas) ===';
;WITH Seq AS (
    SELECT
        ID_INVENTARIO,
        LAG(ID_INVENTARIO) OVER (ORDER BY ID_INVENTARIO) AS ID_ANTERIOR
    FROM [dbo].[TB_INVENTARIO_CICLICO]
)
SELECT *
FROM Seq
WHERE ID_ANTERIOR IS NOT NULL
  AND ID_INVENTARIO - ID_ANTERIOR > 1;

PRINT '=== Itens órfãos? (deve retornar 0) ===';
SELECT COUNT(*) AS ITENS_ORFAOS
FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
WHERE NOT EXISTS (
    SELECT 1
    FROM [dbo].[TB_INVENTARIO_CICLICO] h
    WHERE h.ID_INVENTARIO = i.ID_INVENTARIO
);

PRINT '=== Contagem de itens por inventário (pós) ===';
SELECT
    h.ID_INVENTARIO,
    COUNT(i.ID_ITEM) AS QTD_ITENS
FROM [dbo].[TB_INVENTARIO_CICLICO] h
LEFT JOIN [dbo].[TB_INVENTARIO_CICLICO_ITEM] i
    ON i.ID_INVENTARIO = h.ID_INVENTARIO
GROUP BY h.ID_INVENTARIO
ORDER BY h.ID_INVENTARIO;

PRINT '=== Próximo IDENTITY ===';
SELECT
    IDENT_CURRENT('dbo.TB_INVENTARIO_CICLICO') AS Identity_Atual,
    IDENT_CURRENT('dbo.TB_INVENTARIO_CICLICO') + 1 AS Proximo_ID_Ao_Inserir;
GO
