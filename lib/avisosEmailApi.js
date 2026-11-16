import { sql } from "../db.js";
import { exigirPermissao } from "./permissoesHelper.js";

const LINK = "avisos-email";
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 15;

export const FLUXOS_AVISO = [
  {
    codigo: "orcamento-criado",
    secao: "Orçamentos",
    label: "Orçamento criado",
    descricao: "Sai ao salvar o orçamento pela primeira vez, ainda em aberto. Também sai quando o desenvolvimento de embalagens gera o orçamento.",
  },
  {
    codigo: "orcamento-aguardando",
    secao: "Orçamentos",
    label: "Aguardando aprovação",
    descricao: "Sai quando o orçamento é colocado em aguardando aprovação. Este é o aviso de quem decide.",
  },
];

const FLUXO_OK = new Set(FLUXOS_AVISO.map((item) => item.codigo));
let tabelasProntas = false;

export function normalizarEmails(lista) {
  const origem = Array.isArray(lista) ? lista : String(lista || "").split(/[;,\n]/);
  const vistos = new Set();
  const emails = [];
  for (const item of origem) {
    const email = String(item || "").trim().toLowerCase();
    if (!email || vistos.has(email)) continue;
    if (!EMAIL_OK.test(email) || email.length > 200) {
      return { erro: `E-mail inválido: ${String(item || "").trim().slice(0, 80)}` };
    }
    vistos.add(email);
    emails.push(email);
    if (emails.length > MAX_EMAILS) return { erro: `Use no máximo ${MAX_EMAILS} e-mails por aviso.` };
  }
  if (emails.join(", ").length > 1000) return { erro: "A lista de e-mails passou do limite." };
  return { emails };
}

function emailsDoAmbiente() {
  const lido = normalizarEmails(process.env.ORCAMENTO_EMAIL_DIRETOR || "");
  return lido.erro ? "" : lido.emails.join(", ");
}

export async function garantirAvisos(pool) {
  if (tabelasProntas) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.SHR_AVISO_EMAIL', N'U') IS NULL
    CREATE TABLE dbo.SHR_AVISO_EMAIL (
      CODIGO NVARCHAR(40) NOT NULL PRIMARY KEY,
      ATIVO BIT NOT NULL CONSTRAINT DF_SHR_AVISO_ATIVO DEFAULT (1),
      EMAILS NVARCHAR(1000) NULL,
      ATUALIZADO_EM DATETIME2 NULL,
      ATUALIZADO_POR NVARCHAR(100) NULL
    )
  `);
  const iniciais = emailsDoAmbiente();
  await pool.request()
    .input("emails", sql.NVarChar(1000), iniciais || null)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.SHR_AVISO_EMAIL WHERE CODIGO = N'orcamento-novo')
         AND NOT EXISTS (SELECT 1 FROM dbo.SHR_AVISO_EMAIL WHERE CODIGO = N'orcamento-aguardando')
        UPDATE dbo.SHR_AVISO_EMAIL
        SET CODIGO = N'orcamento-aguardando'
        WHERE CODIGO = N'orcamento-novo';

      IF NOT EXISTS (SELECT 1 FROM dbo.SHR_AVISO_EMAIL WHERE CODIGO = N'orcamento-aguardando')
      INSERT INTO dbo.SHR_AVISO_EMAIL (CODIGO, ATIVO, EMAILS)
      VALUES (N'orcamento-aguardando', 1, @emails);

      IF NOT EXISTS (SELECT 1 FROM dbo.SHR_AVISO_EMAIL WHERE CODIGO = N'orcamento-criado')
      INSERT INTO dbo.SHR_AVISO_EMAIL (CODIGO, ATIVO, EMAILS)
      VALUES (N'orcamento-criado', 1, NULL);
    `);
  tabelasProntas = true;
}

function partirEmails(texto) {
  const lido = normalizarEmails(texto || "");
  return lido.erro ? [] : lido.emails;
}

export async function lerFluxoAviso(pool, codigo) {
  await garantirAvisos(pool);
  const result = await pool.request()
    .input("codigo", sql.NVarChar(40), codigo)
    .query(`SELECT ATIVO, EMAILS FROM dbo.SHR_AVISO_EMAIL WHERE CODIGO = @codigo`);
  const row = result.recordset[0];
  if (!row) return { ativo: false, emails: [] };
  return {
    ativo: row.ATIVO === true || row.ATIVO === 1,
    emails: partirEmails(row.EMAILS),
  };
}

function autor(req) {
  const h = req.headers || {};
  let nome = h["x-user-name"] || h["X-User-Name"] || "";
  try { nome = decodeURIComponent(String(nome)); } catch (_) { /* mantém */ }
  return String(nome || (req.body && req.body.usuario) || "SGC").trim().slice(0, 100) || "SGC";
}

async function listar(res, pool) {
  await garantirAvisos(pool);
  const result = await pool.request().query(`SELECT CODIGO, ATIVO, EMAILS FROM dbo.SHR_AVISO_EMAIL`);
  const gravado = new Map((result.recordset || []).map((row) => [row.CODIGO, row]));
  const data = FLUXOS_AVISO.map((fluxo) => {
    const row = gravado.get(fluxo.codigo);
    return {
      codigo: fluxo.codigo,
      secao: fluxo.secao || "Orçamentos",
      label: fluxo.label,
      descricao: fluxo.descricao,
      ativo: row ? row.ATIVO === true || row.ATIVO === 1 : false,
      emails: row ? partirEmails(row.EMAILS) : [],
    };
  });
  return res.status(200).json({ success: true, data });
}

async function salvar(req, res, pool) {
  await garantirAvisos(pool);
  const fluxos = req.body && req.body.fluxos;
  if (!Array.isArray(fluxos) || !fluxos.length) {
    return res.status(400).json({ success: false, error: "Informe os avisos." });
  }
  const quem = autor(req);
  for (const item of fluxos) {
    const codigo = String(item && item.codigo || "").trim();
    if (!FLUXO_OK.has(codigo)) {
      return res.status(400).json({ success: false, error: "Aviso desconhecido." });
    }
    const lido = normalizarEmails(item.emails || []);
    if (lido.erro) return res.status(400).json({ success: false, error: lido.erro });
    await pool.request()
      .input("codigo", sql.NVarChar(40), codigo)
      .input("ativo", sql.Bit, item.ativo === false ? 0 : 1)
      .input("emails", sql.NVarChar(1000), lido.emails.join(", ") || null)
      .input("quem", sql.NVarChar(100), quem)
      .query(`
        UPDATE dbo.SHR_AVISO_EMAIL SET
          ATIVO = @ativo,
          EMAILS = @emails,
          ATUALIZADO_EM = SYSUTCDATETIME(),
          ATUALIZADO_POR = @quem
        WHERE CODIGO = @codigo;
        IF @@ROWCOUNT = 0
        INSERT INTO dbo.SHR_AVISO_EMAIL (CODIGO, ATIVO, EMAILS, ATUALIZADO_EM, ATUALIZADO_POR)
        VALUES (@codigo, @ativo, @emails, SYSUTCDATETIME(), @quem);
      `);
  }
  return listar(res, pool);
}

export async function handleAvisos(req, res, pool) {
  if (!(await exigirPermissao(req, res, LINK, "Sem permissão para avisos por e-mail."))) return;
  if (req.method === "GET") return listar(res, pool);
  if (req.method === "POST") return salvar(req, res, pool);
  return res.status(405).json({ success: false, error: "Método não permitido." });
}
