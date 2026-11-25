import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";

const LINK = "projetos-kanban";
const STATUS = ["A FAZER", "EM ANDAMENTO", "CONCLUIDO", "PAUSADO", "CANCELADO"];
const ETAPAS = new Set(["pesquisa", "faca", "modelagem", "arte", "ajuste", "grafica", "outro"]);
const CORES = new Set(["#78909c", "#fb8c00", "#8e24aa", "#43a047", "#1e88e5", "#00897b", "#607d8b"]);
const MAX_ENTREGAVEL = 3 * 1024 * 1024;
const MAX_PDF = 5;
const MAX_IMAGEM = 10;
const MAX_LINKS = 10;
const MAX_ENTREGAVEIS = 12;
const MIME_POR_TIPO = {
  "application/pdf": "application/pdf",
  "application/x-pdf": "application/pdf",
  "image/jpg": "image/jpeg",
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

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

    if (req.method === "GET" && acao === "entregavel") return await baixarEntregavel(req, res, pool);
    if (req.method === "GET") return await listar(req, res, pool);
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "mover") return await mover(req, res, pool);
    if (req.method === "POST" && acao === "marcar") return await marcar(req, res, pool);
    if (req.method === "POST" && acao === "entregavel") return await gravarEntregavel(req, res, pool);
    if (req.method === "POST" && acao === "entregavelLink") return await gravarLinkEntregavel(req, res, pool);
    if (req.method === "POST" && acao === "excluirEntregavel") return await excluirEntregavel(req, res, pool);
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
        DATA_CADASTRO DATE NULL,
        DATA_INICIO DATE NULL,
        STATUS NVARCHAR(30) NOT NULL CONSTRAINT DF_GPR_PROJETO_ST DEFAULT (N'A FAZER'),
        PRIORIDADE_ALTA BIT NOT NULL CONSTRAINT DF_GPR_PROJETO_PRI DEFAULT (0),
        ATRASADO BIT NOT NULL CONSTRAINT DF_GPR_PROJETO_ATR DEFAULT (0),
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
        PRIORIDADE_ALTA BIT NOT NULL CONSTRAINT DF_GPR_ACAO_PRI DEFAULT (0),
        ATRASADO BIT NOT NULL CONSTRAINT DF_GPR_ACAO_ATR DEFAULT (0),
        ORDEM INT NOT NULL CONSTRAINT DF_GPR_ACAO_ORD DEFAULT (0)
      );
      CREATE INDEX IX_GPR_ACAO_PROJ ON dbo.GPR_PROJETO_ACAO (PROJETO_ID, ORDEM, ID);
    END;

    IF OBJECT_ID(N'dbo.GPR_PROJETO_REGISTRO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.GPR_PROJETO_REGISTRO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PROJETO_ID INT NOT NULL,
        DATA DATE NOT NULL,
        ETAPA NVARCHAR(20) NOT NULL,
        ROTULO NVARCHAR(80) NULL,
        TITULO NVARCHAR(120) NOT NULL,
        TEXTO NVARCHAR(500) NULL,
        COR NVARCHAR(7) NULL,
        ORDEM INT NOT NULL CONSTRAINT DF_GPR_REG_ORD DEFAULT (0)
      );
      CREATE INDEX IX_GPR_REG_PROJ ON dbo.GPR_PROJETO_REGISTRO (PROJETO_ID, DATA, ORDEM, ID);
    END;

    IF OBJECT_ID(N'dbo.GPR_PROJETO_ENTREGAVEL', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.GPR_PROJETO_ENTREGAVEL (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PROJETO_ID INT NOT NULL,
        TIPO NVARCHAR(20) NOT NULL,
        NOME_ARQUIVO NVARCHAR(255) NOT NULL,
        MIME NVARCHAR(80) NOT NULL,
        CONTEUDO VARBINARY(MAX) NOT NULL,
        TAMANHO INT NOT NULL,
        URL NVARCHAR(2000) NULL,
        CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_GPR_ENT_DT DEFAULT (GETDATE()),
        CRIADO_POR NVARCHAR(100) NULL
      );
      CREATE INDEX IX_GPR_ENT_PROJ ON dbo.GPR_PROJETO_ENTREGAVEL (PROJETO_ID, ID);
    END;
  `);
  await pool.request().query(`
    IF COL_LENGTH('dbo.GPR_PROJETO', 'PRIORIDADE_ALTA') IS NULL
      ALTER TABLE dbo.GPR_PROJETO ADD PRIORIDADE_ALTA BIT NOT NULL CONSTRAINT DF_GPR_PROJETO_PRI DEFAULT (0);
    IF COL_LENGTH('dbo.GPR_PROJETO', 'ATRASADO') IS NULL
      ALTER TABLE dbo.GPR_PROJETO ADD ATRASADO BIT NOT NULL CONSTRAINT DF_GPR_PROJETO_ATR DEFAULT (0);
    IF COL_LENGTH('dbo.GPR_PROJETO_ACAO', 'PRIORIDADE_ALTA') IS NULL
      ALTER TABLE dbo.GPR_PROJETO_ACAO ADD PRIORIDADE_ALTA BIT NOT NULL CONSTRAINT DF_GPR_ACAO_PRI DEFAULT (0);
    IF COL_LENGTH('dbo.GPR_PROJETO_ACAO', 'ATRASADO') IS NULL
      ALTER TABLE dbo.GPR_PROJETO_ACAO ADD ATRASADO BIT NOT NULL CONSTRAINT DF_GPR_ACAO_ATR DEFAULT (0);
    IF COL_LENGTH('dbo.GPR_PROJETO', 'DATA_CADASTRO') IS NULL
      ALTER TABLE dbo.GPR_PROJETO ADD DATA_CADASTRO DATE NULL;
    IF COL_LENGTH('dbo.GPR_PROJETO', 'DATA_INICIO') IS NULL
      ALTER TABLE dbo.GPR_PROJETO ADD DATA_INICIO DATE NULL;
    IF COL_LENGTH('dbo.GPR_PROJETO_REGISTRO', 'COR') IS NULL
      ALTER TABLE dbo.GPR_PROJETO_REGISTRO ADD COR NVARCHAR(7) NULL;
    IF COL_LENGTH('dbo.GPR_PROJETO_ENTREGAVEL', 'URL') IS NULL
      ALTER TABLE dbo.GPR_PROJETO_ENTREGAVEL ADD URL NVARCHAR(2000) NULL;
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

function bit(valor) {
  return valor === true || valor === 1 || valor === "1";
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

function mapRow(r, acoes, registros, entregaveis) {
  return {
    id: r.ID,
    nome: r.NOME,
    descricao: r.DESCRICAO || "",
    responsavel: r.RESPONSAVEL || "",
    cadastro: dataIso(r.DATA_CADASTRO) || dataIso(r.CRIADO_EM),
    inicio: dataIso(r.DATA_INICIO),
    fim: dataIso(r.PRAZO),
    prazo: dataIso(r.PRAZO),
    status: r.STATUS,
    prioridadeAlta: !!r.PRIORIDADE_ALTA,
    atrasado: !!r.ATRASADO,
    ordem: Number(r.ORDEM) || 0,
    criadoEm: r.CRIADO_EM,
    criadoPor: r.CRIADO_POR || "",
    acoes: acoes || [],
    registros: registros || [],
    entregaveis: entregaveis || [],
  };
}

function mapRegistro(r) {
  return {
    id: r.ID,
    data: dataIso(r.DATA),
    etapa: r.ETAPA,
    rotulo: r.ROTULO || "",
    titulo: r.TITULO || "",
    texto: r.TEXTO || "",
    cor: r.COR || "",
    ordem: Number(r.ORDEM) || 0,
  };
}

/** Lançamentos datados da cronologia. Lista ausente não altera o que está salvo. */
export function normalizarRegistros(entrada) {
  if (!Array.isArray(entrada)) return { registros: null };
  if (entrada.length > 80) return { error: "No máximo 80 registros por projeto." };
  const registros = [];
  for (const item of entrada) {
    const titulo = texto(item && item.titulo, 120);
    const data = dataSql(item && item.data);
    const etapa = String((item && item.etapa) || "").trim();
    const rotulo = texto(item && item.rotulo, 80);
    const descricao = texto(item && item.texto, 500);
    if (!titulo && !data && !etapa && !rotulo && !descricao) continue;
    if (data === undefined || !data) return { error: "Informe a data do registro." };
    if (!titulo) return { error: "Informe o título do registro." };
    if (!ETAPAS.has(etapa)) return { error: "Etapa do registro inválida." };
    if (etapa === "outro" && !rotulo) return { error: "Informe o nome da etapa." };
    const cor = String((item && item.cor) || "").trim().toLowerCase();
    const id = Number(item.id) || 0;
    registros.push({
      id: id > 0 ? id : 0,
      data,
      iso: String(item.data).slice(0, 10),
      etapa,
      rotulo: etapa === "outro" ? rotulo : null,
      titulo,
      texto: descricao,
      cor: etapa === "outro" && CORES.has(cor) ? cor : null,
    });
  }
  registros.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return { registros };
}

function mapAcao(r) {
  return {
    id: r.ID,
    texto: r.TEXTO || "",
    nivel: Number(r.NIVEL) || 1,
    feito: !!r.FEITO,
    prioridadeAlta: !!r.PRIORIDADE_ALTA,
    atrasado: !!r.ATRASADO,
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
      feito: bit(item.feito),
      prioridadeAlta: bit(item.prioridadeAlta),
      atrasado: bit(item.atrasado),
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
        SELECT ID, PROJETO_ID, TEXTO, NIVEL, FEITO, PRIORIDADE_ALTA, ATRASADO, ORDEM
        FROM dbo.GPR_PROJETO_ACAO
        WHERE PROJETO_ID=@pid
        ORDER BY ORDEM, ID
      `);
  } else {
    result = await pedido.query(`
      SELECT ID, PROJETO_ID, TEXTO, NIVEL, FEITO, PRIORIDADE_ALTA, ATRASADO, ORDEM
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
        .input("pri", sql.Bit, a.prioridadeAlta)
        .input("atr", sql.Bit, a.atrasado)
        .input("ordem", sql.Int, i)
        .query(`
          UPDATE dbo.GPR_PROJETO_ACAO
          SET TEXTO=@texto, NIVEL=@nivel, FEITO=@feito, PRIORIDADE_ALTA=@pri, ATRASADO=@atr, ORDEM=@ordem
          WHERE ID=@id AND PROJETO_ID=@pid
        `);
    } else {
      await new sql.Request(transaction)
        .input("pid", sql.Int, projetoId)
        .input("texto", sql.NVarChar(300), a.texto)
        .input("nivel", sql.TinyInt, a.nivel)
        .input("feito", sql.Bit, a.feito)
        .input("pri", sql.Bit, a.prioridadeAlta)
        .input("atr", sql.Bit, a.atrasado)
        .input("ordem", sql.Int, i)
        .query(`
          INSERT INTO dbo.GPR_PROJETO_ACAO (PROJETO_ID, TEXTO, NIVEL, FEITO, PRIORIDADE_ALTA, ATRASADO, ORDEM)
          VALUES (@pid, @texto, @nivel, @feito, @pri, @atr, @ordem)
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

async function lerMapaRegistros(conn, projetoId) {
  const pedido = new sql.Request(conn);
  let result;
  if (projetoId) {
    result = await pedido
      .input("pid", sql.Int, projetoId)
      .query(`
        SELECT ID, PROJETO_ID, DATA, ETAPA, ROTULO, TITULO, TEXTO, COR, ORDEM
        FROM dbo.GPR_PROJETO_REGISTRO
        WHERE PROJETO_ID=@pid
        ORDER BY DATA, ORDEM, ID
      `);
  } else {
    result = await pedido.query(`
      SELECT ID, PROJETO_ID, DATA, ETAPA, ROTULO, TITULO, TEXTO, COR, ORDEM
      FROM dbo.GPR_PROJETO_REGISTRO
      ORDER BY PROJETO_ID, DATA, ORDEM, ID
    `);
  }
  const mapa = new Map();
  for (const r of result.recordset || []) {
    const lista = mapa.get(r.PROJETO_ID) || [];
    lista.push(mapRegistro(r));
    mapa.set(r.PROJETO_ID, lista);
  }
  return mapa;
}

async function gravarRegistros(transaction, projetoId, registros) {
  const atuais = await new sql.Request(transaction)
    .input("pid", sql.Int, projetoId)
    .query(`SELECT ID FROM dbo.GPR_PROJETO_REGISTRO WHERE PROJETO_ID=@pid`);
  const idsAtuais = new Set((atuais.recordset || []).map((r) => r.ID));
  const mantidos = new Set();
  for (let i = 0; i < registros.length; i++) {
    const item = registros[i];
    if (item.id && idsAtuais.has(item.id)) {
      mantidos.add(item.id);
      await new sql.Request(transaction)
        .input("id", sql.Int, item.id)
        .input("pid", sql.Int, projetoId)
        .input("data", sql.Date, item.data)
        .input("etapa", sql.NVarChar(20), item.etapa)
        .input("rotulo", sql.NVarChar(80), item.rotulo)
        .input("titulo", sql.NVarChar(120), item.titulo)
        .input("texto", sql.NVarChar(500), item.texto)
        .input("cor", sql.NVarChar(7), item.cor)
        .input("ordem", sql.Int, i)
        .query(`
          UPDATE dbo.GPR_PROJETO_REGISTRO
          SET DATA=@data, ETAPA=@etapa, ROTULO=@rotulo, TITULO=@titulo, TEXTO=@texto, COR=@cor, ORDEM=@ordem
          WHERE ID=@id AND PROJETO_ID=@pid
        `);
    } else {
      await new sql.Request(transaction)
        .input("pid", sql.Int, projetoId)
        .input("data", sql.Date, item.data)
        .input("etapa", sql.NVarChar(20), item.etapa)
        .input("rotulo", sql.NVarChar(80), item.rotulo)
        .input("titulo", sql.NVarChar(120), item.titulo)
        .input("texto", sql.NVarChar(500), item.texto)
        .input("cor", sql.NVarChar(7), item.cor)
        .input("ordem", sql.Int, i)
        .query(`
          INSERT INTO dbo.GPR_PROJETO_REGISTRO (PROJETO_ID, DATA, ETAPA, ROTULO, TITULO, TEXTO, COR, ORDEM)
          VALUES (@pid, @data, @etapa, @rotulo, @titulo, @texto, @cor, @ordem)
        `);
    }
  }
  for (const id of idsAtuais) {
    if (mantidos.has(id)) continue;
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("pid", sql.Int, projetoId)
      .query(`DELETE FROM dbo.GPR_PROJETO_REGISTRO WHERE ID=@id AND PROJETO_ID=@pid`);
  }
}

function inteiro(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function mapEntregavel(r) {
  return {
    id: r.ID,
    tipo: r.TIPO,
    nome: r.NOME_ARQUIVO || "",
    mime: r.MIME || "",
    tamanho: Number(r.TAMANHO) || 0,
    url: r.URL || "",
    criadoEm: r.CRIADO_EM || null,
    criadoPor: r.CRIADO_POR || "",
  };
}

/** Link de um PDF grande. O arquivo em si não entra no banco. */
export function normalizarLinkEntregavel(valor, nomeInformado) {
  const bruto = String(valor || "").trim();
  if (!bruto) return { erro: "Cole o link do PDF." };
  if (bruto.length > 2000) return { erro: "O link passa de 2000 caracteres." };
  let u;
  try {
    u = new URL(bruto);
  } catch (_) {
    return { erro: "Link inválido." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { erro: "O link precisa começar com http ou https." };
  }
  const url = u.toString();
  let nome = texto(nomeInformado, 200);
  if (!nome) {
    let base = "";
    try {
      base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    } catch (_) {
      base = u.pathname.split("/").filter(Boolean).pop() || "";
    }
    nome = /\.pdf$/i.test(base) ? base.slice(0, 200) : (u.hostname || "PDF").slice(0, 200);
  }
  return { url, nome };
}

async function lerMapaEntregaveis(conn, projetoId) {
  const pedido = new sql.Request(conn);
  let result;
  if (projetoId) {
    result = await pedido
      .input("pid", sql.Int, projetoId)
      .query(`
        SELECT ID, PROJETO_ID, TIPO, NOME_ARQUIVO, MIME, TAMANHO, URL,
          CONVERT(VARCHAR(16), CRIADO_EM, 120) AS CRIADO_EM, CRIADO_POR
        FROM dbo.GPR_PROJETO_ENTREGAVEL
        WHERE PROJETO_ID=@pid
        ORDER BY ID
      `);
  } else {
    result = await pedido.query(`
      SELECT ID, PROJETO_ID, TIPO, NOME_ARQUIVO, MIME, TAMANHO, URL,
        CONVERT(VARCHAR(16), CRIADO_EM, 120) AS CRIADO_EM, CRIADO_POR
      FROM dbo.GPR_PROJETO_ENTREGAVEL
      ORDER BY PROJETO_ID, ID
    `);
  }
  const mapa = new Map();
  for (const r of result.recordset || []) {
    const lista = mapa.get(r.PROJETO_ID) || [];
    lista.push(mapEntregavel(r));
    mapa.set(r.PROJETO_ID, lista);
  }
  return mapa;
}

export function decodificarEntregavel(data) {
  if (!data || typeof data !== "string") return { erro: "Arquivo vazio." };
  const virgula = data.indexOf(",");
  const raw = data.startsWith("data:") && virgula >= 0 ? data.slice(virgula + 1) : data;
  const limpo = raw.replace(/\s/g, "");
  if (!limpo) return { erro: "Arquivo vazio." };
  if (limpo.length > Math.ceil(MAX_ENTREGAVEL / 3) * 4) {
    return { erro: "Anexo maior que 3 MB. Reduza o arquivo antes de enviar." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpo) || limpo.length % 4 !== 0) {
    return { erro: "Arquivo inválido." };
  }
  const buf = Buffer.from(limpo, "base64");
  if (!buf.length) return { erro: "Arquivo vazio." };
  if (buf.length > MAX_ENTREGAVEL) return { erro: "Anexo maior que 3 MB. Reduza o arquivo antes de enviar." };
  return { buf };
}

function detectarArquivo(buf) {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { tipo: "PDF", mime: "application/pdf" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { tipo: "IMAGEM", mime: "image/jpeg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { tipo: "IMAGEM", mime: "image/png" };
  }
  if (buf.length >= 6 && buf.slice(0, 4).toString("ascii") === "GIF8") {
    return { tipo: "IMAGEM", mime: "image/gif" };
  }
  if (
    buf.length >= 12
    && buf.slice(0, 4).toString("ascii") === "RIFF"
    && buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return { tipo: "IMAGEM", mime: "image/webp" };
  }
  return null;
}

function extensaoArquivo(nome) {
  const base = String(nome || "").split(/[/\\]/).pop() || "";
  const ponto = base.lastIndexOf(".");
  if (ponto <= 0) return "";
  return base.slice(ponto + 1).toLowerCase();
}

export function classificarEntregavel(buf, mimeInformado, nome) {
  const detectado = detectarArquivo(buf);
  if (!detectado) {
    return { erro: "Envie um PDF ou uma imagem JPG, PNG, GIF ou WEBP." };
  }
  const mime = String(mimeInformado || "").toLowerCase().split(";")[0].trim();
  if (mime && mime !== "application/octet-stream") {
    const esperado = MIME_POR_TIPO[mime];
    if (!esperado || esperado !== detectado.mime) {
      return { erro: "O tipo informado não corresponde ao arquivo." };
    }
  }
  const ext = extensaoArquivo(nome);
  const extImagem = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  if (ext) {
    if (detectado.tipo === "PDF" && ext !== "pdf") return { erro: "O arquivo não é um PDF." };
    if (detectado.tipo === "IMAGEM" && extImagem[ext] !== detectado.mime) {
      return { erro: "A extensão não corresponde à imagem." };
    }
  }
  return detectado;
}

function nomeArquivo(nome, mime) {
  const base = String(nome || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ()\u00C0-\u024F]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 200);
  if (base) return base;
  const ext = mime === "application/pdf" ? "pdf"
    : mime === "image/png" ? "png"
      : mime === "image/gif" ? "gif"
        : mime === "image/webp" ? "webp"
          : "jpg";
  return `entregavel.${ext}`;
}

function disposicaoInline(nome) {
  const bruto = String(nome || "entregavel").replace(/[\r\n]/g, "").slice(0, 180);
  const ascii = bruto.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "entregavel";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(bruto)}`;
}

async function responderEntregaveis(res, pool, id) {
  const mapa = await lerMapaEntregaveis(pool, id);
  return res.json({ success: true, entregaveis: mapa.get(id) || [] });
}

async function gravarEntregavel(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Salve o projeto antes de anexar." });
  const dec = decodificarEntregavel(body.data);
  if (dec.erro) return res.status(400).json({ success: false, error: dec.erro });
  const arq = classificarEntregavel(dec.buf, body.mime, body.nome);
  if (arq.erro) return res.status(400).json({ success: false, error: arq.erro });
  const nome = nomeArquivo(body.nome, arq.mime);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT ID FROM dbo.GPR_PROJETO WITH (UPDLOCK, HOLDLOCK) WHERE ID=@id`);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    const contagem = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TIPO, COUNT(*) AS QTD
        FROM dbo.GPR_PROJETO_ENTREGAVEL
        WHERE PROJETO_ID=@id
        GROUP BY TIPO
      `);
    const nums = contarEntregaveis(contagem.recordset);
    const pdfs = nums.pdfs;
    const imagens = nums.imagens;
    if (pdfs + imagens >= MAX_ENTREGAVEIS) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este projeto já tem 12 entregáveis." });
    }
    if (arq.tipo === "PDF" && pdfs >= MAX_PDF) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este projeto já tem 5 PDFs." });
    }
    if (arq.tipo === "IMAGEM" && imagens >= MAX_IMAGEM) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este projeto já tem 10 fotos." });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("tipo", sql.NVarChar(20), arq.tipo)
      .input("nome", sql.NVarChar(255), nome)
      .input("mime", sql.NVarChar(80), arq.mime)
      .input("conteudo", sql.VarBinary(sql.MAX), dec.buf)
      .input("tamanho", sql.Int, dec.buf.length)
      .input("quem", sql.NVarChar(100), autor(req))
      .query(`
        INSERT INTO dbo.GPR_PROJETO_ENTREGAVEL
          (PROJETO_ID, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_POR)
        VALUES
          (@id, @tipo, @nome, @mime, @conteudo, @tamanho, @quem)
      `);
    await transaction.commit();
    return responderEntregaveis(res, pool, id);
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

function contarEntregaveis(rows) {
  let pdfs = 0;
  let imagens = 0;
  let links = 0;
  for (const row of rows || []) {
    if (row.TIPO === "PDF") pdfs = Number(row.QTD) || 0;
    if (row.TIPO === "IMAGEM") imagens = Number(row.QTD) || 0;
    if (row.TIPO === "LINK") links = Number(row.QTD) || 0;
  }
  return { pdfs, imagens, links };
}

async function gravarLinkEntregavel(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Salve o projeto antes de anexar." });
  const link = normalizarLinkEntregavel(body.url, body.nome);
  if (link.erro) return res.status(400).json({ success: false, error: link.erro });

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT ID FROM dbo.GPR_PROJETO WITH (UPDLOCK, HOLDLOCK) WHERE ID=@id`);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    const contagem = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TIPO, COUNT(*) AS QTD
        FROM dbo.GPR_PROJETO_ENTREGAVEL
        WHERE PROJETO_ID=@id
        GROUP BY TIPO
      `);
    if (contarEntregaveis(contagem.recordset).links >= MAX_LINKS) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este projeto já tem 10 links." });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("nome", sql.NVarChar(255), link.nome)
      .input("url", sql.NVarChar(2000), link.url)
      .input("quem", sql.NVarChar(100), autor(req))
      .query(`
        INSERT INTO dbo.GPR_PROJETO_ENTREGAVEL
          (PROJETO_ID, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, URL, CRIADO_POR)
        VALUES
          (@id, N'LINK', @nome, N'text/uri-list', 0x, 0, @url, @quem)
      `);
    await transaction.commit();
    return responderEntregaveis(res, pool, id);
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function excluirEntregavel(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id || req.query.id);
  const entregavelId = inteiro(body.entregavelId || req.query.entregavelId);
  if (!id || !entregavelId) return res.status(400).json({ success: false, error: "Informe o entregável." });

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT ID FROM dbo.GPR_PROJETO WITH (UPDLOCK, HOLDLOCK) WHERE ID=@id`);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    const apagado = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("eid", sql.Int, entregavelId)
      .query(`DELETE FROM dbo.GPR_PROJETO_ENTREGAVEL WHERE PROJETO_ID=@id AND ID=@eid`);
    if (!apagado.rowsAffected[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Entregável não encontrado." });
    }
    await transaction.commit();
    return responderEntregaveis(res, pool, id);
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function baixarEntregavel(req, res, pool) {
  const id = inteiro(req.query.id);
  const entregavelId = inteiro(req.query.entregavelId);
  if (!id || !entregavelId) return res.status(400).json({ success: false, error: "Informe o entregável." });
  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("eid", sql.Int, entregavelId)
    .query(`
      SELECT MIME, NOME_ARQUIVO, CONTEUDO, TIPO
      FROM dbo.GPR_PROJETO_ENTREGAVEL
      WHERE PROJETO_ID=@id AND ID=@eid
    `);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Entregável não encontrado." });
  }
  const row = result.recordset[0];
  if (row.TIPO === "LINK") {
    return res.status(400).json({ success: false, error: "Este entregável é um link. Abra o endereço direto." });
  }
  const buf = Buffer.isBuffer(row.CONTEUDO) ? row.CONTEUDO : Buffer.from(row.CONTEUDO);
  res.setHeader("Content-Type", row.MIME || "application/octet-stream");
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Content-Disposition", disposicaoInline(row.NOME_ARQUIVO));
  res.setHeader("Cache-Control", "private, max-age=120");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(buf);
}

function autor(req) {
  const nome = req.body && req.body.usuario;
  if (nome) return String(nome).trim().slice(0, 100) || "SGC";
  return usuarioDoRequest(req) || "SGC";
}

async function listar(req, res, pool) {
  const result = await pool.request().query(`
    SELECT ID, NOME, DESCRICAO, RESPONSAVEL, PRAZO, DATA_CADASTRO, DATA_INICIO, STATUS, PRIORIDADE_ALTA, ATRASADO, ORDEM, CRIADO_EM, CRIADO_POR
    FROM dbo.GPR_PROJETO
    ORDER BY
      CASE STATUS WHEN N'A FAZER' THEN 0 WHEN N'EM ANDAMENTO' THEN 1 WHEN N'CONCLUIDO' THEN 2 WHEN N'PAUSADO' THEN 3 WHEN N'CANCELADO' THEN 4 ELSE 5 END,
      ORDEM, ID
  `);
  const mapa = await lerMapaAcoes(pool);
  const regs = await lerMapaRegistros(pool);
  const ents = await lerMapaEntregaveis(pool);
  return res.json({
    success: true,
    projetos: (result.recordset || []).map((r) => mapRow(
      r,
      mapa.get(r.ID) || [],
      regs.get(r.ID) || [],
      ents.get(r.ID) || [],
    )),
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
  const cadastro = dataSql(req.body.cadastro);
  if (cadastro === undefined) return res.status(400).json({ success: false, error: "Data de cadastro inválida." });
  const inicio = dataSql(req.body.inicio);
  if (inicio === undefined) return res.status(400).json({ success: false, error: "Data de início inválida." });
  const fimBruto = req.body.fim !== undefined ? req.body.fim : req.body.prazo;
  const fim = dataSql(fimBruto);
  if (fim === undefined) return res.status(400).json({ success: false, error: "Data de fim inválida." });
  const isoInicio = inicio ? String(req.body.inicio).slice(0, 10) : "";
  const isoFim = fim ? String(fimBruto).slice(0, 10) : "";
  if (isoInicio && isoFim && isoInicio > isoFim) {
    return res.status(400).json({ success: false, error: "A data de início é maior que a de fim." });
  }
  const descricao = texto(req.body.descricao, 1000);
  const responsavel = texto(req.body.responsavel, 100);
  const prioridadeAlta = bit(req.body.prioridadeAlta);
  const usuario = autor(req);
  const norm = normalizarAcoes(req.body.acoes);
  if (norm.error) return res.status(400).json({ success: false, error: norm.error });
  const normReg = normalizarRegistros(req.body.registros);
  if (normReg.error) return res.status(400).json({ success: false, error: normReg.error });

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
        .input("prazo", sql.Date, fim)
        .input("cadastro", sql.Date, cadastro)
        .input("inicio", sql.Date, inicio)
        .input("st", sql.NVarChar(30), status)
        .input("pri", sql.Bit, prioridadeAlta)
        .input("ordem", sql.Int, ordem)
        .input("user", sql.NVarChar(100), usuario)
        .query(`
          INSERT INTO dbo.GPR_PROJETO
            (NOME, DESCRICAO, RESPONSAVEL, PRAZO, DATA_CADASTRO, DATA_INICIO, STATUS, PRIORIDADE_ALTA, ORDEM, CRIADO_POR)
          OUTPUT INSERTED.ID, INSERTED.NOME, INSERTED.DESCRICAO, INSERTED.RESPONSAVEL, INSERTED.PRAZO,
                 INSERTED.DATA_CADASTRO, INSERTED.DATA_INICIO, INSERTED.STATUS, INSERTED.PRIORIDADE_ALTA,
                 INSERTED.ATRASADO, INSERTED.ORDEM, INSERTED.CRIADO_EM, INSERTED.CRIADO_POR
          VALUES (@nome, @desc, @resp, @prazo, ISNULL(@cadastro, CAST(GETDATE() AS date)), @inicio, @st, @pri, @ordem, @user)
        `);
      row = ins.recordset[0];
      criado = true;
    } else {
      const upd = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("nome", sql.NVarChar(160), nome)
        .input("desc", sql.NVarChar(1000), descricao)
        .input("resp", sql.NVarChar(100), responsavel)
        .input("prazo", sql.Date, fim)
        .input("cadastro", sql.Date, cadastro)
        .input("inicio", sql.Date, inicio)
        .input("st", sql.NVarChar(30), status)
        .input("pri", sql.Bit, prioridadeAlta)
        .query(`
          UPDATE dbo.GPR_PROJETO
          SET NOME=@nome, DESCRICAO=@desc, RESPONSAVEL=@resp, PRAZO=@prazo, DATA_CADASTRO=@cadastro,
              DATA_INICIO=@inicio, STATUS=@st, PRIORIDADE_ALTA=@pri, ATUALIZADO_EM=GETDATE()
          OUTPUT INSERTED.ID, INSERTED.NOME, INSERTED.DESCRICAO, INSERTED.RESPONSAVEL, INSERTED.PRAZO,
                 INSERTED.DATA_CADASTRO, INSERTED.DATA_INICIO, INSERTED.STATUS, INSERTED.PRIORIDADE_ALTA,
                 INSERTED.ATRASADO, INSERTED.ORDEM, INSERTED.CRIADO_EM, INSERTED.CRIADO_POR
          WHERE ID=@id
        `);
      if (!upd.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Projeto não encontrado." });
      }
      row = upd.recordset[0];
    }
    if (norm.acoes) await gravarAcoes(transaction, row.ID, norm.acoes);
    if (normReg.registros) await gravarRegistros(transaction, row.ID, normReg.registros);
    const mapa = await lerMapaAcoes(transaction, row.ID);
    const regs = await lerMapaRegistros(transaction, row.ID);
    const ents = await lerMapaEntregaveis(transaction, row.ID);
    await transaction.commit();
    const projeto = mapRow(row, mapa.get(row.ID) || [], regs.get(row.ID) || [], ents.get(row.ID) || []);
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
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.GPR_PROJETO_REGISTRO WHERE PROJETO_ID=@id`);
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.GPR_PROJETO_ENTREGAVEL WHERE PROJETO_ID=@id`);
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
