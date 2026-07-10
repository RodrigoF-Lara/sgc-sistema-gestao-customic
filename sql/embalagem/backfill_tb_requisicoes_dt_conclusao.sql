-- =====================================================================
-- BACKFILL TB_REQUISICOES.DT_CONCLUSAO
-- Preenche a data de conclusão de requisições antigas já concluídas
-- usando o último momento em que algum item foi alterado para Finalizado.
--
-- Regras:
-- 1. Atualiza somente cabeçalhos já concluídos.
-- 2. Atualiza somente linhas em que DT_CONCLUSAO ainda está NULL.
-- 3. Usa MAX(DT_HR_ALTERACAO) do log com STATUS_NOVO = 'Finalizado'.
-- 4. Se não houver log suficiente, a requisição permanece com NULL.
-- =====================================================================

;WITH UltimaFinalizacao AS (
    SELECT
        L.ID_REQ,
        MAX(L.DT_HR_ALTERACAO) AS DT_CONCLUSAO_CALCULADA
    FROM [dbo].[TB_REQ_ITEM_LOG] L
    WHERE UPPER(LTRIM(RTRIM(ISNULL(L.STATUS_NOVO, '')))) = 'FINALIZADO'
      AND L.DT_HR_ALTERACAO IS NOT NULL
    GROUP BY L.ID_REQ
)
UPDATE R
SET R.DT_CONCLUSAO = U.DT_CONCLUSAO_CALCULADA
FROM [dbo].[TB_REQUISICOES] R
INNER JOIN UltimaFinalizacao U
    ON U.ID_REQ = R.ID_REQ
WHERE R.DT_CONCLUSAO IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(R.STATUS, '')))) IN ('CONCLUIDO', 'CONCLUÍDO');

PRINT 'Backfill de DT_CONCLUSAO executado. Confira a quantidade de linhas afetadas na mensagem do SQL Server.';
GO