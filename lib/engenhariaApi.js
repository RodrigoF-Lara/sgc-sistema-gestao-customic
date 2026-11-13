import { getConnection, sql } from "../db.js";
import { exigirPermissao, nivelDoRequest, podeAcessar, usuarioDoRequest } from "./permissoesHelper.js";
import { seedPermissaoEngenharia } from "./permissoesApi.js";
import { anoKardex } from "./kardex.js";
import { dxfCartucho, lerMmVinco } from "./facaCartucho.js";
import { FAMILIAS, facaEstudo } from "./facaFamilia.js";
import { imposicaoEstudo } from "./imposicaoEstudo.js";

const LINK = "engenharia-embalagens";
const LINK_EDITAR = "engenharia-embalagens-editar";
const LINK_APROVAR = "engenharia-embalagens-aprovar";
const STATUS = new Set(["RASCUNHO", "APROVADO"]);
const ORIGENS = new Set(["PARAMETRICO", "ARQUIVO"]);
const FAMILIA_OK = new Set(FAMILIAS);
const MAX_ANEXO = 3 * 1024 * 1024;
const PRECOS_BASE = [
  ["Papel", "Papel cartão", "R$/m²"],
  ["Papel", "Papel cartão", "R$/kg"],
  ["Impressão", "Offset acerto", "R$/ordem"],
  ["Impressão", "Offset variável", "R$/mil folhas"],
  ["Acabamento", "Laminação", "R$/m²"],
  ["Acabamento", "Verniz", "R$/m²"],
  ["Acabamento", "Janela", "R$/mil"],
  ["Conversão", "Corte e vinco", "R$/mil"],
  ["Conversão", "Colagem", "R$/mil"],
  ["Papel", "Microondulado", "R$/m²"],
  ["Acabamento", "Hot stamp", "R$/mil"],
  ["Acabamento", "Relevo", "R$/mil"],
  ["Conversão", "Frete", "R$/ordem"],
  ["Conversão", "Faca e matriz", "R$/ordem"],
  ["Perdas", "Perda técnica", "%"],
];

let tablesReady = false;

export async function handleEngenharia(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);
    if (!(await exigirPermissao(req, res, LINK, "Sem permissão para desenvolvimento de embalagens."))) return;

    if (req.method === "GET" && (acao === "" || acao === "listar")) return await listar(req, res, pool);
    if (req.method === "GET" && acao === "detalhe") return await detalhe(req, res, pool);
    if (req.method === "GET" && acao === "geometria") return await geometria(req, res, pool);
    if (req.method === "GET" && acao === "dxf") return await dxfRota(req, res, pool);
    if (req.method === "GET" && acao === "produtos") return await buscarProdutos(req, res, pool);
    if (req.method === "GET" && acao === "produto") return await buscarProduto(req, res, pool);
    if (req.method === "GET" && acao === "precos") return await listarPrecos(req, res, pool);
    if (req.method === "GET" && acao === "saldo") return await saldoRota(req, res, pool);
    if (req.method === "GET" && acao === "anexo") return await baixarAnexo(req, res, pool);
    if (req.method === "POST" && acao === "aprovar") {
      if (!(await exigirPermissao(req, res, LINK_APROVAR, "Sem permissão para aprovar desenvolvimento de embalagens."))) return;
      return await aprovar(req, res, pool);
    }
    if (req.method === "POST" && acao === "estimar") return await estimarRota(req, res, pool);
    const edita = req.method === "DELETE" || (req.method === "POST" && [
      "salvar", "novaVersao", "precos", "anexo", "excluirAnexo", "excluir", "duplicar", "enviarOrcamento",
    ].includes(acao));
    if (edita && !(await exigirPermissao(req, res, LINK_EDITAR, "Sem permissão para editar desenvolvimento de embalagens."))) return;
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "novaVersao") return await novaVersao(req, res, pool);
    if (req.method === "POST" && acao === "duplicar") return await duplicar(req, res, pool);
    if (req.method === "POST" && acao === "enviarOrcamento") return await enviarOrcamento(req, res, pool);
    if (req.method === "POST" && acao === "precos") return await salvarPrecos(req, res, pool);
    if (req.method === "POST" && acao === "anexo") return await gravarAnexo(req, res, pool);
    if (req.method === "POST" && acao === "excluirAnexo") return await excluirAnexo(req, res, pool);
    if ((req.method === "POST" && acao === "excluir") || req.method === "DELETE") {
      return await excluir(req, res, pool);
    }
    return res.status(400).json({ success: false, error: "Ação inválida." });
  } catch (err) {
    console.error("[engenharia]", err);
    return res.status(500).json({ success: false, error: "Não foi possível concluir a operação de engenharia." });
  }
}

async function ensureTables(pool) {
  if (!tablesReady) {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.EMB_ENG_PROJETO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_PROJETO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          SKU NVARCHAR(100) NOT NULL,
          TITULO NVARCHAR(120) NOT NULL,
          CLIENTE NVARCHAR(120) NULL,
          FAMILIA NVARCHAR(40) NOT NULL CONSTRAINT DF_EMB_ENG_FAM DEFAULT (N'CARTUCHO'),
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ENG_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL
        );
        CREATE INDEX IX_EMB_ENG_SKU ON dbo.EMB_ENG_PROJETO (SKU, ID DESC);
      END;

      IF OBJECT_ID(N'dbo.EMB_ENG_VERSAO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_VERSAO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          PROJETO_ID INT NOT NULL,
          NUMERO INT NOT NULL,
          STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_EMB_ENG_VER_ST DEFAULT (N'RASCUNHO'),
          ORIGEM NVARCHAR(20) NOT NULL,
          COMPRIMENTO DECIMAL(18,2) NOT NULL,
          LARGURA DECIMAL(18,2) NOT NULL,
          ALTURA DECIMAL(18,2) NOT NULL,
          ESPESSURA DECIMAL(18,2) NULL,
          FOLHA_LARGURA DECIMAL(18,2) NOT NULL,
          FOLHA_ALTURA DECIMAL(18,2) NOT NULL,
          MATERIAL NVARCHAR(80) NULL,
          GRAMATURA DECIMAL(18,2) NULL,
          IMPRESSAO NVARCHAR(40) NULL,
          PANTONE NVARCHAR(200) NULL,
          LAMINACAO BIT NOT NULL CONSTRAINT DF_EMB_ENG_LAM DEFAULT (0),
          VERNIZ BIT NOT NULL CONSTRAINT DF_EMB_ENG_VERNZ DEFAULT (0),
          JANELA BIT NOT NULL CONSTRAINT DF_EMB_ENG_JAN DEFAULT (0),
          OBSERVACAO NVARCHAR(1000) NULL,
          QUANTIDADE INT NOT NULL CONSTRAINT DF_EMB_ENG_QTD DEFAULT (1000),
          POSES INT NOT NULL CONSTRAINT DF_EMB_ENG_POSES DEFAULT (1),
          PERDA DECIMAL(9,2) NULL,
          SANGRIA DECIMAL(9,2) NULL,
          MAQUINA_LARGURA DECIMAL(9,2) NULL,
          MAQUINA_ALTURA DECIMAL(9,2) NULL,
          FIBRA NVARCHAR(20) NULL,
          COMPENSACAO DECIMAL(9,2) NULL,
          FAMILIA NVARCHAR(40) NULL,
          MICROONDULADO BIT NOT NULL CONSTRAINT DF_EMB_ENG_MICRO DEFAULT (0),
          HOTSTAMP BIT NOT NULL CONSTRAINT DF_EMB_ENG_HOT DEFAULT (0),
          RELEVO BIT NOT NULL CONSTRAINT DF_EMB_ENG_REL DEFAULT (0),
          FRETE BIT NOT NULL CONSTRAINT DF_EMB_ENG_FRETE DEFAULT (0),
          FACA_MATRIZ BIT NOT NULL CONSTRAINT DF_EMB_ENG_FACA DEFAULT (0),
          APROVACAO_OBS NVARCHAR(500) NULL,
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ENG_VER_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          APROVADO_EM DATETIME NULL,
          APROVADO_POR NVARCHAR(100) NULL,
          CONSTRAINT FK_EMB_ENG_VER_PROJ FOREIGN KEY (PROJETO_ID)
            REFERENCES dbo.EMB_ENG_PROJETO (ID) ON DELETE CASCADE,
          CONSTRAINT UQ_EMB_ENG_VER UNIQUE (PROJETO_ID, NUMERO),
          CONSTRAINT CK_EMB_ENG_VER_ST CHECK (STATUS IN (N'RASCUNHO', N'APROVADO')),
          CONSTRAINT CK_EMB_ENG_VER_ORIG CHECK (ORIGEM IN (N'PARAMETRICO', N'ARQUIVO'))
        );
        CREATE INDEX IX_EMB_ENG_VER_PROJ ON dbo.EMB_ENG_VERSAO (PROJETO_ID, NUMERO DESC);
      END;

      IF OBJECT_ID(N'dbo.EMB_ENG_ANEXO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_ANEXO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          VERSAO_ID INT NOT NULL,
          USO NVARCHAR(20) NOT NULL,
          TIPO NVARCHAR(20) NOT NULL,
          NOME_ARQUIVO NVARCHAR(255) NOT NULL,
          MIME NVARCHAR(80) NOT NULL,
          CONTEUDO VARBINARY(MAX) NOT NULL,
          TAMANHO INT NOT NULL,
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ENG_ANX_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          CONSTRAINT FK_EMB_ENG_ANX_VER FOREIGN KEY (VERSAO_ID)
            REFERENCES dbo.EMB_ENG_VERSAO (ID) ON DELETE CASCADE,
          CONSTRAINT CK_EMB_ENG_ANX_USO CHECK (USO IN (N'FACA', N'ARTE', N'VERNIZ', N'OUTRO')),
          CONSTRAINT CK_EMB_ENG_ANX_TIPO CHECK (TIPO IN (N'PDF', N'SVG', N'IMAGEM')),
          CONSTRAINT CK_EMB_ENG_ANX_TAM CHECK (TAMANHO > 0 AND TAMANHO <= 3145728)
        );
        CREATE INDEX IX_EMB_ENG_ANX_VER ON dbo.EMB_ENG_ANEXO (VERSAO_ID, ID);
      END;

      IF OBJECT_ID(N'dbo.EMB_ENG_PRECO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_PRECO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          GRUPO NVARCHAR(40) NOT NULL,
          ITEM NVARCHAR(80) NOT NULL,
          UNIDADE NVARCHAR(30) NOT NULL,
          PRECO DECIMAL(18,4) NULL,
          QTD_MIN INT NULL,
          VALIDADE DATE NULL,
          FORNECEDOR NVARCHAR(120) NULL,
          IMPOSTO DECIMAL(9,2) NULL,
          ATUALIZADO_EM DATETIME NULL,
          ATUALIZADO_POR NVARCHAR(100) NULL,
          CONSTRAINT UQ_EMB_ENG_PRECO UNIQUE (GRUPO, ITEM, UNIDADE, QTD_MIN)
        );
      END;

      IF OBJECT_ID(N'dbo.EMB_ENG_CONFIG', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_CONFIG (
          CHAVE NVARCHAR(40) NOT NULL PRIMARY KEY,
          VALOR NVARCHAR(40) NULL
        );
      END;

      IF OBJECT_ID(N'dbo.EMB_ENG_NECESSIDADE', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ENG_NECESSIDADE (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          PROJETO_ID INT NOT NULL,
          VERSAO_ID INT NOT NULL,
          SKU NVARCHAR(100) NOT NULL,
          QUANTIDADE INT NOT NULL,
          STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_EMB_ENG_NEC_ST DEFAULT (N'ABERTA'),
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ENG_NEC_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          CONSTRAINT FK_EMB_ENG_NEC_PROJ FOREIGN KEY (PROJETO_ID)
            REFERENCES dbo.EMB_ENG_PROJETO (ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_EMB_ENG_NEC_PROJ ON dbo.EMB_ENG_NECESSIDADE (PROJETO_ID, STATUS, ID DESC);
      END;

      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'SANGRIA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD SANGRIA DECIMAL(9,2) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'MAQUINA_LARGURA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD MAQUINA_LARGURA DECIMAL(9,2) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'MAQUINA_ALTURA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD MAQUINA_ALTURA DECIMAL(9,2) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'FIBRA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD FIBRA NVARCHAR(20) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'COMPENSACAO') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD COMPENSACAO DECIMAL(9,2) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'FAMILIA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD FAMILIA NVARCHAR(40) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'MICROONDULADO') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD MICROONDULADO BIT NOT NULL CONSTRAINT DF_EMB_ENG_MICRO DEFAULT (0);
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'HOTSTAMP') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD HOTSTAMP BIT NOT NULL CONSTRAINT DF_EMB_ENG_HOT DEFAULT (0);
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'RELEVO') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD RELEVO BIT NOT NULL CONSTRAINT DF_EMB_ENG_REL DEFAULT (0);
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'FRETE') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD FRETE BIT NOT NULL CONSTRAINT DF_EMB_ENG_FRETE DEFAULT (0);
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'FACA_MATRIZ') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD FACA_MATRIZ BIT NOT NULL CONSTRAINT DF_EMB_ENG_FACA DEFAULT (0);
      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'APROVACAO_OBS') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD APROVACAO_OBS NVARCHAR(500) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_PROJETO', N'ORCAMENTO_ID') IS NULL
        ALTER TABLE dbo.EMB_ENG_PROJETO ADD ORCAMENTO_ID INT NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_PRECO', N'QTD_MIN') IS NULL
        ALTER TABLE dbo.EMB_ENG_PRECO ADD QTD_MIN INT NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_PRECO', N'VALIDADE') IS NULL
        ALTER TABLE dbo.EMB_ENG_PRECO ADD VALIDADE DATE NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_PRECO', N'FORNECEDOR') IS NULL
        ALTER TABLE dbo.EMB_ENG_PRECO ADD FORNECEDOR NVARCHAR(120) NULL;
      IF COL_LENGTH(N'dbo.EMB_ENG_PRECO', N'IMPOSTO') IS NULL
        ALTER TABLE dbo.EMB_ENG_PRECO ADD IMPOSTO DECIMAL(9,2) NULL;
    `);
    await pool.request().query(`
      IF COL_LENGTH(N'dbo.EMB_ENG_PRECO', N'QTD_MIN') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM sys.indexes i
           INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           WHERE i.object_id = OBJECT_ID(N'dbo.EMB_ENG_PRECO')
             AND i.name = N'UQ_EMB_ENG_PRECO'
             AND c.name = N'QTD_MIN'
         )
      BEGIN
        IF EXISTS (
          SELECT 1 FROM sys.key_constraints
          WHERE name = N'UQ_EMB_ENG_PRECO' AND parent_object_id = OBJECT_ID(N'dbo.EMB_ENG_PRECO')
        )
          ALTER TABLE dbo.EMB_ENG_PRECO DROP CONSTRAINT UQ_EMB_ENG_PRECO;
        ALTER TABLE dbo.EMB_ENG_PRECO ADD CONSTRAINT UQ_EMB_ENG_PRECO UNIQUE (GRUPO, ITEM, UNIDADE, QTD_MIN);
      END
    `);
    for (const [grupo, item, unidade] of PRECOS_BASE) {
      await pool.request()
        .input("g", sql.NVarChar(40), grupo)
        .input("i", sql.NVarChar(80), item)
        .input("u", sql.NVarChar(30), unidade)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.EMB_ENG_PRECO
            WHERE GRUPO = @g AND ITEM = @i AND UNIDADE = @u AND QTD_MIN IS NULL
          )
          INSERT INTO dbo.EMB_ENG_PRECO (GRUPO, ITEM, UNIDADE) VALUES (@g, @i, @u);
        `);
    }
    tablesReady = true;
  }
  await seedPermissaoEngenharia(pool);
}

function agoraSaoPaulo() {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const hora = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day} ${hora}:${map.minute}:${map.second}`;
}

function autor(req) {
  const h = req.headers || {};
  let nome = h["x-user-name"] || h["X-User-Name"] || "";
  try { nome = decodeURIComponent(String(nome)); } catch (_) { /* mantém */ }
  const bruto = String((req.body && req.body.usuario) || nome || usuarioDoRequest(req) || "SGC").trim();
  return bruto.slice(0, 100) || "SGC";
}

function texto(valor, max) {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function medida(valor, nome) {
  if (valor == null || valor === "") return { erro: `Informe ${nome}.` };
  const n = Number(typeof valor === "number" ? valor : String(valor).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return { erro: `${nome} inválido.` };
  const v = Math.round(n * 100) / 100;
  if (v < 10 || v > 2000) return { erro: `${nome} deve ficar entre 10 e 2000 mm.` };
  return { valor: v };
}

function medidaOpcional(valor, nome, min, max) {
  if (valor == null || String(valor).trim() === "") return { valor: null };
  const n = Number(typeof valor === "number" ? valor : String(valor).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return { erro: `${nome} inválido.` };
  const v = Math.round(n * 100) / 100;
  if (v < min || v > max) return { erro: `${nome} fora da faixa permitida.` };
  return { valor: v };
}

function flag(valor) {
  return valor === true || valor === 1 || valor === "1" || valor === "true";
}

function lerMaquina(body) {
  const largura = medidaOpcional(body.maquinaLargura, "A largura da folha de máquina", 10, 3000);
  if (largura.erro) return { erro: "A largura da folha de máquina fica entre 10 e 3000 mm." };
  const altura = medidaOpcional(body.maquinaAltura, "A altura da folha de máquina", 10, 3000);
  if (altura.erro) return { erro: "A altura da folha de máquina fica entre 10 e 3000 mm." };
  if ((largura.valor == null) !== (altura.valor == null)) {
    return { erro: "Informe largura e altura da folha de máquina." };
  }
  return { largura: largura.valor, altura: altura.valor };
}

function lerFibra(body) {
  const bruto = String(body.fibra ?? "").trim().toUpperCase();
  if (!bruto) return { valor: null };
  if (bruto !== "LARGURA" && bruto !== "ALTURA") return { erro: "Sentido de fibra inválido." };
  return { valor: bruto };
}

function chavePreco(grupo, item, unidade) {
  return `${grupo}|${item}|${unidade}`;
}

async function permissoesDe(req) {
  const nivel = nivelDoRequest(req);
  return {
    editar: await podeAcessar(LINK_EDITAR, nivel),
    aprovar: await podeAcessar(LINK_APROVAR, nivel),
  };
}

async function lerMmConfig(pool) {
  const result = await pool.request().query(`
    SELECT VALOR FROM dbo.EMB_ENG_CONFIG WHERE CHAVE = N'MM_POR_VINCO'
  `);
  const bruto = result.recordset[0] && result.recordset[0].VALOR;
  return bruto == null || String(bruto).trim() === "" ? null : bruto;
}

async function mmParaBody(pool, body) {
  if (body && Object.prototype.hasOwnProperty.call(body, "compensacao")) {
    return lerMmVinco(body.compensacao);
  }
  return lerMmVinco(await lerMmConfig(pool));
}

function nomeDxf(familia) {
  if (familia === "BANDEJA") return "bandeja-estudo.dxf";
  if (familia === "ENVELOPE") return "envelope-estudo.dxf";
  if (familia === "MICROONDULADO") return "microondulado-estudo.dxf";
  return "cartucho-estudo.dxf";
}

async function geometria(req, res, pool) {
  const q = req.query || {};
  const mm = await mmParaBody(pool, q);
  if (mm.erro) return res.status(400).json({ success: false, error: mm.erro });
  const desenho = facaEstudo(q.familia, q.comprimento, q.largura, q.altura, q.sangria, mm.valor);
  if (desenho.erro) return res.status(400).json({ success: false, error: desenho.erro });
  return res.status(200).json({ success: true, data: desenho });
}

async function dxfRota(req, res, pool) {
  const q = req.query || {};
  const mm = await mmParaBody(pool, q);
  if (mm.erro) return res.status(400).json({ success: false, error: mm.erro });
  const desenho = facaEstudo(q.familia, q.comprimento, q.largura, q.altura, q.sangria, mm.valor);
  if (desenho.erro) return res.status(400).json({ success: false, error: desenho.erro });
  const arquivo = dxfCartucho(desenho);
  const nome = nomeDxf(desenho.familia);
  res.setHeader("Content-Type", "application/dxf");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  return res.status(200).send(arquivo);
}

async function buscarProdutos(req, res, pool) {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) return res.status(200).json({ success: true, data: [] });
  const result = await pool.request()
    .input("q", sql.NVarChar(160), `%${q.slice(0, 80)}%`)
    .query(`
      SELECT TOP 20 CODIGO, DESCRICAO
      FROM dbo.CAD_PROD
      WHERE CODIGO LIKE @q OR DESCRICAO COLLATE Latin1_General_CI_AI LIKE @q
      ORDER BY CODIGO
    `);
  return res.status(200).json({
    success: true,
    data: (result.recordset || []).map((row) => ({ codigo: row.CODIGO, descricao: row.DESCRICAO || "" })),
  });
}

async function buscarProduto(req, res, pool) {
  const codigo = String(req.query.codigo || "").trim();
  if (!codigo) return res.status(400).json({ success: false, error: "Informe o SKU." });
  const result = await pool.request()
    .input("cod", sql.NVarChar(100), codigo.slice(0, 100))
    .query(`SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO = @cod`);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Produto não cadastrado." });
  }
  const row = result.recordset[0];
  return res.status(200).json({ success: true, data: { codigo: row.CODIGO, descricao: row.DESCRICAO || "" } });
}

function mapVersao(row) {
  return {
    id: row.ID,
    projetoId: row.PROJETO_ID,
    numero: row.NUMERO,
    status: row.STATUS,
    origem: row.ORIGEM,
    comprimento: num(row.COMPRIMENTO),
    largura: num(row.LARGURA),
    altura: num(row.ALTURA),
    espessura: row.ESPESSURA == null ? null : num(row.ESPESSURA),
    folhaLargura: num(row.FOLHA_LARGURA),
    folhaAltura: num(row.FOLHA_ALTURA),
    material: row.MATERIAL || "",
    gramatura: row.GRAMATURA == null ? null : num(row.GRAMATURA),
    impressao: row.IMPRESSAO || "",
    pantone: row.PANTONE || "",
    laminacao: !!row.LAMINACAO,
    verniz: !!row.VERNIZ,
    janela: !!row.JANELA,
    observacao: row.OBSERVACAO || "",
    quantidade: row.QUANTIDADE,
    poses: row.POSES,
    perda: row.PERDA == null ? null : num(row.PERDA),
    sangria: row.SANGRIA == null ? null : num(row.SANGRIA),
    maquinaLargura: row.MAQUINA_LARGURA == null ? null : num(row.MAQUINA_LARGURA),
    maquinaAltura: row.MAQUINA_ALTURA == null ? null : num(row.MAQUINA_ALTURA),
    fibra: row.FIBRA || null,
    compensacao: row.COMPENSACAO == null ? null : num(row.COMPENSACAO),
    familia: row.VERSAO_FAMILIA || row.FAMILIA || "CARTUCHO",
    microondulado: !!row.MICROONDULADO,
    hotstamp: !!row.HOTSTAMP,
    relevo: !!row.RELEVO,
    frete: !!row.FRETE,
    facaMatriz: !!row.FACA_MATRIZ,
    aprovacaoObs: row.APROVACAO_OBS || "",
    criadoEm: row.CRIADO_EM || null,
    criadoPor: row.CRIADO_POR || "",
    aprovadoEm: row.APROVADO_EM || null,
    aprovadoPor: row.APROVADO_POR || "",
  };
}

async function listar(req, res, pool) {
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim().toUpperCase();
  if (status && !STATUS.has(status)) return res.status(400).json({ success: false, error: "Status inválido." });
  const pedido = pool.request();
  const where = ["1 = 1"];
  if (q) {
    pedido.input("q", sql.NVarChar(160), `%${q.slice(0, 120)}%`);
    where.push(`(
      p.SKU LIKE @q OR p.TITULO LIKE @q
      OR ISNULL(p.CLIENTE, N'') COLLATE Latin1_General_CI_AI LIKE @q
      OR ISNULL(cp.DESCRICAO, N'') COLLATE Latin1_General_CI_AI LIKE @q
    )`);
  }
  if (status) {
    pedido.input("status", sql.NVarChar(20), status);
    where.push("v.STATUS = @status");
  }
  const result = await pedido.query(`
    SELECT TOP 300
      p.ID, p.SKU, p.TITULO, p.CLIENTE, p.FAMILIA, cp.DESCRICAO,
      v.ID AS VERSAO_ID, v.NUMERO, v.STATUS, v.ORIGEM,
      v.COMPRIMENTO, v.LARGURA, v.ALTURA, v.FOLHA_LARGURA, v.FOLHA_ALTURA,
      CONVERT(varchar(19), ISNULL(v.APROVADO_EM, v.CRIADO_EM), 120) AS QUANDO
    FROM dbo.EMB_ENG_PROJETO p
    OUTER APPLY (
      SELECT TOP 1 *
      FROM dbo.EMB_ENG_VERSAO x
      WHERE x.PROJETO_ID = p.ID
      ORDER BY x.NUMERO DESC
    ) v
    LEFT JOIN dbo.CAD_PROD cp ON cp.CODIGO = p.SKU
    WHERE ${where.join(" AND ")}
    ORDER BY p.ID DESC
  `);
  const permissoes = await permissoesDe(req);
  return res.status(200).json({
    success: true,
    permissoes,
    data: (result.recordset || []).map((row) => ({
      id: row.ID,
      sku: row.SKU,
      titulo: row.TITULO,
      cliente: row.CLIENTE || "",
      descricao: row.DESCRICAO || "",
      familia: row.FAMILIA,
      versaoId: row.VERSAO_ID,
      numero: row.NUMERO,
      status: row.STATUS,
      origem: row.ORIGEM,
      comprimento: num(row.COMPRIMENTO),
      largura: num(row.LARGURA),
      altura: num(row.ALTURA),
      folhaLargura: num(row.FOLHA_LARGURA),
      folhaAltura: num(row.FOLHA_ALTURA),
      quando: row.QUANDO || null,
    })),
  });
}

async function lerVersao(pool, projetoId, numero) {
  const pedido = pool.request().input("id", sql.Int, projetoId);
  if (numero) pedido.input("num", sql.Int, numero);
  const cab = await pedido.query(`
    SELECT p.ID AS PROJETO_ID, p.SKU, p.TITULO, p.CLIENTE, p.FAMILIA, p.ORCAMENTO_ID, p.CRIADO_POR AS PROJETO_POR,
      CONVERT(varchar(19), p.CRIADO_EM, 120) AS PROJETO_EM, cp.DESCRICAO,
      v.ID, v.NUMERO, v.STATUS, v.ORIGEM,
      v.COMPRIMENTO, v.LARGURA, v.ALTURA, v.ESPESSURA, v.FOLHA_LARGURA, v.FOLHA_ALTURA,
      v.MATERIAL, v.GRAMATURA, v.IMPRESSAO, v.PANTONE, v.LAMINACAO, v.VERNIZ, v.JANELA,
      v.OBSERVACAO, v.QUANTIDADE, v.POSES, v.PERDA, v.SANGRIA,
      v.MAQUINA_LARGURA, v.MAQUINA_ALTURA, v.FIBRA, v.COMPENSACAO,
      v.FAMILIA AS VERSAO_FAMILIA, v.MICROONDULADO, v.HOTSTAMP, v.RELEVO, v.FRETE, v.FACA_MATRIZ,
      v.APROVACAO_OBS, v.CRIADO_POR, v.APROVADO_POR,
      CONVERT(varchar(19), v.CRIADO_EM, 120) AS CRIADO_EM,
      CONVERT(varchar(19), v.APROVADO_EM, 120) AS APROVADO_EM
    FROM dbo.EMB_ENG_PROJETO p
    LEFT JOIN dbo.CAD_PROD cp ON cp.CODIGO = p.SKU
    OUTER APPLY (
      SELECT TOP 1 * FROM dbo.EMB_ENG_VERSAO x
      WHERE x.PROJETO_ID = p.ID ${numero ? "AND x.NUMERO = @num" : ""}
      ORDER BY x.NUMERO DESC
    ) v
    WHERE p.ID = @id
  `);
  if (!cab.recordset.length) return null;
  const row = cab.recordset[0];
  if (!row.ID) return { projeto: row, versao: null, historico: [], anexos: [] };
  const historico = await pool.request()
    .input("id", sql.Int, projetoId)
    .query(`
      SELECT NUMERO, STATUS, ORIGEM, CONVERT(varchar(19), CRIADO_EM, 120) AS CRIADO_EM, CRIADO_POR
      FROM dbo.EMB_ENG_VERSAO WHERE PROJETO_ID = @id ORDER BY NUMERO
    `);
  const anexos = await pool.request()
    .input("vid", sql.Int, row.ID)
    .query(`
      SELECT ID, USO, TIPO, NOME_ARQUIVO, MIME, TAMANHO,
        CONVERT(varchar(16), CRIADO_EM, 120) AS CRIADO_EM, CRIADO_POR
      FROM dbo.EMB_ENG_ANEXO WHERE VERSAO_ID = @vid ORDER BY ID
    `);
  return {
    projeto: row,
    versao: mapVersao(row),
    historico: (historico.recordset || []).map((item) => ({
      numero: item.NUMERO,
      status: item.STATUS,
      origem: item.ORIGEM,
      criadoEm: item.CRIADO_EM,
      criadoPor: item.CRIADO_POR || "",
    })),
    anexos: (anexos.recordset || []).map((item) => ({
      id: item.ID,
      uso: item.USO,
      tipo: item.TIPO,
      nome: item.NOME_ARQUIVO,
      mime: item.MIME,
      tamanho: item.TAMANHO,
      criadoEm: item.CRIADO_EM,
      criadoPor: item.CRIADO_POR || "",
    })),
  };
}

async function montarDetalhe(pool, projetoId, numero) {
  const lido = await lerVersao(pool, projetoId, numero);
  if (!lido) return null;
  const row = lido.projeto;
  const estimativa = lido.versao ? await calcularEstimativa(pool, lido.versao) : null;
  const familiaDesenho = (lido.versao && lido.versao.familia) || row.FAMILIA;
  const desenho = lido.versao && lido.versao.origem === "PARAMETRICO"
    ? facaEstudo(familiaDesenho, lido.versao.comprimento, lido.versao.largura, lido.versao.altura, lido.versao.sangria, lido.versao.compensacao)
    : null;
  const saldo = await saldoSku(pool, row.SKU);
  const necessidade = await lerNecessidade(pool, projetoId);
  const orcamento = await lerOrcamentoVinculo(pool, row.ORCAMENTO_ID);
  const mmConfig = lerMmVinco(await lerMmConfig(pool));
  return {
    id: row.PROJETO_ID,
    sku: row.SKU,
    titulo: row.TITULO,
    cliente: row.CLIENTE || "",
    descricao: row.DESCRICAO || "",
    familia: familiaDesenho || row.FAMILIA,
    orcamentoId: orcamento.id,
    orcamentoNumero: orcamento.numero,
    saldo,
    necessidade,
    compensacaoVigente: mmConfig.erro ? null : (mmConfig.valor > 0 ? mmConfig.valor : null),
    criadoPor: row.PROJETO_POR || "",
    criadoEm: row.PROJETO_EM || null,
    versao: lido.versao,
    historico: lido.historico,
    anexos: lido.anexos,
    desenho: desenho && !desenho.erro ? desenho : null,
    estimativa,
  };
}

async function detalhe(req, res, pool) {
  const id = inteiro(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const numero = req.query.versao ? inteiro(req.query.versao) : null;
  if (req.query.versao && !numero) return res.status(400).json({ success: false, error: "Versão inválida." });
  const data = await montarDetalhe(pool, id, numero);
  if (!data) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
  const permissoes = await permissoesDe(req);
  data.permissoes = permissoes;
  return res.status(200).json({ success: true, permissoes, data });
}

function lerCampos(body, compensacao) {
  const titulo = texto(body.titulo, 120);
  if (!titulo) return { erro: "Informe o título." };
  const sku = texto(body.sku, 100);
  if (!sku) return { erro: "Informe o SKU." };
  const familia = String(body.familia || "CARTUCHO").trim().toUpperCase();
  if (!FAMILIA_OK.has(familia)) return { erro: "Família inválida." };
  const origem = String(body.origem || "").trim().toUpperCase();
  if (!ORIGENS.has(origem)) return { erro: "Origem inválida." };
  const comprimento = medida(body.comprimento, "o comprimento");
  if (comprimento.erro) return comprimento;
  const largura = medida(body.largura, "a largura");
  if (largura.erro) return largura;
  const altura = medida(body.altura, "a altura");
  if (altura.erro) return altura;
  const espessura = medidaOpcional(body.espessura, "A espessura", 0, 20);
  if (espessura.erro) return espessura;
  const gramatura = medidaOpcional(body.gramatura, "A gramatura", 1, 2000);
  if (gramatura.erro) return gramatura;
  const sangria = medidaOpcional(body.sangria, "A sangria", 0, 25);
  if (sangria.erro) return sangria;
  let folhaLargura;
  let folhaAltura;
  let desenho = null;
  if (origem === "PARAMETRICO") {
    desenho = facaEstudo(familia, comprimento.valor, largura.valor, altura.valor, sangria.valor, compensacao);
    if (desenho.erro) return desenho;
    folhaLargura = desenho.folhaLargura;
    folhaAltura = desenho.folhaAltura;
  } else {
    const fl = medida(body.folhaLargura, "a largura da folha");
    if (fl.erro) return fl;
    const fa = medida(body.folhaAltura, "a altura da folha");
    if (fa.erro) return fa;
    folhaLargura = fl.valor;
    folhaAltura = fa.valor;
  }
  const quantidade = inteiro(body.quantidade) || 1000;
  if (quantidade > 10000000) return { erro: "Quantidade acima do limite." };
  const maquina = lerMaquina(body);
  if (maquina.erro) return maquina;
  const fibra = lerFibra(body);
  if (fibra.erro) return fibra;
  const imposta = imposicaoEstudo(folhaLargura, folhaAltura, maquina.largura, maquina.altura, fibra.valor);
  if (imposta.erro) return imposta;
  if (imposta.poses && imposta.poses > 5000) {
    return { erro: "A imposição passou de 5000 poses. Revise o formato de máquina." };
  }
  const poses = imposta.poses || inteiro(body.poses) || 1;
  if (!imposta.poses && poses > 200) return { erro: "Número de poses inválido." };
  const perda = medidaOpcional(body.perda, "A perda", 0, 80);
  if (perda.erro) return perda;
  return {
    valor: {
      titulo,
      sku,
      cliente: texto(body.cliente, 120),
      familia,
      origem,
      comprimento: comprimento.valor,
      largura: largura.valor,
      altura: altura.valor,
      espessura: espessura.valor,
      folhaLargura,
      folhaAltura,
      material: texto(body.material, 80),
      gramatura: gramatura.valor,
      impressao: texto(body.impressao, 40),
      pantone: texto(body.pantone, 200),
      laminacao: flag(body.laminacao),
      verniz: flag(body.verniz),
      janela: flag(body.janela),
      microondulado: flag(body.microondulado) || familia === "MICROONDULADO",
      hotstamp: flag(body.hotstamp),
      relevo: flag(body.relevo),
      frete: flag(body.frete),
      facaMatriz: flag(body.facaMatriz),
      compensacao: compensacao > 0 ? compensacao : null,
      observacao: texto(body.observacao, 1000),
      quantidade,
      poses,
      perda: perda.valor,
      sangria: sangria.valor,
      maquinaLargura: maquina.largura,
      maquinaAltura: maquina.altura,
      fibra: fibra.valor,
      desenho,
    },
  };
}

function pedidoVersao(request, item, quem, agora) {
  request
    .input("origem", sql.NVarChar(20), item.origem)
    .input("c", sql.Decimal(18, 2), item.comprimento)
    .input("l", sql.Decimal(18, 2), item.largura)
    .input("a", sql.Decimal(18, 2), item.altura)
    .input("esp", sql.Decimal(18, 2), item.espessura)
    .input("fl", sql.Decimal(18, 2), item.folhaLargura)
    .input("fa", sql.Decimal(18, 2), item.folhaAltura)
    .input("mat", sql.NVarChar(80), item.material)
    .input("gram", sql.Decimal(18, 2), item.gramatura)
    .input("imp", sql.NVarChar(40), item.impressao)
    .input("pant", sql.NVarChar(200), item.pantone)
    .input("lam", sql.Bit, item.laminacao ? 1 : 0)
    .input("ver", sql.Bit, item.verniz ? 1 : 0)
    .input("jan", sql.Bit, item.janela ? 1 : 0)
    .input("obs", sql.NVarChar(1000), item.observacao)
    .input("qtd", sql.Int, item.quantidade)
    .input("poses", sql.Int, item.poses)
    .input("perda", sql.Decimal(9, 2), item.perda)
    .input("sangria", sql.Decimal(9, 2), item.sangria)
    .input("ml", sql.Decimal(9, 2), item.maquinaLargura)
    .input("ma", sql.Decimal(9, 2), item.maquinaAltura)
    .input("fibra", sql.NVarChar(20), item.fibra)
    .input("compmm", sql.Decimal(9, 2), item.compensacao)
    .input("famv", sql.NVarChar(40), item.familia)
    .input("micro", sql.Bit, item.microondulado ? 1 : 0)
    .input("hot", sql.Bit, item.hotstamp ? 1 : 0)
    .input("rel", sql.Bit, item.relevo ? 1 : 0)
    .input("frete", sql.Bit, item.frete ? 1 : 0)
    .input("facam", sql.Bit, item.facaMatriz ? 1 : 0)
    .input("quem", sql.NVarChar(100), quem)
    .input("agora", sql.VarChar(19), agora);
}

async function salvar(req, res, pool) {
  const body = req.body || {};
  const mm = await mmParaBody(pool, body);
  if (mm.erro) return res.status(400).json({ success: false, error: mm.erro });
  const campos = lerCampos(body, mm.valor);
  if (campos.erro) return res.status(400).json({ success: false, error: campos.erro });
  const item = campos.valor;
  const produto = await pool.request()
    .input("cod", sql.NVarChar(100), item.sku)
    .query(`SELECT CODIGO FROM dbo.CAD_PROD WHERE CODIGO = @cod`);
  if (!produto.recordset.length) {
    return res.status(400).json({ success: false, error: "Produto não cadastrado." });
  }
  item.sku = produto.recordset[0].CODIGO;
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const id = body.id == null || body.id === "" ? null : inteiro(body.id);
  if (body.id != null && body.id !== "" && !id) {
    return res.status(400).json({ success: false, error: "Projeto inválido." });
  }
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let projetoId = id;
    if (!id) {
      const criado = await new sql.Request(transaction)
        .input("sku", sql.NVarChar(100), item.sku)
        .input("titulo", sql.NVarChar(120), item.titulo)
        .input("cliente", sql.NVarChar(120), item.cliente)
        .input("fam", sql.NVarChar(40), item.familia)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          INSERT INTO dbo.EMB_ENG_PROJETO (SKU, TITULO, CLIENTE, FAMILIA, CRIADO_EM, CRIADO_POR)
          OUTPUT INSERTED.ID
          VALUES (@sku, @titulo, @cliente, @fam, CAST(@agora AS DATETIME), @quem)
        `);
      projetoId = criado.recordset[0].ID;
      const versao = new sql.Request(transaction);
      pedidoVersao(versao, item, quem, agora);
      versao.input("proj", sql.Int, projetoId);
      await versao.query(`
        INSERT INTO dbo.EMB_ENG_VERSAO (
          PROJETO_ID, NUMERO, STATUS, ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA,
          MAQUINA_LARGURA, MAQUINA_ALTURA, FIBRA, COMPENSACAO, FAMILIA,
          MICROONDULADO, HOTSTAMP, RELEVO, FRETE, FACA_MATRIZ, CRIADO_EM, CRIADO_POR
        ) VALUES (
          @proj, 1, N'RASCUNHO', @origem, @c, @l, @a, @esp,
          @fl, @fa, @mat, @gram, @imp, @pant,
          @lam, @ver, @jan, @obs, @qtd, @poses, @perda, @sangria,
          @ml, @ma, @fibra, @compmm, @famv, @micro, @hot, @rel, @frete, @facam,
          CAST(@agora AS DATETIME), @quem
        )
      `);
    } else {
      const atual = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .query(`
          SELECT TOP 1 v.ID, v.STATUS
          FROM dbo.EMB_ENG_VERSAO v WITH (UPDLOCK, HOLDLOCK)
          WHERE v.PROJETO_ID = @id
          ORDER BY v.NUMERO DESC
        `);
      if (!atual.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Projeto não encontrado." });
      }
      if (atual.recordset[0].STATUS !== "RASCUNHO") {
        await transaction.rollback();
        return res.status(409).json({ success: false, error: "A versão aprovada não muda. Crie uma nova versão." });
      }
      await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("sku", sql.NVarChar(100), item.sku)
        .input("titulo", sql.NVarChar(120), item.titulo)
        .input("cliente", sql.NVarChar(120), item.cliente)
        .input("fam", sql.NVarChar(40), item.familia)
        .query(`UPDATE dbo.EMB_ENG_PROJETO SET SKU = @sku, TITULO = @titulo, CLIENTE = @cliente, FAMILIA = @fam WHERE ID = @id`);
      const versao = new sql.Request(transaction);
      pedidoVersao(versao, item, quem, agora);
      versao.input("vid", sql.Int, atual.recordset[0].ID);
      await versao.query(`
        UPDATE dbo.EMB_ENG_VERSAO SET
          ORIGEM = @origem, COMPRIMENTO = @c, LARGURA = @l, ALTURA = @a, ESPESSURA = @esp,
          FOLHA_LARGURA = @fl, FOLHA_ALTURA = @fa, MATERIAL = @mat, GRAMATURA = @gram,
          IMPRESSAO = @imp, PANTONE = @pant, LAMINACAO = @lam, VERNIZ = @ver, JANELA = @jan,
          OBSERVACAO = @obs, QUANTIDADE = @qtd, POSES = @poses, PERDA = @perda, SANGRIA = @sangria,
          MAQUINA_LARGURA = @ml, MAQUINA_ALTURA = @ma, FIBRA = @fibra,
          COMPENSACAO = @compmm, FAMILIA = @famv, MICROONDULADO = @micro, HOTSTAMP = @hot,
          RELEVO = @rel, FRETE = @frete, FACA_MATRIZ = @facam
        WHERE ID = @vid
      `);
    }
    await transaction.commit();
    return res.status(200).json({ success: true, data: await montarDetalhe(pool, projetoId, null) });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function aprovar(req, res, pool) {
  const id = inteiro(req.body && req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const comentario = texto(req.body && req.body.comentario, 500);
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 v.ID, v.STATUS, v.QUANTIDADE, p.SKU
        FROM dbo.EMB_ENG_VERSAO v WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.EMB_ENG_PROJETO p ON p.ID = v.PROJETO_ID
        WHERE v.PROJETO_ID = @id
        ORDER BY v.NUMERO DESC
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    if (atual.recordset[0].STATUS !== "RASCUNHO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Esta versão já está aprovada." });
    }
    const versaoId = atual.recordset[0].ID;
    await new sql.Request(transaction)
      .input("vid", sql.Int, versaoId)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .input("obs", sql.NVarChar(500), comentario)
      .query(`
        UPDATE dbo.EMB_ENG_VERSAO SET
          STATUS = N'APROVADO',
          APROVADO_EM = CAST(@agora AS DATETIME),
          APROVADO_POR = @quem,
          APROVACAO_OBS = @obs
        WHERE ID = @vid
      `);
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("vid", sql.Int, versaoId)
      .input("sku", sql.NVarChar(100), atual.recordset[0].SKU)
      .input("qtd", sql.Int, atual.recordset[0].QUANTIDADE)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.EMB_ENG_NECESSIDADE
          WHERE PROJETO_ID = @id AND STATUS = N'ABERTA'
        )
        INSERT INTO dbo.EMB_ENG_NECESSIDADE (PROJETO_ID, VERSAO_ID, SKU, QUANTIDADE, STATUS, CRIADO_EM, CRIADO_POR)
        VALUES (@id, @vid, @sku, @qtd, N'ABERTA', CAST(@agora AS DATETIME), @quem)
      `);
    await transaction.commit();
    const data = await montarDetalhe(pool, id, null);
    data.permissoes = await permissoesDe(req);
    return res.status(200).json({ success: true, permissoes: data.permissoes, data });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function novaVersao(req, res, pool) {
  const id = inteiro(req.body && req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 * FROM dbo.EMB_ENG_VERSAO WITH (UPDLOCK, HOLDLOCK)
        WHERE PROJETO_ID = @id ORDER BY NUMERO DESC
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    const origem = atual.recordset[0];
    if (origem.STATUS !== "APROVADO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Aprove a versão atual antes de abrir outra." });
    }
    const criado = await new sql.Request(transaction)
      .input("src", sql.Int, origem.ID)
      .input("num", sql.Int, origem.NUMERO + 1)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ENG_VERSAO (
          PROJETO_ID, NUMERO, STATUS, ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA,
          MAQUINA_LARGURA, MAQUINA_ALTURA, FIBRA, COMPENSACAO, FAMILIA,
          MICROONDULADO, HOTSTAMP, RELEVO, FRETE, FACA_MATRIZ, CRIADO_EM, CRIADO_POR
        )
        OUTPUT INSERTED.ID
        SELECT
          PROJETO_ID, @num, N'RASCUNHO', ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA,
          MAQUINA_LARGURA, MAQUINA_ALTURA, FIBRA, COMPENSACAO, FAMILIA,
          MICROONDULADO, HOTSTAMP, RELEVO, FRETE, FACA_MATRIZ, CAST(@agora AS DATETIME), @quem
        FROM dbo.EMB_ENG_VERSAO WHERE ID = @src
      `);
    await new sql.Request(transaction)
      .input("src", sql.Int, origem.ID)
      .input("dst", sql.Int, criado.recordset[0].ID)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ENG_ANEXO (VERSAO_ID, USO, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_EM, CRIADO_POR)
        SELECT @dst, USO, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CAST(@agora AS DATETIME), @quem
        FROM dbo.EMB_ENG_ANEXO WHERE VERSAO_ID = @src
      `);
    await transaction.commit();
    return res.status(200).json({ success: true, data: await montarDetalhe(pool, id, null) });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function excluir(req, res, pool) {
  const id = inteiro((req.body && req.body.id) || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 ID, NUMERO, STATUS
        FROM dbo.EMB_ENG_VERSAO WITH (UPDLOCK, HOLDLOCK)
        WHERE PROJETO_ID = @id ORDER BY NUMERO DESC
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    if (atual.recordset[0].STATUS !== "RASCUNHO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Versão aprovada não pode ser excluída." });
    }
    if (atual.recordset[0].NUMERO === 1) {
      await new sql.Request(transaction).input("id", sql.Int, id).query(`DELETE FROM dbo.EMB_ENG_PROJETO WHERE ID = @id`);
    } else {
      await new sql.Request(transaction)
        .input("vid", sql.Int, atual.recordset[0].ID)
        .query(`DELETE FROM dbo.EMB_ENG_VERSAO WHERE ID = @vid`);
    }
    await transaction.commit();
    return res.status(200).json({ success: true });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function saldoSku(pool, sku) {
  try {
    const ano = await anoKardex(pool);
    const result = await pool.request()
      .input("ano", sql.Int, ano)
      .input("cod", sql.NVarChar(100), sku)
      .query(`
        SELECT SUM(k.SALDO) AS SALDO
        FROM dbo.KARDEX_LOTE k
        WHERE k.SALDO > 0
          AND k.KARDEX = @ano
          AND ISNULL(k.D_E_L_E_T_, '') <> '*'
          AND k.CODIGO = @cod
      `);
    const bruto = result.recordset[0] && result.recordset[0].SALDO;
    return { saldo: bruto == null ? 0 : num(bruto), ano };
  } catch (err) {
    console.error("[engenharia] saldo", err.message);
    return { saldo: null, ano: null, erro: "Saldo indisponível." };
  }
}

async function saldoRota(req, res, pool) {
  const codigo = texto(req.query.codigo, 100);
  if (!codigo) return res.status(400).json({ success: false, error: "Informe o SKU." });
  const saldo = await saldoSku(pool, codigo);
  return res.status(200).json({ success: true, data: saldo });
}

async function lerNecessidade(pool, projetoId) {
  const result = await pool.request()
    .input("id", sql.Int, projetoId)
    .query(`
      SELECT TOP 1 ID, STATUS, QUANTIDADE, CRIADO_POR,
        CONVERT(varchar(19), CRIADO_EM, 120) AS CRIADO_EM
      FROM dbo.EMB_ENG_NECESSIDADE
      WHERE PROJETO_ID = @id
      ORDER BY ID DESC
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    id: row.ID,
    status: row.STATUS,
    quantidade: row.QUANTIDADE,
    criadoEm: row.CRIADO_EM,
    criadoPor: row.CRIADO_POR || "",
  };
}

async function lerOrcamentoVinculo(pool, orcamentoId) {
  const id = inteiro(orcamentoId);
  if (!id) return { id: null, numero: "" };
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`SELECT ID, NUMERO FROM dbo.EMB_ORCAMENTO WHERE ID = @id`);
  const row = result.recordset[0];
  if (!row) return { id, numero: "" };
  return { id: row.ID, numero: row.NUMERO || "" };
}

function textoOrcamento(det) {
  const versao = det.versao;
  const est = det.estimativa;
  const linhas = [
    `Desenvolvimento de embalagens: ${det.titulo}`,
    `Família ${versao.familia || det.familia} · versão ${versao.numero} aprovada`,
    `Interno ${versao.comprimento} × ${versao.largura} × ${versao.altura} mm · folha ${versao.folhaLargura} × ${versao.folhaAltura} mm`,
    `Quantidade ${versao.quantidade} · poses ${versao.poses}`,
    est ? `Estimativa R$ ${est.total} · unitário R$ ${est.unitario}` : "Sem estimativa",
    "Estimativa. Não é um custo fechado.",
  ];
  if (est && est.incompleta) linhas.push(`Estimativa incompleta: ${est.motivos.slice(0, 4).join(" ")}`);
  if (versao.material) linhas.push(`Material ${versao.material}`);
  if (versao.observacao) linhas.push(versao.observacao);
  return linhas.join("\n").slice(0, 1000);
}

async function enviarOrcamento(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const codFornecedor = inteiro(body.codFornecedor);
  if (!codFornecedor) return res.status(400).json({ success: false, error: "Informe o fornecedor." });
  const prazo = inteiro(body.prazoDias);
  if (!prazo || prazo > 9999) return res.status(400).json({ success: false, error: "Informe o prazo em dias." });
  const det = await montarDetalhe(pool, id, null);
  if (!det) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
  const ultima = det.historico.length ? det.historico[det.historico.length - 1].numero : null;
  if (!det.versao || det.versao.status !== "APROVADO" || det.versao.numero !== ultima) {
    return res.status(409).json({ success: false, error: "Aprove a versão atual antes de enviar ao orçamento." });
  }
  if (det.orcamentoId) {
    det.permissoes = await permissoesDe(req);
    return res.status(200).json({
      success: true,
      permissoes: det.permissoes,
      data: det,
      orcamento: { id: det.orcamentoId, numero: det.orcamentoNumero, jaEnviado: true },
    });
  }
  const forn = await pool.request()
    .input("cod", sql.Int, codFornecedor)
    .query(`SELECT COD_FORNECEDOR FROM dbo.CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod`);
  if (!forn.recordset.length) {
    return res.status(400).json({ success: false, error: "Fornecedor não cadastrado." });
  }
  const produto = await pool.request()
    .input("cod", sql.NVarChar(100), det.sku)
    .query(`SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO = @cod`);
  if (!produto.recordset.length) {
    return res.status(400).json({ success: false, error: "Produto não cadastrado." });
  }
  const prod = produto.recordset[0];
  const est = det.estimativa;
  const unitario = est ? Number(est.unitario) || 0 : 0;
  const total = est ? Number(est.total) || 0 : 0;
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const hoje = agora.slice(0, 10);
  const obs = textoOrcamento(det);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const travado = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT ORCAMENTO_ID FROM dbo.EMB_ENG_PROJETO WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id`);
    if (!travado.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    if (travado.recordset[0].ORCAMENTO_ID) {
      await transaction.rollback();
      const deNovo = await montarDetalhe(pool, id, null);
      deNovo.permissoes = await permissoesDe(req);
      return res.status(200).json({
        success: true,
        permissoes: deNovo.permissoes,
        data: deNovo,
        orcamento: { id: deNovo.orcamentoId, numero: deNovo.orcamentoNumero, jaEnviado: true },
      });
    }
    const criado = await new sql.Request(transaction)
      .input("cod", sql.Int, codFornecedor)
      .input("data", sql.Date, hoje)
      .input("prazo", sql.Int, prazo)
      .input("obs", sql.NVarChar(1000), obs)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ORCAMENTO (
          NUMERO, COD_FORNECEDOR, DATA_ORCAMENTO, PRAZO_DIAS, DATA_ENTREGA,
          DATA_APROVACAO, CONDICAO_PAGAMENTO, STATUS, OBSERVACAO, CRIADO_EM, CRIADO_POR
        )
        OUTPUT INSERTED.ID
        VALUES (
          NULL, @cod, @data, @prazo, NULL,
          NULL, NULL, N'ABERTO', @obs, CAST(@agora AS DATETIME), @quem
        )
      `);
    const orcamentoId = criado.recordset[0].ID;
    const numero = `ORC-${hoje.slice(0, 4)}-${String(orcamentoId).padStart(5, "0")}`;
    await new sql.Request(transaction)
      .input("id", sql.Int, orcamentoId)
      .input("numero", sql.NVarChar(40), numero)
      .query(`UPDATE dbo.EMB_ORCAMENTO SET NUMERO = @numero WHERE ID = @id AND (NUMERO IS NULL OR NUMERO = N'')`);
    await new sql.Request(transaction)
      .input("orc", sql.Int, orcamentoId)
      .input("cod", sql.NVarChar(100), prod.CODIGO)
      .input("desc", sql.NVarChar(300), String(prod.DESCRICAO || "").slice(0, 300) || null)
      .input("qtd", sql.Decimal(18, 4), det.versao.quantidade)
      .input("vu", sql.Decimal(18, 6), unitario)
      .input("vt", sql.Decimal(18, 4), total)
      .input("prazo", sql.Int, prazo)
      .query(`
        INSERT INTO dbo.EMB_ORCAMENTO_ITEM (
          ORCAMENTO_ID, CODIGO, DESCRICAO, QUANTIDADE, VALOR_UNITARIO, VALOR_TOTAL, PRAZO_DIAS, URGENCIA, ORDEM
        ) VALUES (
          @orc, @cod, @desc, @qtd, @vu, @vt, @prazo, N'NORMAL', 0
        )
      `);
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("orc", sql.Int, orcamentoId)
      .query(`UPDATE dbo.EMB_ENG_PROJETO SET ORCAMENTO_ID = @orc WHERE ID = @id`);
    await transaction.commit();
    const data = await montarDetalhe(pool, id, null);
    data.permissoes = await permissoesDe(req);
    return res.status(200).json({
      success: true,
      permissoes: data.permissoes,
      data,
      orcamento: { id: orcamentoId, numero, jaEnviado: false },
    });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    if (err && (err.number === 2627 || err.number === 2601)) {
      return res.status(409).json({ success: false, error: "Já existe um orçamento com este número." });
    }
    throw err;
  }
}

async function duplicar(req, res, pool) {
  const id = inteiro(req.body && req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o projeto." });
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const origem = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 p.SKU, p.TITULO, p.CLIENTE, p.FAMILIA, v.ID AS VERSAO_ID
        FROM dbo.EMB_ENG_PROJETO p
        INNER JOIN dbo.EMB_ENG_VERSAO v ON v.PROJETO_ID = p.ID
        WHERE p.ID = @id
        ORDER BY v.NUMERO DESC
      `);
    if (!origem.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    const row = origem.recordset[0];
    const titulo = `${row.TITULO} (cópia)`.slice(0, 120);
    const criado = await new sql.Request(transaction)
      .input("sku", sql.NVarChar(100), row.SKU)
      .input("titulo", sql.NVarChar(120), titulo)
      .input("cliente", sql.NVarChar(120), row.CLIENTE)
      .input("fam", sql.NVarChar(40), row.FAMILIA)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ENG_PROJETO (SKU, TITULO, CLIENTE, FAMILIA, CRIADO_EM, CRIADO_POR)
        OUTPUT INSERTED.ID
        VALUES (@sku, @titulo, @cliente, @fam, CAST(@agora AS DATETIME), @quem)
      `);
    const novoId = criado.recordset[0].ID;
    const versao = await new sql.Request(transaction)
      .input("src", sql.Int, row.VERSAO_ID)
      .input("proj", sql.Int, novoId)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ENG_VERSAO (
          PROJETO_ID, NUMERO, STATUS, ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA,
          MAQUINA_LARGURA, MAQUINA_ALTURA, FIBRA, COMPENSACAO, FAMILIA,
          MICROONDULADO, HOTSTAMP, RELEVO, FRETE, FACA_MATRIZ, CRIADO_EM, CRIADO_POR
        )
        OUTPUT INSERTED.ID
        SELECT
          @proj, 1, N'RASCUNHO', ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA,
          MAQUINA_LARGURA, MAQUINA_ALTURA, FIBRA, COMPENSACAO, FAMILIA,
          MICROONDULADO, HOTSTAMP, RELEVO, FRETE, FACA_MATRIZ, CAST(@agora AS DATETIME), @quem
        FROM dbo.EMB_ENG_VERSAO WHERE ID = @src
      `);
    await new sql.Request(transaction)
      .input("src", sql.Int, row.VERSAO_ID)
      .input("dst", sql.Int, versao.recordset[0].ID)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_ENG_ANEXO (VERSAO_ID, USO, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_EM, CRIADO_POR)
        SELECT @dst, USO, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CAST(@agora AS DATETIME), @quem
        FROM dbo.EMB_ENG_ANEXO WHERE VERSAO_ID = @src
      `);
    await transaction.commit();
    const data = await montarDetalhe(pool, novoId, null);
    data.permissoes = await permissoesDe(req);
    return res.status(200).json({ success: true, permissoes: data.permissoes, data });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

function dataIso(valor) {
  if (valor == null || valor === "") return null;
  const s = String(valor);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function precosMapa(pool) {
  const result = await pool.request().query(`
    SELECT ID, GRUPO, ITEM, UNIDADE, PRECO, QTD_MIN, FORNECEDOR, IMPOSTO,
      CONVERT(varchar(10), VALIDADE, 23) AS VALIDADE
    FROM dbo.EMB_ENG_PRECO
    ORDER BY GRUPO, ITEM, UNIDADE, ISNULL(QTD_MIN, 0), ID
  `);
  const mapa = new Map();
  const lista = (result.recordset || []).map((row) => {
    const item = {
      id: row.ID,
      grupo: row.GRUPO,
      item: row.ITEM,
      unidade: row.UNIDADE,
      preco: row.PRECO == null ? null : num(row.PRECO),
      qtdMin: row.QTD_MIN == null ? null : num(row.QTD_MIN),
      validade: dataIso(row.VALIDADE),
      fornecedor: row.FORNECEDOR || "",
      imposto: row.IMPOSTO == null ? null : num(row.IMPOSTO),
    };
    const chave = chavePreco(row.GRUPO, row.ITEM, row.UNIDADE);
    const grupo = mapa.get(chave) || [];
    grupo.push(item);
    mapa.set(chave, grupo);
    return item;
  });
  return { lista, mapa };
}

async function listarPrecos(req, res, pool) {
  const { lista } = await precosMapa(pool);
  const mm = lerMmVinco(await lerMmConfig(pool));
  return res.status(200).json({
    success: true,
    data: lista,
    mmPorVinco: mm.erro || !mm.valor ? null : mm.valor,
    permissoes: await permissoesDe(req),
  });
}

function lerPreco(valor) {
  if (valor == null || String(valor).trim() === "") return { valor: null };
  const n = Number(typeof valor === "number" ? valor : String(valor).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 999999) return { erro: "Preço fora da faixa." };
  return { valor: Math.round(n * 10000) / 10000 };
}

function lerImposto(valor) {
  if (valor == null || String(valor).trim() === "") return { valor: null };
  const n = Number(typeof valor === "number" ? valor : String(valor).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: "O imposto fica entre 0 e 100%." };
  return { valor: Math.round(n * 100) / 100 };
}

function lerValidade(valor) {
  if (valor == null || String(valor).trim() === "") return { valor: null };
  const s = String(valor).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { erro: "Validade inválida." };
  const dt = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return { erro: "Validade inválida." };
  return { valor: s };
}

function camposPreco(bruto) {
  const preco = lerPreco(bruto.preco);
  if (preco.erro) return preco;
  const imposto = lerImposto(bruto.imposto);
  if (imposto.erro) return imposto;
  const validade = lerValidade(bruto.validade);
  if (validade.erro) return validade;
  return {
    preco: preco.valor,
    imposto: imposto.valor,
    validade: validade.valor,
    fornecedor: texto(bruto.fornecedor, 120),
  };
}

async function salvarPrecos(req, res, pool) {
  const body = req.body || {};
  const itens = Array.isArray(body.itens) ? body.itens : [];
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  if (Object.prototype.hasOwnProperty.call(body, "mmPorVinco")) {
    const mm = lerMmVinco(body.mmPorVinco);
    if (mm.erro) return res.status(400).json({ success: false, error: mm.erro });
    await pool.request()
      .input("v", sql.NVarChar(40), mm.valor > 0 ? String(mm.valor) : null)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.EMB_ENG_CONFIG WHERE CHAVE = N'MM_POR_VINCO')
          UPDATE dbo.EMB_ENG_CONFIG SET VALOR = @v WHERE CHAVE = N'MM_POR_VINCO';
        ELSE
          INSERT INTO dbo.EMB_ENG_CONFIG (CHAVE, VALOR) VALUES (N'MM_POR_VINCO', @v);
      `);
  }
  for (const bruto of itens) {
    const campos = camposPreco(bruto);
    if (campos.erro) return res.status(400).json({ success: false, error: campos.erro });
    const id = bruto.id == null || bruto.id === "" ? null : inteiro(bruto.id);
    if (bruto.id != null && bruto.id !== "" && !id) {
      return res.status(400).json({ success: false, error: "Preço inválido." });
    }
    if (!id) {
      const grupo = texto(bruto.grupo, 40);
      const item = texto(bruto.item, 80);
      const unidade = texto(bruto.unidade, 30);
      const qtdMin = inteiro(bruto.qtdMin);
      if (!grupo || !item || !unidade || !qtdMin) {
        return res.status(400).json({ success: false, error: "Informe o item e a quantidade mínima da faixa." });
      }
      try {
        await pool.request()
          .input("g", sql.NVarChar(40), grupo)
          .input("i", sql.NVarChar(80), item)
          .input("u", sql.NVarChar(30), unidade)
          .input("qtd", sql.Int, qtdMin)
          .input("preco", sql.Decimal(18, 4), campos.preco)
          .input("validade", sql.Date, campos.validade)
          .input("forn", sql.NVarChar(120), campos.fornecedor)
          .input("imp", sql.Decimal(9, 2), campos.imposto)
          .input("quem", sql.NVarChar(100), quem)
          .input("agora", sql.VarChar(19), agora)
          .query(`
            INSERT INTO dbo.EMB_ENG_PRECO (
              GRUPO, ITEM, UNIDADE, QTD_MIN, PRECO, VALIDADE, FORNECEDOR, IMPOSTO, ATUALIZADO_EM, ATUALIZADO_POR
            ) VALUES (
              @g, @i, @u, @qtd, @preco, @validade, @forn, @imp, CAST(@agora AS DATETIME), @quem
            )
          `);
      } catch (err) {
        if (err && (err.number === 2627 || err.number === 2601)) {
          return res.status(409).json({ success: false, error: "Já existe essa faixa de quantidade." });
        }
        throw err;
      }
      continue;
    }
    await pool.request()
      .input("id", sql.Int, id)
      .input("preco", sql.Decimal(18, 4), campos.preco)
      .input("validade", sql.Date, campos.validade)
      .input("forn", sql.NVarChar(120), campos.fornecedor)
      .input("imp", sql.Decimal(9, 2), campos.imposto)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        UPDATE dbo.EMB_ENG_PRECO SET
          PRECO = @preco,
          VALIDADE = @validade,
          FORNECEDOR = @forn,
          IMPOSTO = @imp,
          ATUALIZADO_EM = CAST(@agora AS DATETIME),
          ATUALIZADO_POR = @quem
        WHERE ID = @id
      `);
  }
  const { lista } = await precosMapa(pool);
  const mm = lerMmVinco(await lerMmConfig(pool));
  return res.status(200).json({
    success: true,
    data: lista,
    mmPorVinco: mm.erro || !mm.valor ? null : mm.valor,
    permissoes: await permissoesDe(req),
  });
}

function hojeIso() {
  return agoraSaoPaulo().slice(0, 10);
}

function escolherPreco(mapa, grupo, item, unidade, quantidade, semImposto) {
  const rows = mapa.get(chavePreco(grupo, item, unidade)) || [];
  const hoje = hojeIso();
  const comPreco = rows.filter((row) => row.preco != null && row.preco > 0);
  const vigente = (row) => !row.validade || row.validade >= hoje;
  const vivos = comPreco.filter(vigente);
  const candidatas = vivos.filter((row) => row.qtdMin == null || row.qtdMin <= quantidade);
  if (!candidatas.length) {
    if (comPreco.length && !vivos.length) return { vencido: true };
    return null;
  }
  candidatas.sort((a, b) => (b.qtdMin || 0) - (a.qtdMin || 0));
  const escolhida = candidatas[0];
  const imposto = semImposto ? 0 : (escolhida.imposto || 0);
  const fator = 1 + imposto / 100;
  return {
    preco: Number((escolhida.preco * fator).toFixed(6)),
    bruto: escolhida.preco,
    imposto,
    fornecedor: escolhida.fornecedor || "",
    qtdMin: escolhida.qtdMin,
  };
}

function memoriaDe(base, sufixo, escolha) {
  const extra = [];
  if (escolha.qtdMin) extra.push(`faixa ${escolha.qtdMin}`);
  if (escolha.fornecedor) extra.push(escolha.fornecedor);
  if (escolha.imposto) extra.push(`imposto ${escolha.imposto}%`);
  const nota = extra.length ? ` (${extra.join(", ")})` : "";
  return `${Number(base).toFixed(4)} ${sufixo} × R$ ${escolha.bruto}${nota}`;
}

function lancarPreco(mapa, grupo, item, unidade, quantidade, motivos, linhas, base, sufixo, rotulo, semImposto) {
  const escolha = escolherPreco(mapa, grupo, item, unidade, quantidade, semImposto);
  if (escolha && escolha.vencido) {
    motivos.push(`O preço de ${rotulo || item} está vencido.`);
    return "vencido";
  }
  if (!escolha) return "ausente";
  linhas.push({
    item: rotulo || item,
    memoria: memoriaDe(base, sufixo, escolha),
    valor: Number((base * escolha.preco).toFixed(4)),
  });
  return "ok";
}

async function calcularEstimativa(pool, versao) {
  const { mapa } = await precosMapa(pool);
  const motivos = [];
  const linhas = [];
  const quantidade = Math.max(1, num(versao.quantidade) || 1);
  const perdaInformada = versao.perda == null || versao.perda === "" ? null : num(versao.perda);
  const perdaEscolha = escolherPreco(mapa, "Perdas", "Perda técnica", "%", quantidade, true);
  const perdaTabela = perdaEscolha && !perdaEscolha.vencido ? perdaEscolha.bruto : null;
  if (perdaEscolha && perdaEscolha.vencido && perdaInformada == null) {
    motivos.push("O preço de perda técnica está vencido.");
  }
  const perda = perdaInformada == null ? perdaTabela : perdaInformada;
  const imposta = imposicaoEstudo(
    versao.folhaLargura,
    versao.folhaAltura,
    versao.maquinaLargura,
    versao.maquinaAltura,
    versao.fibra
  );
  if (imposta.erro) motivos.push(imposta.erro);
  else imposta.motivos.forEach((motivo) => motivos.push(motivo));
  const poses = imposta.poses || Math.max(1, num(versao.poses) || 1);
  if (perda == null) motivos.push("Informe a perda técnica, no projeto ou na tabela de preços.");
  const fator = 1 + (perda || 0) / 100;
  const folhas = Math.ceil(quantidade / poses);
  const areaUn = (num(versao.folhaLargura) / 1000) * (num(versao.folhaAltura) / 1000);
  const areaTotal = areaUn * folhas * fator;
  const usaMicro = versao.familia === "MICROONDULADO" || versao.microondulado;
  if (usaMicro) {
    const micro = lancarPreco(mapa, "Papel", "Microondulado", "R$/m²", quantidade, motivos, linhas, areaTotal, "m²", "Microondulado");
    if (micro === "ausente") motivos.push("Cadastre o preço do microondulado por m².");
  } else {
    const papelM2 = escolherPreco(mapa, "Papel", "Papel cartão", "R$/m²", quantidade);
    const papelKg = escolherPreco(mapa, "Papel", "Papel cartão", "R$/kg", quantidade);
    if (papelM2 && !papelM2.vencido) {
      linhas.push({
        item: "Papel cartão",
        memoria: memoriaDe(areaTotal, "m²", papelM2),
        valor: Number((areaTotal * papelM2.preco).toFixed(4)),
      });
    } else if (papelKg && !papelKg.vencido && versao.gramatura) {
      const kg = areaTotal * (num(versao.gramatura) / 1000);
      linhas.push({
        item: "Papel cartão",
        memoria: memoriaDe(kg, "kg", papelKg),
        valor: Number((kg * papelKg.preco).toFixed(4)),
      });
    } else if (papelKg && !papelKg.vencido) {
      motivos.push("Para preço por kg, informe a gramatura.");
    } else if ((papelM2 && papelM2.vencido) || (papelKg && papelKg.vencido)) {
      motivos.push("O preço de papel cartão está vencido.");
    } else {
      motivos.push("Cadastre o preço do papel cartão por m² ou por kg.");
    }
  }
  if (versao.impressao) {
    const acerto = lancarPreco(mapa, "Impressão", "Offset acerto", "R$/ordem", quantidade, motivos, linhas, 1, "ordem", "Acerto de impressão");
    const mil = folhas / 1000;
    const variavel = lancarPreco(mapa, "Impressão", "Offset variável", "R$/mil folhas", quantidade, motivos, linhas, mil, "mil folhas", "Impressão variável");
    if (acerto !== "ok" && variavel !== "ok") {
      if (acerto === "vencido" || variavel === "vencido") {
        if (!motivos.some((m) => m.indexOf("offset") >= 0 || m.indexOf("Offset") >= 0 || m.indexOf("Impressão") >= 0)) {
          motivos.push("O preço de offset está vencido.");
        }
      } else {
        motivos.push("Há impressão informada e não há preço de offset.");
      }
    }
  } else {
    motivos.push("Processo de impressão não informado.");
  }
  const extras = [
    [versao.laminacao, "Acabamento", "Laminação", "R$/m²", areaTotal, "m²"],
    [versao.verniz, "Acabamento", "Verniz", "R$/m²", areaTotal, "m²"],
    [versao.janela, "Acabamento", "Janela", "R$/mil", quantidade / 1000, "mil"],
    [versao.hotstamp, "Acabamento", "Hot stamp", "R$/mil", quantidade / 1000, "mil"],
    [versao.relevo, "Acabamento", "Relevo", "R$/mil", quantidade / 1000, "mil"],
    [versao.frete, "Conversão", "Frete", "R$/ordem", 1, "ordem"],
    [versao.facaMatriz, "Conversão", "Faca e matriz", "R$/ordem", 1, "ordem"],
  ];
  for (const [ligado, grupo, item, unidade, base, sufixo] of extras) {
    if (!ligado) continue;
    const estado = lancarPreco(mapa, grupo, item, unidade, quantidade, motivos, linhas, base, sufixo, item);
    if (estado === "ausente") motivos.push(`Sem preço de ${item.toLowerCase()}.`);
  }
  const corte = lancarPreco(mapa, "Conversão", "Corte e vinco", "R$/mil", quantidade, motivos, linhas, quantidade / 1000, "mil", "Corte e vinco");
  if (corte === "ausente") motivos.push("Sem preço de corte e vinco.");
  lancarPreco(mapa, "Conversão", "Colagem", "R$/mil", quantidade, motivos, linhas, quantidade / 1000, "mil", "Colagem");
  const total = Number(linhas.reduce((soma, linha) => soma + linha.valor, 0).toFixed(4));
  return {
    estimativa: true,
    incompleta: motivos.length > 0,
    motivos,
    linhas,
    areaUnidadeM2: Number(areaUn.toFixed(6)),
    folhas,
    poses,
    perda: perda == null ? null : perda,
    imposicao: imposta.informada ? {
      poses: imposta.poses,
      colunas: imposta.colunas,
      linhas: imposta.linhas,
      giro: imposta.giro,
      fibra: imposta.fibra,
      pecaLargura: imposta.pecaLargura,
      pecaAltura: imposta.pecaAltura,
      maquinaLargura: imposta.maquinaLargura,
      maquinaAltura: imposta.maquinaAltura,
    } : null,
    total,
    unitario: Number((total / quantidade).toFixed(6)),
  };
}

async function estimarRota(req, res, pool) {
  const body = req.body || {};
  const mm = await mmParaBody(pool, body);
  if (mm.erro) return res.status(400).json({ success: false, error: mm.erro });
  const campos = lerCampos({ ...body, titulo: body.titulo || "estimativa", sku: body.sku || "EST" }, mm.valor);
  if (campos.erro) return res.status(400).json({ success: false, error: campos.erro });
  const data = await calcularEstimativa(pool, campos.valor);
  return res.status(200).json({ success: true, data });
}

function decodeAnexo(data) {
  if (!data || typeof data !== "string") return { erro: "Arquivo vazio." };
  const virgula = data.indexOf(",");
  const raw = data.startsWith("data:") && virgula >= 0 ? data.slice(virgula + 1) : data;
  const limpo = raw.replace(/\s/g, "");
  if (!limpo || limpo.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpo)) {
    return { erro: "Arquivo inválido." };
  }
  const buf = Buffer.from(limpo, "base64");
  if (!buf.length || buf.length > MAX_ANEXO) return { erro: "O arquivo precisa ter até 3 MB." };
  return { buf };
}

function classificar(buf) {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { tipo: "PDF", mime: "application/pdf" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { tipo: "IMAGEM", mime: "image/jpeg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { tipo: "IMAGEM", mime: "image/png" };
  }
  const inicio = buf.slice(0, 300).toString("utf8").trim().toLowerCase();
  if (inicio.startsWith("<svg") || inicio.includes("<svg")) {
    return { tipo: "SVG", mime: "image/svg+xml" };
  }
  return null;
}

async function gravarAnexo(req, res, pool) {
  const body = req.body || {};
  const versaoId = inteiro(body.versaoId);
  const uso = String(body.uso || "").trim().toUpperCase();
  if (!versaoId) return res.status(400).json({ success: false, error: "Informe a versão." });
  if (!["FACA", "ARTE", "VERNIZ", "OUTRO"].includes(uso)) {
    return res.status(400).json({ success: false, error: "Uso do arquivo inválido." });
  }
  const decodificado = decodeAnexo(body.conteudo);
  if (decodificado.erro) return res.status(400).json({ success: false, error: decodificado.erro });
  const tipo = classificar(decodificado.buf);
  if (!tipo) return res.status(400).json({ success: false, error: "Envie PDF, SVG, JPG ou PNG." });
  const nome = texto(body.nome, 255) || (tipo.tipo === "PDF" ? "arquivo.pdf" : "arquivo");
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const versao = await pool.request()
    .input("id", sql.Int, versaoId)
    .query(`SELECT PROJETO_ID, STATUS FROM dbo.EMB_ENG_VERSAO WHERE ID = @id`);
  if (!versao.recordset.length) return res.status(404).json({ success: false, error: "Versão não encontrada." });
  if (versao.recordset[0].STATUS !== "RASCUNHO") {
    return res.status(409).json({ success: false, error: "A versão aprovada não recebe arquivo. Abra uma nova versão." });
  }
  const qtd = await pool.request()
    .input("id", sql.Int, versaoId)
    .query(`SELECT COUNT(*) AS QTD FROM dbo.EMB_ENG_ANEXO WHERE VERSAO_ID = @id`);
  if (num(qtd.recordset[0].QTD) >= 8) {
    return res.status(409).json({ success: false, error: "Esta versão já tem 8 arquivos." });
  }
  await pool.request()
    .input("vid", sql.Int, versaoId)
    .input("uso", sql.NVarChar(20), uso)
    .input("tipo", sql.NVarChar(20), tipo.tipo)
    .input("nome", sql.NVarChar(255), nome)
    .input("mime", sql.NVarChar(80), tipo.mime)
    .input("bin", sql.VarBinary(sql.MAX), decodificado.buf)
    .input("tam", sql.Int, decodificado.buf.length)
    .input("quem", sql.NVarChar(100), quem)
    .input("agora", sql.VarChar(19), agora)
    .query(`
      INSERT INTO dbo.EMB_ENG_ANEXO (VERSAO_ID, USO, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_EM, CRIADO_POR)
      VALUES (@vid, @uso, @tipo, @nome, @mime, @bin, @tam, CAST(@agora AS DATETIME), @quem)
    `);
  return res.status(200).json({ success: true, data: await montarDetalhe(pool, versao.recordset[0].PROJETO_ID, null) });
}

async function excluirAnexo(req, res, pool) {
  const id = inteiro(req.body && req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o arquivo." });
  const atual = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT a.ID, v.STATUS, v.PROJETO_ID
      FROM dbo.EMB_ENG_ANEXO a
      INNER JOIN dbo.EMB_ENG_VERSAO v ON v.ID = a.VERSAO_ID
      WHERE a.ID = @id
    `);
  if (!atual.recordset.length) return res.status(404).json({ success: false, error: "Arquivo não encontrado." });
  if (atual.recordset[0].STATUS !== "RASCUNHO") {
    return res.status(409).json({ success: false, error: "Arquivo de versão aprovada não sai. Abra uma nova versão." });
  }
  await pool.request().input("id", sql.Int, id).query(`DELETE FROM dbo.EMB_ENG_ANEXO WHERE ID = @id`);
  return res.status(200).json({ success: true, data: await montarDetalhe(pool, atual.recordset[0].PROJETO_ID, null) });
}

async function baixarAnexo(req, res, pool) {
  const id = inteiro(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o arquivo." });
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`SELECT NOME_ARQUIVO, MIME, CONTEUDO FROM dbo.EMB_ENG_ANEXO WHERE ID = @id`);
  if (!result.recordset.length) return res.status(404).json({ success: false, error: "Arquivo não encontrado." });
  const row = result.recordset[0];
  res.setHeader("Content-Type", row.MIME || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="${String(row.NOME_ARQUIVO || "arquivo").replace(/"/g, "")}"`);
  return res.status(200).send(row.CONTEUDO);
}
