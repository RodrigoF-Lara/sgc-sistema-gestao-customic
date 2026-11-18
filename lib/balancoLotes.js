function chaveLote(codigo, armazem, endereco) {
    return [codigo, armazem, endereco].map((v) => String(v || "").trim().toUpperCase()).join("\u0001");
}

function idLote(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Decide quais lotes do ano do balanço atualizar, criar ou apagar.
 * O mesmo código+armazém+endereço pode ter várias linhas. Cada uma fica
 * com o próprio lote. Um idLote informado ganha do casamento por endereço,
 * para a etiqueta continuar válida quando o endereço muda.
 * O campo i é o índice da linha na lista recebida.
 */
export function planejarLotes(lotes, linhas) {
    const nossos = new Map();
    for (const lote of lotes || []) {
        const id = idLote(lote.id ?? lote.ID);
        if (!id || nossos.has(id)) continue;
        nossos.set(id, {
            id,
            codigo: String(lote.codigo ?? lote.CODIGO ?? "").trim().toUpperCase(),
            armazem: String(lote.armazem ?? lote.ARMAZEM ?? "").trim(),
            endereco: String(lote.endereco ?? lote.ENDERECO ?? "").trim(),
        });
    }
    const porChave = new Map();
    for (const lote of nossos.values()) {
        const id = chaveLote(lote.codigo, lote.armazem, lote.endereco);
        if (!porChave.has(id)) porChave.set(id, []);
        porChave.get(id).push(lote.id);
    }
    const usados = new Set();
    const atualizar = [];
    const inserir = [];
    (linhas || []).forEach((linha, i) => {
        const qtd = Number(linha.quantidade);
        if (!linha.codigo || !(qtd > 0)) return;
        let id = idLote(linha.idLote);
        if (!nossos.has(id) || usados.has(id)) id = 0;
        if (!id) {
            const lista = porChave.get(chaveLote(linha.codigo, linha.armazem, linha.endereco)) || [];
            id = lista.find((candidato) => !usados.has(candidato)) || 0;
        }
        const pedido = {
            i,
            codigo: linha.codigo,
            armazem: linha.armazem || "",
            endereco: linha.endereco || "",
            quantidade: qtd,
        };
        if (id) {
            usados.add(id);
            atualizar.push({ id, ...pedido });
        } else {
            inserir.push(pedido);
        }
    });
    const apagar = [...nossos.keys()].filter((id) => !usados.has(id));
    return { atualizar, inserir, apagar };
}
