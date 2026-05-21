-- Criação da tabela de notificações para compartilhamento entre usuários
-- Substitui o armazenamento local (localStorage) por armazenamento centralizado

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TB_NOTIFICACOES')
BEGIN
    CREATE TABLE TB_NOTIFICACOES (
        ID_NOTIF INT IDENTITY(1,1) PRIMARY KEY,
        TIPO VARCHAR(50) NOT NULL,
        MENSAGEM VARCHAR(500) NOT NULL,
        DETALHE VARCHAR(500),
        USUARIO_DESTINO VARCHAR(100),  -- NULL = notificação global (todos veem)
        USUARIO_ORIGEM VARCHAR(100),   -- Quem gerou a notificação
        TIMESTAMP_CRIACAO DATETIME DEFAULT GETDATE(),
        LIDO BIT DEFAULT 0,
        USUARIO_LEITURA VARCHAR(100),  -- Quem marcou como lida (para rastrear leituras individuais)
        TIMESTAMP_LEITURA DATETIME,
        ATIVO BIT DEFAULT 1            -- Permite "deletar" logicamente
    );

    -- Índice para consultas rápidas por usuário
    CREATE INDEX IDX_NOTIF_USUARIO ON TB_NOTIFICACOES(USUARIO_DESTINO, ATIVO, TIMESTAMP_CRIACAO DESC);
    
    -- Índice para consultas de notificações não lidas
    CREATE INDEX IDX_NOTIF_NAO_LIDAS ON TB_NOTIFICACOES(USUARIO_DESTINO, LIDO, ATIVO);
END
GO

PRINT 'Tabela TB_NOTIFICACOES criada com sucesso!';
