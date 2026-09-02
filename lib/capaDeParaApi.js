import { sql } from "../db.js";
import { exigirQualquerPermissao, usuarioDoRequest } from "./permissoesHelper.js";
import { CAPA_DEPARA_SEED } from "./capaDeParaSeed.js";

const LINK_VER = ["capa-depara", "pedido-capa", "pedido-capa-producao"];
const LINK_EDITAR = ["capa-depara", "pedido-capa"];

function normCodigo(v) {
  return String(v || "").trim();
}

function mapRow(r) {
  return {
    id: r.ID,
    codOrigem: r.COD_ORIGEM,
    codPerso: r.COD_PERSO,
    linha: r.LINHA,
    descricao: r.DESCRICAO,
    ativo: r.ATIVO === true || r.ATIVO === 1,
    atualizadoEm: r.ATUALIZADO_EM,
    atualizadoPor: r.ATUALIZADO_POR,
  };
}

export async function ensureDeParaTables(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.PROD_CAPA_DEPARA', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PROD_CAPA_DEPARA (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        COD_ORIGEM NVARCHAR(20) NOT NULL,
        COD_PERSO NVARCHAR(20) NOT NULL,
        LINHA NVARCHAR(40) NULL,
        DESCRICAO NVARCHAR(300) NULL,
        ATIVO BIT NOT NULL CONSTRAINT DF_CAPA_DEPARA_ATV DEFAULT (1),
        ATUALIZADO_EM DATETIME NOT NULL CONSTRAINT DF_CAPA_DEPARA_ATU DEFAULT (GETDATE()),
        ATUALIZADO_POR NVARCHAR(100) NULL
      );
      CREATE UNIQUE INDEX UQ_CAPA_DEPARA_PERSO ON dbo.PROD_CAPA_DEPARA (COD_PERSO);
      CREATE INDEX IX_CAPA_DEPARA_ORIGEM ON dbo.PROD_CAPA_DEPARA (COD_ORIGEM);
      CREATE INDEX IX_CAPA_DEPARA_LINHA ON dbo.PROD_CAPA_DEPARA (LINHA);
    END;
  `);

  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
        SELECT 'capa-depara', p.NIVEL, p.PERMITIDO, 'SEED-DEPARA'
        FROM dbo.SHR_PERMISSOES_MENU p
        WHERE p.LINK_ID = 'pedido-capa'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
            WHERE x.LINK_ID = 'capa-depara' AND x.NIVEL = p.NIVEL
          );
      END
    `);
  } catch (_) {
    /* ok */
  }
}

async function seedIfEmpty(pool) {
  const n = await pool.request().query(`SELECT COUNT(*) AS N FROM dbo.PROD_CAPA_DEPARA`);
  if ((n.recordset[0].N || 0) > 0) return { seeded: false, count: n.recordset[0].N };

  const BATCH = 40;
  for (let i = 0; i < CAPA_DEPARA_SEED.length; i += BATCH) {
    const chunk = CAPA_DEPARA_SEED.slice(i, i + BATCH);
    const req = pool.request();
    const values = chunk.map((row, idx) => {
      req.input(`o${idx}`, sql.NVarChar(20), row.origem);
      req.input(`p${idx}`, sql.NVarChar(20), row.perso);
      req.input(`l${idx}`, sql.NVarChar(40), row.linha || null);
      req.input(`d${idx}`, sql.NVarChar(300), row.descricao || null);
      return `(@o${idx}, @p${idx}, @l${idx}, @d${idx}, 1, 'SEED')`;
    });
    await req.query(`
      INSERT INTO dbo.PROD_CAPA_DEPARA (COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO, ATUALIZADO_POR)
      VALUES ${values.join(",")}
    `);
  }
  return { seeded: true, count: CAPA_DEPARA_SEED.length };
}

export async function resolverDePara(pool, perso) {
  const codigo = normCodigo(perso);
  if (!codigo) return null;
  await ensureDeParaTables(pool);
  await seedIfEmpty(pool);
  const r = await pool
    .request()
    .input("perso", sql.NVarChar(20), codigo)
    .query(`
      SELECT TOP 1 ID, COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO
      FROM dbo.PROD_CAPA_DEPARA
      WHERE COD_PERSO = @perso AND ATIVO = 1
    `);
  if (!r.recordset.length) return null;
  return mapRow(r.recordset[0]);
}

export async function handleCapaDePara(req, res, pool) {
  try {
    await ensureDeParaTables(pool);
    const acao = String(req.query.acao || req.query.action || req.body?.acao || "").trim();

    if (req.method === "GET") {
      if (acao === "resolver") {
        if (!(await exigirQualquerPermissao(req, res, LINK_VER, "Sem permissão para consultar o de/para."))) return;
        await seedIfEmpty(pool);
        const found = await resolverDePara(pool, req.query.perso || req.query.sku || req.query.codigo);
        return res.json({ success: true, data: found });
      }
      if (!(await exigirQualquerPermissao(req, res, LINK_VER, "Sem permissão para o de/para de capas."))) return;
      await seedIfEmpty(pool);
      if (acao === "obter") return await obter(req, res, pool);
      if (acao === "linhas") return await listarLinhas(req, res, pool);
      return await listar(req, res, pool);
    }

    if (req.method === "POST") {
      if (!(await exigirQualquerPermissao(req, res, LINK_EDITAR, "Sem permissão para alterar o de/para."))) return;
      await seedIfEmpty(pool);
      if (acao === "criar") return await criar(req, res, pool);
      if (acao === "atualizar") return await atualizar(req, res, pool);
      if (acao === "excluir") return await excluir(req, res, pool);
      if (acao === "importar") return await importar(req, res, pool);
      return res.status(400).json({ success: false, error: "Ação inválida." });
    }

    return res.status(405).json({ success: false, error: "Método não permitido." });
  } catch (err) {
    console.error("[capa-depara]", err);
    return res.status(500).json({ success: false, error: err.message || "Erro no de/para." });
  }
}

async function listar(req, res, pool) {
  const q = String(req.query.q || "").trim();
  const linha = String(req.query.linha || "").trim();
  const ativos = String(req.query.ativos || "1") !== "0";
  const request = pool.request();
  const where = [];
  if (ativos) where.push("ATIVO = 1");
  if (linha) {
    request.input("linha", sql.NVarChar(40), linha);
    where.push("LINHA = @linha");
  }
  if (q) {
    request.input("q", sql.NVarChar, `%${q}%`);
    where.push(`(
      COD_PERSO LIKE @q OR COD_ORIGEM LIKE @q OR DESCRICAO LIKE @q OR LINHA LIKE @q
    )`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await request.query(`
    SELECT ID, COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO, ATUALIZADO_EM, ATUALIZADO_POR
    FROM dbo.PROD_CAPA_DEPARA
    ${sqlWhere}
    ORDER BY LINHA, COD_PERSO
  `);
  return res.json({ success: true, data: result.recordset.map(mapRow) });
}

async function listarLinhas(req, res, pool) {
  const result = await pool.request().query(`
    SELECT DISTINCT LINHA
    FROM dbo.PROD_CAPA_DEPARA
    WHERE ATIVO = 1 AND LINHA IS NOT NULL AND LINHA <> ''
    ORDER BY LINHA
  `);
  return res.json({
    success: true,
    data: result.recordset.map((r) => r.LINHA),
  });
}

async function obter(req, res, pool) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: "ID inválido." });
  }
  const result = await pool.request().input("id", sql.Int, id).query(`
    SELECT ID, COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO, ATUALIZADO_EM, ATUALIZADO_POR
    FROM dbo.PROD_CAPA_DEPARA WHERE ID=@id
  `);
  if (!result.recordset.length) {
    return res.status(404).json({ success: false, error: "Registro não encontrado." });
  }
  return res.json({ success: true, data: mapRow(result.recordset[0]) });
}

function usuarioNome(req) {
  return (
    (req.headers && req.headers["x-user-name"]) ||
    usuarioDoRequest(req) ||
    "sistema"
  );
}

function validar(body) {
  const origem = normCodigo(body.codOrigem || body.origem);
  const perso = normCodigo(body.codPerso || body.perso);
  if (!origem) return "Informe o código origem (o que vamos produzir).";
  if (!perso) return "Informe o código perso (o que vem do pedido).";
  return null;
}

async function persoDuplicado(pool, perso, idAtual) {
  const r = await pool
    .request()
    .input("perso", sql.NVarChar(20), perso)
    .input("id", sql.Int, idAtual || 0)
    .query(`SELECT ID FROM dbo.PROD_CAPA_DEPARA WHERE COD_PERSO=@perso AND ID<>@id`);
  return r.recordset.length > 0;
}

async function criar(req, res, pool) {
  const err = validar(req.body || {});
  if (err) return res.status(400).json({ success: false, error: err });
  const origem = normCodigo(req.body.codOrigem || req.body.origem);
  const perso = normCodigo(req.body.codPerso || req.body.perso);
  if (await persoDuplicado(pool, perso, 0)) {
    return res.status(409).json({ success: false, error: `Já existe de/para para o perso ${perso}.` });
  }
  const ins = await pool
    .request()
    .input("origem", sql.NVarChar(20), origem)
    .input("perso", sql.NVarChar(20), perso)
    .input("linha", sql.NVarChar(40), String(req.body.linha || "").trim() || null)
    .input("desc", sql.NVarChar(300), String(req.body.descricao || "").trim() || null)
    .input("usuario", sql.NVarChar(100), usuarioNome(req))
    .query(`
      INSERT INTO dbo.PROD_CAPA_DEPARA (COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO, ATUALIZADO_POR)
      OUTPUT INSERTED.ID
      VALUES (@origem, @perso, @linha, @desc, 1, @usuario)
    `);
  return res.status(201).json({ success: true, id: ins.recordset[0].ID });
}

async function atualizar(req, res, pool) {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: "ID inválido." });
  }
  const err = validar(req.body || {});
  if (err) return res.status(400).json({ success: false, error: err });
  const origem = normCodigo(req.body.codOrigem || req.body.origem);
  const perso = normCodigo(req.body.codPerso || req.body.perso);
  if (await persoDuplicado(pool, perso, id)) {
    return res.status(409).json({ success: false, error: `Já existe de/para para o perso ${perso}.` });
  }
  const ativo = req.body.ativo === false || req.body.ativo === 0 || req.body.ativo === "0" ? 0 : 1;
  const upd = await pool
    .request()
    .input("id", sql.Int, id)
    .input("origem", sql.NVarChar(20), origem)
    .input("perso", sql.NVarChar(20), perso)
    .input("linha", sql.NVarChar(40), String(req.body.linha || "").trim() || null)
    .input("desc", sql.NVarChar(300), String(req.body.descricao || "").trim() || null)
    .input("ativo", sql.Bit, ativo)
    .input("usuario", sql.NVarChar(100), usuarioNome(req))
    .query(`
      UPDATE dbo.PROD_CAPA_DEPARA
      SET COD_ORIGEM=@origem, COD_PERSO=@perso, LINHA=@linha, DESCRICAO=@desc,
          ATIVO=@ativo, ATUALIZADO_EM=GETDATE(), ATUALIZADO_POR=@usuario
      WHERE ID=@id
    `);
  if (!upd.rowsAffected || !upd.rowsAffected[0]) {
    return res.status(404).json({ success: false, error: "Registro não encontrado." });
  }
  return res.json({ success: true, id });
}

async function excluir(req, res, pool) {
  const id = Number(req.body?.id || req.query.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: "ID inválido." });
  }
  await pool.request().input("id", sql.Int, id).query(`DELETE FROM dbo.PROD_CAPA_DEPARA WHERE ID=@id`);
  return res.json({ success: true });
}

async function importar(req, res, pool) {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) {
    return res.status(400).json({ success: false, error: "Envie itens: [{ origem, perso, linha, descricao }]." });
  }
  let criados = 0;
  let atualizados = 0;
  let erros = [];
  const usuario = usuarioNome(req);
  for (const it of itens) {
    const origem = normCodigo(it.codOrigem || it.origem);
    const perso = normCodigo(it.codPerso || it.perso);
    if (!origem || !perso) {
      erros.push("Linha sem origem ou perso.");
      continue;
    }
    try {
      const exists = await pool
        .request()
        .input("perso", sql.NVarChar(20), perso)
        .query(`SELECT ID FROM dbo.PROD_CAPA_DEPARA WHERE COD_PERSO=@perso`);
      if (exists.recordset.length) {
        await pool
          .request()
          .input("id", sql.Int, exists.recordset[0].ID)
          .input("origem", sql.NVarChar(20), origem)
          .input("linha", sql.NVarChar(40), String(it.linha || "").trim() || null)
          .input("desc", sql.NVarChar(300), String(it.descricao || "").trim() || null)
          .input("usuario", sql.NVarChar(100), usuario)
          .query(`
            UPDATE dbo.PROD_CAPA_DEPARA
            SET COD_ORIGEM=@origem, LINHA=@linha, DESCRICAO=@desc, ATIVO=1,
                ATUALIZADO_EM=GETDATE(), ATUALIZADO_POR=@usuario
            WHERE ID=@id
          `);
        atualizados += 1;
      } else {
        await pool
          .request()
          .input("origem", sql.NVarChar(20), origem)
          .input("perso", sql.NVarChar(20), perso)
          .input("linha", sql.NVarChar(40), String(it.linha || "").trim() || null)
          .input("desc", sql.NVarChar(300), String(it.descricao || "").trim() || null)
          .input("usuario", sql.NVarChar(100), usuario)
          .query(`
            INSERT INTO dbo.PROD_CAPA_DEPARA (COD_ORIGEM, COD_PERSO, LINHA, DESCRICAO, ATIVO, ATUALIZADO_POR)
            VALUES (@origem, @perso, @linha, @desc, 1, @usuario)
          `);
        criados += 1;
      }
    } catch (e) {
      erros.push(`${perso}: ${e.message}`);
    }
  }
  return res.json({ success: true, criados, atualizados, erros });
}
