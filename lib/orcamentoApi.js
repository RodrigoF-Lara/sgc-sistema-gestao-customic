import { getConnection, sql } from "../db.js";
import { exigirPermissao, usuarioDoRequest } from "./permissoesHelper.js";
import { seedPermissaoOrcamentos } from "./permissoesApi.js";

const LINK = "orcamentos";
const STATUS = new Set(["ABERTO", "APROVADO", "REPROVADO"]);
const LIMITE_LISTA = 300;

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
          ORDEM INT NOT NULL CONSTRAINT DF_EMB_ORC_ITEM_ORD DEFAULT (0),
          CONSTRAINT FK_EMB_ORC_ITEM_ORC FOREIGN KEY (ORCAMENTO_ID)
            REFERENCES dbo.EMB_ORCAMENTO (ID) ON DELETE CASCADE,
          CONSTRAINT CK_EMB_ORC_ITEM_QTD CHECK (QUANTIDADE > 0),
          CONSTRAINT CK_EMB_ORC_ITEM_VALOR CHECK (VALOR_UNITARIO >= 0 AND VALOR_TOTAL >= 0),
          CONSTRAINT CK_EMB_ORC_ITEM_PRAZO CHECK (PRAZO_DIAS IS NULL OR (PRAZO_DIAS >= 0 AND PRAZO_DIAS <= 9999))
        );
        CREATE INDEX IX_EMB_ORC_ITEM_ORC ON dbo.EMB_ORCAMENTO_ITEM (ORCAMENTO_ID, ORDEM, ID);
        CREATE INDEX IX_EMB_ORC_ITEM_COD ON dbo.EMB_ORCAMENTO_ITEM (CODIGO);
      END;
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

function prazoDias(valor) {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 9999) return undefined;
  return n;
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
  };
}

function mapOrcamento(row, itens) {
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
    valorTotal: Number(valor.toFixed(4)),
    resumoProdutos: row.RESUMO_PRODUTOS || "",
    itens: lista,
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
        o.STATUS,
        o.ID_NF,
        CAST(nf.CAB_NUM_NF AS NVARCHAR(40)) AS NUM_NF,
        (SELECT COUNT(*) FROM dbo.EMB_ORCAMENTO_ITEM i WHERE i.ORCAMENTO_ID = o.ID) AS QTD_ITENS,
        (SELECT ISNULL(SUM(i.VALOR_TOTAL), 0) FROM dbo.EMB_ORCAMENTO_ITEM i WHERE i.ORCAMENTO_ID = o.ID) AS VALOR_TOTAL,
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
      SELECT ID, CODIGO, DESCRICAO, QUANTIDADE, VALOR_UNITARIO, VALOR_TOTAL, PRAZO_DIAS
      FROM dbo.EMB_ORCAMENTO_ITEM
      WHERE ORCAMENTO_ID = @id
      ORDER BY ORDEM, ID
    `);
  return mapOrcamento(cab.recordset[0], (itens.recordset || []).map(mapItem));
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
    itens.push({
      codigo,
      quantidade,
      valorUnitario,
      valorTotal: Number((quantidade * valorUnitario).toFixed(4)),
      prazoDias: prazo,
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
  const dataEntrega = dataSql(body.dataEntrega);
  if (dataEntrega === undefined) return res.status(400).json({ success: false, error: "Data de entrega inválida." });
  const numero = texto(body.numero, 40);
  const observacao = texto(body.observacao, 1000);
  const montado = montarItens(body.itens);
  if (montado.erro) return res.status(400).json({ success: false, error: montado.erro });

  if (prazo == null && !dataEntrega) {
    const prazosItem = montado.itens.map((item) => item.prazoDias).filter((n) => n != null);
    if (prazosItem.length === montado.itens.length && prazosItem.length) {
      prazo = Math.max(...prazosItem);
    }
  }
  if (prazo == null && !dataEntrega) {
    return res.status(400).json({ success: false, error: "Informe o prazo em dias ou a data de entrega." });
  }

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
        .input("obs", sql.NVarChar(1000), observacao)
        .input("quem", sql.NVarChar(100), quem)
        .input("agora", sql.VarChar(19), agora)
        .query(`
          INSERT INTO dbo.EMB_ORCAMENTO (
            NUMERO, COD_FORNECEDOR, DATA_ORCAMENTO, PRAZO_DIAS, DATA_ENTREGA,
            STATUS, OBSERVACAO, CRIADO_EM, CRIADO_POR
          )
          OUTPUT INSERTED.ID
          VALUES (
            @numero, @cod, @data, @prazo, @entrega,
            N'ABERTO', @obs, CAST(@agora AS DATETIME), @quem
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
        .input("ordem", sql.Int, i)
        .query(`
          INSERT INTO dbo.EMB_ORCAMENTO_ITEM (
            ORCAMENTO_ID, CODIGO, DESCRICAO, QUANTIDADE, VALOR_UNITARIO, VALOR_TOTAL, PRAZO_DIAS, ORDEM
          ) VALUES (
            @orc, @cod, @desc, @qtd, @vu, @vt, @prazo, @ordem
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
      .query(`
        UPDATE dbo.EMB_ORCAMENTO SET
          STATUS = @status,
          MOTIVO_DECISAO = CASE WHEN @status = N'ABERTO' THEN NULL ELSE @motivo END,
          APROVADO_EM = CASE WHEN @status = N'ABERTO' THEN NULL ELSE CAST(@agora AS DATETIME) END,
          APROVADO_POR = CASE WHEN @status = N'ABERTO' THEN NULL ELSE @quem END,
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
