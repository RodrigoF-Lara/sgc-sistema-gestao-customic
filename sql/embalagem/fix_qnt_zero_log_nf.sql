-- =========================================================
-- CORREÇÃO: QNT = 0 em registros de TB_LOG_NF
-- 
-- O bug fazia com que atualizações de status (ex: Armazenado)
-- gravassem QNT = 0. Este script corrige usando a QNT da
-- entrada de 'LANCAMENTO NF' como fonte da quantidade correta.
--
-- 1) Rode primeiro o SELECT para conferir os registros afetados
-- 2) Se estiver correto, execute o UPDATE
-- =========================================================

-- PASSO 1: Visualizar o que será corrigido
SELECT
    target.ID_NF,
    target.NF,
    target.CODIGO,
    target.PROCESSO,
    target.QNT AS QNT_ATUAL,
    source.QNT AS QNT_CORRETA
FROM [dbo].[TB_LOG_NF] target
INNER JOIN (
    SELECT NF, CODIGO, QNT
    FROM [dbo].[TB_LOG_NF]
    WHERE PROCESSO = 'LANCAMENTO NF'
      AND QNT > 0
) source ON target.NF = source.NF AND target.CODIGO = source.CODIGO
WHERE target.QNT = 0
  AND target.PROCESSO <> 'LANCAMENTO NF'
ORDER BY target.NF, target.CODIGO;

-- PASSO 2: Aplicar a correção
UPDATE target
SET target.QNT = source.QNT
FROM [dbo].[TB_LOG_NF] target
INNER JOIN (
    SELECT NF, CODIGO, QNT
    FROM [dbo].[TB_LOG_NF]
    WHERE PROCESSO = 'LANCAMENTO NF'
      AND QNT > 0
) source ON target.NF = source.NF AND target.CODIGO = source.CODIGO
WHERE target.QNT = 0
  AND target.PROCESSO <> 'LANCAMENTO NF';

-- PASSO 3: Confirmar resultado (deve retornar 0 linhas)
SELECT COUNT(*) AS registros_com_qnt_zero_restantes
FROM [dbo].[TB_LOG_NF]
WHERE QNT = 0 AND PROCESSO <> 'LANCAMENTO NF';
