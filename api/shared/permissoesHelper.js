import { getConnection, sql } from "../../db.js";

/**
 * Helper server-side de permissões (SGC).
 *
 * Grupos = cargo (+ setor), ex:
 *   adm, gerente_estoque, coordenador_estoque, estagio_estoque, ...
 *
 * Regras:
 *  - nivel 'adm' (e legado '1') SEMPRE tem acesso
 *  - link_id 'home' / 'inicio' sempre liberado
 *  - Sem linha (link_id, nivel) ou PERMITIDO = 0 → NEGADO
 *  - Falha de DB → fail-closed (exceto admin/home)
 *
 * CAD_USUARIO.NIVEL grava o CODIGO textual do grupo.
 */

/** Código canônico do administrador */
const ADMIN_CODIGO = "adm";

/** Códigos legados que ainda contam como admin (migração 1→adm) */
const ADMIN_ALIASES = new Set(["adm", "1", "administrador", "admin"]);

/** Cache por "instância quente" do serverless */
let cachePermissoes = null;
let cacheTs = 0;
const CACHE_TTL_MS = 30_000;

/**
 * Normaliza codigo de grupo: trim + lower + espaços→underscore.
 * Mantém a-z, 0-9, _
 */
export function normalizarNivel(nivel) {
  if (nivel === null || nivel === undefined || nivel === "") return "usuario";
  return String(nivel)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function isAdmin(nivel) {
  const n = normalizarNivel(nivel);
  return ADMIN_ALIASES.has(n);
}

/**
 * Invalida o cache (chamar após POST em permissoes).
 */
export function invalidarCachePermissoes() {
  cachePermissoes = null;
  cacheTs = 0;
}

async function carregarPermissoesCache(force = false) {
  const now = Date.now();
  if (!force && cachePermissoes && now - cacheTs < CACHE_TTL_MS) {
    return cachePermissoes;
  }

  const map = {};
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT LINK_ID, NIVEL, PERMITIDO
      FROM dbo.SHR_PERMISSOES_MENU
    `);
    for (const r of result.recordset || []) {
      const linkId = String(r.LINK_ID || "").trim();
      const niv = normalizarNivel(r.NIVEL);
      if (!linkId) continue;
      if (!map[linkId]) map[linkId] = {};
      map[linkId][niv] = r.PERMITIDO === true || r.PERMITIDO === 1 || r.PERMITIDO === "1";
    }
  } catch (err) {
    console.error("[permissoesHelper] Falha ao carregar matriz:", err.message);
  }

  cachePermissoes = map;
  cacheTs = now;
  return map;
}

/**
 * @param {string} linkId
 * @param {string|number|null} nivel
 * @returns {Promise<boolean>}
 */
export async function podeAcessar(linkId, nivel) {
  const niv = normalizarNivel(nivel);
  const id = String(linkId || "").trim();

  if (isAdmin(niv)) return true;
  if (id === "home" || id === "inicio") return true;
  if (!id) return false;

  const perm = await carregarPermissoesCache();
  return !!(perm[id] && perm[id][niv]);
}

/**
 * @returns {Promise<(linkId: string) => boolean>}
 */
export async function criarChecker(nivel) {
  const niv = normalizarNivel(nivel);
  if (isAdmin(niv)) {
    return () => true;
  }
  const perm = await carregarPermissoesCache();
  return (linkId) => {
    const id = String(linkId || "").trim();
    if (id === "home" || id === "inicio") return true;
    return !!(perm[id] && perm[id][niv]);
  };
}

/**
 * Lê o nível do request (headers/query/body).
 * Headers: x-user-level, x-user-code
 */
export function nivelDoRequest(req) {
  const h = req.headers || {};
  const fromHeader =
    h["x-user-level"] ||
    h["X-User-Level"] ||
    h["x-userlevel"];
  if (fromHeader !== undefined && fromHeader !== null && fromHeader !== "") {
    return normalizarNivel(fromHeader);
  }
  if (req.query && req.query.userLevel !== undefined) {
    return normalizarNivel(req.query.userLevel);
  }
  if (req.body && req.body.userLevel !== undefined) {
    return normalizarNivel(req.body.userLevel);
  }
  return null;
}

export function usuarioDoRequest(req) {
  const h = req.headers || {};
  return (
    h["x-user-code"] ||
    h["X-User-Code"] ||
    (req.body && req.body.usuario) ||
    (req.query && req.query.usuario) ||
    null
  );
}

export function exigirAdmin(req, res) {
  const nivel = nivelDoRequest(req);
  if (!isAdmin(nivel)) {
    res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores (ADM).",
    });
    return false;
  }
  return true;
}

export async function exigirPermissao(req, res, linkId, mensagem) {
  const nivel = nivelDoRequest(req);
  if (nivel === null) {
    res.status(401).json({
      success: false,
      error: "Sessão inválida. Informe o cargo do usuário (x-user-level).",
    });
    return false;
  }
  const ok = await podeAcessar(linkId, nivel);
  if (!ok) {
    res.status(403).json({
      success: false,
      error: mensagem || `Sem permissão para: ${linkId}`,
    });
    return false;
  }
  return true;
}

export { ADMIN_CODIGO, ADMIN_ALIASES, sql };
