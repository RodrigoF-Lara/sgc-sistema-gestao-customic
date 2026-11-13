import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";
import { seedPermissaoOrcamentos } from "./permissoesApi.js";

const LINK = "orcamentos";
const STATUS = new Set(["ABERTO", "APROVADO", "REPROVADO"]);
const URGENCIAS = new Set(["BAIXA", "NORMAL", "ALTA", "URGENTE"]);
const LIMITE_LISTA = 300;
const MAX_ANEXO = 3 * 1024 * 1024;
const MAX_PDF = 5;
const MAX_IMAGEM = 10;
const MAX_ANEXOS = 12;
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

export async function handleOrcamento(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-level, x-user-code, x-user-name");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = String(req.query.acao || req.body?.acao || "").trim();

  try {
    const pool = await getConnection();
    await ensureTables(pool);
    if (!(await exigirPermissao(req, res, LINK, "Sem permissão para orçamentos."))) return;

    if (req.method === "GET" && (acao === "" || acao === "listar")) return await listar(req, res, pool);
    if (req.method === "GET" && acao === "detalhe") return await detalhe(req, res, pool);
    if (req.method === "GET" && acao === "fornecedores") return await buscarFornecedores(req, res, pool);
    if (req.method === "GET" && acao === "fornecedor") return await buscarFornecedor(req, res, pool);
    if (req.method === "GET" && acao === "produtos") return await buscarProdutos(req, res, pool);
    if (req.method === "GET" && acao === "produto") return await buscarProduto(req, res, pool);
    if ((req.method === "GET" || req.method === "POST") && acao === "compras") return await comprasRecentes(req, res, pool);
    if (req.method === "GET" && acao === "anexo") return await baixarAnexo(req, res, pool);
    if (req.method === "POST" && acao === "anexo") return await gravarAnexo(req, res, pool);
    if (req.method === "POST" && acao === "excluirAnexo") return await excluirAnexo(req, res, pool);
    if (req.method === "POST" && acao === "salvar") return await salvar(req, res, pool);
    if (req.method === "POST" && acao === "decidir") return await decidir(req, res, pool);
    if ((req.method === "POST" && acao === "excluir") || req.method === "DELETE") {
      return await excluir(req, res, pool);
    }
    return res.status(400).json({ success: false, error: "Ação inválida." });
  } catch (err) {
    console.error("[orcamento]", err);
    return res.status(500).json({ success: false, error: "Não foi possível concluir a operação de orçamento." });
  }
}

async function ensureTables(pool) {
  if (!tablesReady) {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.EMB_ORCAMENTO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ORCAMENTO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          NUMERO NVARCHAR(40) NULL,
          COD_FORNECEDOR INT NOT NULL,
          DATA_ORCAMENTO DATE NOT NULL,
          PRAZO_DIAS INT NULL,
          DATA_ENTREGA DATE NULL,
          DATA_APROVACAO DATE NULL,
          CONDICAO_PAGAMENTO NVARCHAR(80) NULL,
          STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_EMB_ORC_ST DEFAULT (N'ABERTO'),
          OBSERVACAO NVARCHAR(1000) NULL,
          MOTIVO_DECISAO NVARCHAR(500) NULL,
          ID_NF INT NULL,
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ORC_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          ATUALIZADO_EM DATETIME NULL,
          ATUALIZADO_POR NVARCHAR(100) NULL,
          APROVADO_EM DATETIME NULL,
          APROVADO_POR NVARCHAR(100) NULL,
          CONSTRAINT CK_EMB_ORC_STATUS CHECK (STATUS IN (N'ABERTO', N'APROVADO', N'REPROVADO')),
          CONSTRAINT CK_EMB_ORC_PRAZO CHECK (PRAZO_DIAS IS NULL OR (PRAZO_DIAS >= 0 AND PRAZO_DIAS <= 9999))
        );
        CREATE UNIQUE INDEX UX_EMB_ORC_NUMERO ON dbo.EMB_ORCAMENTO (NUMERO) WHERE NUMERO IS NOT NULL;
        CREATE INDEX IX_EMB_ORC_LISTA ON dbo.EMB_ORCAMENTO (DATA_ORCAMENTO DESC, ID DESC) INCLUDE (STATUS, COD_FORNECEDOR);
        CREATE INDEX IX_EMB_ORC_NF ON dbo.EMB_ORCAMENTO (ID_NF) WHERE ID_NF IS NOT NULL;
      END;

      IF OBJECT_ID(N'dbo.EMB_ORCAMENTO_ITEM', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ORCAMENTO_ITEM (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ORCAMENTO_ID INT NOT NULL,
          CODIGO NVARCHAR(100) NOT NULL,
          DESCRICAO NVARCHAR(300) NULL,
          QUANTIDADE DECIMAL(18,4) NOT NULL,
          VALOR_UNITARIO DECIMAL(18,6) NOT NULL,
          VALOR_TOTAL DECIMAL(18,4) NOT NULL,
          PRAZO_DIAS INT NULL,
          URGENCIA NVARCHAR(20) NOT NULL CONSTRAINT DF_EMB_ORC_ITEM_URG DEFAULT (N'NORMAL'),
          ORDEM INT NOT NULL CONSTRAINT DF_EMB_ORC_ITEM_ORD DEFAULT (0),
          CONSTRAINT FK_EMB_ORC_ITEM_ORC FOREIGN KEY (ORCAMENTO_ID)
            REFERENCES dbo.EMB_ORCAMENTO (ID) ON DELETE CASCADE,
          CONSTRAINT CK_EMB_ORC_ITEM_QTD CHECK (QUANTIDADE > 0),
          CONSTRAINT CK_EMB_ORC_ITEM_VALOR CHECK (VALOR_UNITARIO >= 0 AND VALOR_TOTAL >= 0),
          CONSTRAINT CK_EMB_ORC_ITEM_PRAZO CHECK (PRAZO_DIAS IS NULL OR (PRAZO_DIAS >= 0 AND PRAZO_DIAS <= 9999)),
          CONSTRAINT CK_EMB_ORC_ITEM_URG CHECK (URGENCIA IN (N'BAIXA', N'NORMAL', N'ALTA', N'URGENTE'))
        );
        CREATE INDEX IX_EMB_ORC_ITEM_ORC ON dbo.EMB_ORCAMENTO_ITEM (ORCAMENTO_ID, ORDEM, ID);
        CREATE INDEX IX_EMB_ORC_ITEM_COD ON dbo.EMB_ORCAMENTO_ITEM (CODIGO);
      END;

      IF OBJECT_ID(N'dbo.EMB_ORCAMENTO_ANEXO', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMB_ORCAMENTO_ANEXO (
          ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ORCAMENTO_ID INT NOT NULL,
          TIPO NVARCHAR(20) NOT NULL,
          NOME_ARQUIVO NVARCHAR(255) NOT NULL,
          MIME NVARCHAR(80) NOT NULL,
          CONTEUDO VARBINARY(MAX) NOT NULL,
          TAMANHO INT NOT NULL,
          CRIADO_EM DATETIME NOT NULL CONSTRAINT DF_EMB_ORC_ANEXO_CR DEFAULT (GETDATE()),
          CRIADO_POR NVARCHAR(100) NULL,
          CONSTRAINT FK_EMB_ORC_ANEXO_ORC FOREIGN KEY (ORCAMENTO_ID)
            REFERENCES dbo.EMB_ORCAMENTO (ID) ON DELETE CASCADE,
          CONSTRAINT CK_EMB_ORC_ANEXO_TIPO CHECK (TIPO IN (N'PDF', N'IMAGEM')),
          CONSTRAINT CK_EMB_ORC_ANEXO_TAM CHECK (TAMANHO > 0 AND TAMANHO <= 3145728)
        );
        CREATE INDEX IX_EMB_ORC_ANEXO_ORC ON dbo.EMB_ORCAMENTO_ANEXO (ORCAMENTO_ID, ID);
      END;
    `);
    await pool.request().query(`
      IF COL_LENGTH('dbo.EMB_ORCAMENTO', 'CONDICAO_PAGAMENTO') IS NULL
        ALTER TABLE dbo.EMB_ORCAMENTO ADD CONDICAO_PAGAMENTO NVARCHAR(80) NULL;
    `);
    await pool.request().query(`
      IF COL_LENGTH('dbo.EMB_ORCAMENTO', 'DATA_APROVACAO') IS NULL
        ALTER TABLE dbo.EMB_ORCAMENTO ADD DATA_APROVACAO DATE NULL;
    `);
    await pool.request().query(`
      UPDATE dbo.EMB_ORCAMENTO
      SET DATA_APROVACAO = CAST(APROVADO_EM AS DATE)
      WHERE STATUS = N'APROVADO'
        AND DATA_APROVACAO IS NULL
        AND APROVADO_EM IS NOT NULL;

      UPDATE dbo.EMB_ORCAMENTO
      SET DATA_ENTREGA = DATEADD(DAY, PRAZO_DIAS, DATA_APROVACAO)
      WHERE STATUS = N'APROVADO'
        AND DATA_APROVACAO IS NOT NULL
        AND PRAZO_DIAS IS NOT NULL
        AND (
          DATA_ENTREGA IS NULL
          OR DATA_ENTREGA = DATEADD(DAY, PRAZO_DIAS, DATA_ORCAMENTO)
        );
    `);
    await pool.request().query(`
      IF COL_LENGTH('dbo.EMB_ORCAMENTO_ITEM', 'URGENCIA') IS NULL
        ALTER TABLE dbo.EMB_ORCAMENTO_ITEM
          ADD URGENCIA NVARCHAR(20) NOT NULL
          CONSTRAINT DF_EMB_ORC_ITEM_URG DEFAULT (N'NORMAL');
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EMB_ORC_ITEM_URG')
        ALTER TABLE dbo.EMB_ORCAMENTO_ITEM
          ADD CONSTRAINT CK_EMB_ORC_ITEM_URG
          CHECK (URGENCIA IN (N'BAIXA', N'NORMAL', N'ALTA', N'URGENTE'));
    `);
    tablesReady = true;
  }
  await seedPermissaoOrcamentos(pool);
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

function dataSql(valor) {
  if (valor == null || valor === "") return null;
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt;
}

function somarDias(data, dias) {
  const dt = new Date(data.getTime());
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt;
}

function prazoDias(valor) {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 9999) return undefined;
  return n;
}

function parseNumeroBr(valor) {
  let s = String(valor ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const partes = s.split(".");
    const milhar = partes.length > 1
      && partes.slice(1).every((p) => /^\d{3}$/.test(p))
      && !/^0+$/.test(partes[0] || "0");
    if (milhar) s = partes.join("");
  }
  return Number(s);
}

function decimal(valor, casas, min, max) {
  if (valor == null || valor === "") return undefined;
  const bruto = typeof valor === "number" ? valor : parseNumeroBr(valor);
  if (!Number.isFinite(bruto)) return undefined;
  const n = Number(bruto.toFixed(casas));
  if (n < min || n > max) return undefined;
  return n;
}

function urgenciaItem(valor) {
  if (valor == null || String(valor).trim() === "") return "NORMAL";
  const s = String(valor).trim().toUpperCase();
  if (!URGENCIAS.has(s)) return undefined;
  return s;
}

function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function aplicarFiltros(request, query) {
  const where = ["1 = 1"];
  const status = String(query.status || "").trim().toUpperCase();
  if (status) {
    if (!STATUS.has(status)) return { erro: "Status inválido." };
    request.input("status", sql.NVarChar(20), status);
    where.push("o.STATUS = @status");
  }
  const q = String(query.q || "").trim();
  if (q) {
    request.input("q", sql.NVarChar(160), `%${q.slice(0, 120)}%`);
    where.push(`(
      o.NUMERO LIKE @q
      OR CAST(o.COD_FORNECEDOR AS VARCHAR(20)) LIKE @q
      OR f.RAZAO_SOCIAL COLLATE Latin1_General_CI_AI LIKE @q
      OR ISNULL(o.OBSERVACAO, N'') COLLATE Latin1_General_CI_AI LIKE @q
      OR ISNULL(o.CONDICAO_PAGAMENTO, N'') COLLATE Latin1_General_CI_AI LIKE @q
      OR EXISTS (
        SELECT 1 FROM dbo.EMB_ORCAMENTO_ITEM i
        WHERE i.ORCAMENTO_ID = o.ID
          AND (i.CODIGO LIKE @q OR ISNULL(i.DESCRICAO, N'') COLLATE Latin1_General_CI_AI LIKE @q)
      )
    )`);
  }
  const de = dataSql(query.de);
  if (de === undefined) return { erro: "Data inicial inválida." };
  if (de) {
    request.input("de", sql.Date, de);
    where.push("o.DATA_ORCAMENTO >= @de");
  }
  const ate = dataSql(query.ate);
  if (ate === undefined) return { erro: "Data final inválida." };
  if (ate) {
    request.input("ate", sql.Date, ate);
    where.push("o.DATA_ORCAMENTO <= @ate");
  }
  return { where: where.join(" AND ") };
}

function mapItem(row) {
  return {
    id: row.ID,
    codigo: row.CODIGO,
    descricao: row.DESCRICAO || "",
    quantidade: num(row.QUANTIDADE),
    valorUnitario: num(row.VALOR_UNITARIO),
    valorTotal: num(row.VALOR_TOTAL),
    prazoDias: row.PRAZO_DIAS == null ? null : Number(row.PRAZO_DIAS),
    urgencia: URGENCIAS.has(String(row.URGENCIA || "").toUpperCase())
      ? String(row.URGENCIA).toUpperCase()
      : "NORMAL",
  };
}

function mapOrcamento(row, itens, anexos) {
  const lista = itens || [];
  const valor = lista.length
    ? lista.reduce((s, item) => s + num(item.valorTotal), 0)
    : num(row.VALOR_TOTAL);
  return {
    id: row.ID,
    numero: row.NUMERO || "",
    codFornecedor: row.COD_FORNECEDOR,
    razaoSocial: row.RAZAO_SOCIAL || "",
    dataOrcamento: row.DATA_ORCAMENTO || null,
    prazoDias: row.PRAZO_DIAS == null ? null : Number(row.PRAZO_DIAS),
    dataEntrega: row.DATA_ENTREGA || null,
    dataAprovacao: row.DATA_APROVACAO || null,
    condicaoPagamento: row.CONDICAO_PAGAMENTO || "",
    status: row.STATUS,
    observacao: row.OBSERVACAO || "",
    motivo: row.MOTIVO_DECISAO || "",
    idNf: row.ID_NF == null ? null : Number(row.ID_NF),
    numNf: row.NUM_NF || "",
    statusNf: row.STATUS_NF || "",
    criadoEm: row.CRIADO_EM || null,
    criadoPor: row.CRIADO_POR || "",
    atualizadoEm: row.ATUALIZADO_EM || null,
    atualizadoPor: row.ATUALIZADO_POR || "",
    aprovadoEm: row.APROVADO_EM || null,
    aprovadoPor: row.APROVADO_POR || "",
    qtdItens: row.QTD_ITENS != null ? Number(row.QTD_ITENS) : lista.length,
    qtdAnexos: row.QTD_ANEXOS != null ? Number(row.QTD_ANEXOS) : (anexos ? anexos.length : 0),
    valorTotal: Number(valor.toFixed(4)),
    urgencia: URGENCIAS.has(String(row.URGENCIA || "").toUpperCase())
      ? String(row.URGENCIA).toUpperCase()
      : (row.URGENCIA == null ? "" : "NORMAL"),
    resumoProdutos: row.RESUMO_PRODUTOS || "",
    itens: lista,
    anexos: anexos || [],
  };
}

async function listar(req, res, pool) {
  const pedido = pool.request();
  const filtro = aplicarFiltros(pedido, req.query || {});
  if (filtro.erro) return res.status(400).json({ success: false, error: filtro.erro });

  const pedidoResumo = pool.request();
  const filtroResumo = aplicarFiltros(pedidoResumo, req.query || {});
  const [lista, resumo] = await Promise.all([
    pedido.query(`
      SELECT TOP (${LIMITE_LISTA})
        o.ID,
        o.NUMERO,
        o.COD_FORNECEDOR,
        f.RAZAO_SOCIAL,
        CONVERT(VARCHAR(10), o.DATA_ORCAMENTO, 23) AS DATA_ORCAMENTO,
        o.PRAZO_DIAS,
        CONVERT(VARCHAR(10), o.DATA_ENTREGA, 23) AS DATA_ENTREGA,
        CONVERT(VARCHAR(10), o.DATA_APROVACAO, 23) AS DATA_APROVACAO,
        o.CONDICAO_PAGAMENTO,
        o.STATUS,
        o.ID_NF,
        CAST(nf.CAB_NUM_NF AS NVARCHAR(40)) AS NUM_NF,
        (SELECT COUNT(*) FROM dbo.EMB_ORCAMENTO_ITEM i WHERE i.ORCAMENTO_ID = o.ID) AS QTD_ITENS,
        (SELECT COUNT(*) FROM dbo.EMB_ORCAMENTO_ANEXO a WHERE a.ORCAMENTO_ID = o.ID) AS QTD_ANEXOS,
        (SELECT ISNULL(SUM(i.VALOR_TOTAL), 0) FROM dbo.EMB_ORCAMENTO_ITEM i WHERE i.ORCAMENTO_ID = o.ID) AS VALOR_TOTAL,
        (
          SELECT TOP 1 i.URGENCIA
          FROM dbo.EMB_ORCAMENTO_ITEM i
          WHERE i.ORCAMENTO_ID = o.ID
          ORDER BY CASE i.URGENCIA
            WHEN N'URGENTE' THEN 0
            WHEN N'ALTA' THEN 1
            WHEN N'NORMAL' THEN 2
            WHEN N'BAIXA' THEN 3
            ELSE 9
          END, i.ORDEM, i.ID
        ) AS URGENCIA,
        (
          SELECT STRING_AGG(s.CODIGO, ', ') WITHIN GROUP (ORDER BY s.ORDEM, s.ID)
          FROM (
            SELECT TOP 3 i.CODIGO, i.ORDEM, i.ID
            FROM dbo.EMB_ORCAMENTO_ITEM i
            WHERE i.ORCAMENTO_ID = o.ID
            ORDER BY i.ORDEM, i.ID
          ) s
        ) AS RESUMO_PRODUTOS
      FROM dbo.EMB_ORCAMENTO o
      LEFT JOIN dbo.CAD_FORNECEDOR f ON f.COD_FORNECEDOR = o.COD_FORNECEDOR
      LEFT JOIN dbo.NF_CABECALHO nf ON nf.CAB_ID_NF = o.ID_NF
      WHERE ${filtro.where}
      ORDER BY o.DATA_ORCAMENTO DESC, o.ID DESC
    `),
    pedidoResumo.query(`
      SELECT
        COUNT(*) AS TOTAL,
        SUM(CASE WHEN o.STATUS = N'ABERTO' THEN 1 ELSE 0 END) AS ABERTOS,
        SUM(CASE WHEN o.STATUS = N'APROVADO' THEN 1 ELSE 0 END) AS APROVADOS,
        SUM(CASE WHEN o.STATUS = N'REPROVADO' THEN 1 ELSE 0 END) AS REPROVADOS,
        ISNULL(SUM(CASE WHEN o.STATUS = N'APROVADO' THEN v.VALOR ELSE 0 END), 0) AS VALOR_APROVADO
      FROM dbo.EMB_ORCAMENTO o
      LEFT JOIN dbo.CAD_FORNECEDOR f ON f.COD_FORNECEDOR = o.COD_FORNECEDOR
      OUTER APPLY (
        SELECT ISNULL(SUM(i.VALOR_TOTAL), 0) AS VALOR
        FROM dbo.EMB_ORCAMENTO_ITEM i
        WHERE i.ORCAMENTO_ID = o.ID
      ) v
      WHERE ${filtroResumo.where}
    `),
  ]);

  const cab = resumo.recordset[0] || {};
  const total = Number(cab.TOTAL || 0);
  return res.status(200).json({
    success: true,
    data: (lista.recordset || []).map((row) => mapOrcamento(row)),
    resumo: {
      total,
      abertos: Number(cab.ABERTOS || 0),
      aprovados: Number(cab.APROVADOS || 0),
      reprovados: Number(cab.REPROVADOS || 0),
      valorAprovado: num(cab.VALOR_APROVADO),
    },
    truncado: total > LIMITE_LISTA,
  });
}

async function lerCompleto(pool, id) {
  const cab = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT
        o.ID, o.NUMERO, o.COD_FORNECEDOR, f.RAZAO_SOCIAL,
        CONVERT(VARCHAR(10), o.DATA_ORCAMENTO, 23) AS DATA_ORCAMENTO,
        o.PRAZO_DIAS,
        CONVERT(VARCHAR(10), o.DATA_ENTREGA, 23) AS DATA_ENTREGA,
        CONVERT(VARCHAR(10), o.DATA_APROVACAO, 23) AS DATA_APROVACAO,
        o.CONDICAO_PAGAMENTO,
        o.STATUS, o.OBSERVACAO, o.MOTIVO_DECISAO, o.ID_NF,
        CAST(nf.CAB_NUM_NF AS NVARCHAR(40)) AS NUM_NF,
        nf.CAB_STATUS AS STATUS_NF,
        CONVERT(VARCHAR(16), o.CRIADO_EM, 120) AS CRIADO_EM,
        o.CRIADO_POR,
        CONVERT(VARCHAR(16), o.ATUALIZADO_EM, 120) AS ATUALIZADO_EM,
        o.ATUALIZADO_POR,
        CONVERT(VARCHAR(16), o.APROVADO_EM, 120) AS APROVADO_EM,
        o.APROVADO_POR
      FROM dbo.EMB_ORCAMENTO o
      LEFT JOIN dbo.CAD_FORNECEDOR f ON f.COD_FORNECEDOR = o.COD_FORNECEDOR
      LEFT JOIN dbo.NF_CABECALHO nf ON nf.CAB_ID_NF = o.ID_NF
      WHERE o.ID = @id
    `);
  if (!cab.recordset.length) return null;
  const itens = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT ID, CODIGO, DESCRICAO, QUANTIDADE, VALOR_UNITARIO, VALOR_TOTAL, PRAZO_DIAS, URGENCIA
      FROM dbo.EMB_ORCAMENTO_ITEM
      WHERE ORCAMENTO_ID = @id
      ORDER BY ORDEM, ID
    `);
  const anexos = await listarAnexos(pool, id);
  return mapOrcamento(cab.recordset[0], (itens.recordset || []).map(mapItem), anexos);
}

async function detalhe(req, res, pool) {
  const id = inteiro(req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o orçamento." });
  const data = await lerCompleto(pool, id);
  if (!data) return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
  return res.status(200).json({ success: true, data });
}

async function buscarFornecedores(req, res, pool) {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) return res.status(200).json({ success: true, data: [] });
  const result = await pool.request()
    .input("q", sql.NVarChar(160), `%${q.slice(0, 80)}%`)
    .query(`
      SELECT TOP 20 COD_FORNECEDOR, RAZAO_SOCIAL
      FROM dbo.CAD_FORNECEDOR
      WHERE CAST(COD_FORNECEDOR AS VARCHAR(20)) LIKE @q
         OR RAZAO_SOCIAL COLLATE Latin1_General_CI_AI LIKE @q
      ORDER BY RAZAO_SOCIAL
    `);
  return res.status(200).json({
    success: true,
    data: (result.recordset || []).map((row) => ({
      codigo: row.COD_FORNECEDOR,
      razaoSocial: row.RAZAO_SOCIAL || "",
    })),
  });
}

async function buscarFornecedor(req, res, pool) {
  const cod = inteiro(req.query.cod);
  if (!cod) return res.status(400).json({ success: false, error: "Informe o código do fornecedor." });
  const result = await pool.request()
    .input("cod", sql.Int, cod)
    .query(`
      SELECT COD_FORNECEDOR, RAZAO_SOCIAL
      FROM dbo.CAD_FORNECEDOR
      WHERE COD_FORNECEDOR = @cod
    `);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Fornecedor não encontrado." });
  }
  const row = result.recordset[0];
  return res.status(200).json({
    success: true,
    data: { codigo: row.COD_FORNECEDOR, razaoSocial: row.RAZAO_SOCIAL || "" },
  });
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

async function comprasRecentes(req, res, pool) {
  const brutos = Array.isArray(req.body?.codigos)
    ? req.body.codigos
    : String(req.query.codigos || req.query.codigo || "").split(",");
  const codigos = [...new Set(
    brutos.map((codigo) => String(codigo || "").trim().toUpperCase()).filter(Boolean)
  )].slice(0, 200);
  const data = {};
  codigos.forEach((codigo) => { data[codigo] = []; });
  if (!codigos.length) return res.status(200).json({ success: true, data });

  const pedido = pool.request();
  const params = codigos.map((codigo, idx) => {
    pedido.input("c" + idx, sql.NVarChar(100), codigo);
    return "@c" + idx;
  });
  const result = await pedido.query(`
    ;WITH BaseNF AS (
      SELECT
        UPPER(LTRIM(RTRIM(p.PROD_COD_PROD))) AS CODIGO,
        YEAR(c.CAB_DT_EMISSAO) AS ANO,
        MONTH(c.CAB_DT_EMISSAO) AS MES,
        p.PROD_CUSTO_FISCAL_MEDIO_NOVO AS CUSTO,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(LTRIM(RTRIM(p.PROD_COD_PROD))), YEAR(c.CAB_DT_EMISSAO), MONTH(c.CAB_DT_EMISSAO)
          ORDER BY c.CAB_DT_EMISSAO DESC, c.CAB_ID_NF DESC
        ) AS rnMes
      FROM dbo.NF_PRODUTOS p
      INNER JOIN dbo.NF_CABECALHO c ON c.CAB_ID_NF = p.PROD_ID_NF
      WHERE c.CAB_DT_EMISSAO >= DATEADD(MONTH, -36, CAST(GETDATE() AS DATE))
        AND UPPER(LTRIM(RTRIM(p.PROD_COD_PROD))) IN (${params.join(", ")})
        AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO IS NOT NULL
        AND p.PROD_CUSTO_FISCAL_MEDIO_NOVO > 0
    ),
    Recentes AS (
      SELECT CODIGO, ANO, MES, CUSTO,
        ROW_NUMBER() OVER (PARTITION BY CODIGO ORDER BY ANO DESC, MES DESC) AS rn
      FROM BaseNF
      WHERE rnMes = 1
    )
    SELECT CODIGO, ANO, MES, CUSTO
    FROM Recentes
    WHERE rn <= 4
    ORDER BY CODIGO, ANO DESC, MES DESC
  `);
  for (const row of result.recordset || []) {
    const codigo = String(row.CODIGO || "").trim().toUpperCase();
    if (!data[codigo]) data[codigo] = [];
    data[codigo].push({
      ano: Number(row.ANO),
      mes: Number(row.MES),
      custo: num(row.CUSTO),
    });
  }
  return res.status(200).json({ success: true, data });
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

function montarItens(brutos) {
  if (!Array.isArray(brutos) || brutos.length === 0) {
    return { erro: "Inclua ao menos um produto." };
  }
  if (brutos.length > 200) return { erro: "O orçamento aceita no máximo 200 produtos." };
  const itens = [];
  for (let i = 0; i < brutos.length; i++) {
    const linha = i + 1;
    const bruto = brutos[i] || {};
    const codigo = String(bruto.codigo || "").trim();
    if (!codigo) return { erro: `Informe o produto da linha ${linha}.` };
    if (codigo.length > 100) return { erro: `O código da linha ${linha} é longo demais.` };
    const quantidade = decimal(bruto.quantidade, 4, 0.0001, 99999999);
    if (quantidade == null) return { erro: `Quantidade inválida na linha ${linha}.` };
    const valorUnitario = decimal(bruto.valorUnitario, 6, 0, 99999999);
    if (valorUnitario == null) return { erro: `Valor unitário inválido na linha ${linha}.` };
    const prazo = prazoDias(bruto.prazoDias);
    if (prazo === undefined) return { erro: `Prazo inválido na linha ${linha}. Use dias inteiros.` };
    const urgencia = urgenciaItem(bruto.urgencia);
    if (urgencia === undefined) return { erro: `Urgência inválida na linha ${linha}.` };
    itens.push({
      codigo,
      quantidade,
      valorUnitario,
      valorTotal: Number((quantidade * valorUnitario).toFixed(4)),
      prazoDias: prazo,
      urgencia,
    });
  }
  return { itens };
}

async function salvar(req, res, pool) {
  const body = req.body || {};
  const id = body.id == null || body.id === "" ? null : inteiro(body.id);
  if (body.id != null && body.id !== "" && !id) {
    return res.status(400).json({ success: false, error: "Orçamento inválido." });
  }
  const codFornecedor = inteiro(body.codFornecedor);
  if (!codFornecedor) return res.status(400).json({ success: false, error: "Informe o fornecedor." });
  const dataOrcamento = dataSql(body.dataOrcamento);
  if (!dataOrcamento) return res.status(400).json({ success: false, error: "Informe a data do orçamento." });
  let prazo = prazoDias(body.prazoDias);
  if (prazo === undefined) return res.status(400).json({ success: false, error: "Prazo de entrega inválido. Use dias inteiros." });
  const dataAprovacao = dataSql(body.dataAprovacao);
  if (dataAprovacao === undefined) return res.status(400).json({ success: false, error: "Data de aprovação inválida." });
  const numero = texto(body.numero, 40);
  const condicaoPagamento = texto(body.condicaoPagamento, 80);
  const observacao = texto(body.observacao, 1000);
  const montado = montarItens(body.itens);
  if (montado.erro) return res.status(400).json({ success: false, error: montado.erro });

  if (prazo == null) {
    const prazosItem = montado.itens.map((item) => item.prazoDias).filter((n) => n != null);
    if (prazosItem.length === montado.itens.length && prazosItem.length) {
      prazo = Math.max(...prazosItem);
    }
  }
  if (prazo == null) {
    return res.status(400).json({ success: false, error: "Informe o prazo em dias após a aprovação." });
  }
  const dataEntrega = dataAprovacao ? somarDias(dataAprovacao, prazo) : null;

  const forn = await pool.request()
    .input("cod", sql.Int, codFornecedor)
    .query(`SELECT COD_FORNECEDOR FROM dbo.CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod`);
  if (!forn.recordset.length) {
    return res.status(400).json({ success: false, error: "Fornecedor não cadastrado." });
  }

  const codigos = [...new Set(montado.itens.map((item) => item.codigo))];
  const pedidoProd = pool.request();
  const params = codigos.map((codigo, idx) => {
    pedidoProd.input("c" + idx, sql.NVarChar(100), codigo);
    return "@c" + idx;
  });
  const produtos = await pedidoProd.query(`
    SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO IN (${params.join(", ")})
  `);
  const porCodigo = new Map();
  for (const row of produtos.recordset || []) {
    porCodigo.set(String(row.CODIGO).toUpperCase(), row);
  }
  const faltando = [];
  for (const item of montado.itens) {
    const achado = porCodigo.get(item.codigo.toUpperCase());
    if (!achado) {
      faltando.push(item.codigo);
      continue;
    }
    item.codigo = achado.CODIGO;
    item.descricao = String(achado.DESCRICAO || "").slice(0, 300);
  }
  if (faltando.length) {
    return res.status(400).json({
      success: false,
      error: `Produto não cadastrado: ${[...new Set(faltando)].slice(0, 8).join(", ")}.`,
    });
  }

  if (numero) {
    const dup = await pool.request()
      .input("numero", sql.NVarChar(40), numero)
      .input("id", sql.Int, id || 0)
      .query(`
        SELECT ID FROM dbo.EMB_ORCAMENTO
        WHERE NUMERO = @numero AND ID <> @id
      `);
    if (dup.recordset.length) {
      return res.status(409).json({ success: false, error: "Já existe um orçamento com este número." });
    }
  }

  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let orcamentoId = id;
    if (id) {
      const atual = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .query(`
          SELECT STATUS, ID_NF
          FROM dbo.EMB_ORCAMENTO WITH (UPDLOCK, HOLDLOCK)
          WHERE ID = @id
        `);
      if (!atual.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
      }
      if (atual.recordset[0].STATUS !== "ABERTO") {
        await transaction.rollback();
        return res.status(409).json({ success: false, error: "Reabra o orçamento para alterar os dados." });
      }
      if (atual.recordset[0].ID_NF != null) {
        await transaction.rollback();
        return res.status(409).json({ success: false, error: "Orçamento já vinculado a uma nota. Não pode ser alterado." });
      }
      await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("numero", sql.NVarChar(40), numero)
        .input("cod", sql.Int, codFornecedor)
        .input("data", sql.Date, dataOrcamento)
        .input("prazo", sql.Int, prazo)
        .input("entrega", sql.Date, dataEntrega)
        .input("aprovacao", sql.Date, dataAprovacao)
        .input("pag", sql.NVarChar(80), condicaoPagamento)
        .input("obs", sql.NVarChar(1000), observacao)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          UPDATE dbo.EMB_ORCAMENTO SET
            NUMERO = @numero,
            COD_FORNECEDOR = @cod,
            DATA_ORCAMENTO = @data,
            PRAZO_DIAS = @prazo,
            DATA_ENTREGA = @entrega,
            DATA_APROVACAO = @aprovacao,
            CONDICAO_PAGAMENTO = @pag,
            OBSERVACAO = @obs,
            ATUALIZADO_EM = CAST(@agora AS DATETIME),
            ATUALIZADO_POR = @quem
          WHERE ID = @id
        `);
      await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .query(`DELETE FROM dbo.EMB_ORCAMENTO_ITEM WHERE ORCAMENTO_ID = @id`);
    } else {
      const criado = await new sql.Request(transaction)
        .input("numero", sql.NVarChar(40), numero)
        .input("cod", sql.Int, codFornecedor)
        .input("data", sql.Date, dataOrcamento)
        .input("prazo", sql.Int, prazo)
        .input("entrega", sql.Date, dataEntrega)
        .input("aprovacao", sql.Date, dataAprovacao)
        .input("pag", sql.NVarChar(80), condicaoPagamento)
        .input("obs", sql.NVarChar(1000), observacao)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          INSERT INTO dbo.EMB_ORCAMENTO (
            NUMERO, COD_FORNECEDOR, DATA_ORCAMENTO, PRAZO_DIAS, DATA_ENTREGA,
            DATA_APROVACAO, CONDICAO_PAGAMENTO, STATUS, OBSERVACAO, CRIADO_EM, CRIADO_POR
          )
          OUTPUT INSERTED.ID
          VALUES (
            @numero, @cod, @data, @prazo, @entrega,
            @aprovacao, @pag, N'ABERTO', @obs, CAST(@agora AS DATETIME), @quem
          )
        `);
      orcamentoId = criado.recordset[0].ID;
    }

    if (!numero) {
      const ano = String(body.dataOrcamento).slice(0, 4);
      const gerado = `ORC-${ano}-${String(orcamentoId).padStart(5, "0")}`;
      await new sql.Request(transaction)
        .input("id", sql.Int, orcamentoId)
        .input("numero", sql.NVarChar(40), gerado)
        .query(`UPDATE dbo.EMB_ORCAMENTO SET NUMERO = @numero WHERE ID = @id AND (NUMERO IS NULL OR NUMERO = N'')`);
    }

    for (let i = 0; i < montado.itens.length; i++) {
      const item = montado.itens[i];
      await new sql.Request(transaction)
        .input("orc", sql.Int, orcamentoId)
        .input("cod", sql.NVarChar(100), item.codigo)
        .input("desc", sql.NVarChar(300), item.descricao || null)
        .input("qtd", sql.Decimal(18, 4), item.quantidade)
        .input("vu", sql.Decimal(18, 6), item.valorUnitario)
        .input("vt", sql.Decimal(18, 4), item.valorTotal)
        .input("prazo", sql.Int, item.prazoDias)
        .input("urg", sql.NVarChar(20), item.urgencia)
        .input("ordem", sql.Int, i)
        .query(`
          INSERT INTO dbo.EMB_ORCAMENTO_ITEM (
            ORCAMENTO_ID, CODIGO, DESCRICAO, QUANTIDADE, VALOR_UNITARIO, VALOR_TOTAL, PRAZO_DIAS, URGENCIA, ORDEM
          ) VALUES (
            @orc, @cod, @desc, @qtd, @vu, @vt, @prazo, @urg, @ordem
          )
        `);
    }

    await transaction.commit();
    const data = await lerCompleto(pool, orcamentoId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    if (err && (err.number === 2627 || err.number === 2601)) {
      return res.status(409).json({ success: false, error: "Já existe um orçamento com este número." });
    }
    throw err;
  }
}

async function decidir(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id);
  const status = String(body.status || "").trim().toUpperCase();
  if (!id) return res.status(400).json({ success: false, error: "Informe o orçamento." });
  if (!STATUS.has(status)) return res.status(400).json({ success: false, error: "Decisão inválida." });
  const motivo = texto(body.motivo, 500);
  if (status === "REPROVADO" && !motivo) {
    return res.status(400).json({ success: false, error: "Informe o motivo da reprovação." });
  }

  const quem = autor(req);
  const agora = agoraSaoPaulo();
  const dataInformada = dataSql(body.dataAprovacao);
  if (dataInformada === undefined) {
    return res.status(400).json({ success: false, error: "Data de aprovação inválida." });
  }
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT STATUS, ID_NF
        FROM dbo.EMB_ORCAMENTO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @id
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
    }
    const row = atual.recordset[0];
    if (row.ID_NF != null && status !== row.STATUS) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Orçamento vinculado a uma nota. A decisão não pode mudar." });
    }
    if ((status === "APROVADO" || status === "REPROVADO") && row.STATUS !== "ABERTO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Só um orçamento em aberto pode ser aprovado ou reprovado." });
    }
    if (status === "ABERTO" && row.STATUS === "ABERTO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este orçamento já está em aberto." });
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status)
      .input("motivo", sql.NVarChar(500), status === "ABERTO" ? null : motivo)
      .input("quem", sql.NVarChar(100), quem)
      .input("agora", sql.VarChar(19), agora)
      .input("aprovacao", sql.Date, dataInformada)
      .query(`
        UPDATE dbo.EMB_ORCAMENTO SET
          STATUS = @status,
          MOTIVO_DECISAO = CASE WHEN @status = N'ABERTO' THEN NULL ELSE @motivo END,
          APROVADO_EM = CASE WHEN @status = N'ABERTO' THEN NULL ELSE CAST(@agora AS DATETIME) END,
          APROVADO_POR = CASE WHEN @status = N'ABERTO' THEN NULL ELSE @quem END,
          DATA_APROVACAO = CASE
            WHEN @status = N'APROVADO' THEN COALESCE(@aprovacao, DATA_APROVACAO, CAST(@agora AS DATE))
            ELSE NULL
          END,
          DATA_ENTREGA = CASE
            WHEN @status = N'APROVADO' AND PRAZO_DIAS IS NOT NULL THEN DATEADD(DAY, PRAZO_DIAS, COALESCE(@aprovacao, DATA_APROVACAO, CAST(@agora AS DATE)))
            WHEN @status = N'APROVADO' THEN DATA_ENTREGA
            ELSE NULL
          END,
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

async function excluir(req, res, pool) {
  const id = inteiro((req.body && req.body.id) || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Informe o orçamento." });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT STATUS, ID_NF
        FROM dbo.EMB_ORCAMENTO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @id
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
    }
    const row = atual.recordset[0];
    if (row.ID_NF != null) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Orçamento vinculado a uma nota. Não pode ser excluído." });
    }
    if (row.STATUS === "APROVADO") {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Reabra o orçamento aprovado antes de excluir." });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.EMB_ORCAMENTO WHERE ID = @id`);
    await transaction.commit();
    return res.status(200).json({ success: true });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

function mapAnexo(row) {
  return {
    id: row.ID,
    tipo: row.TIPO,
    nome: row.NOME_ARQUIVO || "",
    mime: row.MIME || "",
    tamanho: Number(row.TAMANHO) || 0,
    criadoEm: row.CRIADO_EM || null,
    criadoPor: row.CRIADO_POR || "",
  };
}

async function listarAnexos(pool, id) {
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT ID, TIPO, NOME_ARQUIVO, MIME, TAMANHO,
        CONVERT(VARCHAR(16), CRIADO_EM, 120) AS CRIADO_EM,
        CRIADO_POR
      FROM dbo.EMB_ORCAMENTO_ANEXO
      WHERE ORCAMENTO_ID = @id
      ORDER BY ID
    `);
  return (result.recordset || []).map(mapAnexo);
}

function decodeAnexo(data) {
  if (!data || typeof data !== "string") return { erro: "Arquivo vazio." };
  const virgula = data.indexOf(",");
  const raw = data.startsWith("data:") && virgula >= 0 ? data.slice(virgula + 1) : data;
  const limpo = raw.replace(/\s/g, "");
  if (!limpo) return { erro: "Arquivo vazio." };
  if (limpo.length > Math.ceil(MAX_ANEXO / 3) * 4) {
    return { erro: "Anexo maior que 3 MB. Reduza o arquivo antes de enviar." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpo) || limpo.length % 4 !== 0) {
    return { erro: "Arquivo inválido." };
  }
  const buf = Buffer.from(limpo, "base64");
  if (!buf.length) return { erro: "Arquivo vazio." };
  if (buf.length > MAX_ANEXO) return { erro: "Anexo maior que 3 MB. Reduza o arquivo antes de enviar." };
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

function classificarArquivo(buf, mimeInformado, nome) {
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
  const extPdf = ext === "pdf";
  const extImagem = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  if (ext) {
    if (detectado.tipo === "PDF" && !extPdf) return { erro: "O arquivo não é um PDF." };
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
  return `anexo.${ext}`;
}

function disposicaoInline(nome) {
  const bruto = String(nome || "anexo").replace(/[\r\n]/g, "").slice(0, 180);
  const ascii = bruto.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "anexo";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(bruto)}`;
}

async function responderAnexos(res, pool, id) {
  return res.status(200).json({ success: true, data: await listarAnexos(pool, id) });
}

async function gravarAnexo(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id || req.query.id);
  if (!id) return res.status(400).json({ success: false, error: "Salve o orçamento antes de anexar." });
  const dec = decodeAnexo(body.data);
  if (dec.erro) return res.status(400).json({ success: false, error: dec.erro });
  const arq = classificarArquivo(dec.buf, body.mime, body.nome);
  if (arq.erro) return res.status(400).json({ success: false, error: arq.erro });
  const nome = nomeArquivo(body.nome, arq.mime);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT ID_NF
        FROM dbo.EMB_ORCAMENTO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @id
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
    }
    if (atual.recordset[0].ID_NF != null) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Orçamento vinculado a uma nota. Os anexos não podem mudar." });
    }
    const contagem = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT TIPO, COUNT(*) AS QTD
        FROM dbo.EMB_ORCAMENTO_ANEXO
        WHERE ORCAMENTO_ID = @id
        GROUP BY TIPO
      `);
    let pdfs = 0;
    let imagens = 0;
    for (const row of contagem.recordset || []) {
      if (row.TIPO === "PDF") pdfs = Number(row.QTD) || 0;
      if (row.TIPO === "IMAGEM") imagens = Number(row.QTD) || 0;
    }
    if (pdfs + imagens >= MAX_ANEXOS) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este orçamento já tem 12 anexos." });
    }
    if (arq.tipo === "PDF" && pdfs >= MAX_PDF) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este orçamento já tem 5 PDFs." });
    }
    if (arq.tipo === "IMAGEM" && imagens >= MAX_IMAGEM) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Este orçamento já tem 10 fotos." });
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("tipo", sql.NVarChar(20), arq.tipo)
      .input("nome", sql.NVarChar(255), nome)
      .input("mime", sql.NVarChar(80), arq.mime)
      .input("conteudo", sql.VarBinary(sql.MAX), dec.buf)
      .input("tamanho", sql.Int, dec.buf.length)
      .input("quem", sql.NVarChar(100), autor(req))
      .input("agora", sql.VarChar(19), agoraSaoPaulo())
      .query(`
        INSERT INTO dbo.EMB_ORCAMENTO_ANEXO
          (ORCAMENTO_ID, TIPO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, CRIADO_EM, CRIADO_POR)
        VALUES
          (@id, @tipo, @nome, @mime, @conteudo, @tamanho, CAST(@agora AS DATETIME), @quem)
      `);
    await transaction.commit();
    return responderAnexos(res, pool, id);
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function excluirAnexo(req, res, pool) {
  const body = req.body || {};
  const id = inteiro(body.id || req.query.id);
  const anexoId = inteiro(body.anexoId || req.query.anexoId);
  if (!id || !anexoId) return res.status(400).json({ success: false, error: "Informe o anexo." });

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const atual = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT ID_NF
        FROM dbo.EMB_ORCAMENTO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @id
      `);
    if (!atual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Orçamento não encontrado." });
    }
    if (atual.recordset[0].ID_NF != null) {
      await transaction.rollback();
      return res.status(409).json({ success: false, error: "Orçamento vinculado a uma nota. Os anexos não podem mudar." });
    }
    const apagado = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("anexoId", sql.Int, anexoId)
      .query(`
        DELETE FROM dbo.EMB_ORCAMENTO_ANEXO
        WHERE ORCAMENTO_ID = @id AND ID = @anexoId
      `);
    if (!apagado.rowsAffected[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Anexo não encontrado." });
    }
    await transaction.commit();
    return responderAnexos(res, pool, id);
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    throw err;
  }
}

async function baixarAnexo(req, res, pool) {
  const id = inteiro(req.query.id);
  const anexoId = inteiro(req.query.anexoId);
  if (!id || !anexoId) return res.status(400).json({ success: false, error: "Informe o anexo." });
  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("anexoId", sql.Int, anexoId)
    .query(`
      SELECT MIME, NOME_ARQUIVO, CONTEUDO, TAMANHO
      FROM dbo.EMB_ORCAMENTO_ANEXO
      WHERE ORCAMENTO_ID = @id AND ID = @anexoId
    `);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Anexo não encontrado." });
  }
  const row = result.recordset[0];
  const buf = Buffer.isBuffer(row.CONTEUDO) ? row.CONTEUDO : Buffer.from(row.CONTEUDO);
  res.setHeader("Content-Type", row.MIME || "application/octet-stream");
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Content-Disposition", disposicaoInline(row.NOME_ARQUIVO));
  res.setHeader("Cache-Control", "private, max-age=120");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(buf);
}
