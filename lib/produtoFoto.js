import { sql } from "../db.js";

const MAX_FOTO = 3 * 1024 * 1024;
const MIME_POR_TIPO = {
  "image/jpg": "image/jpeg",
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

let tabelaPronta = false;

export class FotoErro extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function ensureFotoProduto(pool) {
  if (tabelaPronta) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.CAD_PROD_FOTO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CAD_PROD_FOTO (
        CODIGO NVARCHAR(100) NOT NULL PRIMARY KEY,
        NOME_ARQUIVO NVARCHAR(255) NOT NULL,
        MIME NVARCHAR(80) NOT NULL,
        CONTEUDO VARBINARY(MAX) NOT NULL,
        TAMANHO INT NOT NULL,
        ATUALIZADO_EM DATETIME NOT NULL CONSTRAINT DF_CAD_PROD_FOTO_EM DEFAULT (GETDATE()),
        ATUALIZADO_POR NVARCHAR(100) NULL,
        CONSTRAINT CK_CAD_PROD_FOTO_TAM CHECK (TAMANHO > 0 AND TAMANHO <= 3145728)
      );
    END
  `);
  tabelaPronta = true;
}

function codigoInformado(codigo) {
  const texto = String(codigo ?? "").trim();
  if (!texto || texto.length > 100) return "";
  return texto;
}

export function decodificarFoto(data) {
  if (!data || typeof data !== "string") throw new FotoErro(400, "Foto vazia.");
  const virgula = data.indexOf(",");
  const raw = data.startsWith("data:") && virgula >= 0 ? data.slice(virgula + 1) : data;
  const limpo = raw.replace(/\s/g, "");
  if (!limpo) throw new FotoErro(400, "Foto vazia.");
  if (limpo.length > Math.ceil(MAX_FOTO / 3) * 4) {
    throw new FotoErro(400, "A foto passa de 3 MB. Reduza a imagem antes de enviar.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpo) || limpo.length % 4 !== 0) {
    throw new FotoErro(400, "Foto inválida.");
  }
  const buf = Buffer.from(limpo, "base64");
  if (!buf.length) throw new FotoErro(400, "Foto vazia.");
  if (buf.length > MAX_FOTO) throw new FotoErro(400, "A foto passa de 3 MB. Reduza a imagem antes de enviar.");
  return buf;
}

function detectarFoto(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf.slice(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (
    buf.length >= 12
    && buf.slice(0, 4).toString("ascii") === "RIFF"
    && buf.slice(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return "";
}

function extensao(nome) {
  const base = String(nome || "").split(/[/\\]/).pop() || "";
  const ponto = base.lastIndexOf(".");
  if (ponto <= 0) return "";
  return base.slice(ponto + 1).toLowerCase();
}

export function classificarFoto(buf, mimeInformado, nome) {
  const mime = detectarFoto(buf);
  if (!mime) throw new FotoErro(400, "Envie uma imagem JPG, PNG, GIF ou WEBP.");
  const informado = String(mimeInformado || "").toLowerCase().split(";")[0].trim();
  if (informado && informado !== "application/octet-stream") {
    const esperado = MIME_POR_TIPO[informado];
    if (!esperado || esperado !== mime) {
      throw new FotoErro(400, "O tipo informado não corresponde à imagem.");
    }
  }
  const ext = extensao(nome);
  const porExt = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  if (ext && porExt[ext] !== mime) throw new FotoErro(400, "A extensão não corresponde à imagem.");
  return mime;
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
  const ext = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : mime === "image/webp" ? "webp" : "jpg";
  return `foto.${ext}`;
}

export async function codigoDoProduto(pool, codigo) {
  const informado = codigoInformado(codigo);
  if (!informado) return null;
  const exato = await pool.request()
    .input("codigo", sql.NVarChar(100), informado)
    .query("SELECT TOP 1 CODIGO FROM dbo.CAD_PROD WHERE CODIGO = @codigo");
  if (exato.recordset[0]) return String(exato.recordset[0].CODIGO);
  const amplo = await pool.request()
    .input("codigo", sql.NVarChar(100), informado)
    .query(`
      SELECT TOP 1 CODIGO
      FROM dbo.CAD_PROD
      WHERE UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(100), CODIGO)))) = UPPER(LTRIM(RTRIM(@codigo)))
    `);
  return amplo.recordset[0] ? String(amplo.recordset[0].CODIGO) : null;
}

export async function salvarFotoProduto(pool, codigo, data, mimeInformado, nome, usuario) {
  await ensureFotoProduto(pool);
  const oficial = await codigoDoProduto(pool, codigo);
  if (!oficial) throw new FotoErro(404, "Produto não cadastrado.");
  const buf = decodificarFoto(data);
  const mime = classificarFoto(buf, mimeInformado, nome);
  const arquivo = nomeArquivo(nome, mime);
  await pool.request()
    .input("codigo", sql.NVarChar(100), oficial)
    .input("nome", sql.NVarChar(255), arquivo)
    .input("mime", sql.NVarChar(80), mime)
    .input("conteudo", sql.VarBinary(sql.MAX), buf)
    .input("tamanho", sql.Int, buf.length)
    .input("usuario", sql.NVarChar(100), String(usuario || "SGC").slice(0, 100))
    .query(`
      MERGE dbo.CAD_PROD_FOTO AS alvo
      USING (SELECT @codigo AS CODIGO) AS src
      ON alvo.CODIGO = src.CODIGO
      WHEN MATCHED THEN UPDATE SET
        NOME_ARQUIVO = @nome,
        MIME = @mime,
        CONTEUDO = @conteudo,
        TAMANHO = @tamanho,
        ATUALIZADO_EM = GETDATE(),
        ATUALIZADO_POR = @usuario
      WHEN NOT MATCHED THEN INSERT
        (CODIGO, NOME_ARQUIVO, MIME, CONTEUDO, TAMANHO, ATUALIZADO_POR)
        VALUES (@codigo, @nome, @mime, @conteudo, @tamanho, @usuario);
    `);
  return oficial;
}

export async function excluirFotoProduto(pool, codigo) {
  await ensureFotoProduto(pool);
  const oficial = await codigoDoProduto(pool, codigo);
  if (!oficial) throw new FotoErro(404, "Produto não cadastrado.");
  const apagado = await pool.request()
    .input("codigo", sql.NVarChar(100), oficial)
    .query("DELETE FROM dbo.CAD_PROD_FOTO WHERE CODIGO = @codigo");
  return { codigo: oficial, removida: !!apagado.rowsAffected[0] };
}

export async function lerFotoProduto(pool, codigo) {
  await ensureFotoProduto(pool);
  const informado = codigoInformado(codigo);
  if (!informado) throw new FotoErro(400, "Informe o código do produto.");
  const result = await pool.request()
    .input("codigo", sql.NVarChar(100), informado)
    .query(`
      SELECT TOP 1 MIME, NOME_ARQUIVO, CONTEUDO
      FROM dbo.CAD_PROD_FOTO
      WHERE UPPER(LTRIM(RTRIM(CODIGO))) = UPPER(LTRIM(RTRIM(@codigo)))
    `);
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  const buf = Buffer.isBuffer(row.CONTEUDO) ? row.CONTEUDO : Buffer.from(row.CONTEUDO);
  return { mime: row.MIME || "application/octet-stream", nome: row.NOME_ARQUIVO || "foto", buf };
}

export async function codigosComFoto(pool, codigos) {
  await ensureFotoProduto(pool);
  const unicos = [...new Set(
    (codigos || []).map((codigo) => String(codigo || "").trim().toUpperCase()).filter(Boolean)
  )].slice(0, 2000);
  const tem = [];
  const tamanho = 400;
  for (let i = 0; i < unicos.length; i += tamanho) {
    const fatia = unicos.slice(i, i + tamanho);
    const pedido = pool.request();
    const params = fatia.map((codigo, idx) => {
      pedido.input("c" + idx, sql.NVarChar(100), codigo);
      return "@c" + idx;
    });
    const result = await pedido.query(`
      SELECT CODIGO
      FROM dbo.CAD_PROD_FOTO
      WHERE UPPER(LTRIM(RTRIM(CODIGO))) IN (${params.join(", ")})
    `);
    for (const row of result.recordset || []) tem.push(String(row.CODIGO || "").trim().toUpperCase());
  }
  return tem;
}

export function enviarFoto(res, arquivo) {
  const ascii = String(arquivo.nome || "foto").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "foto";
  res.setHeader("Content-Type", arquivo.mime || "application/octet-stream");
  res.setHeader("Content-Length", String(arquivo.buf.length));
  res.setHeader("Content-Disposition", `inline; filename="${ascii}"`);
  res.setHeader("Cache-Control", "private, max-age=120");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(arquivo.buf);
}
