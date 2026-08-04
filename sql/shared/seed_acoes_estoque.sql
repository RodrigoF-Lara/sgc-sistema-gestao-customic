-- Seed: permissões dos botões de Gerenciar Estoque
-- Marca na matriz (ou rode este script e ajuste em Configurações → Permissões)

-- Entrada e Saída: todos os cargos de estoque
;WITH niveis AS (
    SELECT v.nivel FROM (VALUES
        ('gerente_estoque'),('coordenador_estoque'),('supervisor_estoque'),
        ('lider_estoque'),('analista_estoque'),('assistente_estoque'),
        ('auxiliar_estoque'),('estagio_estoque')
    ) v(nivel)
),
links AS (
    SELECT v.link_id FROM (VALUES
        ('estoque-entrada'),
        ('estoque-saida')
    ) v(link_id)
)
INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
SELECT l.link_id, n.nivel, 1, 'SEED'
FROM links l CROSS JOIN niveis n
WHERE OBJECT_ID('dbo.SHR_PERMISSOES_MENU','U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.SHR_PERMISSOES_MENU p
    WHERE p.LINK_ID = l.link_id AND p.NIVEL = n.nivel
  );
GO

-- Zerar / Alterar: só cargos de liderança (gerente → líder)
;WITH niveis AS (
    SELECT v.nivel FROM (VALUES
        ('gerente_estoque'),('coordenador_estoque'),
        ('supervisor_estoque'),('lider_estoque')
    ) v(nivel)
),
links AS (
    SELECT v.link_id FROM (VALUES
        ('estoque-zerar-endereco'),
        ('estoque-zerar-codigo'),
        ('estoque-alterar-endereco')
    ) v(link_id)
)
INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
SELECT l.link_id, n.nivel, 1, 'SEED'
FROM links l CROSS JOIN niveis n
WHERE OBJECT_ID('dbo.SHR_PERMISSOES_MENU','U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.SHR_PERMISSOES_MENU p
    WHERE p.LINK_ID = l.link_id AND p.NIVEL = n.nivel
  );
GO

PRINT 'Seed ações de estoque OK.';
GO
