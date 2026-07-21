-- =====================================================
-- Corrige horários gravados 3h a menos em TB_LOG_NF
-- (bug: new Date(toLocaleString) + toLocaleTimeString SP no Vercel UTC)
--
-- Alvo principal: PROCESSO = 'LANCAMENTO NF' e APP = 'SGC-WEB'
-- (statusNF usava outro padrão e em geral gravava HH "certo" por acaso)
--
-- COMO USAR:
--  1) Rode a PARTE 1 (diagnóstico) e confira
--  2) Rode a PARTE 2 (preview do que vai mudar)
--  3) Rode a PARTE 3 (UPDATE) se estiver ok
--  4) Opcional: PARTE 4 corrige só a NF 3202 / código 308816
-- =====================================================

/* =====================================================
   PARTE 1 — DIAGNÓSTICO
   ===================================================== */

PRINT '=== LANCAMENTO NF via SGC-WEB (candidatos à correção +3h) ===';
SELECT
    ID_NF,
    ID_NF_PROD,
    NF,
    CODIGO,
    USUARIO,
    DT,
    HH,
    PROCESSO,
    APP,
    QNT,
    -- datetime atual (DT + HH)
    DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2)) AS DT_HR_ATUAL,
    -- se somar 3 horas
    DATEADD(HOUR, 3,
        DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
    ) AS DT_HR_CORRIGIDO
FROM [dbo].[TB_LOG_NF]
WHERE PROCESSO = N'LANCAMENTO NF'
  AND (APP = N'SGC-WEB' OR APP LIKE N'%SGC%')
ORDER BY DT DESC, HH DESC;

PRINT '=== Exemplo do print: NF 3202 / código 308816 ===';
SELECT
    NF, CODIGO, USUARIO, DT, HH, PROCESSO, APP,
    DATEADD(HOUR, 3,
        DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
    ) AS DT_HR_SE_SOMAR_3H
FROM [dbo].[TB_LOG_NF]
WHERE NF = N'3202' AND CODIGO = N'308816'
ORDER BY DT, HH;

GO

/* =====================================================
   PARTE 2 — PREVIEW (não altera nada)
   Lista DT/HH atuais e os valores após +3 horas
   ===================================================== */

PRINT '=== PREVIEW correção em massa (LANCAMENTO NF + SGC-WEB) ===';
SELECT
    NF,
    CODIGO,
    DT AS DT_ATUAL,
    HH AS HH_ATUAL,
    CAST(DATEADD(HOUR, 3,
        DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
    ) AS date) AS DT_NOVO,
    CONVERT(varchar(8), DATEADD(HOUR, 3,
        DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
    ), 108) AS HH_NOVO,
    PROCESSO,
    APP,
    USUARIO
FROM [dbo].[TB_LOG_NF]
WHERE PROCESSO = N'LANCAMENTO NF'
  AND (APP = N'SGC-WEB' OR APP LIKE N'%SGC%')
  -- só linhas com HH válida
  AND TRY_CAST(HH AS time) IS NOT NULL
  AND DT IS NOT NULL
ORDER BY DT DESC, HH DESC;

GO

/* =====================================================
   PARTE 3 — UPDATE EM MASSA (+3 horas)
   Descomente o COMMIT no final se o preview estiver ok.
   ===================================================== */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

    PRINT '=== Aplicando +3h em LANCAMENTO NF (SGC-WEB) ===';

    UPDATE log
    SET
        DT = CAST(DATEADD(HOUR, 3, dt_hr) AS date),
        HH = CONVERT(varchar(8), DATEADD(HOUR, 3, dt_hr), 108)
    FROM [dbo].[TB_LOG_NF] log
    CROSS APPLY (
        SELECT DATEADD(
            SECOND,
            DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(log.HH AS time)),
            CAST(log.DT AS datetime2)
        ) AS dt_hr
    ) x
    WHERE log.PROCESSO = N'LANCAMENTO NF'
      AND (log.APP = N'SGC-WEB' OR log.APP LIKE N'%SGC%')
      AND TRY_CAST(log.HH AS time) IS NOT NULL
      AND log.DT IS NOT NULL;

    PRINT CONCAT('Linhas atualizadas na transação (ainda não commitadas): ', @@ROWCOUNT);

    -- Confere amostra após update (ainda dentro da transação)
    SELECT TOP 30
        NF, CODIGO, DT, HH, PROCESSO, APP, USUARIO
    FROM [dbo].[TB_LOG_NF]
    WHERE PROCESSO = N'LANCAMENTO NF'
      AND (APP = N'SGC-WEB' OR APP LIKE N'%SGC%')
    ORDER BY DT DESC, HH DESC;

-- Conferiu o resultado acima?
-- COMMIT TRANSACTION;
ROLLBACK TRANSACTION;  -- padrão seguro: desfaz até você trocar por COMMIT
PRINT 'Transação com ROLLBACK (nada gravado). Troque por COMMIT se o preview estiver ok e rode de novo a PARTE 3.';

GO

/* =====================================================
   PARTE 4 — CORREÇÃO PONTUAL (só o caso do print)
   Use se preferir NÃO rodar a massa, só a NF 3202 / 308816
   LANCAMENTO em 10:38:07 → 13:38:07
   ===================================================== */

/*
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE [dbo].[TB_LOG_NF]
SET
    DT = CAST(DATEADD(HOUR, 3,
            DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
         ) AS date),
    HH = CONVERT(varchar(8), DATEADD(HOUR, 3,
            DATEADD(SECOND, DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(HH AS time)), CAST(DT AS datetime2))
         ), 108)
WHERE NF = N'3202'
  AND CODIGO = N'308816'
  AND PROCESSO = N'LANCAMENTO NF'
  AND HH = N'10:38:07';  -- ajuste se o HH no banco for diferente

SELECT NF, CODIGO, DT, HH, PROCESSO, APP
FROM [dbo].[TB_LOG_NF]
WHERE NF = N'3202' AND CODIGO = N'308816'
ORDER BY DT, HH;

COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
*/

GO

/* =====================================================
   PARTE 5 (OPCIONAL) — digitação no cabeçalho da NF
   Colunas reais: CAB_DT_DIGITACAO / CAB_HR_DIGITACAO
   ===================================================== */

PRINT '=== Cabeçalhos (amostra) CAB_DT_DIGITACAO / CAB_HR_DIGITACAO ===';
SELECT TOP 50
    CAB_ID_NF,
    CAB_NUM_NF,
    CAB_DT_DIGITACAO,
    CAB_HR_DIGITACAO,
    CONVERT(varchar(8),
        DATEADD(HOUR, 3,
            DATEADD(SECOND,
                DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(CAB_HR_DIGITACAO AS time)),
                CAST(CAB_DT_DIGITACAO AS datetime2)
            )
        ),
        108
    ) AS HR_DIG_SE_SOMAR_3H
FROM [dbo].[NF_CABECALHO]
WHERE CAB_HR_DIGITACAO IS NOT NULL
  AND TRY_CAST(CAB_HR_DIGITACAO AS time) IS NOT NULL
  AND CAB_DT_DIGITACAO IS NOT NULL
ORDER BY CAB_ID_NF DESC;

/*
-- Só rode se confirmar que CAB_HR_DIGITACAO também está 3h atrás:
BEGIN TRANSACTION;

UPDATE cab
SET
    CAB_DT_DIGITACAO = CAST(DATEADD(HOUR, 3, x.dt_hr) AS date),
    CAB_HR_DIGITACAO = CONVERT(varchar(8), DATEADD(HOUR, 3, x.dt_hr), 108)
FROM [dbo].[NF_CABECALHO] cab
CROSS APPLY (
    SELECT DATEADD(
        SECOND,
        DATEDIFF(SECOND, CAST('00:00:00' AS time), CAST(cab.CAB_HR_DIGITACAO AS time)),
        CAST(cab.CAB_DT_DIGITACAO AS datetime2)
    ) AS dt_hr
) x
WHERE cab.CAB_HR_DIGITACAO IS NOT NULL
  AND TRY_CAST(cab.CAB_HR_DIGITACAO AS time) IS NOT NULL
  AND cab.CAB_DT_DIGITACAO IS NOT NULL;

-- COMMIT TRANSACTION;
ROLLBACK TRANSACTION;

*/

PRINT 'Fim do script. PARTE 3: troque ROLLBACK por COMMIT se o preview do log estiver ok.';
GO
