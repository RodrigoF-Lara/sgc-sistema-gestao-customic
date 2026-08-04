import { sql } from "../db.js";
import {
  exigirAdmin,
  invalidarCachePermissoes,
  nivelDoRequest,
  usuarioDoRequest,
  normalizarNivel,
  isAdmin,
  podeAcessar,
} from "./permissoesHelper.js";
import { MENU_CATALOG, ACOES_ESPECIAIS } from "./menuCatalog.js";

/**
 * Handlers da matriz de permissões
 * (embutidos em /api/shared/config?tipo=permissoes — sem function extra no Vercel).
 */

export async function handlePermissoes(req, res, pool, method, query) {
  if (method === "GET") {
    const action = (query && query.action) || "matriz";

    if (action === "catalogo") {
      return res.status(200).json({
        success: true,
        data: {
          links: MENU_CATALOG,
          acoes_especiais: ACOES_ESPECIAIS,
        },
      });
    }

    if (action === "minhas") {
      return await minhasPermissoes(req, res, pool);
    }

    if (action === "check") {
      const linkId = query.link_id || query.linkId;
      const nivel = nivelDoRequest(req);
      if (nivel === null) {
        return res.status(401).json({ success: false, error: "Nível não informado" });
      }
      const permitido = await podeAcessar(linkId, nivel);
      return res.status(200).json({ success: true, link_id: linkId, permitido });
    }

    return await getMatriz(req, res, pool);
  }

  if (method === "POST") {
    if (!exigirAdmin(req, res)) return;
    return await upsertPermissoes(req, res, pool);
  }

  return res.status(405).json({ success: false, error: "Método não permitido" });
}

async function getMatriz(req, res, pool) {
  try {
    const result = await pool.request().query(`
      SELECT LINK_ID, NIVEL, PERMITIDO
      FROM dbo.SHR_PERMISSOES_MENU
    `);

    const data = {};
    for (const r of result.recordset || []) {
      const linkId = String(r.LINK_ID || "").trim();
      const niv = normalizarNivel(r.NIVEL);
      if (!linkId) continue;
      if (!data[linkId]) data[linkId] = {};
      data[linkId][niv] = r.PERMITIDO === true || r.PERMITIDO === 1 || r.PERMITIDO === "1";
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.message && /SHR_PERMISSOES_MENU|Invalid object name/i.test(error.message)) {
      return res.status(200).json({
        success: true,
        data: {},
        warning: "Tabela SHR_PERMISSOES_MENU não encontrada. Execute o SQL de criação.",
      });
    }
    throw error;
  }
}

async function minhasPermissoes(req, res, pool) {
  const nivel = nivelDoRequest(req);
  if (nivel === null) {
    return res.status(401).json({
      success: false,
      error: "Informe o nível (header x-user-level)",
    });
  }

  if (isAdmin(nivel)) {
    const all = {};
    for (const link of MENU_CATALOG) all[link.id] = true;
    for (const ac of ACOES_ESPECIAIS) all[ac.id] = true;
    all.home = true;
    return res.status(200).json({
      success: true,
      nivel: normalizarNivel(nivel),
      admin: true,
      data: all,
    });
  }

  try {
    const result = await pool.request()
      .input("nivel", sql.VarChar(50), normalizarNivel(nivel))
      .query(`
        SELECT LINK_ID, PERMITIDO
        FROM dbo.SHR_PERMISSOES_MENU
        WHERE NIVEL = @nivel
      `);

    const data = { home: true };
    for (const r of result.recordset || []) {
      const linkId = String(r.LINK_ID || "").trim();
      data[linkId] = r.PERMITIDO === true || r.PERMITIDO === 1 || r.PERMITIDO === "1";
    }

    return res.status(200).json({
      success: true,
      nivel: normalizarNivel(nivel),
      admin: false,
      data,
    });
  } catch (error) {
    if (error.message && /SHR_PERMISSOES_MENU|Invalid object name/i.test(error.message)) {
      const all = { home: true };
      for (const link of MENU_CATALOG) all[link.id] = true;
      for (const ac of ACOES_ESPECIAIS) all[ac.id] = true;
      return res.status(200).json({
        success: true,
        nivel: normalizarNivel(nivel),
        admin: false,
        data: all,
        warning: "Tabela SHR_PERMISSOES_MENU não encontrada. Execute sql/shared/create_permissoes_tables.sql",
        fail_open: true,
      });
    }
    throw error;
  }
}

async function upsertPermissoes(req, res, pool) {
  const permissoes = (req.body && req.body.permissoes) || [];
  if (!Array.isArray(permissoes) || permissoes.length === 0) {
    return res.status(400).json({ success: false, error: "permissoes[] é obrigatório" });
  }

  const usuario = usuarioDoRequest(req) || "admin";
  let gravados = 0;

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const item of permissoes) {
        const linkId = String(item.link_id || item.linkId || "").trim();
        const nivel = normalizarNivel(item.nivel);
        const permitido =
          item.permitido === true ||
          item.permitido === 1 ||
          item.permitido === "1" ||
          item.permitido === "true";

        if (!linkId || !nivel) continue;

        const request = new sql.Request(transaction);
        await request
          .input("link_id", sql.VarChar(100), linkId)
          .input("nivel", sql.VarChar(50), nivel)
          .input("permitido", sql.Bit, permitido ? 1 : 0)
          .input("usuario", sql.VarChar(100), String(usuario).slice(0, 100))
          .query(`
            MERGE dbo.SHR_PERMISSOES_MENU AS t
            USING (SELECT @link_id AS LINK_ID, @nivel AS NIVEL) AS s
              ON t.LINK_ID = s.LINK_ID AND t.NIVEL = s.NIVEL
            WHEN MATCHED THEN
              UPDATE SET
                PERMITIDO = @permitido,
                DT_ATUALIZACAO = SYSUTCDATETIME(),
                USUARIO_ATUALIZACAO = @usuario
            WHEN NOT MATCHED THEN
              INSERT (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
              VALUES (@link_id, @nivel, @permitido, @usuario);
          `);
        gravados++;
      }

      await transaction.commit();
    } catch (inner) {
      await transaction.rollback();
      throw inner;
    }

    invalidarCachePermissoes();
    return res.status(200).json({ success: true, gravados });
  } catch (error) {
    console.error("Erro ao gravar permissões:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
