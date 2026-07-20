-- =====================================================
-- Reenumera ID_INVENTARIO sequencialmente (sem buracos)
-- Ex.: #10, #14, #15...  →  #10, #11, #12...
--
-- Também atualiza a FK em TB_INVENTARIO_CICLICO_ITEM
-- e ajusta o IDENTITY seed para o próximo número correto.
--
-- COMO USAR:
--  1) Rode a PARTE 1 (diagnóstico) e confira o resultado
--  2) Rode a PARTE 2 (correção) em horário de baixo uso
--  3) Rode a PARTE 3 (conferência)
-- =====================================================

/* =====================================================
   PARTE 1 — DIAGNÓSTICO (somente leitura, seguro)
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
    -- IDs ausentes (texto informativo)
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
   PARTE 2 — CORREÇÃO (escreve no banco)
   Rode só depois de validar a Parte 1.
   ===================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 2.1 Mapa OLD_ID → NEW_ID (ordem cronológica do ID atual)
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
        RETURN;
    END

    PRINT 'Mapeamento a aplicar:';
    SELECT OLD_ID, NEW_ID
    FROM #MapInv
    WHERE OLD_ID <> NEW_ID
    ORDER BY OLD_ID;

    ------------------------------------------------------------
    -- 2.2 Descobre o nome real da FK (pode variar no ambiente)
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
    --     (inclui VALOR_TOTAL_GERAL se a coluna existir)
    ------------------------------------------------------------
    IF OBJECT_ID('tempdb..#HeaderNew') IS NOT NULL DROP TABLE #HeaderNew;

    IF COL_LENGTH('dbo.TB_INVENTARIO_CICLICO', 'VALOR_TOTAL_GERAL') IS NOT NULL
    BEGIN
        SELECT
            m.NEW_ID AS ID_INVENTARIO,
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
        INTO #HeaderNew
        FROM [dbo].[TB_INVENTARIO_CICLICO] h
        INNER JOIN #MapInv m ON m.OLD_ID = h.ID_INVENTARIO;
    END
    ELSE
    BEGIN
        SELECT
            m.NEW_ID AS ID_INVENTARIO,
            h.DT_GERACAO,
            h.CRITERIO,
            h.STATUS,
            h.TOTAL_ITENS,
            h.ACURACIDADE,
            h.USUARIO_CRIACAO,
            h.DT_CRIACAO,
            h.USUARIO_FINALIZACAO,
            h.DT_FINALIZACAO
        INTO #HeaderNew
        FROM [dbo].[TB_INVENTARIO_CICLICO] h
        INNER JOIN #MapInv m ON m.OLD_ID = h.ID_INVENTARIO;
    END

    ------------------------------------------------------------
    -- 2.4 Itens: move ID_INVENTARIO para valor temporário negativo
    --     (evita colisão durante a troca)
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

    -- Reseta identity antes de reinserir
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
    -- 2.8 Ajusta IDENTITY seed = MAX(ID) atual
    --     (próximo inventário será MAX+1)
    ------------------------------------------------------------
    DECLARE @MaxId INT = (SELECT ISNULL(MAX(ID_INVENTARIO), 0) FROM [dbo].[TB_INVENTARIO_CICLICO]);
    DBCC CHECKIDENT ('[dbo].[TB_INVENTARIO_CICLICO]', RESEED, @MaxId);
    PRINT CONCAT('IDENTITY reseed para ', @MaxId, '. Próximo ID será ', @MaxId + 1, '.');

    COMMIT TRANSACTION;
    PRINT '=== Renumeração concluída com sucesso ===';
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
