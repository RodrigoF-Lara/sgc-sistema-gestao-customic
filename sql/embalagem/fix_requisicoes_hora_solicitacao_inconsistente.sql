-- =====================================================================
-- FIX REQUISICOES: horário de solicitação inconsistente
-- Corrige registros onde DT_REQUISICAO + HR_REQUSICAO ficou maior que
-- DT_CONCLUSAO (caso típico de drift UTC x horário local).
--
-- Estratégia (conservadora):
-- 1) Considera apenas inconsistências de até 6 horas.
-- 2) Tenta corrigir com -3h (UTC -> BRT).
-- 3) Se ainda ficar > DT_CONCLUSAO, ajusta para 1 minuto antes da conclusão.
-- =====================================================================

;WITH Base AS (
    SELECT
        R.ID_REQ,
        R.DT_REQUISICAO,
        R.HR_REQUSICAO,
        R.DT_CONCLUSAO,
        TRY_CONVERT(time(0), R.HR_REQUSICAO) AS HORA_REQ_TIME,
        CASE
            WHEN R.DT_REQUISICAO IS NOT NULL
             AND TRY_CONVERT(time(0), R.HR_REQUSICAO) IS NOT NULL
            THEN DATEADD(
                    SECOND,
                    DATEDIFF(SECOND, CAST('00:00:00' AS time(0)), TRY_CONVERT(time(0), R.HR_REQUSICAO)),
                    CAST(R.DT_REQUISICAO AS datetime2)
                 )
            ELSE NULL
        END AS DT_HR_SOLICITACAO
    FROM [dbo].[TB_REQUISICOES] R
),
Inconsistentes AS (
    SELECT
        B.*,
        DATEDIFF(MINUTE, B.DT_CONCLUSAO, B.DT_HR_SOLICITACAO) AS DIFF_MIN
    FROM Base B
    WHERE B.DT_CONCLUSAO IS NOT NULL
      AND B.DT_HR_SOLICITACAO IS NOT NULL
      AND B.DT_HR_SOLICITACAO > B.DT_CONCLUSAO
      AND DATEDIFF(MINUTE, B.DT_CONCLUSAO, B.DT_HR_SOLICITACAO) BETWEEN 1 AND 360
),
Correcao AS (
    SELECT
        I.ID_REQ,
        I.DT_HR_SOLICITACAO,
        I.DT_CONCLUSAO,
        CASE
            WHEN DATEADD(HOUR, -3, I.DT_HR_SOLICITACAO) <= I.DT_CONCLUSAO
                THEN DATEADD(HOUR, -3, I.DT_HR_SOLICITACAO)
            ELSE DATEADD(MINUTE, -1, I.DT_CONCLUSAO)
        END AS DT_HR_SOLICITACAO_CORRIGIDA
    FROM Inconsistentes I
)
UPDATE R
SET
    R.DT_REQUISICAO = CAST(C.DT_HR_SOLICITACAO_CORRIGIDA AS date),
    R.HR_REQUSICAO = CONVERT(varchar(8), CAST(C.DT_HR_SOLICITACAO_CORRIGIDA AS time(0)), 108)
FROM [dbo].[TB_REQUISICOES] R
INNER JOIN Correcao C ON C.ID_REQ = R.ID_REQ;

PRINT 'Correção concluída para inconsistências de até 6h.';
PRINT 'Confira abaixo se restaram linhas inconsistentes:';

SELECT
    R.ID_REQ,
    R.DT_REQUISICAO,
    R.HR_REQUSICAO,
    R.DT_CONCLUSAO,
    DATEADD(
        SECOND,
        DATEDIFF(SECOND, CAST('00:00:00' AS time(0)), TRY_CONVERT(time(0), R.HR_REQUSICAO)),
        CAST(R.DT_REQUISICAO AS datetime2)
    ) AS DT_HR_SOLICITACAO,
    DATEDIFF(
        MINUTE,
        R.DT_CONCLUSAO,
        DATEADD(
            SECOND,
            DATEDIFF(SECOND, CAST('00:00:00' AS time(0)), TRY_CONVERT(time(0), R.HR_REQUSICAO)),
            CAST(R.DT_REQUISICAO AS datetime2)
        )
    ) AS DIFF_MIN
FROM [dbo].[TB_REQUISICOES] R
WHERE R.DT_CONCLUSAO IS NOT NULL
  AND R.DT_REQUISICAO IS NOT NULL
  AND TRY_CONVERT(time(0), R.HR_REQUSICAO) IS NOT NULL
  AND DATEADD(
        SECOND,
        DATEDIFF(SECOND, CAST('00:00:00' AS time(0)), TRY_CONVERT(time(0), R.HR_REQUSICAO)),
        CAST(R.DT_REQUISICAO AS datetime2)
      ) > R.DT_CONCLUSAO
ORDER BY R.ID_REQ DESC;

GO