import { getConnection, sql } from "../db.js";

/**
 * API unificada de Configurações
 * Gerencia configurações de inventário e notificações
 * 
 * Rotas:
 * - /api/config?tipo=inventario&action=get
 * - /api/config?tipo=notificacoes&action=get
 */
export default async function handler(req, res) {
  const { method, query } = req;
  const { tipo } = query;

  try {
    const pool = await getConnection();

    // Roteamento por tipo
    if (tipo === 'inventario') {
      return await handleInventario(req, res, pool, method, query);
    } else if (tipo === 'notificacoes') {
      return await handleNotificacoes(req, res, pool, method, query);
    } else {
      return res.status(400).json({ error: "Parâmetro 'tipo' é obrigatório (inventario ou notificacoes)" });
    }
  } catch (error) {
    console.error("Erro na API de configurações:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

// =========================================================================
// CONFIGURAÇÕES DE INVENTÁRIO
// =========================================================================

async function handleInventario(req, res, pool, method, query) {
  if (method === "GET" && query.action === "get") {
    return await getConfigInventario(pool, res);
  } else if (method === "POST") {
    return await saveConfigInventario(req, res, pool);
  } else {
    return res.status(405).json({ error: "Método não permitido" });
  }
}

async function getConfigInventario(pool, res) {
  try {
    const result = await pool.request().query(`
      SELECT TOP 1 
        QTD_BLOCO_1,
        QTD_BLOCO_2,
        QTD_BLOCO_3,
        QTD_BLOCO_4,
        QTD_BLOCO_5
      FROM TB_CONFIG_INVENTARIO
      ORDER BY ID DESC
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Configurações não encontradas" });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error("Erro ao buscar configuração:", error);
    return res.status(500).json({ 
      error: "Erro ao buscar configuração", 
      message: error.message 
    });
  }
}

async function saveConfigInventario(req, res, pool) {
  const { qtdBloco1, qtdBloco2, qtdBloco3, qtdBloco4, qtdBloco5 } = req.body;

  if (!qtdBloco1 || !qtdBloco2 || !qtdBloco3 || !qtdBloco4 || !qtdBloco5) {
    return res.status(400).json({ error: "Todos os blocos são obrigatórios" });
  }

  try {
    const checkTable = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'TB_CONFIG_INVENTARIO'
    `);

    if (checkTable.recordset[0].count === 0) {
      await pool.request().query(`
        CREATE TABLE TB_CONFIG_INVENTARIO (
          ID INT IDENTITY(1,1) PRIMARY KEY,
          QTD_BLOCO_1 INT NOT NULL,
          QTD_BLOCO_2 INT NOT NULL,
          QTD_BLOCO_3 INT NOT NULL,
          QTD_BLOCO_4 INT NOT NULL,
          QTD_BLOCO_5 INT NOT NULL,
          CRIADO_EM DATETIME DEFAULT GETDATE(),
          ATUALIZADO_EM DATETIME DEFAULT GETDATE()
        )
      `);
    }

    const existing = await pool.request().query(`
      SELECT TOP 1 ID FROM TB_CONFIG_INVENTARIO ORDER BY ID DESC
    `);

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('qtdBloco1', sql.Int, qtdBloco1)
        .input('qtdBloco2', sql.Int, qtdBloco2)
        .input('qtdBloco3', sql.Int, qtdBloco3)
        .input('qtdBloco4', sql.Int, qtdBloco4)
        .input('qtdBloco5', sql.Int, qtdBloco5)
        .input('id', sql.Int, existing.recordset[0].ID)
        .query(`
          UPDATE TB_CONFIG_INVENTARIO 
          SET 
            QTD_BLOCO_1 = @qtdBloco1,
            QTD_BLOCO_2 = @qtdBloco2,
            QTD_BLOCO_3 = @qtdBloco3,
            QTD_BLOCO_4 = @qtdBloco4,
            QTD_BLOCO_5 = @qtdBloco5,
            ATUALIZADO_EM = GETDATE()
          WHERE ID = @id
        `);
    } else {
      await pool.request()
        .input('qtdBloco1', sql.Int, qtdBloco1)
        .input('qtdBloco2', sql.Int, qtdBloco2)
        .input('qtdBloco3', sql.Int, qtdBloco3)
        .input('qtdBloco4', sql.Int, qtdBloco4)
        .input('qtdBloco5', sql.Int, qtdBloco5)
        .query(`
          INSERT INTO TB_CONFIG_INVENTARIO 
            (QTD_BLOCO_1, QTD_BLOCO_2, QTD_BLOCO_3, QTD_BLOCO_4, QTD_BLOCO_5)
          VALUES 
            (@qtdBloco1, @qtdBloco2, @qtdBloco3, @qtdBloco4, @qtdBloco5)
        `);
    }

    return res.status(200).json({ 
      success: true, 
      message: "Configuração salva com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao salvar configuração:", error);
    return res.status(500).json({ 
      error: "Erro ao salvar configuração", 
      message: error.message 
    });
  }
}

// =========================================================================
// CONFIGURAÇÕES DE NOTIFICAÇÕES
// =========================================================================

async function handleNotificacoes(req, res, pool, method, query) {
  if (method === "GET" && query.action === "get") {
    return await getConfigNotificacoes(pool, res);
  } else if (method === "POST") {
    return await saveConfigNotificacoes(req, res, pool);
  } else {
    return res.status(405).json({ error: "Método não permitido" });
  }
}

async function getConfigNotificacoes(pool, res) {
  try {
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'TB_CONFIG_NOTIFICACOES'
    `);

    if (tableExists.recordset[0].count === 0) {
      await criarTabelaConfigNotif(pool);
      return res.status(200).json({ config: null });
    }

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
    console.error("Erro ao buscar configurações de notificações:", error);
    return res.status(500).json({ 
      error: "Erro ao buscar configurações", 
      message: error.message 
    });
  }
}

async function saveConfigNotificacoes(req, res, pool) {
  const { action, config } = req.body;

  if (action !== 'save' || !config) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  try {
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'TB_CONFIG_NOTIFICACOES'
    `);

    if (tableExists.recordset[0].count === 0) {
      await criarTabelaConfigNotif(pool);
    }

    const existing = await pool.request().query(`
      SELECT TOP 1 ID FROM TB_CONFIG_NOTIFICACOES ORDER BY ID DESC
    `);

    const tiposAtivosJson = JSON.stringify(config.tiposAtivos || {});

    if (existing.recordset.length > 0) {
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

async function criarTabelaConfigNotif(pool) {
  await pool.request().query(`
    CREATE TABLE TB_CONFIG_NOTIFICACOES (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      EXPIRATION_DAYS INT DEFAULT 30,
      MAX_NOTIFICATIONS INT DEFAULT 60,
      POLL_INTERVAL INT DEFAULT 10,
      TIPOS_ATIVOS NVARCHAR(MAX),
      CRIADO_EM DATETIME DEFAULT GETDATE(),
      ATUALIZADO_EM DATETIME DEFAULT GETDATE()
    )
  `);
  console.log('Tabela TB_CONFIG_NOTIFICACOES criada');
}
