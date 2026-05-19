const sql = require("mssql");
const getConnection = require("../db");

/**
 * API de Configurações de Notificações
 * Permite salvar e carregar regras de notificações do sistema
 */
export default async function handler(req, res) {
  const { method, query } = req;

  try {
    const pool = await getConnection();

    if (method === "GET" && query.action === "get") {
      return await buscarConfiguracoes(req, res, pool);
    } else if (method === "POST") {
      return await salvarConfiguracoes(req, res, pool);
    } else {
      return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (error) {
    console.error("Erro na API de configurações de notificações:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

async function buscarConfiguracoes(req, res, pool) {
  try {
    // Verifica se a tabela existe
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'TB_CONFIG_NOTIFICACOES'
    `);

    if (tableExists.recordset[0].count === 0) {
      // Se a tabela não existe, cria
      await criarTabelaConfig(pool);
      return res.status(200).json({ config: null }); // Retorna null para usar padrões
    }

    // Busca configuração (deve haver apenas 1 linha)
    const result = await pool.request().query(`
      SELECT TOP 1 
        EXPIRATION_DAYS,
        MAX_NOTIFICATIONS,
        POLL_INTERVAL,
        TIPOS_ATIVOS,
        ATUALIZADO_EM
      FROM TB_CONFIG_NOTIFICACOES
      ORDER BY ID DESC
    `);

    if (result.recordset.length === 0) {
      return res.status(200).json({ config: null });
    }

    const row = result.recordset[0];
    const config = {
      expirationDays: row.EXPIRATION_DAYS,
      maxNotifications: row.MAX_NOTIFICATIONS,
      pollInterval: row.POLL_INTERVAL,
      tiposAtivos: row.TIPOS_ATIVOS ? JSON.parse(row.TIPOS_ATIVOS) : {},
      atualizadoEm: row.ATUALIZADO_EM
    };

    return res.status(200).json({ config });
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);
    return res.status(500).json({ 
      error: "Erro ao buscar configurações", 
      message: error.message 
    });
  }
}

async function salvarConfiguracoes(req, res, pool) {
  const { action, config } = req.body;

  if (action !== 'save' || !config) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  try {
    // Verifica se a tabela existe
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'TB_CONFIG_NOTIFICACOES'
    `);

    if (tableExists.recordset[0].count === 0) {
      await criarTabelaConfig(pool);
    }

    // Verifica se já existe configuração
    const existing = await pool.request().query(`
      SELECT TOP 1 ID FROM TB_CONFIG_NOTIFICACOES ORDER BY ID DESC
    `);

    const tiposAtivosJson = JSON.stringify(config.tiposAtivos || {});

    if (existing.recordset.length > 0) {
      // Atualiza
      await pool.request()
        .input('expirationDays', sql.Int, config.expirationDays || 30)
        .input('maxNotifications', sql.Int, config.maxNotifications || 60)
        .input('pollInterval', sql.Int, config.pollInterval || 10)
        .input('tiposAtivos', sql.NVarChar(sql.MAX), tiposAtivosJson)
        .input('id', sql.Int, existing.recordset[0].ID)
        .query(`
          UPDATE TB_CONFIG_NOTIFICACOES 
          SET 
            EXPIRATION_DAYS = @expirationDays,
            MAX_NOTIFICATIONS = @maxNotifications,
            POLL_INTERVAL = @pollInterval,
            TIPOS_ATIVOS = @tiposAtivos,
            ATUALIZADO_EM = GETDATE()
          WHERE ID = @id
        `);
    } else {
      // Insere
      await pool.request()
        .input('expirationDays', sql.Int, config.expirationDays || 30)
        .input('maxNotifications', sql.Int, config.maxNotifications || 60)
        .input('pollInterval', sql.Int, config.pollInterval || 10)
        .input('tiposAtivos', sql.NVarChar(sql.MAX), tiposAtivosJson)
        .query(`
          INSERT INTO TB_CONFIG_NOTIFICACOES 
            (EXPIRATION_DAYS, MAX_NOTIFICATIONS, POLL_INTERVAL, TIPOS_ATIVOS)
          VALUES 
            (@expirationDays, @maxNotifications, @pollInterval, @tiposAtivos)
        `);
    }

    return res.status(200).json({ 
      success: true, 
      message: "Configurações salvas com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    return res.status(500).json({ 
      error: "Erro ao salvar configurações", 
      message: error.message 
    });
  }
}

async function criarTabelaConfig(pool) {
  const createTableSQL = `
    CREATE TABLE TB_CONFIG_NOTIFICACOES (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      EXPIRATION_DAYS INT DEFAULT 30,
      MAX_NOTIFICATIONS INT DEFAULT 60,
      POLL_INTERVAL INT DEFAULT 10,
      TIPOS_ATIVOS NVARCHAR(MAX),  -- JSON com tipos ativos/inativos
      CRIADO_EM DATETIME DEFAULT GETDATE(),
      ATUALIZADO_EM DATETIME DEFAULT GETDATE()
    );
  `;

  await pool.request().query(createTableSQL);
  console.log('Tabela TB_CONFIG_NOTIFICACOES criada com sucesso');
}
