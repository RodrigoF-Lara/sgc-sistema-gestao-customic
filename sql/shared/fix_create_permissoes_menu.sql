-- =============================================================================
-- Correção: cria SHR_PERMISSOES_MENU + seed (se a 1ª execução parou no DELETE)
-- Rode se viu: Invalid object name 'dbo.SHR_PERMISSOES_MENU'
-- =============================================================================

-- Garante cargos (idempotente)
IF OBJECT_ID('dbo.SHR_NIVEIS_USUARIO', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SHR_NIVEIS_USUARIO (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        CODIGO          VARCHAR(50)  NOT NULL,
        LABEL           VARCHAR(120) NOT NULL,
        SETOR           VARCHAR(50)  NULL,
        ORDEM           INT          NOT NULL CONSTRAINT DF_SHR_NIVEIS_ORDEM2 DEFAULT (100),
        PROTEGIDO       BIT          NOT NULL CONSTRAINT DF_SHR_NIVEIS_PROT2 DEFAULT (0),
        DT_CRIACAO      DATETIME2    NOT NULL CONSTRAINT DF_SHR_NIVEIS_CRIACAO2 DEFAULT (SYSUTCDATETIME()),
        DT_ATUALIZACAO  DATETIME2    NOT NULL CONSTRAINT DF_SHR_NIVEIS_ATUAL2 DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_SHR_NIVEIS_CODIGO2 UNIQUE (CODIGO)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'adm')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('adm', 'ADM', NULL, 10, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'gerente_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('gerente_estoque', 'GERENTE (estoque)', 'ESTOQUE', 20, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'coordenador_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('coordenador_estoque', 'COORDENADOR (estoque)', 'ESTOQUE', 30, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'supervisor_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('supervisor_estoque', 'SUPERVISOR (estoque)', 'ESTOQUE', 40, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'lider_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('lider_estoque', 'LIDER (estoque)', 'ESTOQUE', 50, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'analista_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('analista_estoque', 'ANALISTA (estoque)', 'ESTOQUE', 60, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'assistente_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('assistente_estoque', 'ASSISTENTE (estoque)', 'ESTOQUE', 70, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'auxiliar_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('auxiliar_estoque', 'AUXILIAR (estoque)', 'ESTOQUE', 80, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'estagio_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO) VALUES ('estagio_estoque', 'ESTÁGIO (estoque)', 'ESTOQUE', 90, 0);
GO

-- Cria matriz
IF OBJECT_ID('dbo.SHR_PERMISSOES_MENU', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SHR_PERMISSOES_MENU (
        ID                   INT IDENTITY(1,1) PRIMARY KEY,
        LINK_ID              VARCHAR(100) NOT NULL,
        NIVEL                VARCHAR(50)  NOT NULL,
        PERMITIDO            BIT          NOT NULL CONSTRAINT DF_SHR_PERM_OK2 DEFAULT (0),
        DT_ATUALIZACAO       DATETIME2    NOT NULL CONSTRAINT DF_SHR_PERM_ATUAL2 DEFAULT (SYSUTCDATETIME()),
        USUARIO_ATUALIZACAO  VARCHAR(100) NULL,
        CONSTRAINT UQ_SHR_PERM_LINK_NIVEL2 UNIQUE (LINK_ID, NIVEL)
    );
    CREATE INDEX IDX_SHR_PERM_NIVEL2 ON dbo.SHR_PERMISSOES_MENU (NIVEL);
    CREATE INDEX IDX_SHR_PERM_LINK2  ON dbo.SHR_PERMISSOES_MENU (LINK_ID);
    PRINT 'Tabela SHR_PERMISSOES_MENU criada.';
END
ELSE
    PRINT 'Tabela SHR_PERMISSOES_MENU já existia.';
GO

-- Seed: libera módulos operacionais para cargos de estoque
;WITH links AS (
    SELECT v.link_id
    FROM (VALUES
        ('home'),
        ('nova-requisicao'),
        ('consultar-requisicoes'),
        ('requisicoes'),
        ('saida-rapida'),
        ('estoque'),
        ('inventario-ciclico'),
        ('lancamento-nf'),
        ('status-nf'),
        ('relatorios'),
        ('relatorio-baixa-periodo'),
        ('consumo-medio'),
        ('relatorio-requisicoes'),
        ('relatorio-saldo'),
        ('relatorio-acuracidade'),
        ('saving-compras'),
        ('cadastro-produtos'),
        ('cadastro-fornecedores'),
        ('configuracoes'),
        ('config-notificacoes'),
        ('config-inventario'),
        ('calendario-produtivo')
    ) v(link_id)
),
niveis AS (
    SELECT v.nivel
    FROM (VALUES
        ('gerente_estoque'),
        ('coordenador_estoque'),
        ('supervisor_estoque'),
        ('lider_estoque'),
        ('analista_estoque'),
        ('assistente_estoque'),
        ('auxiliar_estoque'),
        ('estagio_estoque')
    ) v(nivel)
)
INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
SELECT l.link_id, n.nivel, 1, 'SEED'
FROM links l
CROSS JOIN niveis n
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.SHR_PERMISSOES_MENU p
    WHERE p.LINK_ID = l.link_id AND p.NIVEL = n.nivel
);
GO

PRINT 'Correção OK. Conferência:';
SELECT 'SHR_NIVEIS_USUARIO' AS TABELA, COUNT(*) AS QTD FROM dbo.SHR_NIVEIS_USUARIO
UNION ALL
SELECT 'SHR_PERMISSOES_MENU', COUNT(*) FROM dbo.SHR_PERMISSOES_MENU;
GO
