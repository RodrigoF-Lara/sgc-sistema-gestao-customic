const sql = require("mssql");
const getConnection = require("../db");

/**
 * API de Notificações - Gerenciamento centralizado de notificações entre usuários
 * 
 * Métodos suportados:
 * - GET: Buscar notificações do usuário
 * - POST: Criar nova notificação
 * - PUT: Atualizar notificação (marcar como lida/limpar)
 */
export default async function handler(req, res) {
  const { method } = req;

  try {
    const pool = await getConnection();

    switch (method) {
      case "GET":
        return await buscarNotificacoes(req, res, pool);
      
      case "POST":
        return await criarNotificacao(req, res, pool);
      
      case "PUT":
        return await atualizarNotificacao(req, res, pool);

      default:
        return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (error) {
    console.error("Erro na API de notificações:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

/**
 * GET - Buscar notificações do usuário
 * Query params: 
 *   - usuario: nome do usuário
 *   - limite: quantidade máxima de notificações (padrão: 60)
 *   - apenasNaoLidas: true/false (padrão: false)
 */
async function buscarNotificacoes(req, res, pool) {
  const { usuario, limite = 60, apenasNaoLidas = false } = req.query;

  if (!usuario) {
    return res.status(400).json({ error: "Parâmetro 'usuario' é obrigatório" });
  }

  try {
    const query = `
      SELECT TOP (@limite)
        ID_NOTIF,
        TIPO,
        MENSAGEM,
        DETALHE,
        USUARIO_DESTINO,
        USUARIO_ORIGEM,
        TIMESTAMP_CRIACAO,
        LIDO,
        USUARIO_LEITURA,
        TIMESTAMP_LEITURA
      FROM TB_NOTIFICACOES
      WHERE 
        ATIVO = 1
        AND (USUARIO_DESTINO = @usuario OR USUARIO_DESTINO IS NULL)
        ${apenasNaoLidas === 'true' ? 'AND LIDO = 0' : ''}
      ORDER BY TIMESTAMP_CRIACAO DESC
    `;

    const result = await pool.request()
      .input('usuario', sql.VarChar(100), usuario)
      .input('limite', sql.Int, parseInt(limite))
      .query(query);

    // Formatar para o mesmo formato do localStorage anterior
    const notificacoes = result.recordset.map(n => ({
      id: n.ID_NOTIF,
      type: n.TIPO,
      message: n.MENSAGEM,
      detail: n.DETALHE || '',
      timestamp: new Date(n.TIMESTAMP_CRIACAO).getTime(),
      lido: n.LIDO,
      usuarioOrigem: n.USUARIO_ORIGEM,
      usuarioDestino: n.USUARIO_DESTINO
    }));

    return res.status(200).json({ 
      notificacoes,
      total: notificacoes.length,
      naoLidas: notificacoes.filter(n => !n.lido).length
    });
  } catch (error) {
    console.error("Erro ao buscar notificações:", error);
    return res.status(500).json({ 
      error: "Erro ao buscar notificações", 
      message: error.message 
    });
  }
}

/**
 * POST - Criar nova notificação
 * Body: 
 *   - tipo: tipo da notificação (ex: 'requisicao-criada')
 *   - mensagem: mensagem da notificação
 *   - detalhe: informações adicionais (opcional)
 *   - usuarioOrigem: quem gerou a notificação
 *   - usuarioDestino: destinatário específico (opcional, null = todos)
 */
async function criarNotificacao(req, res, pool) {
  const { tipo, mensagem, detalhe = '', usuarioOrigem, usuarioDestino = null } = req.body;

  if (!tipo || !mensagem || !usuarioOrigem) {
    return res.status(400).json({ 
      error: "Parâmetros 'tipo', 'mensagem' e 'usuarioOrigem' são obrigatórios" 
    });
  }

  try {
    const query = `
      INSERT INTO TB_NOTIFICACOES 
        (TIPO, MENSAGEM, DETALHE, USUARIO_ORIGEM, USUARIO_DESTINO)
      VALUES 
        (@tipo, @mensagem, @detalhe, @usuarioOrigem, @usuarioDestino);
      
      SELECT SCOPE_IDENTITY() AS ID_NOTIF;
    `;

    const result = await pool.request()
      .input('tipo', sql.VarChar(50), tipo)
      .input('mensagem', sql.VarChar(500), mensagem)
      .input('detalhe', sql.VarChar(500), detalhe)
      .input('usuarioOrigem', sql.VarChar(100), usuarioOrigem)
      .input('usuarioDestino', sql.VarChar(100), usuarioDestino)
      .query(query);

    const idNotif = result.recordset[0].ID_NOTIF;

    return res.status(201).json({ 
      success: true,
      idNotif,
      message: "Notificação criada com sucesso"
    });
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    return res.status(500).json({ 
      error: "Erro ao criar notificação", 
      message: error.message 
    });
  }
}

/**
 * PUT - Atualizar notificação
 * Body:
 *   - action: 'marcarLida', 'marcarTodasLidas' ou 'limparTodas'
 *   - usuario: nome do usuário
 *   - idNotif: ID da notificação (para 'marcarLida')
 */
async function atualizarNotificacao(req, res, pool) {
  const { action, usuario, idNotif } = req.body;

  if (!action || !usuario) {
    return res.status(400).json({ 
      error: "Parâmetros 'action' e 'usuario' são obrigatórios" 
    });
  }

  try {
    let query;
    let request = pool.request().input('usuario', sql.VarChar(100), usuario);

    switch (action) {
      case 'marcarLida':
        if (!idNotif) {
          return res.status(400).json({ error: "Parâmetro 'idNotif' é obrigatório para esta ação" });
        }
        query = `
          UPDATE TB_NOTIFICACOES 
          SET 
            LIDO = 1,
            USUARIO_LEITURA = @usuario,
            TIMESTAMP_LEITURA = GETDATE()
          WHERE 
            ID_NOTIF = @idNotif
            AND (USUARIO_DESTINO = @usuario OR USUARIO_DESTINO IS NULL)
            AND ATIVO = 1
        `;
        request.input('idNotif', sql.Int, idNotif);
        break;

      case 'marcarTodasLidas':
        query = `
          UPDATE TB_NOTIFICACOES 
          SET 
            LIDO = 1,
            USUARIO_LEITURA = @usuario,
            TIMESTAMP_LEITURA = GETDATE()
          WHERE 
            (USUARIO_DESTINO = @usuario OR USUARIO_DESTINO IS NULL)
            AND LIDO = 0
            AND ATIVO = 1
        `;
        break;

      case 'limparTodas':
        query = `
          UPDATE TB_NOTIFICACOES 
          SET ATIVO = 0
          WHERE 
            (USUARIO_DESTINO = @usuario OR USUARIO_DESTINO IS NULL)
            AND ATIVO = 1
        `;
        break;

      default:
        return res.status(400).json({ error: "Ação inválida" });
    }

    const result = await request.query(query);

    return res.status(200).json({ 
      success: true,
      rowsAffected: result.rowsAffected[0],
      message: "Notificação atualizada com sucesso"
    });
  } catch (error) {
    console.error("Erro ao atualizar notificação:", error);
    return res.status(500).json({ 
      error: "Erro ao atualizar notificação", 
      message: error.message 
    });
  }
}
