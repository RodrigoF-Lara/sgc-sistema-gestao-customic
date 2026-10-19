import { sql } from "../db.js";

export const LOTE = "[dbo].[KARDEX_LOTE]";
export const MOVIMENTO = "[dbo].[KARDEX_MOVIMENTO]";
export const PISO_CONSUMO_2026 = "2026-04-01";

function validarAno(ano) {
    const n = Number(ano);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) return 0;
    return n;
}

/** Lê o ano vivo na hora. Passe o pool ou a transação. Não guarda cache. */
export async function anoKardex(executor) {
    const request = executor.request();
    const result = await request.query("SELECT ANO_VIVO FROM dbo.TB_KARDEX_ANO WHERE ID = 1");
    const ano = validarAno(result.recordset[0] && result.recordset[0].ANO_VIVO);
    if (!ano) throw new Error("Ano do kardex não configurado.");
    return ano;
}

/** Ano escolhido na tela. Vazio usa o ano vivo. */
export function anoInformado(valor, vivo) {
    if (valor === undefined || valor === null || String(valor).trim() === "") return vivo;
    const ano = validarAno(valor);
    if (!ano) throw new Error("Ano inválido.");
    return ano;
}

/** Piso de consumo só do ano 2026, quando o movimento ainda misturava carga antiga. */
export function pisoConsumo(ano, alias) {
    if (Number(ano) !== 2026) return "";
    const coluna = alias ? alias + ".DT" : "DT";
    return `AND ${coluna} >= '${PISO_CONSUMO_2026}'`;
}

export function inputAno(request, ano) {
    return request.input("ANO_KARDEX", sql.Int, ano);
}
