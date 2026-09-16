import { getConnection, sql } from "../db.js";
import { exigirPermissao, exigirQualquerPermissao, usuarioDoRequest } from "./permissoesHelper.js";

const LINK = "design-mockups";
const STATUS = ["A FAZER", "EM ANDAMENTO", "UPADO"];
const SLOTS = [1, 2, 3, 4];

let tablesReady = false;

export async function handleMockups(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);

    if (req.method === "GET") {
      if (acao === "foto") {
        if (!(await exigirQualquerPermissao(req, res, [LINK], "Sem permissão para mockups."))) return;
        return await getFoto(req, res, pool);
      }
      if (!(await exigirQualquerPermissao(req, res, [LINK], "Sem permissão para mockups."))) return;
      if (acao === "lotes") return await listarLotes(req, res, pool);
      return await listarItens(req, res, pool);
    }

    if (req.method === "POST") {
      if (!(await exigirPermissao(req, res, LINK, "Sem permissão para mockups."))) return;
      if (acao === "criar-csv") return await criarCsv(req, res, pool);
      if (acao === "status") return await mudarStatus(req, res, pool);
      if (acao === "status-lote") return await mudarStatusLote(req, res, pool);
      if (acao === "foto") return await salvarFoto(req, res, pool);
      return res.status(400).json({ success: false, error: "Ação inválida." });
    }

    if (req.method === "DELETE") {
      if (!(await exigirPermissao(req, res, LINK, "Sem permissão para mockups."))) return;
      if (acao === "foto") return await apagarFoto(req, res, pool);
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
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  const itens = [];
  for (const row of data) {
    const codigo = valorCampo(row, ["CODIGO", "COD", "CODE", "SKU", "PRODUTO"]);
    if (!codigo) continue;
    const key = codigo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    itens.push({
      codigo,
      descricao: valorCampo(row, ["DESCRICAO", "DESC", "NOME", "PRODUTO_DESC"]) || "",
      linha: valorCampo(row, ["LINHA", "COLECAO", "COLLECTION", "ABA"]) || "",
    });
  }
  return itens;
}

async function listarLotes(req, res, pool) {
  const result = await pool.request().query(`
    SELECT l.ID, l.NOME, l.SOLICITANTE, l.CRIADO_EM,
           COUNT(i.ID) AS TOTAL,
           SUM(CASE WHEN i.STATUS = N'UPADO' THEN 1 ELSE 0 END) AS FEITAS
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
  const status = String(req.query.status || "").trim();
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
    where += " AND (i.CODIGO LIKE @q OR i.DESCRICAO LIKE @q OR i.LINHA LIKE @q)";
  }

  const result = await request.query(`
    SELECT i.ID, i.LOTE_ID, i.CODIGO, i.DESCRICAO, i.LINHA, i.STATUS,
           i.ATUALIZADO_EM, i.ATUALIZADO_POR, l.NOME AS LOTE_NOME,
           ISNULL(f.N1, 0) AS FOTO1, ISNULL(f.N2, 0) AS FOTO2,
           ISNULL(f.N3, 0) AS FOTO3, ISNULL(f.N4, 0) AS FOTO4
    FROM dbo.DSN_MOCKUP_ITEM i
    INNER JOIN dbo.DSN_MOCKUP_LOTE l ON l.ID = i.LOTE_ID
    LEFT JOIN (
      SELECT ITEM_ID,
             SUM(CASE WHEN SLOT = 1 THEN 1 ELSE 0 END) AS N1,
             SUM(CASE WHEN SLOT = 2 THEN 1 ELSE 0 END) AS N2,
             SUM(CASE WHEN SLOT = 3 THEN 1 ELSE 0 END) AS N3,
             SUM(CASE WHEN SLOT = 4 THEN 1 ELSE 0 END) AS N4
      FROM dbo.DSN_MOCKUP_FOTO
      GROUP BY ITEM_ID
    ) f ON f.ITEM_ID = i.ID
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
    fotos: {
      1: Number(r.FOTO1) > 0,
      2: Number(r.FOTO2) > 0,
      3: Number(r.FOTO3) > 0,
      4: Number(r.FOTO4) > 0,
    },
    fotosOk: [r.FOTO1, r.FOTO2, r.FOTO3, r.FOTO4].filter((n) => Number(n) > 0).length,
  }));

  const totReq = pool.request();
  let totWhere = "";
  if (loteId) {
    totReq.input("loteIdT", sql.Int, loteId);
    totWhere = " WHERE LOTE_ID = @loteIdT";
  }
  const totRes = await totReq.query(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN STATUS = N'UPADO' THEN 1 ELSE 0 END) AS FEITAS,
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

async function criarCsv(req, res, pool) {
  const usuario = usuarioDoRequest(req) || "SGC";
  const nome = String(req.body.nome || "Lista de mockups").trim().slice(0, 200) || "Lista de mockups";
  const itens = normalizarItensCsv(req.body.itens || req.body.data || []);
  if (!itens.length) {
    return res.status(400).json({
      success: false,
      error: "Nenhum item válido. Use as colunas codigo e descricao (separador ; ou ,).",
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
    let ignorados = 0;
    for (const it of itens) {
      const exists = await new sql.Request(transaction)
        .input("cod", sql.NVarChar(40), it.codigo)
        .query(`SELECT TOP 1 ID FROM dbo.DSN_MOCKUP_ITEM WHERE CODIGO = @cod`);
      if (exists.recordset.length) {
        ignorados += 1;
        continue;
      }
      await new sql.Request(transaction)
        .input("loteId", sql.Int, loteId)
        .input("codigo", sql.NVarChar(40), it.codigo)
        .input("descricao", sql.NVarChar(400), it.descricao || null)
        .input("linha", sql.NVarChar(80), it.linha || null)
        .query(`
          INSERT INTO dbo.DSN_MOCKUP_ITEM (LOTE_ID, CODIGO, DESCRICAO, LINHA, STATUS)
          VALUES (@loteId, @codigo, @descricao, @linha, N'A FAZER')
        `);
      inseridos += 1;
    }

    if (inseridos === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Nenhum SKU novo. ${ignorados} código(s) já estavam no controle.`,
      });
    }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      loteId,
      inseridos,
      ignorados,
      message: `Lista #${loteId}: ${inseridos} SKU(s) em A FAZER` + (ignorados ? ` (${ignorados} já existiam).` : "."),
    });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function mudarStatus(req, res, pool) {
  const itemId = Number(req.body.itemId || req.body.id);
  const novo = String(req.body.status || "").trim().toUpperCase();
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
  const novo = String(req.body.status || "").trim().toUpperCase();
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
  const slot = Number(req.body.slot);
  if (!itemId || !SLOTS.includes(slot)) {
    return res.status(400).json({ success: false, error: "Item e slot (1 a 4) obrigatórios." });
  }
  const buf = decodeBase64(req.body.data);
  if (!buf) return res.status(400).json({ success: false, error: "Envie a imagem." });
  const mime = String(req.body.mime || "image/jpeg").slice(0, 80);
  const nome = String(req.body.nome || `foto-${slot}.jpg`).slice(0, 255);
  const usuario = usuarioDoRequest(req) || "SGC";

  const exists = await pool.request().input("id", sql.Int, itemId)
    .query(`SELECT ID FROM dbo.DSN_MOCKUP_ITEM WHERE ID=@id`);
  if (!exists.recordset.length) return res.status(404).json({ success: false, error: "Item não encontrado." });

  await pool.request()
    .input("itemId", sql.Int, itemId)
    .input("slot", sql.TinyInt, slot)
    .input("nome", sql.NVarChar(255), nome)
    .input("mime", sql.NVarChar(80), mime)
    .input("conteudo", sql.VarBinary(sql.MAX), buf)
    .input("tamanho", sql.Int, buf.length)
    .input("user", sql.NVarChar(100), usuario)
    .query(`
      MERGE dbo.DSN_MOCKUP_FOTO AS t
      USING (SELECT @itemId AS ITEM_ID, @slot AS SLOT) AS s
         ON t.ITEM_ID = s.ITEM_ID AND t.SLOT = s.SLOT
      WHEN MATCHED THEN
        UPDATE SET NOME_ARQUIVO=@nome, MIME=@mime, CONTEUDO=@conteudo, TAMANHO=@tamanho,
                   CRIADO_EM=GETDATE(), CRIADO_POR=@user
      WHEN NOT MATCHED THEN
        INSERT (ITEM_ID, SLOT, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_POR)
        VALUES (@itemId, @slot, @nome, @mime, @conteudo, @tamanho, @user);
    `);
  return res.json({ success: true, itemId, slot, tamanho: buf.length });
}

async function getFoto(req, res, pool) {
  const itemId = Number(req.query.itemId);
  const slot = Number(req.query.slot);
  if (!itemId || !SLOTS.includes(slot)) {
    return res.status(400).json({ success: false, error: "itemId e slot obrigatórios." });
  }
  const result = await pool.request()
    .input("itemId", sql.Int, itemId)
    .input("slot", sql.TinyInt, slot)
    .query(`SELECT MIME, CONTEUDO, NOME_ARQUIVO FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@itemId AND SLOT=@slot`);
  if (!result.recordset.length) return res.status(404).end();
  const row = result.recordset[0];
  res.setHeader("Content-Type", row.MIME || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=120");
  return res.status(200).send(Buffer.from(row.CONTEUDO));
}

async function apagarFoto(req, res, pool) {
  const itemId = Number(req.query.itemId || req.body?.itemId);
  const slot = Number(req.query.slot || req.body?.slot);
  if (!itemId || !SLOTS.includes(slot)) {
    return res.status(400).json({ success: false, error: "itemId e slot obrigatórios." });
  }
  await pool.request()
    .input("itemId", sql.Int, itemId)
    .input("slot", sql.TinyInt, slot)
    .query(`DELETE FROM dbo.DSN_MOCKUP_FOTO WHERE ITEM_ID=@itemId AND SLOT=@slot`);
  return res.json({ success: true });
}
