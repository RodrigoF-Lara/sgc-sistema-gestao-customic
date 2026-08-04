-- Seed: quem pode GERAR nova lista de inventário cíclico
-- Ajuste depois em Configurações → Permissões (Ações especiais)

IF OBJECT_ID('dbo.SHR_PERMISSOES_MENU', 'U') IS NULL
BEGIN
    PRINT 'Tabela SHR_PERMISSOES_MENU não existe. Rode create_permissoes / fix_create_permissoes_menu antes.';
    RETURN;
END
GO

;WITH niveis AS (
    SELECT v.nivel FROM (VALUES
        ('gerente_estoque'),
        ('coordenador_estoque'),
        ('supervisor_estoque'),
        ('lider_estoque'),
        ('analista_estoque')
    ) v(nivel)
)
INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
SELECT 'inventario-gerar', n.nivel, 1, 'SEED'
FROM niveis n
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.SHR_PERMISSOES_MENU p
    WHERE p.LINK_ID = 'inventario-gerar' AND p.NIVEL = n.nivel
);
GO

PRINT 'Seed inventario-gerar OK (gerente/coordenador/supervisor/lider/analista).';
PRINT 'Assistente, auxiliar e estágio ficam sem gerar (só consultam se tiverem o módulo).';
GO
