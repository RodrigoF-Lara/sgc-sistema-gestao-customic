import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";

const LINK = "projetos-kanban";
const STATUS = ["A FAZER", "EM ANDAMENTO", "CONCLUIDO", "PAUSADO", "CANCELADO"];

let tablesReady = false;

export async function handleProjetos(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);
    if (!(await exigirPermissao(req, res, LINK, "Sem permissão para projetos."))) return;

    if (req.method === "GET") return await listar(req, res, pool);
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "mover") return await mover(req, res, pool);
    if (req.method === "POST" && acao === "marcar") return await marcar(req, res, pool);
    if (req.method === "DELETE") return await excluir(req, res, pool);
    return res.status(400).json({ success: false, error: "Ação inválida." });
  } catch (err) {
    console.error("[projetos/kanban]", err);
    return res.status(500).json({ success: false, error: err.message || "Erro interno." });
  }
}

async function ensureTables(pool) {
  if (tablesReady) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.GPR_PROJETO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.GPR_PROJETO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        NOME NVARCHAR(160) NOT NULL,
        DESCRICAO NVARCHAR(1000) NULL,
        RESPONSAVEL NVARCHAR(100) NULL,
        PRAZO DATE NULL,
        STATUS NVARCHAR(30) NOT NULL CONSTRAINT DF_GPR_PROJETO_ST DEFAULT (N'A FAZER'),
        ORDEM INT NOT NULL CONSTRAINT DF_GPR_PROJETO_ORD DEFAULT (0),
        CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_GPR_PROJETO_DT DEFAULT (GETDATE()),
        CRIADO_POR NVARCHAR(100) NULL,
        ATUALIZADO_EM DATETIME NULL
      );
      CREATE INDEX IX_GPR_PROJETO_STATUS ON dbo.GPR_PROJETO (STATUS, ORDEM, ID);
    END;

    IF OBJECT_ID(N'dbo.GPR_PROJETO_ACAO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.GPR_PROJETO_ACAO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PROJETO_ID INT NOT NULL,
        TEXTO NVARCHAR(300) NOT NULL,
        NIVEL TINYINT NOT NULL CONSTRAINT DF_GPR_ACAO_NV DEFAULT (1),
        FEITO BIT NOT NULL CONSTRAINT DF_GPR_ACAO_FT DEFAULT (0),
        ORDEM INT NOT NULL CONSTRAINT DF_GPR_ACAO_ORD DEFAULT (0)
      );
      CREATE INDEX IX_GPR_ACAO_PROJ ON dbo.GPR_PROJETO_ACAO (PROJETO_ID, ORDEM, ID);
    END;
  `);
  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.SHR_NIVEIS_USUARIO', N'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
        SELECT 'projetos-kanban', n.CODIGO, 1, 'SEED-PROJETOS'
        FROM dbo.SHR_NIVEIS_USUARIO n
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
          WHERE x.LINK_ID = 'projetos-kanban' AND x.NIVEL = n.CODIGO
        );
      END
    `);
  } catch (_) { /* ok */ }
  tablesReady = true;
}

function canonStatus(status) {
  const v = String(status || "").trim().toUpperCase();
  if (v === "CONCLUÍDO" || v === "FEITO" || v === "FINALIZADA") return "CONCLUIDO";
  if (v === "FAZENDO" || v === "ANDAMENTO") return "EM ANDAMENTO";
  if (v === "AFAZER" || v === "TODO") return "A FAZER";
  if (v === "PAUSA" || v === "PAUSADA") return "PAUSADO";
  if (v === "CANCELADA" || v === "CANCELAR") return "CANCELADO";
  return v;
}

function texto(valor, max) {
  const s = String(valor || "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function dataSql(valor) {
  if (!valor) return null;
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function dataIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
}

function mapRow(r, acoes) {
  return {
    id: r.ID,
    nome: r.NOME,
    descricao: r.DESCRICAO || "",
    responsavel: r.RESPONSAVEL || "",
    prazo: dataIso(r.PRAZO),
    status: r.STATUS,
    ordem: Number(r.ORDEM) || 0,
    criadoEm: r.CRIADO_EM,
    criadoPor: r.CRIADO_POR || "",
    acoes: acoes || [],
  };
}

function mapAcao(r) {
  return {
    id: r.ID,
    texto: r.TEXTO || "",
    nivel: Number(r.NIVEL) || 1,
    feito: !!r.FEITO,
    ordem: Number(r.ORDEM) || 0,
  };
}

/** Checklist aninhado: nível 1, 2 ou 3, sem pular um degrau. */
export function normalizarAcoes(entrada) {
  if (!Array.isArray(entrada)) return { acoes: null };
  if (entrada.length > 40) return { error: "No máximo 40 ações por projeto." };
  const acoes = [];
  let prev = 1;
  for (const item of entrada) {
    const nome = texto(item && item.texto, 300);
    if (!nome) continue;
    let nivel = Number(item.nivel);
    if (!Number.isFinite(nivel)) nivel = 1;
    nivel = Math.max(1, Math.min(3, Math.round(nivel)));
    if (!acoes.length) nivel = 1;
    else if (nivel > prev + 1) nivel = prev + 1;
    const id = Number(item.id) || 0;
    acoes.push({
      id: id > 0 ? id : 0,
      texto: nome,
      nivel,
      feito: item.feito === true || item.feito === 1 || item.feito === "1",
    });
    prev = nivel;
  }
  return { acoes };
}

async function lerMapaAcoes(conn, projetoId) {
  const pedido = new sql.Request(conn);
  let result;
  if (projetoId) {
    result = await pedido
      .input("pid", sql.Int, projetoId)
      .query(`
        SELECT ID, PROJETO_ID, TEXTO, NIVEL, FEITO, ORDEM
        FROM dbo.GPR_PROJETO_ACAO
        WHERE PROJETO_ID=@pid
        ORDER BY ORDEM, ID
      `);
  } else {
    result = await pedido.query(`
      SELECT ID, PROJETO_ID, TEXTO, NIVEL, FEITO, ORDEM
      FROM dbo.GPR_PROJETO_ACAO
      ORDER BY PROJETO_ID, ORDEM, ID
    `);
  }
  const mapa = new Map();
  for (const r of result.recordset || []) {
    const lista = mapa.get(r.PROJETO_ID) || [];
    lista.push(mapAcao(r));
    mapa.set(r.PROJETO_ID, lista);
  }
  return mapa;
}

async function gravarAcoes(transaction, projetoId, acoes) {
  const atuais = await new sql.Request(transaction)
    .input("pid", sql.Int, projetoId)
    .query(`SELECT ID FROM dbo.GPR_PROJETO_ACAO WHERE PROJETO_ID=@pid`);
  const idsAtuais = new Set((atuais.recordset || []).map((r) => r.ID));
  const mantidos = new Set();
  for (let i = 0; i < acoes.length; i++) {
    const a = acoes[i];
    if (a.id && idsAtuais.has(a.id)) {
      mantidos.add(a.id);
      await new sql.Request(transaction)
        .input("id", sql.Int, a.id)
        .input("pid", sql.Int, projetoId)
        .input("texto", sql.NVarChar(300), a.texto)
        .input("nivel", sql.TinyInt, a.nivel)
        .input("feito", sql.Bit, a.feito)
        .input("ordem", sql.Int, i)
        .query(`
          UPDATE dbo.GPR_PROJETO_ACAO
          SET TEXTO=@texto, NIVEL=@nivel, FEITO=@feito, ORDEM=@ordem
          WHERE ID=@id AND PROJETO_ID=@pid
        `);
    } else {
      await new sql.Request(transaction)
        .input("pid", sql.Int, projetoId)
        .input("texto", sql.NVarChar(300), a.texto)
        .input("nivel", sql.TinyInt, a.nivel)
        .input("feito", sql.Bit, a.feito)
        .input("ordem", sql.Int, i)
        .query(`
          INSERT INTO dbo.GPR_PROJETO_ACAO (PROJETO_ID, TEXTO, NIVEL, FEITO, ORDEM)
          VALUES (@pid, @texto, @nivel, @feito, @ordem)
        `);
    }
  }
  for (const id of idsAtuais) {
    if (mantidos.has(id)) continue;
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("pid", sql.Int, projetoId)
      .query(`DELETE FROM dbo.GPR_PROJETO_ACAO WHERE ID=@id AND PROJETO_ID=@pid`);
  }
}

function autor(req) {
  const nome = req.body && req.body.usuario;
  if (nome) return String(nome).trim().slice(0, 100) || "SGC";
  return usuarioDoRequest(req) || "SGC";
}

async function listar(req, res, pool) {
  const result = await pool.request().query(`
    SELECT ID, NOME, DESCRICAO, RESPONSAVEL, PRAZO, STATUS, ORDEM, CRIADO_EM, CRIADO_POR
    FROM dbo.GPR_PROJETO
    ORDER BY
      CASE STATUS WHEN N'A FAZER' THEN 0 WHEN N'EM ANDAMENTO' THEN 1 WHEN N'CONCLUIDO' THEN 2 WHEN N'PAUSADO' THEN 3 WHEN N'CANCELADO' THEN 4 ELSE 5 END,
      ORDEM, ID
  `);
  const mapa = await lerMapaAcoes(pool);
  return res.json({
    success: true,
    projetos: (result.recordset || []).map((r) => mapRow(r, mapa.get(r.ID) || [])),
  });
}

async function salvar(req, res, pool) {
  const id = Number(req.body.id) || 0;
  const nome = texto(req.body.nome, 160);
  if (!nome) return res.status(400).json({ success: false, error: "Informe o nome do projeto." });
  const status = canonStatus(req.body.status || "A FAZER");
  if (!STATUS.includes(status)) {
    return res.status(400).json({ success: false, error: "Status inválido." });
  }
  const prazo = dataSql(req.body.prazo);
  if (prazo === undefined) return res.status(400).json({ success: false, error: "Prazo inválido." });
  const descricao = texto(req.body.descricao, 1000);
  const responsavel = texto(req.body.responsavel, 100);
  const usuario = autor(req);
  const norm = normalizarAcoes(req.body.acoes);
  if (norm.error) return res.status(400).json({ success: false, error: norm.error });

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let row;
    let criado = false;
    if (!id) {
      const ordemRes = await new sql.Request(transaction)
        .input("st", sql.NVarChar(30), status)
        .query(`SELECT ISNULL(MAX(ORDEM), -1) + 1 AS N FROM dbo.GPR_PROJETO WHERE STATUS=@st`);
      const ordem = Number(ordemRes.recordset[0]?.N) || 0;
      const ins = await new sql.Request(transaction)
        .input("nome", sql.NVarChar(160), nome)
        .input("desc", sql.NVarChar(1000), descricao)
        .input("resp", sql.NVarChar(100), responsavel)
        .input("prazo", sql.Date, prazo)
        .input("st", sql.NVarChar(30), status)
        .input("ordem", sql.Int, ordem)
        .input("user", sql.NVarChar(100), usuario)
        .query(`
          INSERT INTO dbo.GPR_PROJETO (NOME, DESCRICAO, RESPONSAVEL, PRAZO, STATUS, ORDEM, CRIADO_POR)
          OUTPUT INSERTED.ID, INSERTED.NOME, INSERTED.DESCRICAO, INSERTED.RESPONSAVEL, INSERTED.PRAZO,
                 INSERTED.STATUS, INSERTED.ORDEM, INSERTED.CRIADO_EM, INSERTED.CRIADO_POR
          VALUES (@nome, @desc, @resp, @prazo, @st, @ordem, @user)
        `);
      row = ins.recordset[0];
      criado = true;
    } else {
      const upd = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("nome", sql.NVarChar(160), nome)
        .input("desc", sql.NVarChar(1000), descricao)
        .input("resp", sql.NVarChar(100), responsavel)
        .input("prazo", sql.Date, prazo)
        .input("st", sql.NVarChar(30), status)
        .query(`
          UPDATE dbo.GPR_PROJETO
          SET NOME=@nome, DESCRICAO=@desc, RESPONSAVEL=@resp, PRAZO=@prazo, STATUS=@st, ATUALIZADO_EM=GETDATE()
          OUTPUT INSERTED.ID, INSERTED.NOME, INSERTED.DESCRICAO, INSERTED.RESPONSAVEL, INSERTED.PRAZO,
                 INSERTED.STATUS, INSERTED.ORDEM, INSERTED.CRIADO_EM, INSERTED.CRIADO_POR
          WHERE ID=@id
        `);
      if (!upd.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Projeto não encontrado." });
      }
      row = upd.recordset[0];
    }
    if (norm.acoes) await gravarAcoes(transaction, row.ID, norm.acoes);
    const mapa = await lerMapaAcoes(transaction, row.ID);
    await transaction.commit();
    const projeto = mapRow(row, mapa.get(row.ID) || []);
    if (criado) return res.status(201).json({ success: true, projeto });
    return res.json({ success: true, projeto });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function marcar(req, res, pool) {
  const id = Number(req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Ação obrigatória." });
  const feito = req.body.feito === true || req.body.feito === 1 || req.body.feito === "1";
  const upd = await pool.request()
    .input("id", sql.Int, id)
    .input("feito", sql.Bit, feito)
    .query(`
      UPDATE dbo.GPR_PROJETO_ACAO
      SET FEITO=@feito
      OUTPUT INSERTED.ID, INSERTED.PROJETO_ID, INSERTED.FEITO
      WHERE ID=@id
    `);
  if (!upd.recordset.length) return res.status(404).json({ success: false, error: "Ação não encontrada." });
  const r = upd.recordset[0];
  return res.json({ success: true, id: r.ID, projetoId: r.PROJETO_ID, feito: !!r.FEITO });
}

async function mover(req, res, pool) {
  const itens = Array.isArray(req.body.itens) ? req.body.itens : [];
  if (!itens.length || itens.length > 300) {
    return res.status(400).json({ success: false, error: "Informe os projetos para mover." });
  }
  const limpos = [];
  for (const item of itens) {
    const id = Number(item.id);
    const status = canonStatus(item.status);
    const ordem = Number(item.ordem);
    if (!id || !STATUS.includes(status) || !Number.isFinite(ordem)) continue;
    limpos.push({ id, status, ordem: Math.max(0, Math.round(ordem)) });
  }
  if (!limpos.length) return res.status(400).json({ success: false, error: "Nenhum projeto válido para mover." });

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const item of limpos) {
      await new sql.Request(transaction)
        .input("id", sql.Int, item.id)
        .input("st", sql.NVarChar(30), item.status)
        .input("ordem", sql.Int, item.ordem)
        .query(`
          UPDATE dbo.GPR_PROJETO
          SET STATUS=@st, ORDEM=@ordem, ATUALIZADO_EM=GETDATE()
          WHERE ID=@id
        `);
    }
    await transaction.commit();
    return res.json({ success: true, atualizados: limpos.length });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function excluir(req, res, pool) {
  const id = Number(req.query.id || req.body?.id);
  if (!id) return res.status(400).json({ success: false, error: "Projeto obrigatório." });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.GPR_PROJETO_ACAO WHERE PROJETO_ID=@id`);
    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.GPR_PROJETO OUTPUT DELETED.ID WHERE ID=@id`);
    if (!result.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    await transaction.commit();
    return res.json({ success: true, id });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}
