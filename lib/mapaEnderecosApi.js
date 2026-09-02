import { sql } from "../db.js";
import { exigirQualquerPermissao } from "./permissoesHelper.js";

const LINK_VER = ["mapa-enderecos", "estoque"];
const LINK_EDITAR = ["mapa-enderecos", "estoque-alterar-endereco", "estoque"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function normalizeEndereco(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[.\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(\D)-0+(\d)/g, "$1-$2")
    .replace(/-0+(\d)/g, "-$1")
    .replace(/^0+(\d)/, "$1");
}

function rackPositions(startBay, endBay, seqOffset) {
  const step = startBay > endBay ? -1 : 1;
  const bays = [];
  for (let b = startBay; b !== endBay + step; b += step) bays.push(b);
  const out = [];
  let col = 1;
  const bayCols = {};
  for (const bay of bays) {
    bayCols[bay] = col;
    col += 2;
  }
  for (let nivel = 6; nivel >= 1; nivel--) {
    const linha = 7 - nivel;
    for (const bay of bays) {
      const seqLeft = seqOffset + (bay - Math.min(startBay, endBay)) * 12 + (nivel - 1) * 2 + 2;
      const seqRight = seqLeft - 1;
      const colStart = bayCols[bay];
      out.push({
        endereco: `${pad2(bay)}-${pad2(nivel)}-${seqLeft < 10 ? pad2(seqLeft) : seqLeft}`,
        linha,
        colInicio: colStart,
        colspan: 1,
      });
      out.push({
        endereco: `${pad2(bay)}-${pad2(nivel)}-${seqRight < 10 ? pad2(seqRight) : seqRight}`,
        linha,
        colInicio: colStart + 1,
        colspan: 1,
      });
    }
  }
  return out;
}

function seqRange(prefix, from, to, linha) {
  const cells = [];
  const step = from <= to ? 1 : -1;
  let col = 1;
  for (let n = from; n !== to + step; n += step) {
    cells.push({ endereco: `${prefix}${pad2(n)}`, linha, colInicio: col, colspan: 1 });
    col += 1;
  }
  return cells;
}

function seedLayout() {
  const estantes = [
    { codigo: "estante-1", nome: "Estante 1", tipo: "RACK", ordem: 1, colunas: 30 },
    { codigo: "estante-2", nome: "Estante 2", tipo: "RACK", ordem: 2, colunas: 30 },
    { codigo: "picking-frente", nome: "Picking — Frente", tipo: "PICKING", ordem: 3, colunas: 8 },
    { codigo: "picking-atras", nome: "Picking — Atrás", tipo: "PICKING", ordem: 4, colunas: 8 },
    { codigo: "kdb", nome: "KDB", tipo: "PICKING", ordem: 5, colunas: 1 },
  ];

  const posicoes = {
    "estante-1": rackPositions(15, 1, 0),
    "estante-2": rackPositions(16, 30, 180),
    "picking-frente": [
      { endereco: "EF-05-41", linha: 1, colInicio: 1, colspan: 8 },
      ...seqRange("EF-03-", 33, 40, 2),
      ...seqRange("EF-02-", 25, 32, 3),
      ...seqRange("EF-02-", 17, 24, 4),
      ...seqRange("EF-01-", 9, 16, 5),
      ...seqRange("EF-01-", 1, 8, 6),
      { endereco: "EC-01-01", linha: 7, colInicio: 1, colspan: 4 },
      { endereco: "EC-01-02", linha: 7, colInicio: 5, colspan: 4 },
    ],
    "picking-atras": [
      { endereco: "EA-05-50", linha: 1, colInicio: 1, colspan: 8 },
      ...seqRange("EA-03-", 13, 20, 2),
      { endereco: "EA-02-10", linha: 3, colInicio: 1, colspan: 3 },
      { endereco: "EA-02-11", linha: 3, colInicio: 4, colspan: 3 },
      { endereco: "EA-02-12", linha: 3, colInicio: 7, colspan: 2 },
      { endereco: "EA-02-07", linha: 4, colInicio: 1, colspan: 3 },
      { endereco: "EA-02-08", linha: 4, colInicio: 4, colspan: 3 },
      { endereco: "EA-02-09", linha: 4, colInicio: 7, colspan: 2 },
      { endereco: "EA-01-04", linha: 5, colInicio: 1, colspan: 3 },
      { endereco: "EA-01-05", linha: 5, colInicio: 4, colspan: 3 },
      { endereco: "EA-01-06", linha: 5, colInicio: 7, colspan: 2 },
      { endereco: "EA-01-01", linha: 6, colInicio: 1, colspan: 3 },
      { endereco: "EA-01-02", linha: 6, colInicio: 4, colspan: 3 },
      { endereco: "EA-01-03", linha: 6, colInicio: 7, colspan: 2 },
      { endereco: "EC-01-04", linha: 7, colInicio: 1, colspan: 4 },
      { endereco: "EC-01-03", linha: 7, colInicio: 5, colspan: 4 },
    ],
    kdb: [{ endereco: "KDB-1", linha: 1, colInicio: 1, colspan: 1 }],
  };

  return { estantes, posicoes };
}

async function ensureTables(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.TB_MAPA_ESTANTE', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TB_MAPA_ESTANTE (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CODIGO NVARCHAR(40) NOT NULL UNIQUE,
        NOME NVARCHAR(80) NOT NULL,
        TIPO NVARCHAR(20) NOT NULL DEFAULT 'RACK',
        ORDEM INT NOT NULL DEFAULT 1,
        COLUNAS INT NOT NULL DEFAULT 30,
        ATIVO BIT NOT NULL DEFAULT 1,
        ATUALIZADO_EM DATETIME NOT NULL DEFAULT GETDATE()
      );
    END;

    IF OBJECT_ID(N'dbo.TB_MAPA_POSICAO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TB_MAPA_POSICAO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ESTANTE_ID INT NOT NULL,
        ENDERECO NVARCHAR(40) NOT NULL,
        LINHA INT NOT NULL DEFAULT 1,
        COL_INICIO INT NOT NULL DEFAULT 1,
        COLSPAN INT NOT NULL DEFAULT 1,
        ATIVO BIT NOT NULL DEFAULT 1,
        ATUALIZADO_EM DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_MAPA_POS_ESTANTE FOREIGN KEY (ESTANTE_ID) REFERENCES dbo.TB_MAPA_ESTANTE (ID),
        CONSTRAINT UQ_MAPA_POS_ENDERECO UNIQUE (ENDERECO)
      );
      CREATE INDEX IX_MAPA_POS_ESTANTE ON dbo.TB_MAPA_POSICAO (ESTANTE_ID, LINHA, COL_INICIO);
    END;
  `);

  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
        SELECT 'mapa-enderecos', p.NIVEL, p.PERMITIDO, 'SEED-MAPA'
        FROM dbo.SHR_PERMISSOES_MENU p
        WHERE p.LINK_ID = 'estoque'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
            WHERE x.LINK_ID = 'mapa-enderecos' AND x.NIVEL = p.NIVEL
          );
      END
    `);
  } catch (_) {
    /* permissões podem não existir ainda */
  }
}

async function insertPosicoesBatch(makeRequest, estanteId, list) {
  const BATCH = 80;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const req = makeRequest();
    req.input("estanteId", sql.Int, estanteId);
    const values = chunk.map((p, idx) => {
      req.input(`en${idx}`, sql.NVarChar(40), p.endereco);
      req.input(`l${idx}`, sql.Int, p.linha);
      req.input(`c${idx}`, sql.Int, p.colInicio);
      req.input(`s${idx}`, sql.Int, p.colspan);
      return `(@estanteId, @en${idx}, @l${idx}, @c${idx}, @s${idx})`;
    });
    await req.query(`
      INSERT INTO dbo.TB_MAPA_POSICAO (ESTANTE_ID, ENDERECO, LINHA, COL_INICIO, COLSPAN)
      VALUES ${values.join(",")}
    `);
  }
}

async function seedIfEmpty(pool) {
  const counts = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.TB_MAPA_ESTANTE) AS ESTANTES,
      (SELECT COUNT(*) FROM dbo.TB_MAPA_POSICAO) AS POSICOES
  `);
  const estN = Number(counts.recordset[0].ESTANTES) || 0;
  const posN = Number(counts.recordset[0].POSICOES) || 0;
  if (estN > 0 && posN >= 200) return { seeded: false };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const makeRequest = () => new sql.Request(transaction);
  try {
    if (estN > 0) {
      await makeRequest().query(`DELETE FROM dbo.TB_MAPA_POSICAO`);
      await makeRequest().query(`DELETE FROM dbo.TB_MAPA_ESTANTE`);
    }

    const { estantes, posicoes } = seedLayout();
    for (const e of estantes) {
      const ins = await makeRequest()
        .input("codigo", sql.NVarChar(40), e.codigo)
        .input("nome", sql.NVarChar(80), e.nome)
        .input("tipo", sql.NVarChar(20), e.tipo)
        .input("ordem", sql.Int, e.ordem)
        .input("colunas", sql.Int, e.colunas)
        .query(`
          INSERT INTO dbo.TB_MAPA_ESTANTE (CODIGO, NOME, TIPO, ORDEM, COLUNAS)
          OUTPUT INSERTED.ID
          VALUES (@codigo, @nome, @tipo, @ordem, @colunas)
        `);
      const id = ins.recordset[0].ID;
      await insertPosicoesBatch(makeRequest, id, posicoes[e.codigo] || []);
    }
    await transaction.commit();
    return { seeded: true };
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function saldosPorEndereco(pool) {
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(k.ENDERECO)) AS ENDERECO,
      k.CODIGO,
      MAX(ISNULL(cp.DESCRICAO, '')) AS DESCRICAO,
      MAX(CONVERT(varchar(30), k.ARMAZEM)) AS ARMAZEM,
      SUM(k.SALDO) AS SALDO
    FROM dbo.KARDEX_2026_EMBALAGEM k WITH (NOLOCK)
    LEFT JOIN dbo.CAD_PROD cp WITH (NOLOCK) ON cp.CODIGO = k.CODIGO
    WHERE k.SALDO > 0
      AND k.KARDEX = 2026
      AND ISNULL(k.D_E_L_E_T_, '') <> '*'
      AND k.ENDERECO IS NOT NULL
    GROUP BY LTRIM(RTRIM(k.ENDERECO)), k.CODIGO
  `);
  return result.recordset || [];
}

function indexSaldos(rows) {
  const byNorm = new Map();
  for (const r of rows) {
    const key = normalizeEndereco(r.ENDERECO);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push({
      endereco: r.ENDERECO,
      codigo: r.CODIGO,
      descricao: r.DESCRICAO,
      armazem: r.ARMAZEM,
      saldo: Number(r.SALDO) || 0,
    });
  }
  return byNorm;
}

export async function handleMapaEnderecos(req, res, pool) {
  try {
    await ensureTables(pool);

    if (req.method === "GET") {
      if (!(await exigirQualquerPermissao(req, res, LINK_VER, "Sem permissão para o mapa de endereços."))) {
        return;
      }
      const action = String(req.query.action || "").trim();
      if (action === "mapaPosicao") return await getPosicaoDetalhe(req, res, pool);
      if (action === "mapaSaldos") return await getMapaSaldos(req, res, pool);
      return await getMapa(req, res, pool);
    }

    if (req.method === "POST") {
      if (!(await exigirQualquerPermissao(req, res, LINK_EDITAR, "Sem permissão para editar o mapa."))) {
        return;
      }
      const acao = String(req.body?.acao || req.body?.action || "").trim();
      if (acao === "mapa-salvar-estante") return await salvarEstante(req, res, pool);
      if (acao === "mapa-excluir-estante") return await excluirEstante(req, res, pool);
      if (acao === "mapa-salvar-posicao") return await salvarPosicao(req, res, pool);
      if (acao === "mapa-excluir-posicao") return await excluirPosicao(req, res, pool);
      return res.status(400).json({ success: false, error: "Ação de mapa inválida." });
    }

    return res.status(405).json({ success: false, error: "Método não permitido." });
  } catch (err) {
    console.error("[mapa-enderecos]", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Erro interno no mapa de endereços.",
    });
  }
}

function montarEstantes(estantesRows, posicoesRows, idx) {
  const mappedKeys = new Set();
  const estanteList = estantesRows.map((e) => ({
    id: e.ID,
    codigo: e.CODIGO,
    nome: e.NOME,
    tipo: e.TIPO,
    ordem: e.ORDEM,
    colunas: e.COLUNAS,
    posicoes: posicoesRows
      .filter((p) => p.ESTANTE_ID === e.ID)
      .map((p) => {
        const key = normalizeEndereco(p.ENDERECO);
        mappedKeys.add(key);
        const itens = idx ? idx.get(key) || [] : [];
        const saldoTotal = itens.reduce((s, it) => s + it.saldo, 0);
        return {
          id: p.ID,
          endereco: p.ENDERECO,
          linha: p.LINHA,
          colInicio: p.COL_INICIO,
          colspan: p.COLSPAN,
          ocupado: itens.length > 0,
          saldoTotal,
          itens,
        };
      }),
  }));
  return { estanteList, mappedKeys };
}

function resumoMapa(estanteList, foraDoMapa) {
  const totalPos = estanteList.reduce((s, e) => s + e.posicoes.length, 0);
  const ocupadas = estanteList.reduce((s, e) => s + e.posicoes.filter((p) => p.ocupado).length, 0);
  return {
    posicoes: totalPos,
    ocupadas,
    vazias: totalPos - ocupadas,
    foraDoMapa: (foraDoMapa || []).length,
  };
}

async function getMapa(req, res, pool) {
  const seed = await seedIfEmpty(pool);
  const [estantes, posicoes] = await Promise.all([
    pool.request().query(`
      SELECT ID, CODIGO, NOME, TIPO, ORDEM, COLUNAS, ATIVO
      FROM dbo.TB_MAPA_ESTANTE
      WHERE ATIVO = 1
      ORDER BY ORDEM, ID
    `),
    pool.request().query(`
      SELECT ID, ESTANTE_ID, ENDERECO, LINHA, COL_INICIO, COLSPAN, ATIVO
      FROM dbo.TB_MAPA_POSICAO
      WHERE ATIVO = 1
      ORDER BY ESTANTE_ID, LINHA, COL_INICIO
    `),
  ]);

  const { estanteList } = montarEstantes(estantes.recordset, posicoes.recordset, null);
  return res.json({
    success: true,
    seeded: seed.seeded,
    resumo: resumoMapa(estanteList, []),
    estantes: estanteList,
    foraDoMapa: [],
  });
}

async function getMapaSaldos(req, res, pool) {
  const [posicoes, saldos] = await Promise.all([
    pool.request().query(`SELECT ENDERECO FROM dbo.TB_MAPA_POSICAO WHERE ATIVO = 1`),
    saldosPorEndereco(pool),
  ]);
  const idx = indexSaldos(saldos);
  const mappedKeys = new Set((posicoes.recordset || []).map((p) => normalizeEndereco(p.ENDERECO)));
  const porEndereco = {};
  for (const [key, itens] of idx.entries()) {
    porEndereco[key] = itens;
  }
  const foraDoMapa = [];
  for (const [key, itens] of idx.entries()) {
    if (!mappedKeys.has(key)) {
      foraDoMapa.push({
        endereco: itens[0].endereco,
        saldoTotal: itens.reduce((s, it) => s + it.saldo, 0),
        itens,
      });
    }
  }
  foraDoMapa.sort((a, b) => String(a.endereco).localeCompare(b.endereco, "pt-BR"));
  return res.json({ success: true, porEndereco, foraDoMapa });
}

async function getPosicaoDetalhe(req, res, pool) {
  const endereco = String(req.query.endereco || "").trim();
  if (!endereco) return res.status(400).json({ success: false, error: "Endereço obrigatório." });
  const key = normalizeEndereco(endereco);
  const saldos = await saldosPorEndereco(pool);
  const itens = (indexSaldos(saldos).get(key) || []).filter(Boolean);
  return res.json({ success: true, endereco, itens });
}

function parseIntPos(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function salvarEstante(req, res, pool) {
  const body = req.body || {};
  const id = parseIntPos(body.id, null);
  const nome = String(body.nome || "").trim();
  const codigo = String(body.codigo || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const tipo = String(body.tipo || "RACK").toUpperCase() === "PICKING" ? "PICKING" : "RACK";
  const colunas = parseIntPos(body.colunas, 8);
  const ordem = parseIntPos(body.ordem, 99);
  if (!nome) return res.status(400).json({ success: false, error: "Informe o nome da estante." });

  if (id) {
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("nome", sql.NVarChar(80), nome)
      .input("tipo", sql.NVarChar(20), tipo)
      .input("colunas", sql.Int, Math.min(60, colunas))
      .input("ordem", sql.Int, ordem)
      .query(`
        UPDATE dbo.TB_MAPA_ESTANTE
        SET NOME=@nome, TIPO=@tipo, COLUNAS=@colunas, ORDEM=@ordem, ATUALIZADO_EM=GETDATE()
        WHERE ID=@id
      `);
    return res.json({ success: true, id });
  }

  const codigoFinal = codigo || `estante-${Date.now()}`;
  const ins = await pool
    .request()
    .input("codigo", sql.NVarChar(40), codigoFinal.slice(0, 40))
    .input("nome", sql.NVarChar(80), nome)
    .input("tipo", sql.NVarChar(20), tipo)
    .input("colunas", sql.Int, Math.min(60, colunas))
    .input("ordem", sql.Int, ordem)
    .query(`
      INSERT INTO dbo.TB_MAPA_ESTANTE (CODIGO, NOME, TIPO, COLUNAS, ORDEM)
      OUTPUT INSERTED.ID
      VALUES (@codigo, @nome, @tipo, @colunas, @ordem)
    `);
  return res.status(201).json({ success: true, id: ins.recordset[0].ID });
}

async function excluirEstante(req, res, pool) {
  const id = parseIntPos(req.body?.id, null);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
  await pool.request().input("id", sql.Int, id).query(`DELETE FROM dbo.TB_MAPA_POSICAO WHERE ESTANTE_ID=@id`);
  await pool.request().input("id", sql.Int, id).query(`DELETE FROM dbo.TB_MAPA_ESTANTE WHERE ID=@id`);
  return res.json({ success: true });
}

async function salvarPosicao(req, res, pool) {
  const body = req.body || {};
  const id = parseIntPos(body.id, null);
  const estanteId = parseIntPos(body.estanteId, null);
  const endereco = String(body.endereco || "").trim().toUpperCase();
  const linha = parseIntPos(body.linha, 1);
  const colInicio = parseIntPos(body.colInicio, 1);
  const colspan = parseIntPos(body.colspan, 1);
  if (!estanteId) return res.status(400).json({ success: false, error: "Estante obrigatória." });
  if (!endereco) return res.status(400).json({ success: false, error: "Informe o endereço." });

  const dup = await pool
    .request()
    .input("endereco", sql.NVarChar(40), endereco)
    .input("id", sql.Int, id || 0)
    .query(`SELECT ID FROM dbo.TB_MAPA_POSICAO WHERE ENDERECO=@endereco AND ID<>@id`);
  if (dup.recordset.length) {
    return res.status(400).json({ success: false, error: `Endereço ${endereco} já existe no mapa.` });
  }

  if (id) {
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("estanteId", sql.Int, estanteId)
      .input("endereco", sql.NVarChar(40), endereco)
      .input("linha", sql.Int, linha)
      .input("col", sql.Int, colInicio)
      .input("span", sql.Int, Math.min(30, colspan))
      .query(`
        UPDATE dbo.TB_MAPA_POSICAO
        SET ESTANTE_ID=@estanteId, ENDERECO=@endereco, LINHA=@linha, COL_INICIO=@col, COLSPAN=@span, ATUALIZADO_EM=GETDATE()
        WHERE ID=@id
      `);
    return res.json({ success: true, id });
  }

  const ins = await pool
    .request()
    .input("estanteId", sql.Int, estanteId)
    .input("endereco", sql.NVarChar(40), endereco)
    .input("linha", sql.Int, linha)
    .input("col", sql.Int, colInicio)
    .input("span", sql.Int, Math.min(30, colspan))
    .query(`
      INSERT INTO dbo.TB_MAPA_POSICAO (ESTANTE_ID, ENDERECO, LINHA, COL_INICIO, COLSPAN)
      OUTPUT INSERTED.ID
      VALUES (@estanteId, @endereco, @linha, @col, @span)
    `);
  return res.status(201).json({ success: true, id: ins.recordset[0].ID });
}

async function excluirPosicao(req, res, pool) {
  const id = parseIntPos(req.body?.id, null);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
  await pool.request().input("id", sql.Int, id).query(`DELETE FROM dbo.TB_MAPA_POSICAO WHERE ID=@id`);
  return res.json({ success: true });
}
