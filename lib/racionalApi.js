import { getConnection, sql } from "../db.js";
import { exigirPermissao, nivelDoRequest, podeAcessar, usuarioDoRequest } from "./permissoesHelper.js";
import { seedPermissaoRacional } from "./permissoesApi.js";

const LINK = "racional-compras";
const STATUS = new Set(["ABERTO", "FECHADO"]);
const LIMITE_LISTA = 300;
const MAX_ITENS = 500;
const CANAIS = [
  ["claro", "QTD_CLARO", "VAL_CLARO", "VAL_CLARO_POR", "VAL_CLARO_EM", "racional-valida-claro", "Claro"],
  ["vivo", "QTD_VIVO", "VAL_VIVO", "VAL_VIVO_POR", "VAL_VIVO_EM", "racional-valida-vivo", "Vivo"],
  ["comercial", "QTD_COMERCIAL", "VAL_COMERCIAL", "VAL_COMERCIAL_POR", "VAL_COMERCIAL_EM", "racional-valida-comercial", "Comercial"],
  ["online", "QTD_ONLINE", "VAL_ONLINE", "VAL_ONLINE_POR", "VAL_ONLINE_EM", "racional-valida-online", "On line"],
  ["quiosque", "QTD_QUIOSQUE", "VAL_QUIOSQUE", "VAL_QUIOSQUE_POR", "VAL_QUIOSQUE_EM", "racional-valida-quiosque", "Quiosque"],
  ["estAdicional", "QTD_EST_ADICIONAL", "VAL_EST_ADICIONAL", "VAL_EST_ADICIONAL_POR", "VAL_EST_ADICIONAL_EM", "racional-valida-est", "Est. adicional"],
];

let tablesReady = false;

export async function handleRacional(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);
    if (!(await exigirPermissao(req, res, LINK, "Sem permissão para o racional de compras."))) return;

    if (req.method === "GET" && (acao === "" || acao === "listar")) return await listar(req, res, pool);
    if (req.method === "GET" && acao === "detalhe") return await detalhe(req, res, pool);
    if (req.method === "GET" && acao === "produtos") return await buscarProdutos(req, res, pool);
    if (req.method === "GET" && acao === "produto") return await buscarProduto(req, res, pool);
    if (req.method === "POST" && acao === "resolver") return await resolverProdutos(req, res, pool);
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "decidir") return await decidir(req, res, pool);
    if (req.method === "POST" && acao === "duplicar") return await duplicar(req, res, pool);
    if ((req.method === "POST" && acao === "excluir") || req.method === "DELETE") {
      return await excluir(req, res, pool);
    }
    return res.status(400).json({ success: false, error: "Ação inválida." });
  } catch (err) {
    console.error("[racional]", err);
    return res.status(500).json({ success: false, error: "Não foi possível concluir a operação do racional." });
  }
}

async function ensureTables(pool) {
  if (!tablesReady) {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.EMB_RACIONAL', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_RACIONAL (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          TITULO NVARCHAR(120) NOT NULL,
          REFERENCIA DATE NOT NULL,
          STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_EMB_RAC_ST DEFAULT (N'ABERTO'),
          OBSERVACAO NVARCHAR(1000) NULL,
          PEDIDO NVARCHAR(80) NULL,
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_RAC_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          ATUALIZADO_EM DATETIME NULL,
          ATUALIZADO_POR NVARCHAR(100) NULL,
          FECHADO_EM DATETIME NULL,
          FECHADO_POR NVARCHAR(100) NULL,
          CONSTRAINT CK_EMB_RAC_STATUS CHECK (STATUS IN (N'ABERTO', N'FECHADO'))
        );
        CREATE INDEX IX_EMB_RAC_LISTA ON dbo.EMB_RACIONAL (REFERENCIA DESC, ID DESC) INCLUDE (STATUS, TITULO);
      END;

      IF OBJECT_ID(N'dbo.EMB_RACIONAL_ITEM', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_RACIONAL_ITEM (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          RACIONAL_ID INT NOT NULL,
          CODIGO NVARCHAR(100) NOT NULL,
          DESCRICAO NVARCHAR(300) NULL,
          MOQ DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_MOQ DEFAULT (0),
          QTD_CLARO DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_CLARO DEFAULT (0),
          QTD_VIVO DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_VIVO DEFAULT (0),
          QTD_COMERCIAL DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_COM DEFAULT (0),
          QTD_ONLINE DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_ON DEFAULT (0),
          QTD_QUIOSQUE DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_QUI DEFAULT (0),
          QTD_EST_ADICIONAL DECIMAL(18,4) NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_EST DEFAULT (0),
          VAL_CLARO BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_CLARO DEFAULT (0),
          VAL_CLARO_POR NVARCHAR(100) NULL,
          VAL_CLARO_EM DATETIME NULL,
          VAL_VIVO BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_VIVO DEFAULT (0),
          VAL_VIVO_POR NVARCHAR(100) NULL,
          VAL_VIVO_EM DATETIME NULL,
          VAL_COMERCIAL BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_COM DEFAULT (0),
          VAL_COMERCIAL_POR NVARCHAR(100) NULL,
          VAL_COMERCIAL_EM DATETIME NULL,
          VAL_ONLINE BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_ON DEFAULT (0),
          VAL_ONLINE_POR NVARCHAR(100) NULL,
          VAL_ONLINE_EM DATETIME NULL,
          VAL_QUIOSQUE BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_QUI DEFAULT (0),
          VAL_QUIOSQUE_POR NVARCHAR(100) NULL,
          VAL_QUIOSQUE_EM DATETIME NULL,
          VAL_EST_ADICIONAL BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_EST DEFAULT (0),
          VAL_EST_ADICIONAL_POR NVARCHAR(100) NULL,
          VAL_EST_ADICIONAL_EM DATETIME NULL,
          OBSERVACAO NVARCHAR(300) NULL,
          ORDEM INT NOT NULL CONSTRAINT DF_EMB_RAC_ITEM_ORD DEFAULT (0),
          ATUALIZADO_POR NVARCHAR(100) NULL,
          CONSTRAINT FK_EMB_RAC_ITEM_RAC FOREIGN KEY (RACIONAL_ID)
            REFERENCES dbo.EMB_RACIONAL (ID) ON DELETE CASCADE,
          CONSTRAINT UQ_EMB_RAC_ITEM_COD UNIQUE (RACIONAL_ID, CODIGO),
          CONSTRAINT CK_EMB_RAC_ITEM_MOQ CHECK (MOQ >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_CLARO CHECK (QTD_CLARO >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_VIVO CHECK (QTD_VIVO >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_COM CHECK (QTD_COMERCIAL >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_ON CHECK (QTD_ONLINE >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_QUI CHECK (QTD_QUIOSQUE >= 0),
          CONSTRAINT CK_EMB_RAC_ITEM_EST CHECK (QTD_EST_ADICIONAL >= 0)
        );
        CREATE INDEX IX_EMB_RAC_ITEM_RAC ON dbo.EMB_RACIONAL_ITEM (RACIONAL_ID, ORDEM, ID);
      END;
    `);
    await pool.request().query(`
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_CLARO') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_CLARO BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_CLARO DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_CLARO_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_CLARO_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_CLARO_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_CLARO_EM DATETIME NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_VIVO') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_VIVO BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_VIVO DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_VIVO_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_VIVO_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_VIVO_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_VIVO_EM DATETIME NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_COMERCIAL') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_COMERCIAL BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_COM DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_COMERCIAL_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_COMERCIAL_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_COMERCIAL_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_COMERCIAL_EM DATETIME NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_ONLINE') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_ONLINE BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_ON DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_ONLINE_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_ONLINE_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_ONLINE_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_ONLINE_EM DATETIME NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_QUIOSQUE') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_QUIOSQUE BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_QUI DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_QUIOSQUE_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_QUIOSQUE_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_QUIOSQUE_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_QUIOSQUE_EM DATETIME NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_EST_ADICIONAL') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_EST_ADICIONAL BIT NOT NULL CONSTRAINT DF_EMB_RAC_VAL_EST DEFAULT (0);
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_EST_ADICIONAL_POR') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_EST_ADICIONAL_POR NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.EMB_RACIONAL_ITEM', 'VAL_EST_ADICIONAL_EM') IS NULL
        ALTER TABLE dbo.EMB_RACIONAL_ITEM ADD VAL_EST_ADICIONAL_EM DATETIME NULL;
    `);
    tablesReady = true;
  }
  await seedPermissaoRacional(pool);
}

function agoraSaoPaulo() {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const hora = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day} ${hora}:${map.minute}:${map.second}`;
}

function autor(req) {
  const h = req.headers || {};
  let nome = h["x-user-name"] || h["X-User-Name"] || "";
  try { nome = decodeURIComponent(String(nome)); } catch (_) { /* mantém */ }
  const corpo = req.body && req.body.usuario;
  const bruto = String(corpo || nome || usuarioDoRequest(req) || "SGC").trim();
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

function decimal(valor, casas, min, max) {
  if (valor == null || valor === "") return undefined;
  let bruto;
  if (typeof valor === "number") {
    bruto = valor;
  } else {
    let s = String(valor).trim().replace(/\s/g, "");
    if (!s) return undefined;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    bruto = Number(s);
  }
  if (!Number.isFinite(bruto)) return undefined;
  const n = Number(bruto.toFixed(casas));
  if (n < min || n > max) return undefined;
  return n;
}

function qtdCanal(valor, linha, nome) {
  if (valor == null || String(valor).trim() === "") return { valor: 0 };
  const n = decimal(valor, 4, 0, 99999999);
  if (n == null) return { erro: `${nome} inválido na linha ${linha}.` };
  return { valor: n };
}

function mesSql(valor) {
  const m = String(valor || "").trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-01`;
}

function somaPlano(valores) {
  return Number(valores.reduce((soma, n) => soma + n, 0).toFixed(4));
}

function calcular(moq, valores) {
  const total = somaPlano(valores);
  const abaixoMoq = total > 0 && moq > 0 && total < moq;
  const aComprar = total <= 0 ? 0 : (abaixoMoq ? moq : total);
  return { total, aComprar, abaixoMoq };
}

function mesmaQtd(a, b) {
  return Number(a).toFixed(4) === Number(b).toFixed(4);
}

function validacaoDe(row) {
  const validacao = {};
  for (const [chave, , okCol, porCol, emCol] of CANAIS) {
    const ok = row[okCol] === true || row[okCol] === 1;
    validacao[chave] = ok
      ? { ok: true, por: row[porCol] || "", em: row[emCol] || null }
      : { ok: false, por: null, em: null };
  }
  return validacao;
}

function mapItem(row) {
  const canais = {};
  const valores = CANAIS.map(([chave, coluna]) => {
    const n = num(row[coluna]);
    canais[chave] = n;
    return n;
  });
  const moq = num(row.MOQ);
  return {
    id: row.ID,
    codigo: row.CODIGO,
    descricao: row.DESCRICAO || "",
    moq,
    ...canais,
    validacao: validacaoDe(row),
    observacao: row.OBSERVACAO || "",
    atualizadoPor: row.ATUALIZADO_POR || "",
    ...calcular(moq, valores),
  };
}

function resumir(itens) {
  return itens.reduce((acc, item) => {
    acc.total = Number((acc.total + item.total).toFixed(4));
    acc.aComprar = Number((acc.aComprar + item.aComprar).toFixed(4));
    if (item.abaixoMoq) acc.abaixo += 1;
    return acc;
  }, { total: 0, aComprar: 0, abaixo: 0, skus: itens.length });
}

function aplicarFiltros(request, query) {
  const where = ["1 = 1"];
  const status = String(query.status || "").trim().toUpperCase();
  if (status) {
    if (!STATUS.has(status)) return { erro: "Status inválido." };
    request.input("status", sql.NVarChar(20), status);
    where.push("r.STATUS = @status");
  }
  const mes = String(query.mes || "").trim();
  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return { erro: "Mês inválido." };
    request.input("mes", sql.Char(7), mes);
    where.push("CONVERT(char(7), r.REFERENCIA, 23) = @mes");
  }
  const q = String(query.q || "").trim();
  if (q) {
    request.input("q", sql.NVarChar(160), `%${q.slice(0, 120)}%`);
    where.push(`(
      r.TITULO LIKE @q
      OR ISNULL(r.PEDIDO, N'') LIKE @q
      OR ISNULL(r.OBSERVACAO, N'') COLLATE Latin1_General_CI_AI LIKE @q
      OR EXISTS (
        SELECT 1 FROM dbo.EMB_RACIONAL_ITEM i
        WHERE i.RACIONAL_ID = r.ID
          AND (i.CODIGO LIKE @q OR ISNULL(i.DESCRICAO, N'') COLLATE Latin1_General_CI_AI LIKE @q)
      )
    )`);
  }
  return { where: where.join(" AND ") };
}

async function listar(req, res, pool) {
  const query = req.query || {};
  const pedidoResumo = pool.request();
  const filtros = aplicarFiltros(pedidoResumo, query);
  if (filtros.erro) return res.status(400).json({ success: false, error: filtros.erro });

  const resumoQuery = await pedidoResumo.query(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN r.STATUS = N'ABERTO' THEN 1 ELSE 0 END) AS ABERTOS,
      SUM(CASE WHEN r.STATUS = N'FECHADO' THEN 1 ELSE 0 END) AS FECHADOS
    FROM dbo.EMB_RACIONAL r
    WHERE ${filtros.where}
  `);

  const pedidoLista = pool.request();
  aplicarFiltros(pedidoLista, query);
  const lista = await pedidoLista.query(`
    ;WITH Base AS (
      SELECT
        r.ID,
        r.TITULO,
        r.REFERENCIA,
        r.STATUS,
        r.PEDIDO,
        r.CRIADO_POR,
        r.CRIADO_EM,
        i.ID AS ITEM_ID,
        ISNULL(i.MOQ, 0) AS MOQ,
        CASE
          WHEN i.ID IS NULL THEN CAST(0 AS DECIMAL(18,4))
          ELSE i.QTD_CLARO + i.QTD_VIVO + i.QTD_COMERCIAL + i.QTD_ONLINE + i.QTD_QUIOSQUE + i.QTD_EST_ADICIONAL
        END AS PLANO,
        CASE
          WHEN i.ID IS NULL THEN 0
          ELSE CAST(ISNULL(i.VAL_CLARO, 0) AS INT)
            + CAST(ISNULL(i.VAL_VIVO, 0) AS INT)
            + CAST(ISNULL(i.VAL_COMERCIAL, 0) AS INT)
            + CAST(ISNULL(i.VAL_ONLINE, 0) AS INT)
            + CAST(ISNULL(i.VAL_QUIOSQUE, 0) AS INT)
            + CAST(ISNULL(i.VAL_EST_ADICIONAL, 0) AS INT)
        END AS VALIDADOS
      FROM dbo.EMB_RACIONAL r
      LEFT JOIN dbo.EMB_RACIONAL_ITEM i ON i.RACIONAL_ID = r.ID
      WHERE ${filtros.where}
    ),
    Linha AS (
      SELECT
        ID, TITULO, REFERENCIA, STATUS, PEDIDO, CRIADO_POR, CRIADO_EM, ITEM_ID, PLANO, VALIDADOS,
        CASE
          WHEN ITEM_ID IS NULL OR PLANO <= 0 THEN CAST(0 AS DECIMAL(18,4))
          WHEN MOQ > 0 AND PLANO < MOQ THEN MOQ
          ELSE PLANO
        END AS COMPRAR,
        CASE
          WHEN ITEM_ID IS NOT NULL AND PLANO > 0 AND MOQ > 0 AND PLANO < MOQ THEN 1
          ELSE 0
        END AS ABAIXO
      FROM Base
    )
    SELECT
      ID, TITULO,
      CONVERT(char(7), REFERENCIA, 23) AS REFERENCIA,
      STATUS, PEDIDO, CRIADO_POR,
      CONVERT(varchar(19), CRIADO_EM, 120) AS CRIADO_EM,
      SUM(CASE WHEN ITEM_ID IS NOT NULL THEN 1 ELSE 0 END) AS QTD_SKU,
      SUM(PLANO) AS TOTAL,
      SUM(COMPRAR) AS A_COMPRAR,
      SUM(ABAIXO) AS QTD_ABAIXO,
      SUM(VALIDADOS) AS QTD_VALIDADA,
      SUM(CASE WHEN ITEM_ID IS NOT NULL THEN 6 ELSE 0 END) AS QTD_SLOTS
    FROM Linha
    GROUP BY ID, TITULO, REFERENCIA, STATUS, PEDIDO, CRIADO_POR, CRIADO_EM
    ORDER BY REFERENCIA DESC, ID DESC
    OFFSET 0 ROWS FETCH NEXT ${LIMITE_LISTA + 1} ROWS ONLY
  `);

  const linhas = lista.recordset || [];
  const truncado = linhas.length > LIMITE_LISTA;
  const pagina = truncado ? linhas.slice(0, LIMITE_LISTA) : linhas;
  const cab = resumoQuery.recordset[0] || {};
  return res.status(200).json({
    success: true,
    truncado,
    resumo: {
      total: num(cab.TOTAL),
      abertos: num(cab.ABERTOS),
      fechados: num(cab.FECHADOS),
    },
    data: pagina.map((row) => ({
      id: row.ID,
      titulo: row.TITULO,
      referencia: String(row.REFERENCIA || "").trim(),
      status: row.STATUS,
      pedido: row.PEDIDO || "",
      criadoPor: row.CRIADO_POR || "",
      criadoEm: row.CRIADO_EM || null,
      qtdSku: num(row.QTD_SKU),
      total: num(row.TOTAL),
      aComprar: num(row.A_COMPRAR),
      qtdAbaixo: num(row.QTD_ABAIXO),
      qtdValidada: num(row.QTD_VALIDADA),
      qtdSlots: num(row.QTD_SLOTS),
    })),
  });
}

async function lerCompleto(pool, id) {
  const cab = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT
        ID, TITULO,
        CONVERT(char(7), REFERENCIA, 23) AS REFERENCIA,
        STATUS, OBSERVACAO, PEDIDO, CRIADO_POR,
        CONVERT(varchar(19), CRIADO_EM, 120) AS CRIADO_EM,
        ATUALIZADO_POR,
        CONVERT(varchar(19), ATUALIZADO_EM, 120) AS ATUALIZADO_EM,
        FECHADO_POR,
        CONVERT(varchar(19), FECHADO_EM, 120) AS FECHADO_EM
      FROM dbo.EMB_RACIONAL
      WHERE ID = @id
    `);
  if (!cab.recordset.length) return null;
  const itens = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT
        ID, CODIGO, DESCRICAO, MOQ,
        QTD_CLARO, QTD_VIVO, QTD_COMERCIAL, QTD_ONLINE, QTD_QUIOSQUE, QTD_EST_ADICIONAL,
        VAL_CLARO, VAL_CLARO_POR, CONVERT(varchar(19), VAL_CLARO_EM, 120) AS VAL_CLARO_EM,
        VAL_VIVO, VAL_VIVO_POR, CONVERT(varchar(19), VAL_VIVO_EM, 120) AS VAL_VIVO_EM,
        VAL_COMERCIAL, VAL_COMERCIAL_POR, CONVERT(varchar(19), VAL_COMERCIAL_EM, 120) AS VAL_COMERCIAL_EM,
        VAL_ONLINE, VAL_ONLINE_POR, CONVERT(varchar(19), VAL_ONLINE_EM, 120) AS VAL_ONLINE_EM,
        VAL_QUIOSQUE, VAL_QUIOSQUE_POR, CONVERT(varchar(19), VAL_QUIOSQUE_EM, 120) AS VAL_QUIOSQUE_EM,
        VAL_EST_ADICIONAL, VAL_EST_ADICIONAL_POR, CONVERT(varchar(19), VAL_EST_ADICIONAL_EM, 120) AS VAL_EST_ADICIONAL_EM,
        OBSERVACAO, ATUALIZADO_POR
      FROM dbo.EMB_RACIONAL_ITEM
      WHERE RACIONAL_ID = @id
      ORDER BY ORDEM, ID
    `);
  const row = cab.recordset[0];
  const lista = (itens.recordset || []).map(mapItem);
  return {
    id: row.ID,
    titulo: row.TITULO,
    referencia: String(row.REFERENCIA || "").trim(),
    status: row.STATUS,
    observacao: row.OBSERVACAO || "",
    pedido: row.PEDIDO || "",
    criadoPor: row.CRIADO_POR || "",
    criadoEm: row.CRIADO_EM || null,
    atualizadoPor: row.ATUALIZADO_POR || "",
    atualizadoEm: row.ATUALIZADO_EM || null,
    fechadoPor: row.FECHADO_POR || "",
    fechadoEm: row.FECHADO_EM || null,
    itens: lista,
    resumo: resumir(lista),
  };
}

async function detalhe(req, res, pool) {
  const id = inteiro(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o racional." });
  const data = await lerCompleto(pool, id);
  if (!data) return res.status(404).json({ success: false, error: "Racional não encontrado." });
  return res.status(200).json({ success: true, data });
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
    data: (result.recordset || []).map((row) => ({
      codigo: row.CODIGO,
      descricao: row.DESCRICAO || "",
    })),
  });
}

async function buscarProduto(req, res, pool) {
  const codigo = String(req.query.codigo || "").trim();
  if (!codigo) return res.status(400).json({ success: false, error: "Informe o código do produto." });
  const result = await pool.request()
    .input("cod", sql.NVarChar(100), codigo.slice(0, 100))
    .query(`SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO = @cod`);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Produto não cadastrado." });
  }
  const row = result.recordset[0];
  return res.status(200).json({
    success: true,
    data: { codigo: row.CODIGO, descricao: row.DESCRICAO || "" },
  });
}

async function resolverProdutos(req, res, pool) {
  const brutos = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
  const codigos = [...new Set(
    brutos.map((codigo) => String(codigo || "").trim()).filter(Boolean)
  )].slice(0, MAX_ITENS);
  if (!codigos.length) return res.status(200).json({ success: true, data: [], ausentes: [] });
  const pedido = pool.request();
  const params = codigos.map((codigo, idx) => {
    pedido.input("c" + idx, sql.NVarChar(100), codigo.slice(0, 100));
    return "@c" + idx;
  });
  const result = await pedido.query(`
    SELECT CODIGO, DESCRICAO
    FROM dbo.CAD_PROD
    WHERE CODIGO IN (${params.join(", ")})
  `);
  const porCodigo = new Map();
  for (const row of result.recordset || []) {
    porCodigo.set(String(row.CODIGO).toUpperCase(), {
      codigo: row.CODIGO,
      descricao: row.DESCRICAO || "",
    });
  }
  const data = [];
  const ausentes = [];
  codigos.forEach((codigo) => {
    const achado = porCodigo.get(codigo.toUpperCase());
    if (achado) data.push(achado);
    else ausentes.push(codigo);
  });
  return res.status(200).json({ success: true, data, ausentes });
}

function montarItens(brutos) {
  if (!Array.isArray(brutos) || brutos.length === 0) {
    return { erro: "Inclua ao menos um produto." };
  }
  if (brutos.length > MAX_ITENS) return { erro: `O racional aceita no máximo ${MAX_ITENS} produtos.` };
  const itens = [];
  const vistos = new Set();
  for (let i = 0; i < brutos.length; i++) {
    const linha = i + 1;
    const bruto = brutos[i] || {};
    const codigo = String(bruto.codigo || "").trim();
    if (!codigo) return { erro: `Informe o produto da linha ${linha}.` };
    if (codigo.length > 100) return { erro: `O código da linha ${linha} é longo demais.` };
    const chave = codigo.toUpperCase();
    if (vistos.has(chave)) return { erro: `O produto ${codigo} está repetido.` };
    vistos.add(chave);
    const moq = qtdCanal(bruto.moq, linha, "MOQ");
    if (moq.erro) return { erro: moq.erro };
    const canais = {};
    const valores = [];
    for (const [nome, rotulo] of [
      ["claro", "Claro"],
      ["vivo", "Vivo"],
      ["comercial", "Comercial"],
      ["online", "On line"],
      ["quiosque", "Quiosque"],
      ["estAdicional", "Est. adicional"],
    ]) {
      const qtd = qtdCanal(bruto[nome], linha, rotulo);
      if (qtd.erro) return { erro: qtd.erro };
      canais[nome] = qtd.valor;
      valores.push(qtd.valor);
    }
    const pedidoVal = bruto.validacao || {};
    const validacao = {};
    for (const [nome] of CANAIS) {
      validacao[nome] = pedidoVal[nome] === true || pedidoVal[nome] === 1;
    }
    itens.push({
      codigo,
      moq: moq.valor,
      ...canais,
      validacao,
      observacao: texto(bruto.observacao, 300),
      ...calcular(moq.valor, valores),
    });
  }
  return { itens };
}

async function completarProdutos(pool, itens) {
  const pedido = pool.request();
  const params = itens.map((item, idx) => {
    pedido.input("c" + idx, sql.NVarChar(100), item.codigo);
    return "@c" + idx;
  });
  const produtos = await pedido.query(`
    SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO IN (${params.join(", ")})
  `);
  const porCodigo = new Map();
  for (const row of produtos.recordset || []) {
    porCodigo.set(String(row.CODIGO).toUpperCase(), row);
  }
  const faltando = [];
  for (const item of itens) {
    const achado = porCodigo.get(item.codigo.toUpperCase());
    if (!achado) {
      faltando.push(item.codigo);
      continue;
    }
    item.codigo = achado.CODIGO;
    item.descricao = String(achado.DESCRICAO || "").slice(0, 300);
  }
  return faltando;
}

function resolverValidacoes(itens, anteriores, quem, agora, pode) {
  for (const item of itens) {
    const anterior = anteriores.get(String(item.codigo).toUpperCase());
    const validacao = {};
    for (const [chave, , , , , , rotulo] of CANAIS) {
      const pedido = !!(item.validacao && item.validacao[chave]);
      const velho = anterior && anterior[chave];
      const mantem = !!(velho && velho.ok && mesmaQtd(velho.qtd, item[chave]));
      if (pedido && mantem) {
        validacao[chave] = { ok: true, por: velho.por || quem, em: velho.em || agora };
      } else if (pedido) {
        if (!pode[chave]) return `Sem permissão para validar ${rotulo}.`;
        validacao[chave] = { ok: true, por: quem, em: agora };
      } else if (mantem) {
        if (!pode[chave]) return `Sem permissão para retirar a validação de ${rotulo}.`;
        validacao[chave] = { ok: false, por: null, em: null };
      } else {
        validacao[chave] = { ok: false, por: null, em: null };
      }
    }
    item.validacao = validacao;
  }
  return "";
}

async function permissoesDosCanais(req) {
  const nivel = nivelDoRequest(req);
  const pode = {};
  for (const [chave, , , , , link] of CANAIS) {
    pode[chave] = await podeAcessar(link, nivel);
  }
  return pode;
}

async function lerValidacoes(executor, racionalId) {
  const cols = CANAIS.map(([, qtd, ok, por, em]) =>
    `${qtd}, ${ok}, ${por}, CONVERT(varchar(19), ${em}, 120) AS ${em}`
  ).join(", ");
  const rows = await new sql.Request(executor)
    .input("id", sql.Int, racionalId)
    .query(`SELECT CODIGO, ${cols} FROM dbo.EMB_RACIONAL_ITEM WHERE RACIONAL_ID = @id`);
  const mapa = new Map();
  for (const row of rows.recordset || []) {
    const item = {};
    for (const [chave, qtd, ok, por, em] of CANAIS) {
      item[chave] = {
        qtd: num(row[qtd]),
        ok: row[ok] === true || row[ok] === 1,
        por: row[por] || "",
        em: row[em] || null,
      };
    }
    mapa.set(String(row.CODIGO).toUpperCase(), item);
  }
  return mapa;
}

async function gravarItens(transaction, racionalId, itens, quem) {
  await new sql.Request(transaction)
    .input("id", sql.Int, racionalId)
    .query(`DELETE FROM dbo.EMB_RACIONAL_ITEM WHERE RACIONAL_ID = @id`);
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const pedido = new sql.Request(transaction)
      .input("rac", sql.Int, racionalId)
      .input("cod", sql.NVarChar(100), item.codigo)
      .input("desc", sql.NVarChar(300), item.descricao || null)
      .input("moq", sql.Decimal(18, 4), item.moq)
      .input("claro", sql.Decimal(18, 4), item.claro)
      .input("vivo", sql.Decimal(18, 4), item.vivo)
      .input("comercial", sql.Decimal(18, 4), item.comercial)
      .input("online", sql.Decimal(18, 4), item.online)
      .input("quiosque", sql.Decimal(18, 4), item.quiosque)
      .input("est", sql.Decimal(18, 4), item.estAdicional)
      .input("obs", sql.NVarChar(300), item.observacao)
      .input("ordem", sql.Int, i)
      .input("quem", sql.NVarChar(100), quem);
    for (const [chave, , okCol] of CANAIS) {
      const val = (item.validacao && item.validacao[chave]) || { ok: false, por: null, em: null };
      const prefixo = okCol.slice(4).replace(/^_/, "").toLowerCase();
      pedido.input("ok" + prefixo, sql.Bit, val.ok ? 1 : 0);
      pedido.input("por" + prefixo, sql.NVarChar(100), val.ok ? texto(val.por, 100) : null);
      pedido.input("em" + prefixo, sql.VarChar(19), val.ok ? val.em : null);
    }
    await pedido.query(`
        INSERT INTO dbo.EMB_RACIONAL_ITEM (
          RACIONAL_ID, CODIGO, DESCRICAO, MOQ,
          QTD_CLARO, QTD_VIVO, QTD_COMERCIAL, QTD_ONLINE, QTD_QUIOSQUE, QTD_EST_ADICIONAL,
          VAL_CLARO, VAL_CLARO_POR, VAL_CLARO_EM,
          VAL_VIVO, VAL_VIVO_POR, VAL_VIVO_EM,
          VAL_COMERCIAL, VAL_COMERCIAL_POR, VAL_COMERCIAL_EM,
          VAL_ONLINE, VAL_ONLINE_POR, VAL_ONLINE_EM,
          VAL_QUIOSQUE, VAL_QUIOSQUE_POR, VAL_QUIOSQUE_EM,
          VAL_EST_ADICIONAL, VAL_EST_ADICIONAL_POR, VAL_EST_ADICIONAL_EM,
          OBSERVACAO, ORDEM, ATUALIZADO_POR
        ) VALUES (
          @rac, @cod, @desc, @moq,
          @claro, @vivo, @comercial, @online, @quiosque, @est,
          @okclaro, @porclaro, CAST(NULLIF(@emclaro, '') AS DATETIME),
          @okvivo, @porvivo, CAST(NULLIF(@emvivo, '') AS DATETIME),
          @okcomercial, @porcomercial, CAST(NULLIF(@emcomercial, '') AS DATETIME),
          @okonline, @poronline, CAST(NULLIF(@emonline, '') AS DATETIME),
          @okquiosque, @porquiosque, CAST(NULLIF(@emquiosque, '') AS DATETIME),
          @okest_adicional, @porest_adicional, CAST(NULLIF(@emest_adicional, '') AS DATETIME),
          @obs, @ordem, @quem
        )
      `);
  }
}

async function salvar(req, res, pool) {
  const body = req.body || {};
  const id = body.id == null || body.id === "" ? null : inteiro(body.id);
  if (body.id != null && body.id !== "" && !id) {
    return res.status(400).json({ success: false, error: "Racional inválido." });
  }
  const titulo = texto(body.titulo, 120);
  if (!titulo) return res.status(400).json({ success: false, error: "Informe o título do racional." });
  const referencia = mesSql(body.referencia);
  if (!referencia) return res.status(400).json({ success: false, error: "Informe o mês de referência." });
  const observacao = texto(body.observacao, 1000);
  const pedidoTxt = texto(body.pedido, 80);
  const montado = montarItens(body.itens);
  if (montado.erro) return res.status(400).json({ success: false, error: montado.erro });
  const faltando = await completarProdutos(pool, montado.itens);
  if (faltando.length) {
    return res.status(400).json({
      success: false,
      error: `Produto não cadastrado: ${[...new Set(faltando)].slice(0, 8).join(", ")}.`,
    });
  }

  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let racionalId = id;
    if (id) {
      const atual = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .query(`SELECT STATUS FROM dbo.EMB_RACIONAL WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id`);
      if (!atual.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Racional não encontrado." });
      }
      if (atual.recordset[0].STATUS !== "ABERTO") {
        await transaction.rollback();
        return res.status(409).json({ success: false, error: "Reabra o racional para alterar os dados." });
      }
      await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("titulo", sql.NVarChar(120), titulo)
        .input("ref", sql.Date, referencia)
        .input("obs", sql.NVarChar(1000), observacao)
        .input("pedido", sql.NVarChar(80), pedidoTxt)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          UPDATE dbo.EMB_RACIONAL SET
            TITULO = @titulo,
            REFERENCIA = @ref,
            OBSERVACAO = @obs,
            PEDIDO = @pedido,
            ATUALIZADO_EM = CAST(@agora AS DATETIME),
            ATUALIZADO_POR = @quem
          WHERE ID = @id
        `);
    } else {
      const criado = await new sql.Request(transaction)
        .input("titulo", sql.NVarChar(120), titulo)
        .input("ref", sql.Date, referencia)
        .input("obs", sql.NVarChar(1000), observacao)
        .input("pedido", sql.NVarChar(80), pedidoTxt)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          INSERT INTO dbo.EMB_RACIONAL (
            TITULO, REFERENCIA, STATUS, OBSERVACAO, PEDIDO, CRIADO_EM, CRIADO_POR
          )
          OUTPUT INSERTED.ID
          VALUES (
            @titulo, @ref, N'ABERTO', @obs, @pedido, CAST(@agora AS DATETIME), @quem
          )
        `);
      racionalId = criado.recordset[0].ID;
    }
    const anteriores = id ? await lerValidacoes(transaction, racionalId) : new Map();
    const erroVal = resolverValidacoes(
      montado.itens,
      anteriores,
      quem,
      agora,
      await permissoesDosCanais(req)
    );
    if (erroVal) {
      await transaction.rollback();
      return res.status(403).json({ success: false, error: erroVal });
    }
    await gravarItens(transaction, racionalId, montado.itens, quem);
    await transaction.commit();
    return res.status(200).json({ success: true, data: await lerCompleto(pool, racionalId) });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    if (err && (err.number === 2627 || err.number === 2601)) {
      return res.status(409).json({ success: false, error: "Há um produto repetido neste racional." });
    }
    throw err;
  }
}

async function decidir(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id);
  const status = String(body.status || "").trim().toUpperCase();
  if (!id) return res.status(400).json({ success: false, error: "Informe o racional." });
  if (!STATUS.has(status)) return res.status(400).json({ success: false, error: "Situação inválida." });
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT STATUS FROM dbo.EMB_RACIONAL WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id`);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Racional não encontrado." });
    }
    if (atual.recordset[0].STATUS === status) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        error: status === "ABERTO" ? "Este racional já está em aberto." : "Este racional já está fechado.",
      });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        UPDATE dbo.EMB_RACIONAL SET
          STATUS = @status,
          FECHADO_EM = CASE WHEN @status = N'FECHADO' THEN CAST(@agora AS DATETIME) ELSE NULL END,
          FECHADO_POR = CASE WHEN @status = N'FECHADO' THEN @quem ELSE NULL END,
          ATUALIZADO_EM = CAST(@agora AS DATETIME),
          ATUALIZADO_POR = @quem
        WHERE ID = @id
      `);
    await transaction.commit();
    return res.status(200).json({ success: true, data: await lerCompleto(pool, id) });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function duplicar(req, res, pool) {
  const id = inteiro(req.body && req.body.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o racional." });
  const origem = await lerCompleto(pool, id);
  if (!origem) return res.status(404).json({ success: false, error: "Racional não encontrado." });
  if (!origem.itens.length) {
    return res.status(400).json({ success: false, error: "Este racional não tem produtos para copiar." });
  }
  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const titulo = `Cópia de ${origem.titulo}`.slice(0, 120);
  const referencia = mesSql(origem.referencia);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const criado = await new sql.Request(transaction)
      .input("titulo", sql.NVarChar(120), titulo)
      .input("ref", sql.Date, referencia)
      .input("obs", sql.NVarChar(1000), texto(origem.observacao, 1000))
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .query(`
        INSERT INTO dbo.EMB_RACIONAL (
          TITULO, REFERENCIA, STATUS, OBSERVACAO, PEDIDO, CRIADO_EM, CRIADO_POR
        )
        OUTPUT INSERTED.ID
        VALUES (
          @titulo, @ref, N'ABERTO', @obs, NULL, CAST(@agora AS DATETIME), @quem
        )
      `);
    const novoId = criado.recordset[0].ID;
    for (const item of origem.itens) {
      const limpa = {};
      for (const [chave] of CANAIS) limpa[chave] = { ok: false, por: null, em: null };
      item.validacao = limpa;
    }
    await gravarItens(transaction, novoId, origem.itens, quem);
    await transaction.commit();
    return res.status(200).json({ success: true, data: await lerCompleto(pool, novoId) });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function excluir(req, res, pool) {
  const id = inteiro((req.body && req.body.id) || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o racional." });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`SELECT STATUS FROM dbo.EMB_RACIONAL WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id`);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Racional não encontrado." });
    }
    if (atual.recordset[0].STATUS !== "ABERTO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Reabra o racional antes de excluir." });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.EMB_RACIONAL WHERE ID = @id`);
    await transaction.commit();
    return res.status(200).json({ success: true });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}
