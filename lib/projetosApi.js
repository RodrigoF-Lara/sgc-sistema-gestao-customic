import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";

const LINK = "projetos-kanban";
const STATUS = ["A FAZER", "EM ANDAMENTO", "CONCLUIDO"];

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

function mapRow(r) {
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
  };
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
      CASE STATUS WHEN N'A FAZER' THEN 0 WHEN N'EM ANDAMENTO' THEN 1 WHEN N'CONCLUIDO' THEN 2 ELSE 3 END,
      ORDEM, ID
  `);
  return res.json({
    success: true,
    projetos: (result.recordset || []).map(mapRow),
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

  if (!id) {
    const ordemRes = await pool.request()
      .input("st", sql.NVarChar(30), status)
      .query(`SELECT ISNULL(MAX(ORDEM), -1) + 1 AS N FROM dbo.GPR_PROJETO WHERE STATUS=@st`);
    const ordem = Number(ordemRes.recordset[0]?.N) || 0;
    const ins = await pool.request()
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
    return res.status(201).json({ success: true, projeto: mapRow(ins.recordset[0]) });
  }

  const upd = await pool.request()
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
  if (!upd.recordset.length) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
  return res.json({ success: true, projeto: mapRow(upd.recordset[0]) });
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
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`DELETE FROM dbo.GPR_PROJETO WHERE ID=@id`);
  if (!result.rowsAffected?.[0]) {
    return res.status(404).json({ success: false, error: "Projeto não encontrado." });
  }
  return res.json({ success: true, id });
}
