import { getConnection, sql } from "../../db.js";
import { exigirAdmin, normalizarNivel } from "./permissoesHelper.js";

/**
 * API de Grupos / Cargos de usuário
 *
 * GET  → lista cargos ordenados
 * POST → action=create|update|delete (só ADM)
 *
 * CODIGO: snake_case (ex: gerente_estoque)
 * LABEL: exibição (ex: GERENTE (estoque))
 * SETOR: opcional (ex: ESTOQUE)
 */
export default async function handler(req, res) {
  try {
    const pool = await getConnection();

    if (req.method === "GET") {
      return await listarNiveis(req, res, pool);
    }

    if (req.method === "POST") {
      if (!exigirAdmin(req, res)) return;
      const action = (req.body && req.body.action) || "";
      if (action === "create") return await criarNivel(req, res, pool);
      if (action === "update") return await atualizarNivel(req, res, pool);
      if (action === "delete") return await excluirNivel(req, res, pool);
      return res.status(400).json({ success: false, error: "action inválida (create|update|delete)" });
    }

    return res.status(405).json({ success: false, error: "Método não permitido" });
  } catch (error) {
    console.error("Erro na API de níveis:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      message: error.message,
    });
  }
}

function sanitizarCodigo(codigo) {
  return normalizarNivel(codigo);
}

function sanitizarSetor(setor) {
  if (setor === null || setor === undefined || setor === "") return null;
  return String(setor).trim().toUpperCase().slice(0, 50) || null;
}

const FALLBACK_CARGOS = [
  { id: 1, codigo: "adm", label: "ADM", setor: null, ordem: 10, protegido: true },
  { id: 2, codigo: "gerente_estoque", label: "GERENTE (estoque)", setor: "ESTOQUE", ordem: 20, protegido: false },
  { id: 3, codigo: "coordenador_estoque", label: "COORDENADOR (estoque)", setor: "ESTOQUE", ordem: 30, protegido: false },
  { id: 4, codigo: "supervisor_estoque", label: "SUPERVISOR (estoque)", setor: "ESTOQUE", ordem: 40, protegido: false },
  { id: 5, codigo: "lider_estoque", label: "LIDER (estoque)", setor: "ESTOQUE", ordem: 50, protegido: false },
  { id: 6, codigo: "analista_estoque", label: "ANALISTA (estoque)", setor: "ESTOQUE", ordem: 60, protegido: false },
  { id: 7, codigo: "assistente_estoque", label: "ASSISTENTE (estoque)", setor: "ESTOQUE", ordem: 70, protegido: false },
  { id: 8, codigo: "auxiliar_estoque", label: "AUXILIAR (estoque)", setor: "ESTOQUE", ordem: 80, protegido: false },
  { id: 9, codigo: "estagio_estoque", label: "ESTÁGIO (estoque)", setor: "ESTOQUE", ordem: 90, protegido: false },
];

async function listarNiveis(req, res, pool) {
  try {
    const result = await pool.request().query(`
      SELECT ID as id, CODIGO as codigo, LABEL as label, SETOR as setor, ORDEM as ordem,
             PROTEGIDO as protegido, DT_CRIACAO as dt_criacao, DT_ATUALIZACAO as dt_atualizacao
      FROM dbo.SHR_NIVEIS_USUARIO
      ORDER BY ORDEM, LABEL
    `);

    const data = (result.recordset || []).map((r) => ({
      id: r.id,
      codigo: String(r.codigo),
      label: r.label,
      setor: r.setor || null,
      ordem: r.ordem,
      protegido: r.protegido === true || r.protegido === 1,
      dt_criacao: r.dt_criacao,
      dt_atualizacao: r.dt_atualizacao,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    // Coluna SETOR pode não existir ainda
    if (error.message && /Invalid column name ['\"]SETOR['\"]/i.test(error.message)) {
      try {
        const result = await pool.request().query(`
          SELECT ID as id, CODIGO as codigo, LABEL as label, ORDEM as ordem,
                 PROTEGIDO as protegido, DT_CRIACAO as dt_criacao, DT_ATUALIZACAO as dt_atualizacao
          FROM dbo.SHR_NIVEIS_USUARIO
          ORDER BY ORDEM, LABEL
        `);
        const data = (result.recordset || []).map((r) => ({
          id: r.id,
          codigo: String(r.codigo),
          label: r.label,
          setor: null,
          ordem: r.ordem,
          protegido: r.protegido === true || r.protegido === 1,
        }));
        return res.status(200).json({
          success: true,
          data,
          warning: "Coluna SETOR ausente — rode o SQL de permissões atualizado.",
        });
      } catch (e2) {
        /* fallthrough */
      }
    }

    if (error.message && /SHR_NIVEIS_USUARIO|Invalid object name/i.test(error.message)) {
      return res.status(200).json({
        success: true,
        data: FALLBACK_CARGOS,
        warning: "Tabela SHR_NIVEIS_USUARIO não encontrada. Execute sql/shared/create_permissoes_tables.sql",
      });
    }
    throw error;
  }
}

async function criarNivel(req, res, pool) {
  const { codigo, label, ordem, setor } = req.body || {};
  const codigoSan = sanitizarCodigo(codigo);
  const labelSan = String(label || "").trim();
  const setorSan = sanitizarSetor(setor);
  const ordemNum = ordem !== undefined && ordem !== null && ordem !== ""
    ? parseInt(ordem, 10)
    : 100;

  if (!codigoSan || codigoSan === "usuario") {
    return res.status(400).json({
      success: false,
      error: "Código inválido. Use letras minúsculas, números e _ (ex: gerente_estoque)",
    });
  }
  if (!labelSan) {
    return res.status(400).json({ success: false, error: "Nome de exibição (label) é obrigatório" });
  }
  if (Number.isNaN(ordemNum)) {
    return res.status(400).json({ success: false, error: "Ordem inválida" });
  }

  try {
    const existe = await pool.request()
      .input("codigo", sql.VarChar(50), codigoSan)
      .query(`SELECT COUNT(*) as c FROM dbo.SHR_NIVEIS_USUARIO WHERE CODIGO = @codigo`);

    if (existe.recordset[0].c > 0) {
      return res.status(409).json({ success: false, error: "Já existe um cargo com este código" });
    }

    const result = await pool.request()
      .input("codigo", sql.VarChar(50), codigoSan)
      .input("label", sql.VarChar(120), labelSan)
      .input("setor", sql.VarChar(50), setorSan)
      .input("ordem", sql.Int, ordemNum)
      .query(`
        INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, SETOR, ORDEM, PROTEGIDO)
        OUTPUT INSERTED.ID as id, INSERTED.CODIGO as codigo, INSERTED.LABEL as label,
               INSERTED.SETOR as setor, INSERTED.ORDEM as ordem, INSERTED.PROTEGIDO as protegido
        VALUES (@codigo, @label, @setor, @ordem, 0)
      `);

    const row = result.recordset[0];
    return res.status(201).json({
      success: true,
      data: {
        id: row.id,
        codigo: String(row.codigo),
        label: row.label,
        setor: row.setor || null,
        ordem: row.ordem,
        protegido: false,
      },
    });
  } catch (error) {
    // Fallback se coluna SETOR não existe
    if (error.message && /Invalid column name ['\"]SETOR['\"]/i.test(error.message)) {
      try {
        const result = await pool.request()
          .input("codigo", sql.VarChar(50), codigoSan)
          .input("label", sql.VarChar(120), labelSan)
          .input("ordem", sql.Int, ordemNum)
          .query(`
            INSERT INTO dbo.SHR_NIVEIS_USUARIO (CODIGO, LABEL, ORDEM, PROTEGIDO)
            OUTPUT INSERTED.ID as id, INSERTED.CODIGO as codigo, INSERTED.LABEL as label,
                   INSERTED.ORDEM as ordem, INSERTED.PROTEGIDO as protegido
            VALUES (@codigo, @label, @ordem, 0)
          `);
        const row = result.recordset[0];
        return res.status(201).json({
          success: true,
          data: {
            id: row.id,
            codigo: String(row.codigo),
            label: row.label,
            setor: null,
            ordem: row.ordem,
            protegido: false,
          },
          warning: "Coluna SETOR ausente — rode o SQL atualizado.",
        });
      } catch (e2) {
        return res.status(500).json({ success: false, error: e2.message });
      }
    }
    console.error("Erro ao criar cargo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function atualizarNivel(req, res, pool) {
  const { id, label, ordem, setor } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, error: "id é obrigatório" });
  }

  const labelSan = label !== undefined ? String(label).trim() : null;
  const ordemNum = ordem !== undefined && ordem !== null && ordem !== ""
    ? parseInt(ordem, 10)
    : null;
  const hasSetor = Object.prototype.hasOwnProperty.call(req.body || {}, "setor");
  const setorSan = hasSetor ? sanitizarSetor(setor) : undefined;

  if (labelSan !== null && !labelSan) {
    return res.status(400).json({ success: false, error: "Label não pode ser vazio" });
  }
  if (ordemNum !== null && Number.isNaN(ordemNum)) {
    return res.status(400).json({ success: false, error: "Ordem inválida" });
  }

  try {
    const atual = await pool.request()
      .input("id", sql.Int, parseInt(id, 10))
      .query(`SELECT ID, CODIGO, PROTEGIDO FROM dbo.SHR_NIVEIS_USUARIO WHERE ID = @id`);

    if (atual.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "Cargo não encontrado" });
    }

    let sets = ["DT_ATUALIZACAO = SYSUTCDATETIME()"];
    const request = pool.request().input("id", sql.Int, parseInt(id, 10));

    if (labelSan !== null) {
      sets.push("LABEL = @label");
      request.input("label", sql.VarChar(120), labelSan);
    }
    if (ordemNum !== null) {
      sets.push("ORDEM = @ordem");
      request.input("ordem", sql.Int, ordemNum);
    }
    if (hasSetor) {
      sets.push("SETOR = @setor");
      request.input("setor", sql.VarChar(50), setorSan);
    }

    if (sets.length === 1) {
      return res.status(400).json({ success: false, error: "Nada para atualizar" });
    }

    await request.query(`
      UPDATE dbo.SHR_NIVEIS_USUARIO SET ${sets.join(", ")} WHERE ID = @id
    `);

    return res.status(200).json({ success: true, message: "Cargo atualizado" });
  } catch (error) {
    console.error("Erro ao atualizar cargo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function excluirNivel(req, res, pool) {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, error: "id é obrigatório" });
  }

  try {
    const atual = await pool.request()
      .input("id", sql.Int, parseInt(id, 10))
      .query(`
        SELECT ID, CODIGO, PROTEGIDO FROM dbo.SHR_NIVEIS_USUARIO WHERE ID = @id
      `);

    if (atual.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "Cargo não encontrado" });
    }

    const row = atual.recordset[0];
    if (row.PROTEGIDO === true || row.PROTEGIDO === 1) {
      return res.status(403).json({
        success: false,
        error: "Este cargo é protegido e não pode ser excluído (ADM)",
      });
    }

    const codigo = normalizarNivel(row.CODIGO);

    const u = await pool.request()
      .input("nivel", sql.VarChar(50), codigo)
      .query(`
        SELECT COUNT(*) as c
        FROM dbo.CAD_USUARIO
        WHERE LOWER(LTRIM(RTRIM(CAST(NIVEL AS VARCHAR(50))))) = @nivel
      `);
    const countUsers = u.recordset[0].c;

    if (countUsers > 0) {
      return res.status(409).json({
        success: false,
        error: `Não é possível excluir: existem ${countUsers} usuário(s) com este cargo`,
      });
    }

    await pool.request()
      .input("nivel", sql.VarChar(50), codigo)
      .query(`DELETE FROM dbo.SHR_PERMISSOES_MENU WHERE LOWER(LTRIM(RTRIM(NIVEL))) = @nivel`);

    await pool.request()
      .input("id", sql.Int, parseInt(id, 10))
      .query(`DELETE FROM dbo.SHR_NIVEIS_USUARIO WHERE ID = @id`);

    return res.status(200).json({ success: true, message: "Cargo excluído" });
  } catch (error) {
    console.error("Erro ao excluir cargo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
