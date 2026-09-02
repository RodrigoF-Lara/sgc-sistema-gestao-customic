import { getConnection, sql } from "../db.js";
import {
  exigirPermissao,
  exigirQualquerPermissao,
  usuarioDoRequest,
} from "./permissoesHelper.js";

const LINK_COM = "pedido-capa";
const LINK_PROD = "pedido-capa-producao";

const STATUS = {
  RASCUNHO: "RASCUNHO",
  EM_PRODUCAO: "EM_PRODUCAO",
  PRODUZIDO: "PRODUZIDO",
  ENVIADO: "ENVIADO",
  CANCELADO: "CANCELADO",
};

const TRANSICOES = {
  [STATUS.RASCUNHO]: [STATUS.EM_PRODUCAO, STATUS.CANCELADO],
  [STATUS.EM_PRODUCAO]: [STATUS.PRODUZIDO, STATUS.CANCELADO],
  [STATUS.PRODUZIDO]: [STATUS.ENVIADO],
};

let tablesReady = false;

export async function handlePedidoCapa(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-user-level, x-user-code, x-user-name"
  );
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    if (req.method === "GET") {
      if (acao === "resolver-modelo") return await resolverModelo(req, res);
      if (acao === "anexo") {
        if (!(await exigirQualquerPermissao(req, res, [LINK_COM, LINK_PROD]))) return;
        return await getAnexo(req, res);
      }
      if (!(await exigirQualquerPermissao(req, res, [LINK_COM, LINK_PROD], "Sem permissão para pedidos de capa."))) {
        return;
      }
      if (acao === "obter") return await obter(req, res);
      if (acao === "logs") return await listarLogs(req, res);
      return await listar(req, res);
    }

    if (req.method === "POST") {
      if (acao === "widget-criar") return await widgetCriar(req, res);
      if (acao === "status") return await mudarStatus(req, res);
      if (acao === "criar" || acao === "atualizar") {
        if (!(await exigirPermissao(req, res, LINK_COM, "Sem permissão para criar/editar pedido de capa."))) {
          return;
        }
        return acao === "criar" ? await criar(req, res) : await atualizar(req, res);
      }
      return res.status(400).json({ success: false, error: "Ação inválida." });
    }

    return res.status(405).json({ success: false, error: "Método não permitido." });
  } catch (err) {
    console.error("[comercial/pedidos]", err);
    return res.status(500).json({
      success: false,
      error: "Erro interno",
      message: err.message,
    });
  }
}

async function ensureTables(pool) {
  if (tablesReady) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.COM_PEDIDO_CAPA', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.COM_PEDIDO_CAPA (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        NUMERO_PEDIDO NVARCHAR(40) NULL,
        CLIENTE NVARCHAR(200) NOT NULL,
        CONTATO NVARCHAR(120) NULL,
        TELEFONE NVARCHAR(40) NULL,
        MODELO_ID NVARCHAR(80) NOT NULL,
        MODELO_NOME NVARCHAR(200) NOT NULL,
        QUANTIDADE INT NOT NULL DEFAULT 1,
        DATA_PEDIDO DATE NOT NULL,
        DATA_NECESSIDADE DATE NOT NULL,
        PRIORIDADE NVARCHAR(20) NOT NULL DEFAULT 'NORMAL',
        OBSERVACAO NVARCHAR(MAX) NULL,
        STATUS NVARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
        VENDEDOR NVARCHAR(100) NOT NULL,
        PRODUCAO_POR NVARCHAR(100) NULL,
        ENVIADO_POR NVARCHAR(100) NULL,
        DT_ENVIO_PRODUCAO DATETIME NULL,
        DT_PRODUZIDO DATETIME NULL,
        DT_ENVIADO DATETIME NULL,
        CRIADO_EM DATETIME NOT NULL DEFAULT GETDATE(),
        ATUALIZADO_EM DATETIME NOT NULL DEFAULT GETDATE()
      );
      CREATE INDEX IX_COM_PEDIDO_CAPA_STATUS ON dbo.COM_PEDIDO_CAPA (STATUS, DATA_NECESSIDADE);
    END;

    IF OBJECT_ID(N'dbo.COM_PEDIDO_CAPA_ANEXO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.COM_PEDIDO_CAPA_ANEXO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PEDIDO_ID INT NOT NULL,
        TIPO NVARCHAR(20) NOT NULL,
        NOME_ARQUIVO NVARCHAR(255) NULL,
        MIME NVARCHAR(80) NOT NULL,
        CONTEUDO VARBINARY(MAX) NOT NULL,
        TAMANHO INT NOT NULL,
        CRIADO_EM DATETIME NOT NULL DEFAULT GETDATE(),
        CRIADO_POR NVARCHAR(100) NULL,
        CONSTRAINT FK_COM_PEDIDO_ANEXO_PEDIDO FOREIGN KEY (PEDIDO_ID) REFERENCES dbo.COM_PEDIDO_CAPA (ID)
      );
      CREATE UNIQUE INDEX UQ_COM_PEDIDO_ANEXO_TIPO ON dbo.COM_PEDIDO_CAPA_ANEXO (PEDIDO_ID, TIPO);
    END;

    IF OBJECT_ID(N'dbo.COM_PEDIDO_CAPA_LOG', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.COM_PEDIDO_CAPA_LOG (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PEDIDO_ID INT NOT NULL,
        ACAO NVARCHAR(40) NOT NULL,
        STATUS_ANTERIOR NVARCHAR(20) NULL,
        STATUS_NOVO NVARCHAR(20) NULL,
        USUARIO NVARCHAR(100) NOT NULL,
        DETALHE NVARCHAR(MAX) NULL,
        CRIADO_EM DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_COM_PEDIDO_LOG_PEDIDO FOREIGN KEY (PEDIDO_ID) REFERENCES dbo.COM_PEDIDO_CAPA (ID)
      );
      CREATE INDEX IX_COM_PEDIDO_LOG_PEDIDO ON dbo.COM_PEDIDO_CAPA_LOG (PEDIDO_ID, CRIADO_EM);
    END;
  `);
  tablesReady = true;
}

function usuarioNome(req) {
  const h = req.headers || {};
  return (
    h["x-user-name"] ||
    (req.body && (req.body.vendedor || req.body.usuarioNome)) ||
    usuarioDoRequest(req) ||
    "desconhecido"
  );
}

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function codigoInterno(id) {
  return `CAPA-${String(id).padStart(5, "0")}`;
}

function decodeBase64(data) {
  if (!data) return null;
  const raw = String(data).includes(",") ? String(data).split(",")[1] : String(data);
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) return null;
  if (buf.length > 4.5 * 1024 * 1024) {
    throw new Error("Anexo maior que 4.5 MB. Compacte a imagem.");
  }
  return buf;
}

function mapPedido(row) {
  return {
    id: row.ID,
    codigoInterno: codigoInterno(row.ID),
    numeroPedido: row.NUMERO_PEDIDO,
    cliente: row.CLIENTE,
    contato: row.CONTATO,
    telefone: row.TELEFONE,
    modeloId: row.MODELO_ID,
    modeloNome: row.MODELO_NOME,
    quantidade: row.QUANTIDADE,
    dataPedido: row.DATA_PEDIDO,
    dataNecessidade: row.DATA_NECESSIDADE,
    prioridade: row.PRIORIDADE,
    observacao: row.OBSERVACAO,
    status: row.STATUS,
    vendedor: row.VENDEDOR,
    producaoPor: row.PRODUCAO_POR,
    enviadoPor: row.ENVIADO_POR,
    dtEnvioProducao: row.DT_ENVIO_PRODUCAO,
    dtProduzido: row.DT_PRODUZIDO,
    dtEnviado: row.DT_ENVIADO,
    criadoEm: row.CRIADO_EM,
    atualizadoEm: row.ATUALIZADO_EM,
    hasPreview: !!(row.HAS_PREVIEW === 1 || row.HAS_PREVIEW === true),
    hasArte: !!(row.HAS_ARTE === 1 || row.HAS_ARTE === true),
  };
}

async function salvarAnexos(pool, pedidoId, usuario, preview, arte) {
  const items = [];
  if (preview && preview.data) {
    items.push({
      tipo: "PREVIEW",
      nome: preview.nome || "preview.png",
      mime: preview.mime || "image/png",
      buf: decodeBase64(preview.data),
    });
  }
  if (arte && arte.data) {
    items.push({
      tipo: "ARTE",
      nome: arte.nome || "arte.jpg",
      mime: arte.mime || "image/jpeg",
      buf: decodeBase64(arte.data),
    });
  }
  for (const it of items) {
    if (!it.buf) continue;
    await pool
      .request()
      .input("pedidoId", sql.Int, pedidoId)
      .input("tipo", sql.NVarChar(20), it.tipo)
      .query(`DELETE FROM dbo.COM_PEDIDO_CAPA_ANEXO WHERE PEDIDO_ID=@pedidoId AND TIPO=@tipo`);
    await pool
      .request()
      .input("pedidoId", sql.Int, pedidoId)
      .input("tipo", sql.NVarChar(20), it.tipo)
      .input("nome", sql.NVarChar(255), it.nome)
      .input("mime", sql.NVarChar(80), it.mime)
      .input("conteudo", sql.VarBinary(sql.MAX), it.buf)
      .input("tamanho", sql.Int, it.buf.length)
      .input("usuario", sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO dbo.COM_PEDIDO_CAPA_ANEXO
          (PEDIDO_ID, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_POR)
        VALUES
          (@pedidoId, @tipo, @nome, @mime, @conteudo, @tamanho, @usuario)
      `);
  }
}

async function logar(pool, pedidoId, acao, usuario, de, para, detalhe) {
  await pool
    .request()
    .input("pedidoId", sql.Int, pedidoId)
    .input("acao", sql.NVarChar(40), acao)
    .input("de", sql.NVarChar(20), de || null)
    .input("para", sql.NVarChar(20), para || null)
    .input("usuario", sql.NVarChar(100), usuario)
    .input("detalhe", sql.NVarChar(sql.MAX), detalhe || null)
    .query(`
      INSERT INTO dbo.COM_PEDIDO_CAPA_LOG
        (PEDIDO_ID, ACAO, STATUS_ANTERIOR, STATUS_NOVO, USUARIO, DETALHE)
      VALUES
        (@pedidoId, @acao, @de, @para, @usuario, @detalhe)
    `);
}

function validarCampos(body) {
  const cliente = String(body.cliente || "").trim();
  const modeloId = String(body.modeloId || "").trim();
  const modeloNome = String(body.modeloNome || "").trim();
  const quantidade = Number(body.quantidade);
  const dataPedido = String(body.dataPedido || "").trim();
  const dataNecessidade = String(body.dataNecessidade || "").trim();
  if (!cliente) return "Informe o cliente.";
  if (!modeloId || !modeloNome) return "Selecione o modelo.";
  if (!Number.isInteger(quantidade) || quantidade < 1) return "Quantidade inválida.";
  if (!dataPedido) return "Informe a data do pedido.";
  if (!dataNecessidade) return "Informe a data de necessidade.";
  return null;
}

async function criar(req, res) {
  const pool = await getConnection();
  await ensureTables(pool);
  const err = validarCampos(req.body || {});
  if (err) return res.status(400).json({ success: false, error: err });

  const usuario = usuarioNome(req);
  const enviarAgora = !!req.body.enviarProducao;
  const status = enviarAgora ? STATUS.EM_PRODUCAO : STATUS.RASCUNHO;
  if (enviarAgora && !(req.body.preview && req.body.preview.data)) {
    return res.status(400).json({
      success: false,
      error: "Para enviar à produção, monte a arte e gere o print da capa.",
    });
  }

  const prioridade = String(req.body.prioridade || "NORMAL").toUpperCase() === "URGENTE"
    ? "URGENTE"
    : "NORMAL";

  const result = await pool
    .request()
    .input("numero", sql.NVarChar(40), String(req.body.numeroPedido || "").trim() || null)
    .input("cliente", sql.NVarChar(200), String(req.body.cliente).trim())
    .input("contato", sql.NVarChar(120), String(req.body.contato || "").trim() || null)
    .input("telefone", sql.NVarChar(40), String(req.body.telefone || "").trim() || null)
    .input("modeloId", sql.NVarChar(80), String(req.body.modeloId).trim())
    .input("modeloNome", sql.NVarChar(200), String(req.body.modeloNome).trim())
    .input("quantidade", sql.Int, Number(req.body.quantidade))
    .input("dataPedido", sql.Date, req.body.dataPedido)
    .input("dataNecessidade", sql.Date, req.body.dataNecessidade)
    .input("prioridade", sql.NVarChar(20), prioridade)
    .input("observacao", sql.NVarChar(sql.MAX), String(req.body.observacao || "").trim() || null)
    .input("status", sql.NVarChar(20), status)
    .input("vendedor", sql.NVarChar(100), usuario)
    .input("dtProd", sql.DateTime, enviarAgora ? new Date() : null)
    .query(`
      INSERT INTO dbo.COM_PEDIDO_CAPA
        (NUMERO_PEDIDO, CLIENTE, CONTATO, TELEFONE, MODELO_ID, MODELO_NOME, QUANTIDADE,
         DATA_PEDIDO, DATA_NECESSIDADE, PRIORIDADE, OBSERVACAO, STATUS, VENDEDOR, DT_ENVIO_PRODUCAO)
      OUTPUT INSERTED.ID
      VALUES
        (@numero, @cliente, @contato, @telefone, @modeloId, @modeloNome, @quantidade,
         @dataPedido, @dataNecessidade, @prioridade, @observacao, @status, @vendedor, @dtProd)
    `);

  const id = result.recordset[0].ID;
  await salvarAnexos(pool, id, usuario, req.body.preview, req.body.arte);
  await logar(pool, id, "CRIADO", usuario, null, STATUS.RASCUNHO, "Pedido criado");
  if (enviarAgora) {
    await logar(pool, id, "ENVIADO_PRODUCAO", usuario, STATUS.RASCUNHO, STATUS.EM_PRODUCAO, "Enviado para produção");
  }

  return res.status(201).json({
    success: true,
    id,
    codigoInterno: codigoInterno(id),
    status,
  });
}

async function atualizar(req, res) {
  const pool = await getConnection();
  await ensureTables(pool);
  const id = parseId(req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
  const err = validarCampos(req.body || {});
  if (err) return res.status(400).json({ success: false, error: err });

  const atual = await pool.request().input("id", sql.Int, id)
    .query(`SELECT * FROM dbo.COM_PEDIDO_CAPA WHERE ID=@id`);
  if (!atual.recordset.length) return res.status(404).json({ success: false, error: "Pedido não encontrado." });
  if (atual.recordset[0].STATUS !== STATUS.RASCUNHO) {
    return res.status(400).json({ success: false, error: "Só é possível editar rascunho." });
  }

  const usuario = usuarioNome(req);
  const prioridade = String(req.body.prioridade || "NORMAL").toUpperCase() === "URGENTE"
    ? "URGENTE"
    : "NORMAL";

  await pool
    .request()
    .input("id", sql.Int, id)
    .input("numero", sql.NVarChar(40), String(req.body.numeroPedido || "").trim() || null)
    .input("cliente", sql.NVarChar(200), String(req.body.cliente).trim())
    .input("contato", sql.NVarChar(120), String(req.body.contato || "").trim() || null)
    .input("telefone", sql.NVarChar(40), String(req.body.telefone || "").trim() || null)
    .input("modeloId", sql.NVarChar(80), String(req.body.modeloId).trim())
    .input("modeloNome", sql.NVarChar(200), String(req.body.modeloNome).trim())
    .input("quantidade", sql.Int, Number(req.body.quantidade))
    .input("dataPedido", sql.Date, req.body.dataPedido)
    .input("dataNecessidade", sql.Date, req.body.dataNecessidade)
    .input("prioridade", sql.NVarChar(20), prioridade)
    .input("observacao", sql.NVarChar(sql.MAX), String(req.body.observacao || "").trim() || null)
    .query(`
      UPDATE dbo.COM_PEDIDO_CAPA SET
        NUMERO_PEDIDO=@numero, CLIENTE=@cliente, CONTATO=@contato, TELEFONE=@telefone,
        MODELO_ID=@modeloId, MODELO_NOME=@modeloNome, QUANTIDADE=@quantidade,
        DATA_PEDIDO=@dataPedido, DATA_NECESSIDADE=@dataNecessidade,
        PRIORIDADE=@prioridade, OBSERVACAO=@observacao, ATUALIZADO_EM=GETDATE()
      WHERE ID=@id
    `);

  await salvarAnexos(pool, id, usuario, req.body.preview, req.body.arte);
  await logar(pool, id, "ATUALIZADO", usuario, STATUS.RASCUNHO, STATUS.RASCUNHO, "Rascunho atualizado");

  const enviarAgora = !!req.body.enviarProducao;
  if (enviarAgora) {
    const hasPrev = await pool.request().input("id", sql.Int, id).query(`
      SELECT 1 AS ok FROM dbo.COM_PEDIDO_CAPA_ANEXO WHERE PEDIDO_ID=@id AND TIPO='PREVIEW'
    `);
    if (!hasPrev.recordset.length) {
      return res.status(400).json({
        success: false,
        error: "Monte a arte e gere o print da capa antes de enviar à produção.",
      });
    }
    await pool.request().input("id", sql.Int, id).query(`
      UPDATE dbo.COM_PEDIDO_CAPA
      SET STATUS='EM_PRODUCAO', DT_ENVIO_PRODUCAO=GETDATE(), ATUALIZADO_EM=GETDATE()
      WHERE ID=@id
    `);
    await logar(pool, id, "ENVIADO_PRODUCAO", usuario, STATUS.RASCUNHO, STATUS.EM_PRODUCAO, "Enviado para produção");
    return res.json({
      success: true,
      id,
      codigoInterno: codigoInterno(id),
      status: STATUS.EM_PRODUCAO,
    });
  }

  return res.json({ success: true, id, codigoInterno: codigoInterno(id), status: STATUS.RASCUNHO });
}

async function mudarStatus(req, res) {
  const novo = String(req.body.status || "").toUpperCase();
  const id = parseId(req.body.id);
  if (!id || !STATUS[novo]) {
    return res.status(400).json({ success: false, error: "Pedido ou status inválido." });
  }

  const precisaProd = novo === STATUS.PRODUZIDO || novo === STATUS.ENVIADO;
  const link = precisaProd ? LINK_PROD : LINK_COM;
  const msg = precisaProd
    ? "Sem permissão de produção para este status."
    : "Sem permissão comercial para este status.";
  if (!(await exigirPermissao(req, res, link, msg))) return;

  const pool = await getConnection();
  await ensureTables(pool);
  const atualRes = await pool.request().input("id", sql.Int, id)
    .query(`SELECT * FROM dbo.COM_PEDIDO_CAPA WHERE ID=@id`);
  if (!atualRes.recordset.length) {
    return res.status(404).json({ success: false, error: "Pedido não encontrado." });
  }
  const atual = atualRes.recordset[0];
  const permitidos = TRANSICOES[atual.STATUS] || [];
  if (!permitidos.includes(novo)) {
    return res.status(400).json({
      success: false,
      error: `Não é possível ir de ${atual.STATUS} para ${novo}.`,
    });
  }

  if (novo === STATUS.EM_PRODUCAO) {
    const hasPrev = await pool.request().input("id", sql.Int, id).query(`
      SELECT 1 AS ok FROM dbo.COM_PEDIDO_CAPA_ANEXO WHERE PEDIDO_ID=@id AND TIPO='PREVIEW'
    `);
    if (!hasPrev.recordset.length) {
      return res.status(400).json({
        success: false,
        error: "Anexe o print da montagem antes de enviar à produção.",
      });
    }
  }

  const usuario = usuarioNome(req);
  const reqUp = pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novo);
  let extra = "ATUALIZADO_EM=GETDATE(), STATUS=@status";
  if (novo === STATUS.EM_PRODUCAO) extra += ", DT_ENVIO_PRODUCAO=GETDATE()";
  if (novo === STATUS.PRODUZIDO) {
    extra += ", DT_PRODUZIDO=GETDATE(), PRODUCAO_POR=@usuario";
    reqUp.input("usuario", sql.NVarChar(100), usuario);
  }
  if (novo === STATUS.ENVIADO) {
    extra += ", DT_ENVIADO=GETDATE(), ENVIADO_POR=@usuario";
    reqUp.input("usuario", sql.NVarChar(100), usuario);
  }
  await reqUp.query(`UPDATE dbo.COM_PEDIDO_CAPA SET ${extra} WHERE ID=@id`);

  const acaoLog =
    novo === STATUS.EM_PRODUCAO
      ? "ENVIADO_PRODUCAO"
      : novo === STATUS.PRODUZIDO
        ? "PRODUZIDO"
        : novo === STATUS.ENVIADO
          ? "ENVIADO"
          : "CANCELADO";
  await logar(pool, id, acaoLog, usuario, atual.STATUS, novo, req.body.detalhe || null);

  return res.json({ success: true, id, status: novo, codigoInterno: codigoInterno(id) });
}

const SELECT_FLAGS = `
  CASE WHEN EXISTS (SELECT 1 FROM dbo.COM_PEDIDO_CAPA_ANEXO a WHERE a.PEDIDO_ID=p.ID AND a.TIPO='PREVIEW') THEN 1 ELSE 0 END AS HAS_PREVIEW,
  CASE WHEN EXISTS (SELECT 1 FROM dbo.COM_PEDIDO_CAPA_ANEXO a WHERE a.PEDIDO_ID=p.ID AND a.TIPO='ARTE') THEN 1 ELSE 0 END AS HAS_ARTE
`;

async function listar(req, res) {
  const pool = await getConnection();
  await ensureTables(pool);
  const status = String(req.query.status || "").trim().toUpperCase();
  const q = String(req.query.q || "").trim();
  const fila = String(req.query.fila || "") === "1";

  const request = pool.request();
  const where = [];
  if (fila) {
    where.push(`p.STATUS IN ('EM_PRODUCAO','PRODUZIDO')`);
  }
  if (status && STATUS[status]) {
    where.push(`p.STATUS = @status`);
    request.input("status", sql.NVarChar(20), status);
  }
  if (q) {
    where.push(`(
      p.CLIENTE LIKE @q OR p.NUMERO_PEDIDO LIKE @q OR p.MODELO_NOME LIKE @q
      OR p.VENDEDOR LIKE @q OR ('CAPA-' + RIGHT('00000'+CAST(p.ID AS VARCHAR),5)) LIKE @q
    )`);
    request.input("q", sql.NVarChar, `%${q}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await request.query(`
    SELECT TOP 300 p.*, ${SELECT_FLAGS}
    FROM dbo.COM_PEDIDO_CAPA p
    ${sqlWhere}
    ORDER BY
      CASE p.PRIORIDADE WHEN 'URGENTE' THEN 0 ELSE 1 END,
      p.DATA_NECESSIDADE ASC, p.ID DESC
  `);
  return res.json({ success: true, data: result.recordset.map(mapPedido) });
}

async function obter(req, res) {
  const id = parseId(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
  const pool = await getConnection();
  await ensureTables(pool);
  const result = await pool.request().input("id", sql.Int, id).query(`
    SELECT p.*, ${SELECT_FLAGS}
    FROM dbo.COM_PEDIDO_CAPA p
    WHERE p.ID=@id
  `);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Pedido não encontrado." });
  }
  return res.json({ success: true, data: mapPedido(result.recordset[0]) });
}

async function listarLogs(req, res) {
  const id = parseId(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
  const pool = await getConnection();
  await ensureTables(pool);
  const result = await pool.request().input("id", sql.Int, id).query(`
    SELECT ID, PEDIDO_ID, ACAO, STATUS_ANTERIOR, STATUS_NOVO, USUARIO, DETALHE, CRIADO_EM
    FROM dbo.COM_PEDIDO_CAPA_LOG
    WHERE PEDIDO_ID=@id
    ORDER BY CRIADO_EM ASC, ID ASC
  `);
  return res.json({
    success: true,
    data: result.recordset.map((r) => ({
      id: r.ID,
      acao: r.ACAO,
      statusAnterior: r.STATUS_ANTERIOR,
      statusNovo: r.STATUS_NOVO,
      usuario: r.USUARIO,
      detalhe: r.DETALHE,
      criadoEm: r.CRIADO_EM,
    })),
  });
}

async function getAnexo(req, res) {
  const id = parseId(req.query.id);
  const tipo = String(req.query.tipo || "PREVIEW").toUpperCase();
  if (!id || !["PREVIEW", "ARTE"].includes(tipo)) {
    return res.status(400).json({ success: false, error: "Anexo inválido." });
  }
  const pool = await getConnection();
  await ensureTables(pool);
  const result = await pool.request().input("id", sql.Int, id).input("tipo", sql.NVarChar(20), tipo)
    .query(`
      SELECT MIME, NOME_ARQUIVO, CONTEUDO, TAMANHO
      FROM dbo.COM_PEDIDO_CAPA_ANEXO
      WHERE PEDIDO_ID=@id AND TIPO=@tipo
    `);
  if (!result.recordset.length) return res.status(404).end();
  const row = result.recordset[0];
  const buf = Buffer.isBuffer(row.CONTEUDO) ? row.CONTEUDO : Buffer.from(row.CONTEUDO);
  res.setHeader("Content-Type", row.MIME || "application/octet-stream");
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Cache-Control", "private, max-age=120");
  return res.status(200).send(buf);
}

const MODELO_KEYWORDS = [
  ["17 pro max", "iphone-17-pro-max-18-pro-max", "iPhone 17 Pro Max / 18 Pro Max"],
  ["18 pro max", "iphone-17-pro-max-18-pro-max", "iPhone 17 Pro Max / 18 Pro Max"],
  ["16 pro max", "iphone-14-pro-max-15-pro-max-16-pro-max", "iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max"],
  ["15 pro max", "iphone-14-pro-max-15-pro-max-16-pro-max", "iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max"],
  ["14 pro max", "iphone-14-pro-max-15-pro-max-16-pro-max", "iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max"],
  ["17 air", "iphone-17-air", "iPhone 17 Air"],
  ["17 pro", "iphone-17-pro-18-pro", "iPhone 17 Pro / 18 Pro"],
  ["18 pro", "iphone-17-pro-18-pro", "iPhone 17 Pro / 18 Pro"],
  ["16 plus", "iphone-16-plus", "iPhone 16 Plus"],
  ["16e", "iphone-16e-17e", "iPhone 16e / 17e"],
  ["17e", "iphone-16e-17e", "iPhone 16e / 17e"],
  ["16 pro", "iphone-14-pro-15-pro-16-pro", "iPhone 14 Pro / 15 Pro / 16 Pro"],
  ["15 pro", "iphone-14-pro-15-pro-16-pro", "iPhone 14 Pro / 15 Pro / 16 Pro"],
  ["14 pro", "iphone-14-pro-15-pro-16-pro", "iPhone 14 Pro / 15 Pro / 16 Pro"],
  ["15 plus", "iphone-14-plus-15-plus", "iPhone 14 Plus / 15 Plus"],
  ["14 plus", "iphone-14-plus-15-plus", "iPhone 14 Plus / 15 Plus"],
  ["s26 ultra", "samsung-s24-ultra-s25-ultra-s26-ultra", "Samsung S24 Ultra / S25 Ultra / S26 Ultra"],
  ["s25 ultra", "samsung-s24-ultra-s25-ultra-s26-ultra", "Samsung S24 Ultra / S25 Ultra / S26 Ultra"],
  ["s24 ultra", "samsung-s24-ultra-s25-ultra-s26-ultra", "Samsung S24 Ultra / S25 Ultra / S26 Ultra"],
  ["s26+", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s25+", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s24+", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s26 plus", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s25 plus", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s24 plus", "samsung-s24-plus-s25-plus-s26-plus", "Samsung S24+ / S25+ / S26+"],
  ["s26", "samsung-s24-s25-s26", "Samsung S24 / S25 / S26"],
  ["s25", "samsung-s24-s25-s26", "Samsung S24 / S25 / S26"],
  ["s24", "samsung-s24-s25-s26", "Samsung S24 / S25 / S26"],
  ["iphone 17", "iphone-16-17", "iPhone 16 / 17"],
  ["iphone 16", "iphone-16-17", "iPhone 16 / 17"],
  ["iphone 15", "iphone-13-14-15", "iPhone 13 / 14 / 15"],
  ["iphone 14", "iphone-13-14-15", "iPhone 13 / 14 / 15"],
  ["iphone 13", "iphone-13-14-15", "iPhone 13 / 14 / 15"],
];

function limparTexto(v) {
  return decodeURIComponent(String(v || "").replace(/\+/g, " ")).trim();
}

function matchModelo(texto, sku) {
  const hay = `${sku || ""} ${texto || ""}`.toLowerCase();
  for (const [kw, id, name] of MODELO_KEYWORDS) {
    if (hay.includes(kw)) return { id, name };
  }
  return null;
}

async function resolverModelo(req, res) {
  const sku = limparTexto(req.query.sku || req.query.SKU || "");
  const q = limparTexto(req.query.q || req.query.texto || "");
  const found = matchModelo(q, sku);
  if (!found) {
    return res.json({ success: true, data: null });
  }
  return res.json({ success: true, data: { modeloId: found.id, modeloNome: found.name } });
}

async function widgetCriar(req, res) {
  const pool = await getConnection();
  await ensureTables(pool);
  const modeloId = String(req.body.modeloId || "").trim();
  const modeloNome = String(req.body.modeloNome || modeloId).trim();
  if (!modeloId || !modeloNome) {
    return res.status(400).json({ success: false, error: "Modelo obrigatório." });
  }
  if (!(req.body.preview && req.body.preview.data)) {
    return res.status(400).json({ success: false, error: "Gere o print da montagem." });
  }
  const sku = String(req.body.sku || "").trim();
  const origem = String(req.body.origem || "").trim().slice(0, 400);
  const hoje = new Date();
  const nec = new Date(hoje.getTime() + 7 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  const obs = [
    sku ? `SKU loja: ${sku}` : null,
    origem ? `Página: ${origem}` : null,
    String(req.body.observacao || "").trim() || null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await pool
    .request()
    .input("numero", sql.NVarChar(40), sku || null)
    .input("cliente", sql.NVarChar(200), "Loja virtual")
    .input("contato", sql.NVarChar(120), null)
    .input("telefone", sql.NVarChar(40), null)
    .input("modeloId", sql.NVarChar(80), modeloId)
    .input("modeloNome", sql.NVarChar(200), modeloNome)
    .input("quantidade", sql.Int, Math.max(1, Number(req.body.quantidade) || 1))
    .input("dataPedido", sql.Date, iso(hoje))
    .input("dataNecessidade", sql.Date, iso(nec))
    .input("prioridade", sql.NVarChar(20), "NORMAL")
    .input("observacao", sql.NVarChar(sql.MAX), obs || null)
    .input("status", sql.NVarChar(20), STATUS.RASCUNHO)
    .input("vendedor", sql.NVarChar(100), "E-COMMERCE")
    .query(`
      INSERT INTO dbo.COM_PEDIDO_CAPA
        (NUMERO_PEDIDO, CLIENTE, CONTATO, TELEFONE, MODELO_ID, MODELO_NOME, QUANTIDADE,
         DATA_PEDIDO, DATA_NECESSIDADE, PRIORIDADE, OBSERVACAO, STATUS, VENDEDOR)
      OUTPUT INSERTED.ID
      VALUES
        (@numero, @cliente, @contato, @telefone, @modeloId, @modeloNome, @quantidade,
         @dataPedido, @dataNecessidade, @prioridade, @observacao, @status, @vendedor)
    `);

  const id = result.recordset[0].ID;
  await salvarAnexos(pool, id, "E-COMMERCE", req.body.preview, req.body.arte);
  await logar(
    pool,
    id,
    "CRIADO",
    "E-COMMERCE",
    null,
    STATUS.RASCUNHO,
    "Arte enviada pelo widget da loja"
  );
  return res.status(201).json({
    success: true,
    id,
    codigoInterno: codigoInterno(id),
    status: STATUS.RASCUNHO,
  });
}
