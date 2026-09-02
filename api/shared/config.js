import { getConnection, sql } from "../../db.js";
import { handleNiveis } from "../../lib/niveisApi.js";
import { handlePermissoes } from "../../lib/permissoesApi.js";
import { handlePedidoCapa } from "../../lib/pedidoCapaApi.js";

/**
 * API unificada de Configurações (+ cargos/permissões)
 *
 * Rotas:
 * - /api/shared/config?tipo=inventario&action=get
 * - /api/shared/config?tipo=notificacoes&action=get
 * - /api/shared/config?tipo=calendarioProdutivo&action=get
 * - /api/shared/config?tipo=niveis
 * - /api/shared/config?tipo=permissoes&action=minhas|matriz|catalogo|check
 *
 * Cargos e permissões vivem aqui (não em api/shared/niveis|permissoes.js)
 * para respeitar o limite de 12 Serverless Functions do Vercel Hobby.
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
    } else if (tipo === 'calendarioProdutivo') {
      return await handleCalendarioProdutivo(req, res, pool, method, query);
    } else if (tipo === 'niveis') {
      return await handleNiveis(req, res, pool, method);
    } else if (tipo === 'permissoes') {
      return await handlePermissoes(req, res, pool, method, query);
    } else if (tipo === "pedidoCapa") {
      return await handlePedidoCapa(req, res);
    } else {
      return res.status(400).json({
        error: "Parâmetro 'tipo' é obrigatório (inventario, notificacoes, calendarioProdutivo, niveis, permissoes ou pedidoCapa)"
      });
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
        BLOCO1_QTD_ITENS,
        BLOCO1_DIAS_MOVIMENTACAO,
        BLOCO2_QTD_ITENS,
        BLOCO2_ACURACIDADE_MIN,
        BLOCO3_QTD_ITENS,
        BLOCO4_QTD_ITENS,
        BLOCO5_QTD_ITENS,
        BLOCO5_INVENTARIOS_ATRAS,
        USUARIO_ALTERACAO,
        DT_ALTERACAO
      FROM TB_CONFIG_INVENTARIO
      ORDER BY ID_CONFIG DESC
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Configurações não encontradas" });
    }

    // Retorna no formato esperado pelo frontend
    return res.status(200).json({ 
      success: true,
      config: result.recordset[0] 
    });
  } catch (error) {
    console.error("Erro ao buscar configuração:", error);
    return res.status(500).json({ 
      error: "Erro ao buscar configuração", 
      message: error.message 
    });
  }
}

async function saveConfigInventario(req, res, pool) {
  const { 
    bloco1QtdItens,
    bloco1DiasMovimentacao,
    bloco2QtdItens,
    bloco2AcuracidadeMin,
    bloco3QtdItens,
    bloco4QtdItens,
    bloco5QtdItens,
    bloco5InventariosAtras,
    usuario
  } = req.body;

  // Validação
  if (!bloco1QtdItens || !bloco2QtdItens || !bloco3QtdItens || !bloco4QtdItens || !bloco5QtdItens) {
    return res.status(400).json({ error: "Todos os blocos são obrigatórios" });
  }

  try {
    // Verifica se já existe configuração
    const existing = await pool.request().query(`
      SELECT TOP 1 ID_CONFIG FROM TB_CONFIG_INVENTARIO ORDER BY ID_CONFIG DESC
    `);

    if (existing.recordset.length > 0) {
      // UPDATE
      await pool.request()
        .input('bloco1Qtd', sql.Int, bloco1QtdItens)
        .input('bloco1Dias', sql.Int, bloco1DiasMovimentacao)
        .input('bloco2Qtd', sql.Int, bloco2QtdItens)
        .input('bloco2Acur', sql.Float, bloco2AcuracidadeMin)
        .input('bloco3Qtd', sql.Int, bloco3QtdItens)
        .input('bloco4Qtd', sql.Int, bloco4QtdItens)
        .input('bloco5Qtd', sql.Int, bloco5QtdItens)
        .input('bloco5Inv', sql.Int, bloco5InventariosAtras)
        .input('usuario', sql.NVarChar, usuario || 'SISTEMA')
        .input('id', sql.Int, existing.recordset[0].ID_CONFIG)
        .query(`
          UPDATE TB_CONFIG_INVENTARIO 
          SET 
            BLOCO1_QTD_ITENS = @bloco1Qtd,
            BLOCO1_DIAS_MOVIMENTACAO = @bloco1Dias,
            BLOCO2_QTD_ITENS = @bloco2Qtd,
            BLOCO2_ACURACIDADE_MIN = @bloco2Acur,
            BLOCO3_QTD_ITENS = @bloco3Qtd,
            BLOCO4_QTD_ITENS = @bloco4Qtd,
            BLOCO5_QTD_ITENS = @bloco5Qtd,
            BLOCO5_INVENTARIOS_ATRAS = @bloco5Inv,
            USUARIO_ALTERACAO = @usuario,
            DT_ALTERACAO = GETDATE()
          WHERE ID_CONFIG = @id
        `);
    } else {
      // INSERT
      await pool.request()
        .input('bloco1Qtd', sql.Int, bloco1QtdItens)
        .input('bloco1Dias', sql.Int, bloco1DiasMovimentacao)
        .input('bloco2Qtd', sql.Int, bloco2QtdItens)
        .input('bloco2Acur', sql.Float, bloco2AcuracidadeMin)
        .input('bloco3Qtd', sql.Int, bloco3QtdItens)
        .input('bloco4Qtd', sql.Int, bloco4QtdItens)
        .input('bloco5Qtd', sql.Int, bloco5QtdItens)
        .input('bloco5Inv', sql.Int, bloco5InventariosAtras)
        .input('usuario', sql.NVarChar, usuario || 'SISTEMA')
        .query(`
          INSERT INTO TB_CONFIG_INVENTARIO 
            (BLOCO1_QTD_ITENS, BLOCO1_DIAS_MOVIMENTACAO, BLOCO2_QTD_ITENS, BLOCO2_ACURACIDADE_MIN, 
             BLOCO3_QTD_ITENS, BLOCO4_QTD_ITENS, BLOCO5_QTD_ITENS, BLOCO5_INVENTARIOS_ATRAS, USUARIO_ALTERACAO)
          VALUES 
            (@bloco1Qtd, @bloco1Dias, @bloco2Qtd, @bloco2Acur, @bloco3Qtd, @bloco4Qtd, @bloco5Qtd, @bloco5Inv, @usuario)
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

// =========================================================================
// CALENDÁRIO PRODUTIVO
// =========================================================================

async function handleCalendarioProdutivo(req, res, pool, method, query) {
  if (method === "GET" && query.action === "get") {
    return await getCalendarioProdutivo(pool, res);
  } else if (method === "POST") {
    return await saveCalendarioProdutivo(req, res, pool);
  } else {
    return res.status(405).json({ error: "Método não permitido" });
  }
}

function calendarioPadrao() {
  return {
    horaInicio: '08:00',
    horaFim: '18:00',
    diasAtivos: {
      seg: true,
      ter: true,
      qua: true,
      qui: true,
      sex: true,
      sab: false,
      dom: false
    }
  };
}

async function getCalendarioProdutivo(pool, res) {
  try {
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'TB_CONFIG_CALENDARIO_PRODUTIVO'
    `);

    if (tableExists.recordset[0].count === 0) {
      return res.status(200).json({ config: calendarioPadrao() });
    }

    const result = await pool.request().query(`
      SELECT TOP 1
        HORA_INICIO,
        HORA_FIM,
        SEG,
        TER,
        QUA,
        QUI,
        SEX,
        SAB,
        DOM,
        USUARIO_ALTERACAO,
        DT_ALTERACAO
      FROM TB_CONFIG_CALENDARIO_PRODUTIVO
      ORDER BY ID_CONFIG DESC
    `);

    if (result.recordset.length === 0) {
      return res.status(200).json({ config: calendarioPadrao() });
    }

    const row = result.recordset[0];
    return res.status(200).json({
      config: {
        horaInicio: String(row.HORA_INICIO || '08:00').slice(0, 5),
        horaFim: String(row.HORA_FIM || '18:00').slice(0, 5),
        diasAtivos: {
          seg: Boolean(row.SEG),
          ter: Boolean(row.TER),
          qua: Boolean(row.QUA),
          qui: Boolean(row.QUI),
          sex: Boolean(row.SEX),
          sab: Boolean(row.SAB),
          dom: Boolean(row.DOM)
        },
        usuarioAlteracao: row.USUARIO_ALTERACAO,
        dtAlteracao: row.DT_ALTERACAO
      }
    });
  } catch (error) {
    console.error('Erro ao buscar calendário produtivo:', error);
    return res.status(500).json({
      error: 'Erro ao buscar calendário produtivo',
      message: error.message
    });
  }
}

async function saveCalendarioProdutivo(req, res, pool) {
  const { action, config, usuario } = req.body || {};
  if (action !== 'save' || !config) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  const horaInicio = String(config.horaInicio || '').trim();
  const horaFim = String(config.horaFim || '').trim();
  const diasAtivos = config.diasAtivos || {};

  if (!horaInicio || !horaFim) {
    return res.status(400).json({ error: 'Hora de início e fim são obrigatórias.' });
  }

  if (horaInicio >= horaFim) {
    return res.status(400).json({ error: 'A hora de início deve ser menor que a hora de fim.' });
  }

  try {
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'TB_CONFIG_CALENDARIO_PRODUTIVO'
    `);

    if (tableExists.recordset[0].count === 0) {
      return res.status(400).json({ error: 'Tabela TB_CONFIG_CALENDARIO_PRODUTIVO não encontrada. Execute o script SQL primeiro.' });
    }

    const existing = await pool.request().query(`
      SELECT TOP 1 ID_CONFIG FROM TB_CONFIG_CALENDARIO_PRODUTIVO ORDER BY ID_CONFIG DESC
    `);

    const reqSql = pool.request()
      .input('HORA_INICIO', sql.NVarChar, horaInicio)
      .input('HORA_FIM', sql.NVarChar, horaFim)
      .input('SEG', sql.Bit, diasAtivos.seg ? 1 : 0)
      .input('TER', sql.Bit, diasAtivos.ter ? 1 : 0)
      .input('QUA', sql.Bit, diasAtivos.qua ? 1 : 0)
      .input('QUI', sql.Bit, diasAtivos.qui ? 1 : 0)
      .input('SEX', sql.Bit, diasAtivos.sex ? 1 : 0)
      .input('SAB', sql.Bit, diasAtivos.sab ? 1 : 0)
      .input('DOM', sql.Bit, diasAtivos.dom ? 1 : 0)
      .input('USUARIO_ALTERACAO', sql.NVarChar, usuario || 'SISTEMA');

    if (existing.recordset.length > 0) {
      await reqSql
        .input('ID_CONFIG', sql.Int, existing.recordset[0].ID_CONFIG)
        .query(`
          UPDATE TB_CONFIG_CALENDARIO_PRODUTIVO
          SET
            HORA_INICIO = @HORA_INICIO,
            HORA_FIM = @HORA_FIM,
            SEG = @SEG,
            TER = @TER,
            QUA = @QUA,
            QUI = @QUI,
            SEX = @SEX,
            SAB = @SAB,
            DOM = @DOM,
            USUARIO_ALTERACAO = @USUARIO_ALTERACAO,
            DT_ALTERACAO = GETDATE()
          WHERE ID_CONFIG = @ID_CONFIG
        `);
    } else {
      await reqSql.query(`
        INSERT INTO TB_CONFIG_CALENDARIO_PRODUTIVO
          (HORA_INICIO, HORA_FIM, SEG, TER, QUA, QUI, SEX, SAB, DOM, USUARIO_ALTERACAO)
        VALUES
          (@HORA_INICIO, @HORA_FIM, @SEG, @TER, @QUA, @QUI, @SEX, @SAB, @DOM, @USUARIO_ALTERACAO)
      `);
    }

    return res.status(200).json({ success: true, message: 'Calendário produtivo salvo com sucesso.' });
  } catch (error) {
    console.error('Erro ao salvar calendário produtivo:', error);
    return res.status(500).json({
      error: 'Erro ao salvar calendário produtivo',
      message: error.message
    });
  }
}
