-- =============================================================================
-- Sistema de Permissões por Cargo + Setor (SGC)
--
-- Grupos (exemplos):
--   adm                      → ADM
--   gerente_estoque          → GERENTE (estoque)
--   coordenador_estoque      → COORDENADOR (estoque)
--   ...
--
-- CAD_USUARIO.NIVEL grava o CODIGO do grupo (texto), não mais 1/2/3/4.
-- Administrador = codigo 'adm' (bypass total no helper).
-- Default = NEGADO se não houver linha (link_id, nivel) com permitido = 1.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) CAD_USUARIO.NIVEL: INT → VARCHAR(50) + migração legada 1/2/3/4
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL'
)
BEGIN
    DECLARE @tipo NVARCHAR(128);
    SELECT @tipo = DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL';

    IF @tipo IN ('int', 'smallint', 'tinyint', 'bigint', 'decimal', 'numeric')
    BEGIN
        -- Converte valores numéricos para texto temporário via coluna auxiliar
        IF COL_LENGTH('dbo.CAD_USUARIO', 'NIVEL_TXT') IS NULL
            ALTER TABLE dbo.CAD_USUARIO ADD NIVEL_TXT VARCHAR(50) NULL;

        EXEC(N'
            UPDATE dbo.CAD_USUARIO
            SET NIVEL_TXT = CASE CAST(NIVEL AS VARCHAR(20))
                WHEN ''1'' THEN ''adm''
                WHEN ''2'' THEN ''gerente_estoque''
                WHEN ''3'' THEN ''assistente_estoque''
                WHEN ''4'' THEN ''auxiliar_estoque''
                ELSE LOWER(REPLACE(LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))), '' '', ''_''))
            END
        ');

        ALTER TABLE dbo.CAD_USUARIO DROP COLUMN NIVEL;
        EXEC sp_rename 'dbo.CAD_USUARIO.NIVEL_TXT', 'NIVEL', 'COLUMN';
        PRINT 'CAD_USUARIO.NIVEL migrado de numérico para VARCHAR (cargos).';
    END
    ELSE IF @tipo IN ('varchar', 'nvarchar', 'char', 'nchar', 'text')
    BEGIN
        -- Já é texto: só normaliza legados numéricos se ainda existirem
        UPDATE dbo.CAD_USUARIO SET NIVEL = 'adm' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('1', '01');
        UPDATE dbo.CAD_USUARIO SET NIVEL = 'gerente_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('2', '02');
        UPDATE dbo.CAD_USUARIO SET NIVEL = 'assistente_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('3', '03');
        UPDATE dbo.CAD_USUARIO SET NIVEL = 'auxiliar_estoque' WHERE LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50)))) IN ('4', '04');
        PRINT 'CAD_USUARIO.NIVEL já é texto; legados 1-4 normalizados se encontrados.';
    END
END
GO

-- Garante largura mínima
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CAD_USUARIO' AND COLUMN_NAME = 'NIVEL'
      AND (CHARACTER_MAXIMUM_LENGTH IS NULL OR CHARACTER_MAXIMUM_LENGTH < 50)
      AND DATA_TYPE IN ('varchar', 'nvarchar', 'char', 'nchar')
)
BEGIN
    ALTER TABLE dbo.CAD_USUARIO ALTER COLUMN NIVEL VARCHAR(50) NULL;
END
GO

-- ---------------------------------------------------------------------------
-- 1) Grupos / cargos
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SHR_NIVEIS_USUARIO')
BEGIN
    CREATE TABLE dbo.SHR_NIVEIS_USUARIO (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        CODIGO          VARCHAR(50)  NOT NULL,
        LABEL           VARCHAR(120) NOT NULL,
        SETOR           VARCHAR(50)  NULL,   -- ex: ESTOQUE (vazio para ADM)
        ORDEM           INT          NOT NULL CONSTRAINT DF_SHR_NIVEIS_ORDEM DEFAULT (100),
        PROTEGIDO       BIT          NOT NULL CONSTRAINT DF_SHR_NIVEIS_PROT DEFAULT (0),
        DT_CRIACAO      DATETIME2    NOT NULL CONSTRAINT DF_SHR_NIVEIS_CRIACAO DEFAULT (SYSUTCDATETIME()),
        DT_ATUALIZACAO  DATETIME2    NOT NULL CONSTRAINT DF_SHR_NIVEIS_ATUAL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_SHR_NIVEIS_CODIGO UNIQUE (CODIGO)
    );

    CREATE INDEX IDX_SHR_NIVEIS_ORDEM ON dbo.SHR_NIVEIS_USUARIO (ORDEM);
    PRINT 'Tabela SHR_NIVEIS_USUARIO criada.';
END
GO

-- Coluna SETOR se a tabela já existia sem ela
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SHR_NIVEIS_USUARIO')
   AND NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SHR_NIVEIS_USUARIO' AND COLUMN_NAME = 'SETOR'
   )
BEGIN
    ALTER TABLE dbo.SHR_NIVEIS_USUARIO ADD SETOR VARCHAR(50) NULL;
    PRINT 'Coluna SETOR adicionada em SHR_NIVEIS_USUARIO.';
END
GO

-- Amplia LABEL se necessário
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'SHR_NIVEIS_USUARIO' AND COLUMN_NAME = 'LABEL'
      AND CHARACTER_MAXIMUM_LENGTH < 120
)
BEGIN
    ALTER TABLE dbo.SHR_NIVEIS_USUARIO ALTER COLUMN LABEL VARCHAR(120) NOT NULL;
END
GO

-- Remove seed numérico antigo (1-4) — só se as tabelas já existirem
IF OBJECT_ID('dbo.SHR_PERMISSOES_MENU', 'U') IS NOT NULL
BEGIN
    DELETE FROM dbo.SHR_PERMISSOES_MENU
    WHERE NIVEL IN ('1', '2', '3', '4');
END
GO

IF OBJECT_ID('dbo.SHR_NIVEIS_USUARIO', 'U') IS NOT NULL
BEGIN
    DELETE FROM dbo.SHR_NIVEIS_USUARIO
    WHERE CODIGO IN ('1', '2', '3', '4')
      AND NOT EXISTS (
          SELECT 1 FROM dbo.CAD_USUARIO u
          WHERE LTRIM(RTRIM(CAST(u.NIVEL AS VARCHAR(50)))) = SHR_NIVEIS_USUARIO.CODIGO
      );
END
GO

-- Seed dos cargos (não sobrescreve se já existir)
-- ADM
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'adm')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('adm', 'ADM', NULL, 10, 1);

-- Estoque
IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'gerente_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('gerente_estoque', 'GERENTE (estoque)', 'ESTOQUE', 20, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'coordenador_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('coordenador_estoque', 'COORDENADOR (estoque)', 'ESTOQUE', 30, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'supervisor_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('supervisor_estoque', 'SUPERVISOR (estoque)', 'ESTOQUE', 40, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'lider_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('lider_estoque', 'LIDER (estoque)', 'ESTOQUE', 50, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'analista_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('analista_estoque', 'ANALISTA (estoque)', 'ESTOQUE', 60, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'assistente_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('assistente_estoque', 'ASSISTENTE (estoque)', 'ESTOQUE', 70, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'auxiliar_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('auxiliar_estoque', 'AUXILIAR (estoque)', 'ESTOQUE', 80, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = 'estagio_estoque')
    INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
    VALUES ('estagio_estoque', 'ESTÁGIO (estoque)', 'ESTOQUE', 90, 0);
GO

-- Atualiza labels/setor se já existiam sem esses dados
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'ADM', SETOR = NULL, ORDEM = 10, PROTEGIDO = 1, DT_ATUALIZACAO = SYSUTCDATETIME() WHERE CODIGO = 'adm';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'GERENTE (estoque)', SETOR = 'ESTOQUE', ORDEM = 20 WHERE CODIGO = 'gerente_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'COORDENADOR (estoque)', SETOR = 'ESTOQUE', ORDEM = 30 WHERE CODIGO = 'coordenador_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'SUPERVISOR (estoque)', SETOR = 'ESTOQUE', ORDEM = 40 WHERE CODIGO = 'supervisor_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'LIDER (estoque)', SETOR = 'ESTOQUE', ORDEM = 50 WHERE CODIGO = 'lider_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'ANALISTA (estoque)', SETOR = 'ESTOQUE', ORDEM = 60 WHERE CODIGO = 'analista_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'ASSISTENTE (estoque)', SETOR = 'ESTOQUE', ORDEM = 70 WHERE CODIGO = 'assistente_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'AUXILIAR (estoque)', SETOR = 'ESTOQUE', ORDEM = 80 WHERE CODIGO = 'auxiliar_estoque';
UPDATE dbo.SHR_NIVEIS_USUARIO SET LABEL = 'ESTÁGIO (estoque)', SETOR = 'ESTOQUE', ORDEM = 90 WHERE CODIGO = 'estagio_estoque';
GO

-- ---------------------------------------------------------------------------
-- 2) Matriz de permissões
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SHR_PERMISSOES_MENU')
BEGIN
    CREATE TABLE dbo.SHR_PERMISSOES_MENU (
        ID                   INT IDENTITY(1,1) PRIMARY KEY,
        LINK_ID              VARCHAR(100) NOT NULL,
        NIVEL                VARCHAR(50)  NOT NULL,  -- = SHR_NIVEIS_USUARIO.CODIGO
        PERMITIDO            BIT          NOT NULL CONSTRAINT DF_SHR_PERM_OK DEFAULT (0),
        DT_ATUALIZACAO       DATETIME2    NOT NULL CONSTRAINT DF_SHR_PERM_ATUAL DEFAULT (SYSUTCDATETIME()),
        USUARIO_ATUALIZACAO  VARCHAR(100) NULL,
        CONSTRAINT UQ_SHR_PERM_LINK_NIVEL UNIQUE (LINK_ID, NIVEL)
    );

    CREATE INDEX IDX_SHR_PERM_NIVEL ON dbo.SHR_PERMISSOES_MENU (NIVEL);
    CREATE INDEX IDX_SHR_PERM_LINK  ON dbo.SHR_PERMISSOES_MENU (LINK_ID);
    PRINT 'Tabela SHR_PERMISSOES_MENU criada.';
END
GO

-- ---------------------------------------------------------------------------
-- 3) Seed: libera módulos operacionais para cargos de estoque
--    ADM não precisa de linhas (bypass no helper).
-- ---------------------------------------------------------------------------
;WITH links AS (
    SELECT v.link_id
    FROM (VALUES
        ('home'),
        ('nova-requisicao'),
        ('consultar-requisicoes'),
        ('requisicoes'),
        ('saida-rapida'),
        ('estoque'),
        ('mapa-enderecos'),
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
        ('calendario-produtivo'),
        ('capa-depara')
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

PRINT 'Sistema de permissões (cargos + setor): OK.';
GO
