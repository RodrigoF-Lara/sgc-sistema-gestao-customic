-- =====================================================================
-- IMPORTAÇÃO TERMÔMETRO -> CAD_PROD
--
-- Objetivo:
--   Atualizar as colunas de faixa de estoque na CAD_PROD a partir de um XML:
--     - ESTOQUE_MINIMO
--     - ESTOQUE_REGULAR
--     - ESTOQUE_EXCEDENTE
--
-- Como usar:
--   1) Ajuste o caminho em OPENROWSET (bloco OPÇÃO A), ou
--   2) Cole o XML no bloco OPÇÃO B se OPENROWSET estiver bloqueado.
--   3) Execute o script inteiro.
--
-- Observações:
--   - O parser tenta ler nomes de campo comuns, em elemento e atributo:
--     CODIGO | Codigo
--     ESTOQUE_MINIMO | estoque_minimo
--     ESTOQUE_REGULAR | estoque_regular
--     ESTOQUE_EXCEDENTE | estoque_excedente
--   - O script é idempotente para criação de colunas (só cria se faltar).
-- =====================================================================

SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRAN;

    -- 1) Garantir colunas na CAD_PROD
    IF COL_LENGTH('dbo.CAD_PROD', 'ESTOQUE_MINIMO') IS NULL
    BEGIN
        ALTER TABLE dbo.CAD_PROD ADD ESTOQUE_MINIMO DECIMAL(18,3) NULL;
        PRINT 'Coluna ESTOQUE_MINIMO criada.';
    END

    IF COL_LENGTH('dbo.CAD_PROD', 'ESTOQUE_REGULAR') IS NULL
    BEGIN
        ALTER TABLE dbo.CAD_PROD ADD ESTOQUE_REGULAR DECIMAL(18,3) NULL;
        PRINT 'Coluna ESTOQUE_REGULAR criada.';
    END

    IF COL_LENGTH('dbo.CAD_PROD', 'ESTOQUE_EXCEDENTE') IS NULL
    BEGIN
        ALTER TABLE dbo.CAD_PROD ADD ESTOQUE_EXCEDENTE DECIMAL(18,3) NULL;
        PRINT 'Coluna ESTOQUE_EXCEDENTE criada.';
    END

    -- 2) Carregar XML
    DECLARE @xml XML;

    -- ================================================================
    -- OPÇÃO A: Ler XML de arquivo (ajuste o caminho abaixo)
    -- ================================================================
    SELECT @xml = TRY_CAST(BulkColumn AS XML)
    FROM OPENROWSET(
        BULK 'C:\\IMPORT\\termometro.xml',
        SINGLE_BLOB
    ) AS X;

    -- ================================================================
    -- OPÇÃO B: Se OPENROWSET estiver bloqueado, comente OPÇÃO A e use:
    -- ================================================================
    -- SET @xml = N'
    -- <root>
    --   <item>
    --     <CODIGO>307793</CODIGO>
    --     <ESTOQUE_MINIMO>10</ESTOQUE_MINIMO>
    --     <ESTOQUE_REGULAR>30</ESTOQUE_REGULAR>
    --     <ESTOQUE_EXCEDENTE>60</ESTOQUE_EXCEDENTE>
    --   </item>
    -- </root>';

    IF @xml IS NULL
    BEGIN
        THROW 50001, 'Nao foi possivel carregar o XML. Verifique caminho/permissoes ou use a OPCAO B.', 1;
    END

    -- 3) Staging de importacao
    IF OBJECT_ID('tempdb..#TMP_TERMOMETRO') IS NOT NULL
        DROP TABLE #TMP_TERMOMETRO;

    CREATE TABLE #TMP_TERMOMETRO (
        CODIGO            NVARCHAR(50)   NOT NULL,
        ESTOQUE_MINIMO    DECIMAL(18,3)  NULL,
        ESTOQUE_REGULAR   DECIMAL(18,3)  NULL,
        ESTOQUE_EXCEDENTE DECIMAL(18,3)  NULL
    );

    ;WITH RAW AS (
        SELECT
            CODIGO_TXT = LTRIM(RTRIM(COALESCE(
                NULLIF(N.value('(CODIGO/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(Codigo/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@CODIGO)[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@Codigo)[1]', 'nvarchar(100)'), '')
            ))),
            MIN_TXT = LTRIM(RTRIM(COALESCE(
                NULLIF(N.value('(ESTOQUE_MINIMO/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(estoque_minimo/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@ESTOQUE_MINIMO)[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@estoque_minimo)[1]', 'nvarchar(100)'), '')
            ))),
            REG_TXT = LTRIM(RTRIM(COALESCE(
                NULLIF(N.value('(ESTOQUE_REGULAR/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(estoque_regular/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@ESTOQUE_REGULAR)[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@estoque_regular)[1]', 'nvarchar(100)'), '')
            ))),
            EXC_TXT = LTRIM(RTRIM(COALESCE(
                NULLIF(N.value('(ESTOQUE_EXCEDENTE/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(estoque_excedente/text())[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@ESTOQUE_EXCEDENTE)[1]', 'nvarchar(100)'), ''),
                NULLIF(N.value('(@estoque_excedente)[1]', 'nvarchar(100)'), '')
            )))
        FROM @xml.nodes('//*') AS T(N)
    )
    INSERT INTO #TMP_TERMOMETRO (CODIGO, ESTOQUE_MINIMO, ESTOQUE_REGULAR, ESTOQUE_EXCEDENTE)
    SELECT
        R.CODIGO_TXT,
        TRY_CONVERT(DECIMAL(18,3), REPLACE(R.MIN_TXT, ',', '.')),
        TRY_CONVERT(DECIMAL(18,3), REPLACE(R.REG_TXT, ',', '.')),
        TRY_CONVERT(DECIMAL(18,3), REPLACE(R.EXC_TXT, ',', '.'))
    FROM RAW AS R
    WHERE R.CODIGO_TXT IS NOT NULL
      AND (
            R.MIN_TXT IS NOT NULL
         OR R.REG_TXT IS NOT NULL
         OR R.EXC_TXT IS NOT NULL
      );

    -- Eliminar duplicados por codigo, mantendo o maior valor de cada faixa
    ;WITH DEDUP AS (
        SELECT
            CODIGO,
            ESTOQUE_MINIMO = MAX(ESTOQUE_MINIMO),
            ESTOQUE_REGULAR = MAX(ESTOQUE_REGULAR),
            ESTOQUE_EXCEDENTE = MAX(ESTOQUE_EXCEDENTE)
        FROM #TMP_TERMOMETRO
        GROUP BY CODIGO
    )
    UPDATE P
       SET P.ESTOQUE_MINIMO = D.ESTOQUE_MINIMO,
           P.ESTOQUE_REGULAR = D.ESTOQUE_REGULAR,
           P.ESTOQUE_EXCEDENTE = D.ESTOQUE_EXCEDENTE
    FROM dbo.CAD_PROD AS P
    INNER JOIN DEDUP AS D
        ON LTRIM(RTRIM(CONVERT(VARCHAR(50), P.CODIGO))) = D.CODIGO;

    DECLARE @Atualizados INT = @@ROWCOUNT;

    DECLARE @Importados INT = (
        SELECT COUNT(DISTINCT CODIGO)
        FROM #TMP_TERMOMETRO
    );

    DECLARE @NaoEncontrados INT = (
        SELECT COUNT(*)
        FROM (
            SELECT DISTINCT T.CODIGO
            FROM #TMP_TERMOMETRO AS T
            LEFT JOIN dbo.CAD_PROD AS P
                ON LTRIM(RTRIM(CONVERT(VARCHAR(50), P.CODIGO))) = T.CODIGO
            WHERE P.CODIGO IS NULL
        ) AS X
    );

    PRINT 'Codigos importados no XML: ' + CONVERT(VARCHAR(20), @Importados);
    PRINT 'Registros atualizados na CAD_PROD: ' + CONVERT(VARCHAR(20), @Atualizados);
    PRINT 'Codigos do XML nao encontrados na CAD_PROD: ' + CONVERT(VARCHAR(20), @NaoEncontrados);

    -- Amostra de codigos nao encontrados
    SELECT TOP (50) DISTINCT T.CODIGO AS CODIGO_NAO_ENCONTRADO
    FROM #TMP_TERMOMETRO AS T
    LEFT JOIN dbo.CAD_PROD AS P
        ON LTRIM(RTRIM(CONVERT(VARCHAR(50), P.CODIGO))) = T.CODIGO
    WHERE P.CODIGO IS NULL
    ORDER BY T.CODIGO;

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRAN;

    DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @Line INT = ERROR_LINE();
    DECLARE @Num INT = ERROR_NUMBER();

    RAISERROR('Falha no import do termometro. Numero: %d | Linha: %d | Mensagem: %s', 16, 1, @Num, @Line, @Err);
END CATCH;
