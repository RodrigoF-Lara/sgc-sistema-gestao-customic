import crypto from "crypto";
import { getConnection, sql } from "../db.js";
import { exigirPermissao, exigirQualquerPermissao, isAdmin, nivelDoRequest, usuarioDoRequest } from "./permissoesHelper.js";

const LINK = "design-mockups";
const STATUS_FEITO = "FINALIZADA";
const STATUS = ["A FAZER", "EM ANDAMENTO", STATUS_FEITO];

function canonStatus(status) {
  const v = String(status || "").trim().toUpperCase();
  return v === "UPADO" ? STATUS_FEITO : v;
}
const MAX_FOTOS = 50;
const LIMITE_PADRAO = 100;
const LIMITE_MAX = 200;

let tablesReady = false;

export async function handleMockups(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name, x-api-key, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);

    if (req.method === "GET") {
      if (acao === "integracao" || acao === "integracao-foto") {
        if (!(await exigirChaveIntegracao(req, res, pool))) return;
        if (acao === "integracao-foto") return await getFotoIntegracao(req, res, pool);
        return await listarIntegracao(req, res, pool);
      }
      if (acao === "foto") {
        if (!(await exigirQualquerPermissao(req, res, [LINK], "Sem permissão para mockups."))) return;
        return await getFoto(req, res, pool);
      }
      if (!(await exigirQualquerPermissao(req, res, [LINK], "Sem permissão para mockups."))) return;
      if (acao === "chave-api") return await verChaveApi(req, res, pool);
      if (acao === "lotes") return await listarLotes(req, res, pool);
      return await listarItens(req, res, pool);
    }

    if (req.method === "POST") {
      if (!(await exigirPermissao(req, res, LINK, "Sem permissão para mockups."))) return;
      if (acao === "chave-api") return await girarChaveApi(req, res, pool);
      if (acao === "criar-csv") return await criarCsv(req, res, pool);
      if (acao === "status") return await mudarStatus(req, res, pool);
      if (acao === "status-lote") return await mudarStatusLote(req, res, pool);
      if (acao === "foto") return await salvarFoto(req, res, pool);
      return res.status(400).json({ success: false, error: "Ação inválida." });
    }

    if (req.method === "DELETE") {
      if (!(await exigirPermissao(req, res, LINK, "Sem permissão para mockups."))) return;
      if (acao === "foto") return await apagarFoto(req, res, pool);
      if (acao === "item") return await apagarItem(req, res, pool);
      if (acao === "lote") return await apagarLote(req, res, pool);
      return res.status(400).json({ success: false, error: "Ação inválida." });
    }

    return res.status(405).json({ success: false, error: "Método não permitido." });
  } catch (err) {
    console.error("[design/mockups]", err);
    return res.status(500).json({ success: false, error: err.message || "Erro interno." });
  }
}

async function ensureTables(pool) {
  if (tablesReady) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.DSN_MOCKUP_LOTE', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DSN_MOCKUP_LOTE (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        NOME NVARCHAR(200) NOT NULL,
        SOLICITANTE NVARCHAR(100) NULL,
        CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_DSN_MOCKUP_LOTE_DT DEFAULT (GETDATE())
      );
    END;

    IF OBJECT_ID(N'dbo.DSN_MOCKUP_ITEM', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DSN_MOCKUP_ITEM (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LOTE_ID INT NOT NULL,
        CODIGO NVARCHAR(40) NOT NULL,
        DESCRICAO NVARCHAR(400) NULL,
        LINHA NVARCHAR(80) NULL,
        STATUS NVARCHAR(30) NOT NULL CONSTRAINT DF_DSN_MOCKUP_ST DEFAULT (N'A FAZER'),
        ATUALIZADO_EM DATETIME NULL,
        ATUALIZADO_POR NVARCHAR(100) NULL,
        CONSTRAINT FK_DSN_MOCKUP_ITEM_LOTE FOREIGN KEY (LOTE_ID) REFERENCES dbo.DSN_MOCKUP_LOTE (ID)
      );
      CREATE INDEX IX_DSN_MOCKUP_ITEM_LOTE ON dbo.DSN_MOCKUP_ITEM (LOTE_ID, STATUS);
      CREATE INDEX IX_DSN_MOCKUP_ITEM_COD ON dbo.DSN_MOCKUP_ITEM (CODIGO);
    END;

    IF OBJECT_ID(N'dbo.DSN_MOCKUP_FOTO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DSN_MOCKUP_FOTO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ITEM_ID INT NOT NULL,
        SLOT TINYINT NOT NULL,
        NOME_ARQUIVO NVARCHAR(255) NULL,
        MIME NVARCHAR(80) NOT NULL,
        CONTEUDO VARBINARY(MAX) NOT NULL,
        TAMANHO INT NOT NULL,
        CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_DSN_MOCKUP_FOTO_DT DEFAULT (GETDATE()),
        CRIADO_POR NVARCHAR(100) NULL,
        CONSTRAINT FK_DSN_MOCKUP_FOTO_ITEM FOREIGN KEY (ITEM_ID) REFERENCES dbo.DSN_MOCKUP_ITEM (ID),
        CONSTRAINT UQ_DSN_MOCKUP_FOTO_SLOT UNIQUE (ITEM_ID, SLOT)
      );
    END;

    IF OBJECT_ID(N'dbo.DSN_MOCKUP_LOG', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DSN_MOCKUP_LOG (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ITEM_ID INT NOT NULL,
        STATUS_ANTERIOR NVARCHAR(30) NULL,
        STATUS_NOVO NVARCHAR(30) NOT NULL,
        USUARIO NVARCHAR(100) NOT NULL,
        CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_DSN_MOCKUP_LOG_DT DEFAULT (GETDATE()),
        CONSTRAINT FK_DSN_MOCKUP_LOG_ITEM FOREIGN KEY (ITEM_ID) REFERENCES dbo.DSN_MOCKUP_ITEM (ID)
      );
      CREATE INDEX IX_DSN_MOCKUP_LOG_ITEM ON dbo.DSN_MOCKUP_LOG (ITEM_ID, CRIADO_EM);
    END;

    IF OBJECT_ID(N'dbo.DSN_MOCKUP_API', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DSN_MOCKUP_API (
        ID INT NOT NULL PRIMARY KEY,
        CHAVE NVARCHAR(80) NOT NULL,
        ATUALIZADO_EM DATETIME NOT NULL CONSTRAINT DF_DSN_MOCKUP_API_DT DEFAULT (GETDATE())
      );
    END;
  `);

  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
        SELECT 'design-mockups', p.NIVEL, p.PERMITIDO, 'SEED-MOCKUPS'
        FROM dbo.SHR_PERMISSOES_MENU p
        WHERE p.LINK_ID = 'pedido-capa'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
            WHERE x.LINK_ID = 'design-mockups' AND x.NIVEL = p.NIVEL
          );
      END
    `);
  } catch (_) { /* ok */ }

  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.DSN_MOCKUP_ITEM', N'U') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = N'IX_DSN_MOCKUP_ITEM_ATU' AND object_id = OBJECT_ID(N'dbo.DSN_MOCKUP_ITEM')
        )
        CREATE INDEX IX_DSN_MOCKUP_ITEM_ATU ON dbo.DSN_MOCKUP_ITEM (STATUS, ATUALIZADO_EM, ID);
    `);
  } catch (_) { /* índice é apoio do filtro por data */ }

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.DSN_MOCKUP_ITEM', N'U') IS NOT NULL
      UPDATE dbo.DSN_MOCKUP_ITEM SET STATUS = N'FINALIZADA' WHERE STATUS = N'UPADO';
    IF OBJECT_ID(N'dbo.DSN_MOCKUP_LOG', N'U') IS NOT NULL
    BEGIN
      UPDATE dbo.DSN_MOCKUP_LOG SET STATUS_ANTERIOR = N'FINALIZADA' WHERE STATUS_ANTERIOR = N'UPADO';
      UPDATE dbo.DSN_MOCKUP_LOG SET STATUS_NOVO = N'FINALIZADA' WHERE STATUS_NOVO = N'UPADO';
    END
  `);

  tablesReady = true;
}

function decodeBase64(data) {
  if (!data) return null;
  const raw = String(data).includes(",") ? String(data).split(",")[1] : String(data);
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) return null;
  if (buf.length > 4.5 * 1024 * 1024) {
    throw new Error("Foto maior que 4.5 MB. Compacte a imagem.");
  }
  return buf;
}

function normalizarChave(chave) {
  return String(chave || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function valorCampo(row, aliases) {
  if (!row || typeof row !== "object") return null;
  const map = {};
  for (const [k, v] of Object.entries(row)) map[normalizarChave(k)] = v;
  for (const alias of aliases) {
    const v = map[alias];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function normalizarItensCsv(data) {
  if (!Array.isArray(data)) return { itens: [], duplicados: [] };
  const seen = new Set();
  const duplicadosSet = new Set();
  const itens = [];
  const duplicados = [];
  for (const row of data) {
    const codigo = valorCampo(row, ["CODIGO", "COD", "CODE", "SKU", "PRODUTO"]);
    if (!codigo) continue;
    const key = codigo.toUpperCase();
    if (seen.has(key)) {
      if (!duplicadosSet.has(key)) {
        duplicadosSet.add(key);
        duplicados.push(codigo);
      }
      continue;
    }
    seen.add(key);
    itens.push({
      codigo,
      linha: valorCampo(row, ["LINHA", "COLECAO", "COLLECTION", "ABA"]) || "",
    });
  }
  return { itens, duplicados };
}

async function listarLotes(req, res, pool) {
  const result = await pool.request().query(`
    SELECT l.ID, l.NOME, l.SOLICITANTE, l.CRIADO_EM,
           COUNT(i.ID) AS TOTAL,
           SUM(CASE WHEN i.STATUS = N'FINALIZADA' THEN 1 ELSE 0 END) AS FEITAS
    FROM dbo.DSN_MOCKUP_LOTE l
    LEFT JOIN dbo.DSN_MOCKUP_ITEM i ON i.LOTE_ID = l.ID
    GROUP BY l.ID, l.NOME, l.SOLICITANTE, l.CRIADO_EM
    ORDER BY l.ID DESC
  `);
  return res.json({
    success: true,
    data: (result.recordset || []).map((r) => ({
      id: r.ID,
      nome: r.NOME,
      solicitante: r.SOLICITANTE,
      criadoEm: r.CRIADO_EM,
      total: Number(r.TOTAL) || 0,
      feitas: Number(r.FEITAS) || 0,
    })),
  });
}

async function listarItens(req, res, pool) {
  const loteId = Number(req.query.loteId) || null;
  const status = canonStatus(req.query.status);
  const q = String(req.query.q || "").trim();

  const request = pool.request();
  let where = "WHERE 1=1";
  if (loteId) {
    request.input("loteId", sql.Int, loteId);
    where += " AND i.LOTE_ID = @loteId";
  }
  if (status && STATUS.includes(status)) {
    request.input("status", sql.NVarChar(30), status);
    where += " AND i.STATUS = @status";
  }
  if (q) {
    request.input("q", sql.NVarChar(200), `%${q}%`);
    where += " AND (i.CODIGO LIKE @q OR ISNULL(cp.DESCRICAO, i.DESCRICAO) LIKE @q OR i.LINHA LIKE @q)";
  }

  const result = await request.query(`
    SELECT i.ID, i.LOTE_ID, i.CODIGO,
           ISNULL(cp.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
           i.LINHA, i.STATUS,
           i.ATUALIZADO_EM, i.ATUALIZADO_POR, l.NOME AS LOTE_NOME
    FROM dbo.DSN_MOCKUP_ITEM i
    INNER JOIN dbo.DSN_MOCKUP_LOTE l ON l.ID = i.LOTE_ID
    LEFT JOIN dbo.CAD_PROD cp ON cp.CODIGO = i.CODIGO
    ${where}
    ORDER BY i.ID DESC
  `);

  const itens = (result.recordset || []).map((r) => ({
    id: r.ID,
    loteId: r.LOTE_ID,
    loteNome: r.LOTE_NOME,
    codigo: r.CODIGO,
    descricao: r.DESCRICAO || "",
    linha: r.LINHA || "",
    status: r.STATUS,
    atualizadoEm: r.ATUALIZADO_EM,
    atualizadoPor: r.ATUALIZADO_POR,
    fotos: [],
    fotosOk: 0,
  }));

  if (itens.length) {
    const fotosReq = pool.request();
    const inList = itens.map((it, i) => {
      fotosReq.input(`fid${i}`, sql.Int, it.id);
      return `@fid${i}`;
    }).join(",");
    const fotosRes = await fotosReq.query(`
      SELECT ID, ITEM_ID, SLOT, NOME_ARQUIVO
      FROM dbo.DSN_MOCKUP_FOTO
      WHERE ITEM_ID IN (${inList})
      ORDER BY ITEM_ID, SLOT, ID
    `);
    const byItem = new Map();
    for (const row of fotosRes.recordset || []) {
      if (!byItem.has(row.ITEM_ID)) byItem.set(row.ITEM_ID, []);
      byItem.get(row.ITEM_ID).push({
        id: row.ID,
        slot: row.SLOT,
        nome: row.NOME_ARQUIVO || "",
      });
    }
    for (const it of itens) {
      it.fotos = byItem.get(it.id) || [];
      it.fotosOk = it.fotos.length;
    }
  }

  const totReq = pool.request();
  let totWhere = "";
  if (loteId) {
    totReq.input("loteIdT", sql.Int, loteId);
    totWhere = " WHERE LOTE_ID = @loteIdT";
  }
  const totRes = await totReq.query(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN STATUS = N'FINALIZADA' THEN 1 ELSE 0 END) AS FEITAS,
      SUM(CASE WHEN STATUS = N'EM ANDAMENTO' THEN 1 ELSE 0 END) AS ANDAMENTO,
      SUM(CASE WHEN STATUS = N'A FAZER' THEN 1 ELSE 0 END) AS A_FAZER
    FROM dbo.DSN_MOCKUP_ITEM${totWhere}
  `);
  const tr = totRes.recordset[0] || {};
  const totais = {
    total: Number(tr.TOTAL) || 0,
    feitas: Number(tr.FEITAS) || 0,
    andamento: Number(tr.ANDAMENTO) || 0,
    aFazer: Number(tr.A_FAZER) || 0,
  };

  return res.json({ success: true, itens, totais });
}

function montarErrosCsv({ naoCadastrados, ignoradosCodigos, duplicados }) {
  return [
    ...naoCadastrados.map((codigo) => ({ codigo, motivo: "Não cadastrado no produto" })),
    ...ignoradosCodigos.map((codigo) => ({ codigo, motivo: "Já está no controle de mockups" })),
    ...duplicados.map((codigo) => ({ codigo, motivo: "Repetido no CSV (mantida 1 ocorrência)" })),
  ];
}

async function criarCsv(req, res, pool) {
  const usuario = usuarioDoRequest(req) || "SGC";
  const nome = String(req.body.nome || "Lista de mockups").trim().slice(0, 200) || "Lista de mockups";
  const { itens, duplicados } = normalizarItensCsv(req.body.itens || req.body.data || []);
  if (!itens.length) {
    return res.status(400).json({
      success: false,
      error: "Nenhum código válido. Use a coluna codigo (um SKU por linha).",
    });
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const loteRes = await new sql.Request(transaction)
      .input("nome", sql.NVarChar(200), nome)
      .input("solicitante", sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO dbo.DSN_MOCKUP_LOTE (NOME, SOLICITANTE)
        OUTPUT INSERTED.ID
        VALUES (@nome, @solicitante)
      `);
    const loteId = loteRes.recordset[0].ID;

    let inseridos = 0;
    const ignoradosCodigos = [];
    const naoCadastrados = [];
    for (const it of itens) {
      const exists = await new sql.Request(transaction)
        .input("cod", sql.NVarChar(40), it.codigo)
        .query(`SELECT TOP 1 ID FROM dbo.DSN_MOCKUP_ITEM WHERE CODIGO = @cod`);
      if (exists.recordset.length) {
        ignoradosCodigos.push(it.codigo);
        continue;
      }
      const prod = await new sql.Request(transaction)
        .input("cod", sql.NVarChar(50), it.codigo)
        .query(`SELECT TOP 1 DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO = @cod`);
      if (!prod.recordset.length) {
        naoCadastrados.push(it.codigo);
        continue;
      }
      const descricao = String(prod.recordset[0].DESCRICAO || "").trim();
      await new sql.Request(transaction)
        .input("loteId", sql.Int, loteId)
        .input("codigo", sql.NVarChar(40), it.codigo)
        .input("descricao", sql.NVarChar(400), descricao || null)
        .input("linha", sql.NVarChar(80), it.linha || null)
        .query(`
          INSERT INTO dbo.DSN_MOCKUP_ITEM (LOTE_ID, CODIGO, DESCRICAO, LINHA, STATUS)
          VALUES (@loteId, @codigo, @descricao, @linha, N'A FAZER')
        `);
      inseridos += 1;
    }

    const erros = montarErrosCsv({ naoCadastrados, ignoradosCodigos, duplicados });
    if (inseridos === 0) {
      await transaction.rollback();
      const partes = [];
      if (ignoradosCodigos.length) partes.push(`${ignoradosCodigos.length} já no controle`);
      if (naoCadastrados.length) partes.push(`${naoCadastrados.length} não cadastrado(s) no produto`);
      return res.status(400).json({
        success: false,
        error: `Nenhum SKU novo. ${partes.join("; ") || "Verifique o CSV."} O relatório lista os códigos.`,
        inseridos: 0,
        ignorados: ignoradosCodigos.length,
        naoCadastrados,
        duplicados,
        erros,
      });
    }

    await transaction.commit();
    let msg = `Lista #${loteId}: ${inseridos} SKU(s) em A FAZER.`;
    if (erros.length) msg += ` ${erros.length} não entraram. O relatório lista os códigos.`;
    return res.status(201).json({
      success: true,
      loteId,
      inseridos,
      ignorados: ignoradosCodigos.length,
      naoCadastrados,
      duplicados,
      erros,
      message: msg,
    });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function apagarItem(req, res, pool) {
  const itemId = Number(req.query.itemId || req.query.id || req.body?.itemId || req.body?.id);
  if (!itemId) {
    return res.status(400).json({ success: false, error: "Item obrigatório." });
  }
  const cur = await pool.request()
    .input("id", sql.Int, itemId)
    .query(`
      SELECT i.ID, i.CODIGO
      FROM dbo.DSN_MOCKUP_ITEM i
      WHERE i.ID=@id
    `);
  if (!cur.recordset.length) {
    return res.status(404).json({ success: false, error: "Item não encontrado." });
  }
  const codigo = cur.recordset[0].CODIGO;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const fotos = await new sql.Request(transaction)
      .input("id", sql.Int, itemId)
      .query(`SELECT COUNT(*) AS N FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@id`);
    await new sql.Request(transaction)
      .input("id", sql.Int, itemId)
      .query(`DELETE FROM dbo.DSN_MOCKUP_LOG WHERE ITEM_ID=@id`);
    await new sql.Request(transaction)
      .input("id", sql.Int, itemId)
      .query(`DELETE FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@id`);
    await new sql.Request(transaction)
      .input("id", sql.Int, itemId)
      .query(`DELETE FROM dbo.DSN_MOCKUP_ITEM WHERE ID=@id`);
    await transaction.commit();
    const nFotos = Number(fotos.recordset[0]?.N) || 0;
    return res.json({
      success: true,
      id: itemId,
      codigo,
      fotos: nFotos,
      message: `Código ${codigo} excluído. Ele pode entrar de novo em outra lista.`,
    });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function apagarLote(req, res, pool) {
  const loteId = Number(req.query.loteId || req.body?.loteId || req.body?.id);
  if (!loteId) {
    return res.status(400).json({ success: false, error: "Selecione a lista para excluir." });
  }

  const lote = await pool.request()
    .input("id", sql.Int, loteId)
    .query(`SELECT ID, NOME FROM dbo.DSN_MOCKUP_LOTE WHERE ID=@id`);
  if (!lote.recordset.length) {
    return res.status(404).json({ success: false, error: "Lista não encontrada." });
  }
  const nome = lote.recordset[0].NOME;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const antes = await new sql.Request(transaction)
      .input("loteId", sql.Int, loteId)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.DSN_MOCKUP_ITEM WHERE LOTE_ID=@loteId) AS ITENS,
          (SELECT COUNT(*)
             FROM dbo.DSN_MOCKUP_FOTO f
             INNER JOIN dbo.DSN_MOCKUP_ITEM i ON i.ID = f.ITEM_ID
            WHERE i.LOTE_ID=@loteId) AS FOTOS
      `);
    await new sql.Request(transaction)
      .input("loteId", sql.Int, loteId)
      .query(`
        DELETE lg
        FROM dbo.DSN_MOCKUP_LOG lg
        INNER JOIN dbo.DSN_MOCKUP_ITEM i ON i.ID = lg.ITEM_ID
        WHERE i.LOTE_ID = @loteId
      `);
    await new sql.Request(transaction)
      .input("loteId", sql.Int, loteId)
      .query(`
        DELETE f
        FROM dbo.DSN_MOCKUP_FOTO f
        INNER JOIN dbo.DSN_MOCKUP_ITEM i ON i.ID = f.ITEM_ID
        WHERE i.LOTE_ID = @loteId
      `);
    await new sql.Request(transaction)
      .input("loteId", sql.Int, loteId)
      .query(`DELETE FROM dbo.DSN_MOCKUP_ITEM WHERE LOTE_ID=@loteId`);
    await new sql.Request(transaction)
      .input("loteId", sql.Int, loteId)
      .query(`DELETE FROM dbo.DSN_MOCKUP_LOTE WHERE ID=@loteId`);
    await transaction.commit();

    const itens = Number(antes.recordset[0]?.ITENS) || 0;
    const fotos = Number(antes.recordset[0]?.FOTOS) || 0;
    return res.json({
      success: true,
      loteId,
      nome,
      itens,
      fotos,
      message: `Lista "${nome}" excluída: ${itens} SKU(s) e ${fotos} foto(s).`,
    });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function mudarStatus(req, res, pool) {
  const itemId = Number(req.body.itemId || req.body.id);
  const novo = canonStatus(req.body.status);
  if (!itemId || !STATUS.includes(novo)) {
    return res.status(400).json({ success: false, error: "Item e status válidos são obrigatórios." });
  }
  const usuario = usuarioDoRequest(req) || "SGC";
  const cur = await pool.request().input("id", sql.Int, itemId)
    .query(`SELECT ID, STATUS FROM dbo.DSN_MOCKUP_ITEM WHERE ID=@id`);
  if (!cur.recordset.length) return res.status(404).json({ success: false, error: "Item não encontrado." });
  const anterior = cur.recordset[0].STATUS;
  if (anterior === novo) return res.json({ success: true, id: itemId, status: novo });

  await pool.request()
    .input("id", sql.Int, itemId)
    .input("st", sql.NVarChar(30), novo)
    .input("user", sql.NVarChar(100), usuario)
    .query(`
      UPDATE dbo.DSN_MOCKUP_ITEM
      SET STATUS=@st, ATUALIZADO_EM=GETDATE(), ATUALIZADO_POR=@user
      WHERE ID=@id
    `);
  await pool.request()
    .input("id", sql.Int, itemId)
    .input("ant", sql.NVarChar(30), anterior)
    .input("novo", sql.NVarChar(30), novo)
    .input("user", sql.NVarChar(100), usuario)
    .query(`
      INSERT INTO dbo.DSN_MOCKUP_LOG (ITEM_ID, STATUS_ANTERIOR, STATUS_NOVO, USUARIO)
      VALUES (@id, @ant, @novo, @user)
    `);
  return res.json({ success: true, id: itemId, status: novo });
}

async function mudarStatusLote(req, res, pool) {
  const ids = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(Number).filter((n) => n > 0) : [];
  const novo = canonStatus(req.body.status);
  if (!ids.length || !STATUS.includes(novo)) {
    return res.status(400).json({ success: false, error: "Selecione itens e um status." });
  }
  const usuario = usuarioDoRequest(req) || "SGC";
  let n = 0;
  for (const id of ids) {
    const cur = await pool.request().input("id", sql.Int, id)
      .query(`SELECT STATUS FROM dbo.DSN_MOCKUP_ITEM WHERE ID=@id`);
    if (!cur.recordset.length) continue;
    const anterior = cur.recordset[0].STATUS;
    if (anterior === novo) continue;
    await pool.request()
      .input("id", sql.Int, id)
      .input("st", sql.NVarChar(30), novo)
      .input("user", sql.NVarChar(100), usuario)
      .query(`UPDATE dbo.DSN_MOCKUP_ITEM SET STATUS=@st, ATUALIZADO_EM=GETDATE(), ATUALIZADO_POR=@user WHERE ID=@id`);
    await pool.request()
      .input("id", sql.Int, id)
      .input("ant", sql.NVarChar(30), anterior)
      .input("novo", sql.NVarChar(30), novo)
      .input("user", sql.NVarChar(100), usuario)
      .query(`INSERT INTO dbo.DSN_MOCKUP_LOG (ITEM_ID, STATUS_ANTERIOR, STATUS_NOVO, USUARIO) VALUES (@id, @ant, @novo, @user)`);
    n += 1;
  }
  return res.json({ success: true, alterados: n });
}

async function salvarFoto(req, res, pool) {
  const itemId = Number(req.body.itemId);
  const fotoId = Number(req.body.id || req.body.fotoId) || 0;
  if (!itemId) {
    return res.status(400).json({ success: false, error: "Item obrigatório." });
  }
  const buf = decodeBase64(req.body.data);
  if (!buf) return res.status(400).json({ success: false, error: "Envie a imagem." });
  const mime = String(req.body.mime || "image/jpeg").slice(0, 80);
  const usuario = usuarioDoRequest(req) || "SGC";

  const exists = await pool.request().input("id", sql.Int, itemId)
    .query(`SELECT ID FROM dbo.DSN_MOCKUP_ITEM WHERE ID=@id`);
  if (!exists.recordset.length) return res.status(404).json({ success: false, error: "Item não encontrado." });

  if (fotoId) {
    const cur = await pool.request()
      .input("id", sql.Int, fotoId)
      .input("itemId", sql.Int, itemId)
      .query(`SELECT ID, SLOT FROM dbo.DSN_MOCKUP_FOTO WHERE ID=@id AND ITEM_ID=@itemId`);
    if (!cur.recordset.length) return res.status(404).json({ success: false, error: "Foto não encontrada." });
    const slot = cur.recordset[0].SLOT;
    const nome = String(req.body.nome || `foto-${slot}.jpg`).slice(0, 255);
    await pool.request()
      .input("id", sql.Int, fotoId)
      .input("nome", sql.NVarChar(255), nome)
      .input("mime", sql.NVarChar(80), mime)
      .input("conteudo", sql.VarBinary(sql.MAX), buf)
      .input("tamanho", sql.Int, buf.length)
      .input("user", sql.NVarChar(100), usuario)
      .query(`
        UPDATE dbo.DSN_MOCKUP_FOTO
        SET NOME_ARQUIVO=@nome, MIME=@mime, CONTEUDO=@conteudo, TAMANHO=@tamanho,
            CRIADO_EM=GETDATE(), CRIADO_POR=@user
        WHERE ID=@id
      `);
    return res.json({ success: true, itemId, id: fotoId, slot, tamanho: buf.length });
  }

  const slotsRes = await pool.request().input("itemId", sql.Int, itemId)
    .query(`SELECT ID, SLOT FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@itemId`);
  const used = new Set((slotsRes.recordset || []).map((r) => Number(r.SLOT)));
  if (used.size >= MAX_FOTOS) {
    return res.status(400).json({ success: false, error: `Limite de ${MAX_FOTOS} fotos por SKU.` });
  }

  let slot = Number(req.body.slot) || 0;
  if (slot > 0 && used.has(slot)) {
    return res.status(400).json({ success: false, error: "Já existe foto nesse slot. Envie sem slot para adicionar outra." });
  }
  if (!slot) {
    for (let i = 1; i <= 255; i++) {
      if (!used.has(i)) {
        slot = i;
        break;
      }
    }
  }
  if (slot < 1 || slot > 255) {
    return res.status(400).json({ success: false, error: "Não foi possível alocar um slot para a foto." });
  }

  const nome = String(req.body.nome || `foto-${slot}.jpg`).slice(0, 255);
  const ins = await pool.request()
    .input("itemId", sql.Int, itemId)
    .input("slot", sql.TinyInt, slot)
    .input("nome", sql.NVarChar(255), nome)
    .input("mime", sql.NVarChar(80), mime)
    .input("conteudo", sql.VarBinary(sql.MAX), buf)
    .input("tamanho", sql.Int, buf.length)
    .input("user", sql.NVarChar(100), usuario)
    .query(`
      INSERT INTO dbo.DSN_MOCKUP_FOTO (ITEM_ID, SLOT, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_POR)
      OUTPUT INSERTED.ID
      VALUES (@itemId, @slot, @nome, @mime, @conteudo, @tamanho, @user)
    `);
  return res.json({
    success: true,
    itemId,
    id: ins.recordset[0]?.ID,
    slot,
    tamanho: buf.length,
  });
}

export function chaveConfere(informada, esperada) {
  const a = Buffer.from(String(informada || ""));
  const b = Buffer.from(String(esperada || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function tokenAmbiente() {
  const valor = String(process.env.MOCKUPS_API_TOKEN || "").trim();
  return valor || null;
}

function novaChave() {
  return crypto.randomBytes(24).toString("base64url");
}

function chaveDoRequest(req) {
  const h = req.headers || {};
  if (h["x-api-key"]) return String(h["x-api-key"]).trim();
  const auth = String(h.authorization || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  if (req.query && req.query.chave) return String(req.query.chave).trim();
  return "";
}

function origemPublica(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function urlListaPublica(req) {
  const base = origemPublica(req);
  const path = "/api/design/mockups/finalizados";
  return base ? base + path : path;
}

function urlFotoPublica(req, id) {
  const base = origemPublica(req);
  const path = `/api/design/mockups/finalizados/foto?id=${id}`;
  return base ? base + path : path;
}

async function lerChaveApi(pool, criar) {
  const ambiente = tokenAmbiente();
  if (ambiente) return { origem: "ambiente", chave: ambiente };
  const cur = await pool.request().query(`SELECT CHAVE FROM dbo.DSN_MOCKUP_API WHERE ID=1`);
  if (cur.recordset.length) return { origem: "banco", chave: cur.recordset[0].CHAVE };
  if (!criar) return { origem: "banco", chave: null };
  const chave = novaChave();
  try {
    await pool.request()
      .input("chave", sql.NVarChar(80), chave)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.DSN_MOCKUP_API WHERE ID=1)
          INSERT INTO dbo.DSN_MOCKUP_API (ID, CHAVE) VALUES (1, @chave);
      `);
  } catch (_) { /* outra chamada criou a linha */ }
  const again = await pool.request().query(`SELECT CHAVE FROM dbo.DSN_MOCKUP_API WHERE ID=1`);
  if (!again.recordset.length) {
    throw new Error("Não foi possível gerar a chave da API.");
  }
  return { origem: "banco", chave: again.recordset[0].CHAVE };
}

async function exigirChaveIntegracao(req, res, pool) {
  const guardada = await lerChaveApi(pool, false);
  if (!guardada.chave) {
    res.status(503).json({
      success: false,
      error: "API ainda sem chave. Um administrador gera a chave em Geral, na aba API's.",
    });
    return false;
  }
  if (!chaveConfere(chaveDoRequest(req), guardada.chave)) {
    res.status(401).json({ success: false, error: "Chave de API ausente ou inválida." });
    return false;
  }
  return true;
}

function respostaChave(req, guardada) {
  return {
    success: true,
    origem: guardada.origem,
    chave: guardada.origem === "ambiente" ? null : guardada.chave,
    listaUrl: urlListaPublica(req),
    fotoUrl: urlFotoPublica(req, "{id}"),
  };
}

async function verChaveApi(req, res, pool) {
  if (!isAdmin(nivelDoRequest(req))) {
    return res.status(403).json({ success: false, error: "Só administrador vê a chave da API." });
  }
  const guardada = await lerChaveApi(pool, true);
  return res.json(respostaChave(req, guardada));
}

async function girarChaveApi(req, res, pool) {
  if (!isAdmin(nivelDoRequest(req))) {
    return res.status(403).json({ success: false, error: "Só administrador gera a chave da API." });
  }
  if (tokenAmbiente()) {
    return res.status(400).json({
      success: false,
      error: "A chave está definida no servidor (MOCKUPS_API_TOKEN) e não muda por aqui.",
    });
  }
  const chave = novaChave();
  await pool.request()
    .input("chave", sql.NVarChar(80), chave)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.DSN_MOCKUP_API WHERE ID=1)
        UPDATE dbo.DSN_MOCKUP_API SET CHAVE=@chave, ATUALIZADO_EM=GETDATE() WHERE ID=1;
      ELSE
        INSERT INTO dbo.DSN_MOCKUP_API (ID, CHAVE) VALUES (1, @chave);
    `);
  return res.json(respostaChave(req, { origem: "banco", chave }));
}

function inteiroQuery(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const bruto = String(valor).trim();
  if (!/^\d+$/.test(bruto)) return undefined;
  const n = Number(bruto);
  if (!Number.isSafeInteger(n) || n > 2147483647) return undefined;
  return n;
}

function diaQuery(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const m = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt;
}

function likeContem(valor) {
  return `%${String(valor).replace(/[\[%_]/g, (ch) => `[${ch}]`)}%`;
}

/** Filtros da lista pública. Sem limite, a página traz 100 itens. */
export function montarFiltroIntegracao(query) {
  const qy = query || {};
  const binds = [];
  const partes = ["i.STATUS = N'FINALIZADA'"];

  const id = inteiroQuery(qy.id);
  if (id === undefined || id === 0) return { error: "Id inválido." };
  if (id) {
    binds.push({ name: "id", type: sql.Int, value: id });
    partes.push("i.ID = @id");
  }

  const loteId = inteiroQuery(qy.loteId);
  if (loteId === undefined || loteId === 0) return { error: "Lista inválida." };
  if (loteId) {
    binds.push({ name: "loteId", type: sql.Int, value: loteId });
    partes.push("i.LOTE_ID = @loteId");
  }

  const codigo = String(qy.codigo || "").trim();
  if (codigo) {
    binds.push({ name: "codigo", type: sql.NVarChar(40), value: codigo.slice(0, 40) });
    partes.push("i.CODIGO = @codigo");
  }

  const q = String(qy.q || "").trim().slice(0, 200);
  if (q) {
    binds.push({ name: "q", type: sql.NVarChar(620), value: likeContem(q) });
    partes.push("(i.CODIGO LIKE @q OR ISNULL(cp.DESCRICAO, i.DESCRICAO) LIKE @q OR i.LINHA LIKE @q)");
  }

  const desde = diaQuery(qy.desde);
  const ate = diaQuery(qy.ate);
  if (desde === undefined || ate === undefined) {
    return { error: "Data inválida. Use AAAA-MM-DD em desde e ate." };
  }
  if (desde && ate && desde.getTime() > ate.getTime()) {
    return { error: "A data inicial é maior que a final." };
  }
  if (desde) {
    binds.push({ name: "desde", type: sql.DateTime2, value: desde });
    partes.push("i.ATUALIZADO_EM >= @desde");
  }
  if (ate) {
    const fim = new Date(ate.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1);
    binds.push({ name: "ate", type: sql.DateTime2, value: fim });
    partes.push("i.ATUALIZADO_EM < @ate");
  }

  let limite = LIMITE_PADRAO;
  if (qy.limite != null && String(qy.limite).trim() !== "") {
    const n = inteiroQuery(qy.limite);
    if (n === undefined || n < 1 || n > LIMITE_MAX) {
      return { error: `Limite inválido. Use de 1 a ${LIMITE_MAX}.` };
    }
    limite = n;
  }
  let offset = 0;
  if (qy.offset != null && String(qy.offset).trim() !== "") {
    const n = inteiroQuery(qy.offset);
    if (n === undefined || n > 1000000) return { error: "Offset inválido." };
    offset = n;
  }

  const fotosBruto = String(qy.fotos == null ? "" : qy.fotos).trim().toLowerCase();
  const comFotos = fotosBruto !== "0" && fotosBruto !== "nao" && fotosBruto !== "não" && fotosBruto !== "false";

  return {
    where: partes.join(" AND "),
    binds,
    limite,
    offset,
    comFotos,
  };
}

async function listarIntegracao(req, res, pool) {
  const filtro = montarFiltroIntegracao(req.query);
  if (filtro.error) return res.status(400).json({ success: false, error: filtro.error });

  function aplicar(request) {
    for (const b of filtro.binds) request.input(b.name, b.type, b.value);
    return request;
  }

  const from = `
    FROM dbo.DSN_MOCKUP_ITEM i
    INNER JOIN dbo.DSN_MOCKUP_LOTE l ON l.ID = i.LOTE_ID
    LEFT JOIN dbo.CAD_PROD cp ON cp.CODIGO = i.CODIGO
    WHERE ${filtro.where}
  `;
  const countRes = await aplicar(pool.request()).query(`SELECT COUNT(*) AS N ${from}`);
  const total = Number(countRes.recordset[0]?.N) || 0;

  const pageReq = aplicar(pool.request());
  pageReq.input("off", sql.Int, filtro.offset);
  pageReq.input("lim", sql.Int, filtro.limite);
  const result = await pageReq.query(`
    SELECT i.ID, i.LOTE_ID, i.CODIGO,
           ISNULL(cp.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
           i.LINHA, i.STATUS, i.ATUALIZADO_EM, l.NOME AS LOTE_NOME
    ${from}
    ORDER BY i.CODIGO, i.ID
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
  `);
  const itens = (result.recordset || []).map((r) => ({
    id: r.ID,
    codigo: r.CODIGO,
    descricao: r.DESCRICAO || "",
    linha: r.LINHA || "",
    status: STATUS_FEITO,
    lista: { id: r.LOTE_ID, nome: r.LOTE_NOME },
    atualizadoEm: r.ATUALIZADO_EM ? new Date(r.ATUALIZADO_EM).toISOString() : null,
    fotos: [],
  }));
  if (filtro.comFotos && itens.length) {
    const fotosReq = pool.request();
    const inList = itens.map((it, i) => {
      fotosReq.input(`fid${i}`, sql.Int, it.id);
      return `@fid${i}`;
    }).join(",");
    const fotosRes = await fotosReq.query(`
      SELECT ID, ITEM_ID, SLOT, NOME_ARQUIVO, MIME
      FROM dbo.DSN_MOCKUP_FOTO
      WHERE ITEM_ID IN (${inList})
      ORDER BY ITEM_ID, SLOT, ID
    `);
    const byItem = new Map();
    for (const row of fotosRes.recordset || []) {
      if (!byItem.has(row.ITEM_ID)) byItem.set(row.ITEM_ID, []);
      byItem.get(row.ITEM_ID).push(row);
    }
    for (const it of itens) {
      const fotos = byItem.get(it.id) || [];
      it.fotos = fotos.map((f, i) => ({
        id: f.ID,
        ordem: i + 1,
        slot: f.SLOT,
        nome: f.NOME_ARQUIVO || "",
        mime: f.MIME || "image/jpeg",
        url: urlFotoPublica(req, f.ID),
      }));
    }
  }
  return res.json({
    success: true,
    somente: STATUS_FEITO,
    total,
    limite: filtro.limite,
    offset: filtro.offset,
    itens,
  });
}

function nomeArquivoHeader(nome) {
  const limpo = String(nome || "foto.jpg").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return limpo || "foto.jpg";
}

async function getFotoIntegracao(req, res, pool) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "id da foto obrigatório." });
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT f.MIME, f.CONTEUDO, f.NOME_ARQUIVO
      FROM dbo.DSN_MOCKUP_FOTO f
      INNER JOIN dbo.DSN_MOCKUP_ITEM i ON i.ID = f.ITEM_ID
      WHERE f.ID=@id AND i.STATUS = N'FINALIZADA'
    `);
  if (!result.recordset.length) return res.status(404).json({ success: false, error: "Foto não encontrada." });
  const row = result.recordset[0];
  res.setHeader("Content-Type", row.MIME || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=120");
  res.setHeader("Content-Disposition", `inline; filename="${nomeArquivoHeader(row.NOME_ARQUIVO)}"`);
  return res.status(200).send(Buffer.from(row.CONTEUDO));
}

async function getFoto(req, res, pool) {
  const id = Number(req.query.id);
  const itemId = Number(req.query.itemId);
  const slot = Number(req.query.slot);
  let result;
  if (id) {
    result = await pool.request()
      .input("id", sql.Int, id)
      .query(`SELECT MIME, CONTEUDO, NOME_ARQUIVO FROM dbo.DSN_MOCKUP_FOTO WHERE ID=@id`);
  } else if (itemId && slot > 0) {
    result = await pool.request()
      .input("itemId", sql.Int, itemId)
      .input("slot", sql.TinyInt, slot)
      .query(`SELECT MIME, CONTEUDO, NOME_ARQUIVO FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@itemId AND SLOT=@slot`);
  } else {
    return res.status(400).json({ success: false, error: "id da foto (ou itemId e slot) obrigatório." });
  }
  if (!result.recordset.length) return res.status(404).end();
  const row = result.recordset[0];
  res.setHeader("Content-Type", row.MIME || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=120");
  return res.status(200).send(Buffer.from(row.CONTEUDO));
}

async function apagarFoto(req, res, pool) {
  const id = Number(req.query.id || req.body?.id || req.body?.fotoId);
  const itemId = Number(req.query.itemId || req.body?.itemId);
  const slot = Number(req.query.slot || req.body?.slot);
  let result;
  if (id) {
    result = await pool.request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.DSN_MOCKUP_FOTO WHERE ID=@id`);
  } else if (itemId && slot > 0) {
    result = await pool.request()
      .input("itemId", sql.Int, itemId)
      .input("slot", sql.TinyInt, slot)
      .query(`DELETE FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@itemId AND SLOT=@slot`);
  } else {
    return res.status(400).json({ success: false, error: "id da foto (ou itemId e slot) obrigatório." });
  }
  if (!result.rowsAffected?.[0]) {
    return res.status(404).json({ success: false, error: "Foto não encontrada." });
  }
  return res.json({ success: true });
}
