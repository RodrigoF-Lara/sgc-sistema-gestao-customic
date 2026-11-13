import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";
import { seedPermissaoEngenharia } from "./permissoesApi.js";
import { facaCartucho } from "./facaCartucho.js";

const LINK = "engenharia-embalagens";
const STATUS = new Set(["RASCUNHO", "APROVADO"]);
const ORIGENS = new Set(["PARAMETRICO", "ARQUIVO"]);
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
    if (req.method === "GET" && acao === "geometria") return geometria(req, res);
    if (req.method === "GET" && acao === "produtos") return await buscarProdutos(req, res, pool);
    if (req.method === "GET" && acao === "produto") return await buscarProduto(req, res, pool);
    if (req.method === "GET" && acao === "precos") return await listarPrecos(req, res, pool);
    if (req.method === "GET" && acao === "anexo") return await baixarAnexo(req, res, pool);
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "aprovar") return await aprovar(req, res, pool);
    if (req.method === "POST" && acao === "novaVersao") return await novaVersao(req, res, pool);
    if (req.method === "POST" && acao === "estimar") return await estimarRota(req, res, pool);
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
          ATUALIZADO_EM DATETIME NULL,
          ATUALIZADO_POR NVARCHAR(100) NULL,
          CONSTRAINT UQ_EMB_ENG_PRECO UNIQUE (GRUPO, ITEM, UNIDADE)
        );
      END;

      IF COL_LENGTH(N'dbo.EMB_ENG_VERSAO', N'SANGRIA') IS NULL
        ALTER TABLE dbo.EMB_ENG_VERSAO ADD SANGRIA DECIMAL(9,2) NULL;
    `);
    for (const [grupo, item, unidade] of PRECOS_BASE) {
      await pool.request()
        .input("g", sql.NVarChar(40), grupo)
        .input("i", sql.NVarChar(80), item)
        .input("u", sql.NVarChar(30), unidade)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.EMB_ENG_PRECO
            WHERE GRUPO = @g AND ITEM = @i AND UNIDADE = @u
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

function chavePreco(grupo, item, unidade) {
  return `${grupo}|${item}|${unidade}`;
}

function geometria(req, res) {
  const q = req.query || {};
  const desenho = facaCartucho(q.comprimento, q.largura, q.altura, q.sangria);
  if (desenho.erro) return res.status(400).json({ success: false, error: desenho.erro });
  return res.status(200).json({ success: true, data: desenho });
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
  return res.status(200).json({
    success: true,
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
    SELECT p.ID AS PROJETO_ID, p.SKU, p.TITULO, p.CLIENTE, p.FAMILIA, p.CRIADO_POR AS PROJETO_POR,
      CONVERT(varchar(19), p.CRIADO_EM, 120) AS PROJETO_EM, cp.DESCRICAO,
      v.ID, v.NUMERO, v.STATUS, v.ORIGEM,
      v.COMPRIMENTO, v.LARGURA, v.ALTURA, v.ESPESSURA, v.FOLHA_LARGURA, v.FOLHA_ALTURA,
      v.MATERIAL, v.GRAMATURA, v.IMPRESSAO, v.PANTONE, v.LAMINACAO, v.VERNIZ, v.JANELA,
      v.OBSERVACAO, v.QUANTIDADE, v.POSES, v.PERDA, v.SANGRIA, v.CRIADO_POR, v.APROVADO_POR,
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
  const desenho = lido.versao && lido.versao.origem === "PARAMETRICO"
    ? facaCartucho(lido.versao.comprimento, lido.versao.largura, lido.versao.altura, lido.versao.sangria)
    : null;
  return {
    id: row.PROJETO_ID,
    sku: row.SKU,
    titulo: row.TITULO,
    cliente: row.CLIENTE || "",
    descricao: row.DESCRICAO || "",
    familia: row.FAMILIA,
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
  return res.status(200).json({ success: true, data });
}

function lerCampos(body) {
  const titulo = texto(body.titulo, 120);
  if (!titulo) return { erro: "Informe o título." };
  const sku = texto(body.sku, 100);
  if (!sku) return { erro: "Informe o SKU." };
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
    desenho = facaCartucho(comprimento.valor, largura.valor, altura.valor, sangria.valor);
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
  const poses = inteiro(body.poses) || 1;
  if (poses > 200) return { erro: "Número de poses inválido." };
  const perda = medidaOpcional(body.perda, "A perda", 0, 80);
  if (perda.erro) return perda;
  return {
    valor: {
      titulo,
      sku,
      cliente: texto(body.cliente, 120),
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
      observacao: texto(body.observacao, 1000),
      quantidade,
      poses,
      perda: perda.valor,
      sangria: sangria.valor,
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
    .input("quem", sql.NVarChar(100), quem)
    .input("agora", sql.VarChar(19), agora);
}

async function salvar(req, res, pool) {
  const body = req.body || {};
  const campos = lerCampos(body);
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
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          INSERT INTO dbo.EMB_ENG_PROJETO (SKU, TITULO, CLIENTE, FAMILIA, CRIADO_EM, CRIADO_POR)
          OUTPUT INSERTED.ID
          VALUES (@sku, @titulo, @cliente, N'CARTUCHO', CAST(@agora AS DATETIME), @quem)
        `);
      projetoId = criado.recordset[0].ID;
      const versao = new sql.Request(transaction);
      pedidoVersao(versao, item, quem, agora);
      versao.input("proj", sql.Int, projetoId);
      await versao.query(`
        INSERT INTO dbo.EMB_ENG_VERSAO (
          PROJETO_ID, NUMERO, STATUS, ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA, CRIADO_EM, CRIADO_POR
        ) VALUES (
          @proj, 1, N'RASCUNHO', @origem, @c, @l, @a, @esp,
          @fl, @fa, @mat, @gram, @imp, @pant,
          @lam, @ver, @jan, @obs, @qtd, @poses, @perda, @sangria, CAST(@agora AS DATETIME), @quem
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
        .query(`UPDATE dbo.EMB_ENG_PROJETO SET SKU = @sku, TITULO = @titulo, CLIENTE = @cliente WHERE ID = @id`);
      const versao = new sql.Request(transaction);
      pedidoVersao(versao, item, quem, agora);
      versao.input("vid", sql.Int, atual.recordset[0].ID);
      await versao.query(`
        UPDATE dbo.EMB_ENG_VERSAO SET
          ORIGEM = @origem, COMPRIMENTO = @c, LARGURA = @l, ALTURA = @a, ESPESSURA = @esp,
          FOLHA_LARGURA = @fl, FOLHA_ALTURA = @fa, MATERIAL = @mat, GRAMATURA = @gram,
          IMPRESSAO = @imp, PANTONE = @pant, LAMINACAO = @lam, VERNIZ = @ver, JANELA = @jan,
          OBSERVACAO = @obs, QUANTIDADE = @qtd, POSES = @poses, PERDA = @perda, SANGRIA = @sangria
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
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 ID, STATUS FROM dbo.EMB_ENG_VERSAO WITH (UPDLOCK, HOLDLOCK)
        WHERE PROJETO_ID = @id ORDER BY NUMERO DESC
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    }
    if (atual.recordset[0].STATUS !== "RASCUNHO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Esta versão já está aprovada." });
    }
    await new sql.Request(transaction)
      .input("vid", sql.Int, atual.recordset[0].ID)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        UPDATE dbo.EMB_ENG_VERSAO SET
          STATUS = N'APROVADO',
          APROVADO_EM = CAST(@agora AS DATETIME),
          APROVADO_POR = @quem
        WHERE ID = @vid
      `);
    await transaction.commit();
    return res.status(200).json({ success: true, data: await montarDetalhe(pool, id, null) });
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
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA, CRIADO_EM, CRIADO_POR
        )
        OUTPUT INSERTED.ID
        SELECT
          PROJETO_ID, @num, N'RASCUNHO', ORIGEM, COMPRIMENTO, LARGURA, ALTURA, ESPESSURA,
          FOLHA_LARGURA, FOLHA_ALTURA, MATERIAL, GRAMATURA, IMPRESSAO, PANTONE,
          LAMINACAO, VERNIZ, JANELA, OBSERVACAO, QUANTIDADE, POSES, PERDA, SANGRIA, CAST(@agora AS DATETIME), @quem
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

async function precosMapa(pool) {
  const result = await pool.request().query(`
    SELECT ID, GRUPO, ITEM, UNIDADE, PRECO FROM dbo.EMB_ENG_PRECO ORDER BY ID
  `);
  const mapa = new Map();
  const lista = (result.recordset || []).map((row) => {
    const item = {
      id: row.ID,
      grupo: row.GRUPO,
      item: row.ITEM,
      unidade: row.UNIDADE,
      preco: row.PRECO == null ? null : num(row.PRECO),
    };
    mapa.set(chavePreco(row.GRUPO, row.ITEM, row.UNIDADE), item);
    return item;
  });
  return { lista, mapa };
}

async function listarPrecos(req, res, pool) {
  const { lista } = await precosMapa(pool);
  return res.status(200).json({ success: true, data: lista });
}

async function salvarPrecos(req, res, pool) {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  for (const bruto of itens) {
    const id = inteiro(bruto.id);
    if (!id) return res.status(400).json({ success: false, error: "Preço inválido." });
    let preco = null;
    if (bruto.preco != null && String(bruto.preco).trim() !== "") {
      const n = Number(typeof bruto.preco === "number" ? bruto.preco : String(bruto.preco).trim().replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 999999) {
        return res.status(400).json({ success: false, error: "Preço fora da faixa." });
      }
      preco = Math.round(n * 10000) / 10000;
    }
    await pool.request()
      .input("id", sql.Int, id)
      .input("preco", sql.Decimal(18, 4), preco)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        UPDATE dbo.EMB_ENG_PRECO SET
          PRECO = @preco, ATUALIZADO_EM = CAST(@agora AS DATETIME), ATUALIZADO_POR = @quem
        WHERE ID = @id
      `);
  }
  const { lista } = await precosMapa(pool);
  return res.status(200).json({ success: true, data: lista });
}

function precoDe(mapa, grupo, item, unidade) {
  const row = mapa.get(chavePreco(grupo, item, unidade));
  if (!row || row.preco == null || row.preco <= 0) return null;
  return row.preco;
}

async function calcularEstimativa(pool, versao) {
  const { mapa } = await precosMapa(pool);
  const motivos = [];
  const linhas = [];
  const poses = Math.max(1, num(versao.poses) || 1);
  const quantidade = Math.max(1, num(versao.quantidade) || 1);
  const perdaInformada = versao.perda == null || versao.perda === "" ? null : num(versao.perda);
  const perdaTabela = precoDe(mapa, "Perdas", "Perda técnica", "%");
  const perda = perdaInformada == null ? perdaTabela : perdaInformada;
  motivos.push("Faltam imposição, formato de máquina, poses calculadas e sentido de fibra. Esta conta não fecha custo.");
  if (perda == null) motivos.push("Informe a perda técnica, no projeto ou na tabela de preços.");
  const fator = 1 + (perda || 0) / 100;
  const folhas = Math.ceil(quantidade / poses);
  const areaUn = (num(versao.folhaLargura) / 1000) * (num(versao.folhaAltura) / 1000);
  const areaTotal = areaUn * folhas * fator;
  const papelM2 = precoDe(mapa, "Papel", "Papel cartão", "R$/m²");
  const papelKg = precoDe(mapa, "Papel", "Papel cartão", "R$/kg");
  if (papelM2) {
    linhas.push({
      item: "Papel cartão",
      memoria: `${areaTotal.toFixed(4)} m² × R$ ${papelM2}`,
      valor: Number((areaTotal * papelM2).toFixed(4)),
    });
  } else if (papelKg && versao.gramatura) {
    const kg = areaTotal * (num(versao.gramatura) / 1000);
    linhas.push({
      item: "Papel cartão",
      memoria: `${kg.toFixed(4)} kg × R$ ${papelKg}`,
      valor: Number((kg * papelKg).toFixed(4)),
    });
  } else if (papelKg && !versao.gramatura) {
    motivos.push("Para preço por kg, informe a gramatura.");
  } else {
    motivos.push("Cadastre o preço do papel cartão por m² ou por kg.");
  }
  if (versao.impressao) {
    const acerto = precoDe(mapa, "Impressão", "Offset acerto", "R$/ordem");
    const variavel = precoDe(mapa, "Impressão", "Offset variável", "R$/mil folhas");
    if (!acerto && !variavel) motivos.push("Há impressão informada e não há preço de offset.");
    if (acerto) linhas.push({ item: "Acerto de impressão", memoria: "1 ordem", valor: acerto });
    if (variavel) {
      const mil = folhas / 1000;
      linhas.push({
        item: "Impressão variável",
        memoria: `${mil.toFixed(3)} mil folhas × R$ ${variavel}`,
        valor: Number((mil * variavel).toFixed(4)),
      });
    }
  } else {
    motivos.push("Processo de impressão não informado.");
  }
  const extras = [
    [versao.laminacao, "Acabamento", "Laminação", "R$/m²", areaTotal, "m²"],
    [versao.verniz, "Acabamento", "Verniz", "R$/m²", areaTotal, "m²"],
    [versao.janela, "Acabamento", "Janela", "R$/mil", quantidade / 1000, "mil"],
  ];
  for (const [ligado, grupo, item, unidade, base, sufixo] of extras) {
    if (!ligado) continue;
    const preco = precoDe(mapa, grupo, item, unidade);
    if (!preco) {
      motivos.push(`Sem preço de ${item.toLowerCase()}.`);
      continue;
    }
    linhas.push({
      item,
      memoria: `${base.toFixed(4)} ${sufixo} × R$ ${preco}`,
      valor: Number((base * preco).toFixed(4)),
    });
  }
  const corte = precoDe(mapa, "Conversão", "Corte e vinco", "R$/mil");
  const cola = precoDe(mapa, "Conversão", "Colagem", "R$/mil");
  if (corte) {
    linhas.push({
      item: "Corte e vinco",
      memoria: `${(quantidade / 1000).toFixed(3)} mil × R$ ${corte}`,
      valor: Number(((quantidade / 1000) * corte).toFixed(4)),
    });
  } else motivos.push("Sem preço de corte e vinco.");
  if (cola) {
    linhas.push({
      item: "Colagem",
      memoria: `${(quantidade / 1000).toFixed(3)} mil × R$ ${cola}`,
      valor: Number(((quantidade / 1000) * cola).toFixed(4)),
    });
  }
  const total = Number(linhas.reduce((soma, linha) => soma + linha.valor, 0).toFixed(4));
  return {
    estimativa: true,
    incompleta: motivos.length > 0,
    motivos,
    linhas,
    areaUnidadeM2: Number(areaUn.toFixed(6)),
    folhas,
    perda: perda == null ? null : perda,
    total,
    unitario: Number((total / quantidade).toFixed(6)),
  };
}

async function estimarRota(req, res, pool) {
  const body = req.body || {};
  const campos = lerCampos({ ...body, titulo: body.titulo || "estimativa", sku: body.sku || "EST" });
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
  res.setHeader("Content-Disposition", `inline; filename="${String(row.NOME_ARQUIVO || "arquivo").replace(/"/g, "")}"`);
  return res.status(200).send(row.CONTEUDO);
}
