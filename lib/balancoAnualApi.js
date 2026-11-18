import { getConnection, sql } from "../db.js";
import { exigirPermissao, nivelDoRequest, isAdmin, invalidarCachePermissoes } from "./permissoesHelper.js";
import { anoKardex, LOTE, MOVIMENTO } from "./kardex.js";
import { planejarLotes } from "./balancoLotes.js";
import { lerFotoProduto, codigosComFoto, enviarFoto } from "./produtoFoto.js";

function agoraSaoPaulo() {
    const dt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hr = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
    return { dt, hr };
}

function corpo(req) {
    if (!req.body) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
}

function chave(codigo, armazem, endereco) {
    return [codigo, armazem, endereco].map((v) => String(v || "").trim().toUpperCase()).join("\u0001");
}

function numero(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (valor === null || valor === undefined) return null;
    let texto = String(valor).trim().replace(/\s/g, "");
    if (!texto) return null;
    const temVirgula = texto.includes(",");
    const pontos = (texto.match(/\./g) || []).length;
    if (temVirgula && pontos) texto = texto.replace(/\./g, "").replace(",", ".");
    else if (temVirgula) texto = texto.replace(",", ".");
    else if (pontos > 1) texto = texto.replace(/\./g, "");
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
}

function tamanhoInvalido(item) {
    if (item.codigo.length > 10) return `Código ${item.codigo} passa de 10 caracteres.`;
    if (item.armazem.length > 40) return `Armazém do código ${item.codigo} passa de 40 caracteres.`;
    if (item.endereco.length > 100) return `Endereço do código ${item.codigo} passa de 100 caracteres.`;
    return "";
}

function normalizarItem(bruto) {
    const codigo = String(bruto.codigo ?? bruto.CODIGO ?? "").trim().toUpperCase();
    const armazem = String(bruto.armazem ?? bruto.ARMAZEM ?? "").trim();
    const endereco = String(bruto.endereco ?? bruto.ENDERECO ?? "").trim();
    const quantidade = numero(bruto.quantidade ?? bruto.QUANTIDADE ?? bruto.QNT);
    const idBruto = Number(bruto.idLote ?? bruto.ID_LOTE);
    const idLote = Number.isInteger(idBruto) && idBruto > 0 ? idBruto : null;
    return { codigo, armazem, endereco, quantidade, idLote };
}

async function garantirTabelas(pool) {
    await pool.request().query(`
        IF OBJECT_ID(N'dbo.TB_BALANCO_ANUAL', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.TB_BALANCO_ANUAL (
                ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                ANO INT NOT NULL,
                STATUS NVARCHAR(20) NOT NULL,
                USUARIO_ABERTURA NVARCHAR(100) NULL,
                DT_ABERTURA DATETIME NOT NULL DEFAULT GETDATE(),
                USUARIO_SUBIDA NVARCHAR(100) NULL,
                DT_SUBIDA DATETIME NULL
            );
            CREATE UNIQUE INDEX UX_BALANCO_ANUAL_ANO
                ON dbo.TB_BALANCO_ANUAL (ANO)
                WHERE STATUS IN ('ABERTO', 'FINALIZADO');
        END
        IF OBJECT_ID(N'dbo.TB_BALANCO_ANUAL_ITEM', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.TB_BALANCO_ANUAL_ITEM (
                ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                ID_BALANCO INT NOT NULL,
                CODIGO NVARCHAR(50) NOT NULL,
                DESCRICAO NVARCHAR(255) NULL,
                ARMAZEM NVARCHAR(40) NULL,
                ENDERECO NVARCHAR(200) NULL,
                QUANTIDADE FLOAT NULL,
                SALDO_REF FLOAT NULL,
                CONSTRAINT FK_BALANCO_ITEM FOREIGN KEY (ID_BALANCO)
                    REFERENCES dbo.TB_BALANCO_ANUAL (ID)
            );
            CREATE INDEX IX_BALANCO_ITEM_BALANCO ON dbo.TB_BALANCO_ANUAL_ITEM (ID_BALANCO, CODIGO);
        END
        IF COL_LENGTH('dbo.TB_BALANCO_ANUAL_ITEM', 'ID_LOTE') IS NULL
            ALTER TABLE dbo.TB_BALANCO_ANUAL_ITEM ADD ID_LOTE INT NULL;
        IF COL_LENGTH('dbo.TB_BALANCO_ANUAL', 'ANO_ORIGEM') IS NULL
        BEGIN
            ALTER TABLE dbo.TB_BALANCO_ANUAL ADD
                ANO_ORIGEM INT NULL,
                QTD_ANTIGA FLOAT NULL,
                QTD_NOVA FLOAT NULL,
                QTD_DIFERENCA FLOAT NULL,
                VL_ANTIGO FLOAT NULL,
                VL_NOVO FLOAT NULL,
                VL_DIFERENCA FLOAT NULL,
                CODIGOS_SEM_CUSTO INT NULL;
        END
        IF OBJECT_ID(N'dbo.TB_BALANCO_ANUAL_DIFERENCA', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.TB_BALANCO_ANUAL_DIFERENCA (
                ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                ID_BALANCO INT NOT NULL,
                CODIGO NVARCHAR(50) NOT NULL,
                DESCRICAO NVARCHAR(255) NULL,
                QTD_ANTIGA FLOAT NULL,
                QTD_NOVA FLOAT NULL,
                QTD_DIFERENCA FLOAT NULL,
                CUSTO_UNIT FLOAT NULL,
                VL_ANTIGO FLOAT NULL,
                VL_NOVO FLOAT NULL,
                VL_DIFERENCA FLOAT NULL,
                CONSTRAINT FK_BALANCO_DIFERENCA FOREIGN KEY (ID_BALANCO)
                    REFERENCES dbo.TB_BALANCO_ANUAL (ID)
            );
            CREATE INDEX IX_BALANCO_DIFERENCA_BALANCO
                ON dbo.TB_BALANCO_ANUAL_DIFERENCA (ID_BALANCO, CODIGO);
        END
    `);
    const seed = await pool.request().query(`
        DECLARE @n INT = 0;
        IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
        BEGIN
            INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
            SELECT 'balanco-anual', p.NIVEL, p.PERMITIDO, 'SEED-BALANCO'
            FROM dbo.SHR_PERMISSOES_MENU p
            WHERE p.LINK_ID = 'inventario-ciclico'
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
                  WHERE x.LINK_ID = 'balanco-anual' AND x.NIVEL = p.NIVEL
              );
            SET @n = @n + @@ROWCOUNT;
            INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
            SELECT 'balanco-subir', p.NIVEL, p.PERMITIDO, 'SEED-BALANCO'
            FROM dbo.SHR_PERMISSOES_MENU p
            WHERE p.LINK_ID = 'inventario-gerar'
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
                  WHERE x.LINK_ID = 'balanco-subir' AND x.NIVEL = p.NIVEL
              );
            SET @n = @n + @@ROWCOUNT;
        END
        SELECT @n AS INSERIDOS;
    `);
    if (seed.recordset[0] && Number(seed.recordset[0].INSERIDOS) > 0) invalidarCachePermissoes();
}

function podeSubir(req) {
    return isAdmin(nivelDoRequest(req));
}

async function lerBalanco(pool, id) {
    const cab = await pool.request()
        .input("ID", sql.Int, id)
        .query("SELECT ID, ANO, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA FROM dbo.TB_BALANCO_ANUAL WHERE ID = @ID");
    if (!cab.recordset.length) return null;
    const itens = await pool.request()
        .input("ID", sql.Int, id)
        .query(`
            SELECT CODIGO, DESCRICAO, ARMAZEM, ENDERECO, QUANTIDADE, SALDO_REF, ID_LOTE
            FROM dbo.TB_BALANCO_ANUAL_ITEM
            WHERE ID_BALANCO = @ID
            ORDER BY CODIGO, ENDERECO, ID
        `);
    const linhas = itens.recordset || [];
    const comFoto = new Set(await codigosComFoto(pool, linhas.map((row) => row.CODIGO)));
    for (const row of linhas) {
        row.TEM_FOTO = comFoto.has(String(row.CODIGO || "").trim().toUpperCase()) ? 1 : 0;
    }
    return { ...cab.recordset[0], itens: linhas };
}

async function saldoReferencia(pool, anoVivo) {
    const result = await pool.request()
        .input("ANO", sql.Int, anoVivo)
        .query(`
            SELECT
                UPPER(LTRIM(RTRIM(CODIGO))) AS CODIGO,
                LTRIM(RTRIM(ISNULL(ARMAZEM, ''))) AS ARMAZEM,
                LTRIM(RTRIM(ISNULL(ENDERECO, ''))) AS ENDERECO,
                SUM(SALDO) AS SALDO
            FROM ${LOTE}
            WHERE ISNULL(D_E_L_E_T_, '') <> '*'
              AND KARDEX = @ANO
              AND SALDO > 0
            GROUP BY UPPER(LTRIM(RTRIM(CODIGO))), LTRIM(RTRIM(ISNULL(ARMAZEM, ''))), LTRIM(RTRIM(ISNULL(ENDERECO, '')))
        `);
    const porEndereco = new Map();
    for (const row of result.recordset) {
        porEndereco.set(chave(row.CODIGO, row.ARMAZEM, row.ENDERECO), Number(row.SALDO) || 0);
    }
    return { porEndereco };
}

function arredQtd(valor) {
    return Math.round((Number(valor) || 0) * 1e6) / 1e6;
}

function arredValor(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

function numeroOuNull(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function dicaLeitura(solto) {
    return solto ? "WITH (NOLOCK)" : "";
}

function pedidoLeitura(executor) {
    const pedido = executor.request();
    pedido.timeout = 40000;
    return pedido;
}

async function saldoPorCodigo(executor, anoVivo, solto) {
    const result = await pedidoLeitura(executor)
        .input("ANO", sql.Int, anoVivo)
        .query(`
            SELECT
                LTRIM(RTRIM(CODIGO)) AS CODIGO,
                SUM(SALDO) AS SALDO
            FROM ${LOTE} ${dicaLeitura(solto)}
            WHERE ISNULL(D_E_L_E_T_, '') <> '*'
              AND KARDEX = @ANO
              AND SALDO > 0
            GROUP BY LTRIM(RTRIM(CODIGO))
        `);
    const mapa = new Map();
    for (const row of result.recordset) {
        const codigo = String(row.CODIGO || "").trim().toUpperCase();
        if (!codigo) continue;
        mapa.set(codigo, arredQtd((mapa.get(codigo) || 0) + Number(row.SALDO || 0)));
    }
    return mapa;
}

async function descricoesCadastro(executor, codigos, solto) {
    const mapa = new Map();
    const dica = dicaLeitura(solto);
    for (let i = 0; i < codigos.length; i += 400) {
        const fatia = codigos.slice(i, i + 400);
        const pedido = pedidoLeitura(executor);
        const params = fatia.map((codigo, idx) => {
            pedido.input("c" + idx, sql.VarChar(50), codigo);
            return "@c" + idx;
        });
        const achou = await pedido.query(`
            SELECT CODIGO, DESCRICAO
            FROM dbo.CAD_PROD ${dica}
            WHERE CODIGO IN (${params.join(", ")})
        `);
        for (const row of achou.recordset) {
            mapa.set(String(row.CODIGO || "").trim().toUpperCase(), String(row.DESCRICAO || "").trim().slice(0, 255));
        }
    }
    return mapa;
}

async function custosUnitarios(executor, codigos, solto) {
    const mapa = new Map();
    const dica = dicaLeitura(solto);
    const curtos = codigos.map((codigo) => String(codigo).slice(0, 10));
    for (let i = 0; i < curtos.length; i += 80) {
        const fatia = curtos.slice(i, i + 80);
        const pedido = pedidoLeitura(executor);
        const params = fatia.map((codigo, idx) => {
            pedido.input("c" + idx, sql.VarChar(10), codigo);
            return "@c" + idx;
        });
        const achou = await pedido.query(`
            SELECT
                UPPER(LTRIM(RTRIM(x.PROD_COD_PROD))) AS CODIGO,
                COALESCE(
                    NULLIF(x.PROD_VALOR_UNIT, 0),
                    NULLIF(x.PROD_CUSTO_FISCAL_MEDIO_NOVO, 0),
                    NULLIF(x.PROD_CUSTO_CONTABIL_MEDIO_NOVO, 0),
                    NULLIF(x.PROD_CUSTO_PAGO, 0),
                    0
                ) AS CUSTO
            FROM (
                SELECT
                    np.PROD_COD_PROD,
                    np.PROD_VALOR_UNIT,
                    np.PROD_CUSTO_FISCAL_MEDIO_NOVO,
                    np.PROD_CUSTO_CONTABIL_MEDIO_NOVO,
                    np.PROD_CUSTO_PAGO,
                    ROW_NUMBER() OVER (
                        PARTITION BY np.PROD_COD_PROD
                        ORDER BY
                            CASE
                                WHEN ISNULL(np.PROD_CUSTO_FISCAL_MEDIO_NOVO, 0) > 0
                                  OR ISNULL(np.PROD_CUSTO_CONTABIL_MEDIO_NOVO, 0) > 0
                                  OR ISNULL(np.PROD_VALOR_UNIT, 0) > 0
                                  OR ISNULL(np.PROD_CUSTO_PAGO, 0) > 0
                                THEN 0 ELSE 1
                            END,
                            ISNULL(np.PROD_DT_EMISSAO, '1900-01-01') DESC,
                            np.PROD_ID_PROD DESC
                    ) AS RN
                FROM dbo.NF_PRODUTOS np ${dica}
                WHERE np.PROD_COD_PROD IN (${params.join(", ")})
            ) x
            WHERE x.RN = 1
        `);
        for (const row of achou.recordset) {
            mapa.set(String(row.CODIGO || "").trim().toUpperCase(), Number(row.CUSTO) || 0);
        }
    }
    return mapa;
}

function ordenarDiferencas(linhas) {
    linhas.sort((a, b) => Math.abs(b.vlDiferenca) - Math.abs(a.vlDiferenca) || a.codigo.localeCompare(b.codigo, "pt-BR"));
    return linhas;
}

function respostaComparativo({ previa, gravado, id, anoVivo, anoBalanco, cab, totais, linhas }) {
    return {
        previa,
        gravado,
        id,
        anoVivo,
        anoBalanco,
        dtAbertura: cab.DT_ABERTURA || null,
        dtSubida: cab.DT_SUBIDA || null,
        usuarioAbertura: cab.USUARIO_ABERTURA || null,
        usuarioSubida: cab.USUARIO_SUBIDA || null,
        totais,
        linhas,
    };
}

// Diferença = quantidade contada − saldo do ano vivo. O custo da nota fica congelado na virada.
async function comparar(executor, balanco, anoVivo, solto) {
    const antiga = await saldoPorCodigo(executor, anoVivo, solto);
    const nova = new Map();
    const desc = new Map();
    for (const item of balanco.itens || []) {
        const codigo = String(item.CODIGO || item.codigo || "").trim().toUpperCase();
        if (!codigo) continue;
        const qtd = numero(item.QUANTIDADE ?? item.quantidade);
        if (qtd === null || qtd < 0) continue;
        nova.set(codigo, arredQtd((nova.get(codigo) || 0) + qtd));
        const texto = String(item.DESCRICAO || item.descricao || "").trim();
        if (texto && !desc.has(codigo)) desc.set(codigo, texto.slice(0, 255));
    }
    const codigos = [...new Set([...antiga.keys(), ...nova.keys()])];
    const cadastro = await descricoesCadastro(executor, codigos.filter((codigo) => !desc.get(codigo)), solto);
    for (const [codigo, texto] of cadastro) {
        if (texto && !desc.has(codigo)) desc.set(codigo, texto);
    }
    const custos = await custosUnitarios(executor, codigos, solto);
    const linhas = [];
    for (const codigo of codigos) {
        const qtdAntiga = arredQtd(antiga.get(codigo) || 0);
        const qtdNova = arredQtd(nova.get(codigo) || 0);
        if (qtdAntiga === 0 && qtdNova === 0) continue;
        const custoUnit = Math.round((custos.get(codigo) || 0) * 1e6) / 1e6;
        const vlAntigo = arredValor(qtdAntiga * custoUnit);
        const vlNovo = arredValor(qtdNova * custoUnit);
        linhas.push({
            codigo,
            descricao: desc.get(codigo) || "",
            qtdAntiga,
            qtdNova,
            qtdDiferenca: arredQtd(qtdNova - qtdAntiga),
            custoUnit,
            vlAntigo,
            vlNovo,
            vlDiferenca: arredValor(vlNovo - vlAntigo),
        });
    }
    ordenarDiferencas(linhas);
    const totais = {
        qtdAntiga: 0,
        qtdNova: 0,
        qtdDiferenca: 0,
        vlAntigo: 0,
        vlNovo: 0,
        vlDiferenca: 0,
        semCusto: 0,
        codigos: linhas.length,
    };
    for (const linha of linhas) {
        totais.qtdAntiga = arredQtd(totais.qtdAntiga + linha.qtdAntiga);
        totais.qtdNova = arredQtd(totais.qtdNova + linha.qtdNova);
        totais.qtdDiferenca = arredQtd(totais.qtdDiferenca + linha.qtdDiferenca);
        totais.vlAntigo = arredValor(totais.vlAntigo + linha.vlAntigo);
        totais.vlNovo = arredValor(totais.vlNovo + linha.vlNovo);
        totais.vlDiferenca = arredValor(totais.vlDiferenca + linha.vlDiferenca);
        if (!linha.custoUnit) totais.semCusto += 1;
    }
    return respostaComparativo({
        previa: true,
        gravado: false,
        id: balanco.ID,
        anoVivo,
        anoBalanco: balanco.ANO,
        cab: balanco,
        totais,
        linhas,
    });
}

async function gravarComparativo(transaction, id, anoOrigem, comparativo) {
    await transaction.request()
        .input("ID", sql.Int, id)
        .query("DELETE FROM dbo.TB_BALANCO_ANUAL_DIFERENCA WHERE ID_BALANCO = @ID");
    const linhas = comparativo.linhas || [];
    const tamanho = 160;
    for (let i = 0; i < linhas.length; i += tamanho) {
        const fatia = linhas.slice(i, i + tamanho);
        const pedido = transaction.request();
        pedido.input("ID", sql.Int, id);
        const values = fatia.map((linha, idx) => {
            pedido.input("c" + idx, sql.NVarChar(50), String(linha.codigo).slice(0, 50));
            pedido.input("d" + idx, sql.NVarChar(255), String(linha.descricao || "").slice(0, 255));
            pedido.input("qa" + idx, sql.Float, linha.qtdAntiga);
            pedido.input("qn" + idx, sql.Float, linha.qtdNova);
            pedido.input("qd" + idx, sql.Float, linha.qtdDiferenca);
            pedido.input("cu" + idx, sql.Float, linha.custoUnit);
            pedido.input("va" + idx, sql.Float, linha.vlAntigo);
            pedido.input("vn" + idx, sql.Float, linha.vlNovo);
            pedido.input("vd" + idx, sql.Float, linha.vlDiferenca);
            return `(@ID, @c${idx}, @d${idx}, @qa${idx}, @qn${idx}, @qd${idx}, @cu${idx}, @va${idx}, @vn${idx}, @vd${idx})`;
        });
        await pedido.query(`
            INSERT INTO dbo.TB_BALANCO_ANUAL_DIFERENCA
                (ID_BALANCO, CODIGO, DESCRICAO, QTD_ANTIGA, QTD_NOVA, QTD_DIFERENCA, CUSTO_UNIT, VL_ANTIGO, VL_NOVO, VL_DIFERENCA)
            VALUES ${values.join(",")}
        `);
    }
    const t = comparativo.totais;
    const gravou = await transaction.request()
        .input("ID", sql.Int, id)
        .input("ORIGEM", sql.Int, anoOrigem)
        .input("QA", sql.Float, t.qtdAntiga)
        .input("QN", sql.Float, t.qtdNova)
        .input("QD", sql.Float, t.qtdDiferenca)
        .input("VA", sql.Float, t.vlAntigo)
        .input("VN", sql.Float, t.vlNovo)
        .input("VD", sql.Float, t.vlDiferenca)
        .input("SEM", sql.Int, t.semCusto)
        .query(`
            UPDATE dbo.TB_BALANCO_ANUAL
            SET ANO_ORIGEM = @ORIGEM,
                QTD_ANTIGA = @QA,
                QTD_NOVA = @QN,
                QTD_DIFERENCA = @QD,
                VL_ANTIGO = @VA,
                VL_NOVO = @VN,
                VL_DIFERENCA = @VD,
                CODIGOS_SEM_CUSTO = @SEM
            WHERE ID = @ID AND STATUS = 'ABERTO'
        `);
    if (!gravou.rowsAffected || !gravou.rowsAffected[0]) {
        throw new Error("O balanço não estava aberto para gravar a diferença.");
    }
}

function resumoVirada(row) {
    return {
        id: row.ID,
        ano: row.ANO,
        anoOrigem: numeroOuNull(row.ANO_ORIGEM),
        status: row.STATUS,
        usuarioAbertura: row.USUARIO_ABERTURA || null,
        dtAbertura: row.DT_ABERTURA || null,
        usuarioSubida: row.USUARIO_SUBIDA || null,
        dtSubida: row.DT_SUBIDA || null,
        qtdAntiga: numeroOuNull(row.QTD_ANTIGA),
        qtdNova: numeroOuNull(row.QTD_NOVA),
        qtdDiferenca: numeroOuNull(row.QTD_DIFERENCA),
        vlAntigo: numeroOuNull(row.VL_ANTIGO),
        vlNovo: numeroOuNull(row.VL_NOVO),
        vlDiferenca: numeroOuNull(row.VL_DIFERENCA),
        semCusto: row.CODIGOS_SEM_CUSTO === null || row.CODIGOS_SEM_CUSTO === undefined ? null : Number(row.CODIGOS_SEM_CUSTO),
    };
}

async function lerDiferenca(pool, id) {
    const cab = await pool.request()
        .input("ID", sql.Int, id)
        .query(`
            SELECT ID, ANO, ANO_ORIGEM, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA,
                   QTD_ANTIGA, QTD_NOVA, QTD_DIFERENCA, VL_ANTIGO, VL_NOVO, VL_DIFERENCA, CODIGOS_SEM_CUSTO
            FROM dbo.TB_BALANCO_ANUAL
            WHERE ID = @ID
        `);
    if (!cab.recordset.length) return null;
    const row = cab.recordset[0];
    const itens = await pool.request()
        .input("ID", sql.Int, id)
        .query(`
            SELECT CODIGO, DESCRICAO, QTD_ANTIGA, QTD_NOVA, QTD_DIFERENCA, CUSTO_UNIT, VL_ANTIGO, VL_NOVO, VL_DIFERENCA
            FROM dbo.TB_BALANCO_ANUAL_DIFERENCA
            WHERE ID_BALANCO = @ID
        `);
    const linhas = ordenarDiferencas(itens.recordset.map((linha) => ({
        codigo: String(linha.CODIGO || "").trim(),
        descricao: linha.DESCRICAO || "",
        qtdAntiga: Number(linha.QTD_ANTIGA) || 0,
        qtdNova: Number(linha.QTD_NOVA) || 0,
        qtdDiferenca: Number(linha.QTD_DIFERENCA) || 0,
        custoUnit: Number(linha.CUSTO_UNIT) || 0,
        vlAntigo: Number(linha.VL_ANTIGO) || 0,
        vlNovo: Number(linha.VL_NOVO) || 0,
        vlDiferenca: Number(linha.VL_DIFERENCA) || 0,
    })));
    const gravado = row.STATUS === "FINALIZADO" && row.QTD_ANTIGA !== null && row.QTD_ANTIGA !== undefined;
    return respostaComparativo({
        previa: false,
        gravado,
        id: row.ID,
        anoVivo: row.ANO_ORIGEM,
        anoBalanco: row.ANO,
        cab: row,
        totais: {
            qtdAntiga: numeroOuNull(row.QTD_ANTIGA),
            qtdNova: numeroOuNull(row.QTD_NOVA),
            qtdDiferenca: numeroOuNull(row.QTD_DIFERENCA),
            vlAntigo: numeroOuNull(row.VL_ANTIGO),
            vlNovo: numeroOuNull(row.VL_NOVO),
            vlDiferenca: numeroOuNull(row.VL_DIFERENCA),
            semCusto: row.CODIGOS_SEM_CUSTO === null || row.CODIGOS_SEM_CUSTO === undefined ? null : Number(row.CODIGOS_SEM_CUSTO),
            codigos: linhas.length,
        },
        linhas,
    });
}

async function analisar(pool, balanco) {
    const itens = (balanco.itens || []).map((item) => ({
        codigo: String(item.CODIGO || item.codigo || "").trim().toUpperCase(),
        descricao: item.DESCRICAO || item.descricao || "",
        armazem: String(item.ARMAZEM ?? item.armazem ?? "").trim(),
        endereco: String(item.ENDERECO ?? item.endereco ?? "").trim(),
        quantidade: item.QUANTIDADE ?? item.quantidade,
        idLote: item.ID_LOTE || item.idLote || null,
    }));
    const erros = [];
    const enderecosContados = new Set();
    for (const item of itens) {
        if (!item.codigo) {
            erros.push({ tipo: "vazio", mensagem: "Há uma linha sem código." });
            continue;
        }
        const longo = tamanhoInvalido(item);
        if (longo) erros.push({ tipo: "vazio", codigo: item.codigo, mensagem: longo });
        const qtd = numero(item.quantidade);
        if (qtd === null || !Number.isFinite(qtd)) {
            erros.push({ tipo: "vazio", codigo: item.codigo, mensagem: `Código ${item.codigo}: quantidade vazia.` });
        } else if (qtd < 0) {
            erros.push({ tipo: "vazio", codigo: item.codigo, mensagem: `Código ${item.codigo}: quantidade menor que zero.` });
        } else {
            enderecosContados.add(chave(item.codigo, item.armazem, item.endereco));
        }
    }
    const codigos = [...new Set(itens.map((item) => item.codigo).filter(Boolean))];
    const cadastrados = new Set();
    for (let i = 0; i < codigos.length; i += 400) {
        const fatia = codigos.slice(i, i + 400);
        const pedido = pool.request();
        const params = fatia.map((codigo, idx) => {
            pedido.input("c" + idx, sql.VarChar, codigo);
            return "@c" + idx;
        });
        const achou = await pedido.query(`SELECT CODIGO FROM dbo.CAD_PROD WHERE CODIGO IN (${params.join(", ")})`);
        for (const row of achou.recordset) cadastrados.add(String(row.CODIGO).trim().toUpperCase());
    }
    for (const codigo of codigos) {
        if (!cadastrados.has(codigo)) {
            erros.push({ tipo: "inexistente", codigo, mensagem: `Código ${codigo} não existe no cadastro.` });
        }
    }
    const anoVivo = await anoKardex(pool);
    const refs = await saldoReferencia(pool, anoVivo);
    const fora = [];
    for (const [id, saldo] of refs.porEndereco) {
        if (saldo > 0 && !enderecosContados.has(id)) {
            const [codigo, armazem, endereco] = id.split("\u0001");
            fora.push({ codigo, armazem, endereco, saldo });
        }
    }
    fora.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)) || String(a.endereco).localeCompare(String(b.endereco)));
    const paraSubir = itens.filter((item) => numero(item.quantidade) > 0);
    return { erros, fora, paraSubir, anoVivo, totalContado: paraSubir.reduce((s, item) => s + numero(item.quantidade), 0) };
}

async function inserirLotes(transaction, ano, usuario, linhas) {
    const { dt, hr } = agoraSaoPaulo();
    const criados = [];
    const tamanho = 80;
    for (let i = 0; i < linhas.length; i += tamanho) {
        const fatia = linhas.slice(i, i + tamanho);
        const pedido = transaction.request();
        pedido.input("USUARIO", sql.VarChar, String(usuario || "").slice(0, 50));
        pedido.input("DT", sql.Date, dt);
        pedido.input("HR", sql.VarChar, hr);
        pedido.input("ANO", sql.Int, ano);
        const values = fatia.map((linha, idx) => {
            pedido.input("o" + idx, sql.Int, i + idx);
            pedido.input("c" + idx, sql.VarChar, linha.codigo);
            pedido.input("e" + idx, sql.VarChar, linha.endereco || "");
            pedido.input("a" + idx, sql.VarChar, linha.armazem || "");
            pedido.input("q" + idx, sql.Float, numero(linha.quantidade));
            return `(@o${idx}, @c${idx}, @e${idx}, @a${idx}, @q${idx})`;
        });
        // MERGE devolve o ORD da linha junto com o ID. Duas entradas iguais
        // no mesmo endereço não podem ser casadas só por código+endereço.
        const gravou = await pedido.query(`
            SET NOCOUNT ON;
            DECLARE @src TABLE (
                ORD INT NOT NULL,
                CODIGO VARCHAR(10) NULL,
                ENDERECO VARCHAR(100) NULL,
                ARMAZEM VARCHAR(40) NULL,
                QNT FLOAT NULL
            );
            INSERT INTO @src (ORD, CODIGO, ENDERECO, ARMAZEM, QNT)
            VALUES ${values.join(",")};

            DECLARE @map TABLE (
                ORD INT NOT NULL,
                ID INT NOT NULL,
                CODIGO VARCHAR(10) NULL,
                ARMAZEM VARCHAR(40) NULL,
                ENDERECO VARCHAR(100) NULL,
                QNT FLOAT NULL
            );

            MERGE ${LOTE} AS l
            USING @src AS s ON 1 = 0
            WHEN NOT MATCHED THEN
                INSERT ([D_E_L_E_T_],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[QNT_SAIDA],[USUARIO_SAIDA],[DT_SAIDA],[HR_SAIDA],[KARDEX])
                VALUES ('', s.CODIGO, s.ENDERECO, s.ARMAZEM, s.QNT, @USUARIO, @DT, @HR, 'inventario', '', 0, '', '', '', @ANO)
            OUTPUT s.ORD, INSERTED.ID, INSERTED.CODIGO, INSERTED.ARMAZEM, INSERTED.ENDERECO, INSERTED.QNT
                INTO @map (ORD, ID, CODIGO, ARMAZEM, ENDERECO, QNT);

            SELECT ORD, ID, CODIGO, ARMAZEM, ENDERECO, QNT FROM @map ORDER BY ORD;
        `);
        const tabelas = gravou.recordsets && gravou.recordsets.length ? gravou.recordsets : [gravou.recordset || []];
        const linhasNovas = tabelas.find((tabela) => tabela && tabela.length && tabela[0] && tabela[0].ORD !== undefined && tabela[0].ORD !== null) || [];
        criados.push(...linhasNovas);
    }
    return { criados, dt, hr };
}

async function inserirMovimentos(transaction, ano, usuario, dt, hr, criados) {
    const tamanho = 80;
    for (let i = 0; i < criados.length; i += tamanho) {
        const fatia = criados.slice(i, i + tamanho);
        const pedido = transaction.request();
        pedido.input("USUARIO", sql.VarChar, String(usuario || "").slice(0, 50));
        pedido.input("DT", sql.Date, dt);
        pedido.input("HR", sql.VarChar, hr);
        pedido.input("ANO", sql.Int, ano);
        const values = fatia.map((linha, idx) => {
            pedido.input("id" + idx, sql.Int, linha.ID);
            pedido.input("c" + idx, sql.VarChar, linha.CODIGO);
            pedido.input("e" + idx, sql.VarChar, linha.ENDERECO || "");
            pedido.input("a" + idx, sql.VarChar, linha.ARMAZEM || "");
            pedido.input("q" + idx, sql.Float, linha.QNT);
            return `('', 'SGC-WEB', @id${idx}, @c${idx}, @e${idx}, @a${idx}, @q${idx}, 'ENTRADA', @USUARIO, @DT, @HR, 'inventario', '', @ANO, '')`;
        });
        await pedido.query(`
            INSERT INTO ${MOVIMENTO}
                ([D_E_L_E_T_],[APLICATIVO],[ID_TB_RESUMO],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[OPERACAO],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[KARDEX],[CAIXA])
            VALUES ${values.join(",")}
        `);
    }
}

function loteNosso(lote, ano) {
    return Number(lote.KARDEX) === Number(ano)
        && String(lote.MOTIVO || "").trim().toLowerCase() === "inventario"
        && !(Number(lote.QNT_SAIDA) > 0)
        && String(lote.D_E_L_E_T_ || "").trim() !== "*";
}

async function buscarLotes(executor, ids) {
    const lista = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    const achados = [];
    for (let i = 0; i < lista.length; i += 400) {
        const fatia = lista.slice(i, i + 400);
        const pedido = executor.request();
        const params = fatia.map((id, idx) => {
            pedido.input("id" + idx, sql.Int, id);
            return "@id" + idx;
        });
        const result = await pedido.query(`
            SELECT ID, CODIGO, ENDERECO, ARMAZEM, QNT, QNT_SAIDA, KARDEX, MOTIVO, D_E_L_E_T_
            FROM ${LOTE}
            WHERE ID IN (${params.join(", ")})
        `);
        achados.push(...result.recordset);
    }
    return achados;
}

async function atualizarLotes(transaction, ano, usuario, linhas) {
    if (!linhas.length) return;
    const { dt, hr } = agoraSaoPaulo();
    for (let i = 0; i < linhas.length; i += 60) {
        const fatia = linhas.slice(i, i + 60);
        const pedido = transaction.request();
        pedido.input("ANO", sql.Int, ano);
        pedido.input("USUARIO", sql.VarChar, String(usuario || "").slice(0, 50));
        pedido.input("DT", sql.Date, dt);
        pedido.input("HR", sql.VarChar, hr);
        const values = fatia.map((linha, idx) => {
            pedido.input("id" + idx, sql.Int, linha.id);
            pedido.input("c" + idx, sql.VarChar, linha.codigo);
            pedido.input("e" + idx, sql.VarChar, linha.endereco || "");
            pedido.input("a" + idx, sql.VarChar, linha.armazem || "");
            pedido.input("q" + idx, sql.Float, linha.quantidade);
            return `(@id${idx}, @c${idx}, @e${idx}, @a${idx}, @q${idx})`;
        });
        const gravou = await pedido.query(`
            UPDATE l
            SET l.CODIGO = v.CODIGO,
                l.ENDERECO = v.ENDERECO,
                l.ARMAZEM = v.ARMAZEM,
                l.QNT = v.QNT,
                l.USUARIO = @USUARIO,
                l.DT = @DT,
                l.HR = @HR
            FROM ${LOTE} l
            INNER JOIN (VALUES ${values.join(", ")}) AS v(ID, CODIGO, ENDERECO, ARMAZEM, QNT)
                ON l.ID = v.ID
            WHERE l.KARDEX = @ANO
              AND l.MOTIVO = 'inventario'
              AND ISNULL(l.QNT_SAIDA, 0) = 0
              AND ISNULL(l.D_E_L_E_T_, '') <> '*'
        `);
        const afetou = gravou.rowsAffected && gravou.rowsAffected[0];
        if (afetou !== fatia.length) {
            throw new Error("Não foi possível atualizar um lote reservado da contagem.");
        }
    }
}

async function apagarLotesReservados(transaction, ano, ids) {
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 400) {
        const fatia = ids.slice(i, i + 400);
        const pedido = transaction.request();
        pedido.input("ANO", sql.Int, ano);
        const params = fatia.map((id, idx) => {
            pedido.input("id" + idx, sql.Int, id);
            return "@id" + idx;
        });
        const lista = params.join(", ");
        const estado = await pedido.query(`
            SELECT l.ID,
                CASE
                    WHEN l.KARDEX = @ANO
                     AND l.MOTIVO = 'inventario'
                     AND ISNULL(l.QNT_SAIDA, 0) = 0
                     AND ISNULL(l.D_E_L_E_T_, '') <> '*'
                     AND NOT EXISTS (
                        SELECT 1 FROM ${MOVIMENTO} m
                        WHERE m.ID_TB_RESUMO = l.ID AND ISNULL(m.D_E_L_E_T_, '') <> '*'
                     )
                    THEN 1 ELSE 0
                END AS PODE
            FROM ${LOTE} l
            WHERE l.ID IN (${lista})
        `);
        const bloqueado = estado.recordset.find((row) => Number(row.PODE) !== 1);
        if (bloqueado) {
            throw new Error(`O lote ${bloqueado.ID} já teve movimento e não pode sair da contagem.`);
        }
        if (!estado.recordset.length) continue;
        const apaga = transaction.request();
        apaga.input("ANO", sql.Int, ano);
        fatia.forEach((loteId, idx) => apaga.input("id" + idx, sql.Int, loteId));
        await apaga.query(`
            DELETE l
            FROM ${LOTE} l
            WHERE l.ID IN (${lista})
              AND l.KARDEX = @ANO
              AND l.MOTIVO = 'inventario'
              AND ISNULL(l.QNT_SAIDA, 0) = 0
              AND ISNULL(l.D_E_L_E_T_, '') <> '*'
              AND NOT EXISTS (
                SELECT 1 FROM ${MOVIMENTO} m
                WHERE m.ID_TB_RESUMO = l.ID AND ISNULL(m.D_E_L_E_T_, '') <> '*'
              )
        `);
    }
}

async function limparLotesSoltos(transaction, idBalanco, ano) {
    await transaction.request()
        .input("ID", sql.Int, idBalanco)
        .input("ANO", sql.Int, ano)
        .query(`
            DELETE l
            FROM ${LOTE} l
            WHERE l.KARDEX = @ANO
              AND l.MOTIVO = 'inventario'
              AND ISNULL(l.QNT_SAIDA, 0) = 0
              AND ISNULL(l.D_E_L_E_T_, '') <> '*'
              AND NOT EXISTS (
                SELECT 1 FROM dbo.TB_BALANCO_ANUAL_ITEM i
                WHERE i.ID_BALANCO = @ID
                  AND i.ID_LOTE = l.ID
                  AND ISNULL(i.QUANTIDADE, 0) > 0
              )
              AND NOT EXISTS (
                SELECT 1 FROM ${MOVIMENTO} m
                WHERE m.ID_TB_RESUMO = l.ID AND ISNULL(m.D_E_L_E_T_, '') <> '*'
              )
        `);
}

async function sincronizarLotes(transaction, { idBalanco, ano, usuario, linhas, cadastrados }) {
    const atuais = await transaction.request()
        .input("ID", sql.Int, idBalanco)
        .query("SELECT ID_LOTE FROM dbo.TB_BALANCO_ANUAL_ITEM WHERE ID_BALANCO = @ID AND ID_LOTE IS NOT NULL");
    const ids = new Set(atuais.recordset.map((row) => Number(row.ID_LOTE)));
    for (const linha of linhas) if (linha.idLote) ids.add(linha.idLote);
    const brutos = await buscarLotes(transaction, [...ids]);
    const nossos = brutos.filter((lote) => loteNosso(lote, ano));
    const elegiveis = linhas.filter((linha) => linha.codigo && numero(linha.quantidade) > 0 && cadastrados.has(linha.codigo));
    const conjuntoElegivel = new Set(elegiveis);
    const plano = planejarLotes(nossos, elegiveis);
    await atualizarLotes(transaction, ano, usuario, plano.atualizar);
    const { criados } = plano.inserir.length
        ? await inserirLotes(transaction, ano, usuario, plano.inserir)
        : { criados: [] };
    if (criados.length !== plano.inserir.length) {
        throw new Error("A quantidade de lotes reservados não fechou com a contagem.");
    }
    await apagarLotesReservados(transaction, ano, plano.apagar);
    const idPorIndice = new Map();
    for (const linha of plano.atualizar) idPorIndice.set(linha.i, linha.id);
    for (const criado of criados) {
        const origem = plano.inserir[Number(criado.ORD)];
        if (!origem) throw new Error("Não consegui amarrar o lote novo à linha da contagem.");
        idPorIndice.set(origem.i, Number(criado.ID));
    }
    elegiveis.forEach((linha, i) => {
        const reservado = idPorIndice.get(i);
        if (!reservado) throw new Error(`Não reservei o lote do código ${linha.codigo}.`);
        linha.idLote = reservado;
    });
    for (const linha of linhas) {
        if (!conjuntoElegivel.has(linha)) linha.idLote = null;
    }
}

async function prepararLotesVirada(transaction, idBalanco, ano, usuario, paraSubir) {
    await limparLotesSoltos(transaction, idBalanco, ano);
    const salvos = await transaction.request()
        .input("ID", sql.Int, idBalanco)
        .query(`
            SELECT ID, CODIGO, ARMAZEM, ENDERECO, QUANTIDADE, ID_LOTE
            FROM dbo.TB_BALANCO_ANUAL_ITEM
            WHERE ID_BALANCO = @ID AND ISNULL(QUANTIDADE, 0) > 0
        `);
    const linhas = salvos.recordset.map((row) => ({
        itemId: Number(row.ID),
        codigo: String(row.CODIGO || "").trim().toUpperCase(),
        armazem: String(row.ARMAZEM || "").trim(),
        endereco: String(row.ENDERECO || "").trim(),
        quantidade: Number(row.QUANTIDADE),
        idLote: row.ID_LOTE || null,
    }));
    if (linhas.length !== paraSubir.length) {
        throw new Error("A contagem mudou durante a virada. Salve de novo.");
    }
    const brutos = await buscarLotes(transaction, linhas.map((linha) => linha.idLote));
    const nossos = new Map(brutos.filter((lote) => loteNosso(lote, ano)).map((lote) => [Number(lote.ID), lote]));
    const faltam = [];
    const ajustar = [];
    const prontos = [];
    const vistos = new Set();
    for (const linha of linhas) {
        const lote = linha.idLote ? nossos.get(Number(linha.idLote)) : null;
        if (!lote || vistos.has(lote.ID)) {
            faltam.push(linha);
            continue;
        }
        vistos.add(lote.ID);
        const qtd = numero(linha.quantidade);
        const mudou = String(lote.CODIGO || "").trim().toUpperCase() !== linha.codigo
            || String(lote.ENDERECO || "").trim() !== linha.endereco
            || String(lote.ARMAZEM || "").trim() !== linha.armazem
            || Math.abs(Number(lote.QNT) - qtd) > 1e-6;
        if (mudou) ajustar.push({ id: lote.ID, ...linha, quantidade: qtd });
        prontos.push({
            ID: lote.ID,
            CODIGO: linha.codigo,
            ARMAZEM: linha.armazem,
            ENDERECO: linha.endereco,
            QNT: qtd,
        });
    }
    if (ajustar.length) await atualizarLotes(transaction, ano, usuario, ajustar);
    if (faltam.length) {
        const { criados } = await inserirLotes(transaction, ano, usuario, faltam);
        if (criados.length !== faltam.length) {
            throw new Error("Não foi possível reservar todos os lotes da virada.");
        }
        for (const row of criados) {
            const linha = faltam[Number(row.ORD)];
            if (!linha) throw new Error("Não achei a linha da contagem de um lote da virada.");
            await transaction.request()
                .input("ITEM", sql.Int, linha.itemId)
                .input("LOTE", sql.Int, row.ID)
                .query(`
                    UPDATE dbo.TB_BALANCO_ANUAL_ITEM
                    SET ID_LOTE = @LOTE
                    WHERE ID = @ITEM
                `);
            prontos.push({
                ID: row.ID,
                CODIGO: linha.codigo,
                ARMAZEM: linha.armazem,
                ENDERECO: linha.endereco,
                QNT: numero(linha.quantidade),
            });
        }
    }
    if (prontos.length !== linhas.length) {
        throw new Error("A quantidade de lotes da virada não fechou com a contagem.");
    }
    const { dt, hr } = agoraSaoPaulo();
    return { criados: prontos, dt, hr };
}

export default async function handler(req, res) {
    try {
        const pool = await getConnection();
        await garantirTabelas(pool);
        if (!(await exigirPermissao(req, res, "balanco-anual", "Sem permissão para o balanço anual."))) return;

        if (req.method === "GET" && req.query.acao === "foto") {
            const arquivo = await lerFotoProduto(pool, req.query.codigo);
            if (!arquivo) return res.status(404).json({ message: "Produto sem foto." });
            return enviarFoto(res, arquivo);
        }

        if (req.method === "GET") {
            const anoVivo = await anoKardex(pool);
            if (req.query.acao === "diferenca") {
                const idDif = Number(req.query.id);
                if (!idDif) return res.status(400).json({ message: "Balanço não informado." });
                const dif = await lerDiferenca(pool, idDif);
                if (!dif) return res.status(404).json({ message: "Balanço não encontrado." });
                return res.status(200).json(dif);
            }
            const aberto = await pool.request().query(`
                SELECT TOP 1 ID, ANO, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA
                FROM dbo.TB_BALANCO_ANUAL
                WHERE STATUS = 'ABERTO'
                ORDER BY ID DESC
            `);
            const balanco = aberto.recordset[0] ? await lerBalanco(pool, aberto.recordset[0].ID) : null;
            const viradas = await pool.request().query(`
                SELECT ID, ANO, ANO_ORIGEM, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA,
                       QTD_ANTIGA, QTD_NOVA, QTD_DIFERENCA, VL_ANTIGO, VL_NOVO, VL_DIFERENCA, CODIGOS_SEM_CUSTO
                FROM dbo.TB_BALANCO_ANUAL
                WHERE STATUS = 'FINALIZADO'
                ORDER BY DT_SUBIDA DESC, ID DESC
            `);
            return res.status(200).json({
                anoVivo,
                podeSubir: podeSubir(req),
                balanco,
                viradas: viradas.recordset.map(resumoVirada),
            });
        }

        if (req.method !== "POST") return res.status(405).json({ message: "Método não permitido." });
        const body = corpo(req);
        const acao = body.acao;
        if (acao === "quaisFotos") {
            const codigos = await codigosComFoto(pool, body.codigos);
            return res.status(200).json({ codigos });
        }
        const usuario = String(body.usuario || "").trim() || "SGC";

        if (acao === "abrir") {
            const ano = Number(body.ano);
            if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
                return res.status(400).json({ message: "Informe o ano do balanço." });
            }
            const existe = await pool.request()
                .input("ANO", sql.Int, ano)
                .query("SELECT TOP 1 ID, STATUS FROM dbo.TB_BALANCO_ANUAL WHERE ANO = @ANO AND STATUS IN ('ABERTO', 'FINALIZADO')");
            if (existe.recordset[0]?.STATUS === "FINALIZADO") {
                return res.status(400).json({ message: "Esse ano já teve o saldo lançado." });
            }
            if (existe.recordset[0]?.STATUS === "ABERTO") {
                return res.status(200).json({ balanco: await lerBalanco(pool, existe.recordset[0].ID) });
            }
            const outro = await pool.request().query("SELECT TOP 1 ANO FROM dbo.TB_BALANCO_ANUAL WHERE STATUS = 'ABERTO'");
            if (outro.recordset.length) {
                return res.status(400).json({ message: `Feche ou conclua o balanço de ${outro.recordset[0].ANO} antes de abrir outro.` });
            }
            const criou = await pool.request()
                .input("ANO", sql.Int, ano)
                .input("USUARIO", sql.NVarChar, usuario)
                .query(`
                    INSERT INTO dbo.TB_BALANCO_ANUAL (ANO, STATUS, USUARIO_ABERTURA)
                    OUTPUT INSERTED.ID
                    VALUES (@ANO, 'ABERTO', @USUARIO)
                `);
            return res.status(200).json({ balanco: await lerBalanco(pool, criou.recordset[0].ID) });
        }

        const id = Number(body.id);
        if (!id) return res.status(400).json({ message: "Balanço não informado." });
        const balanco = await lerBalanco(pool, id);
        if (!balanco) return res.status(404).json({ message: "Balanço não encontrado." });
        if (balanco.STATUS !== "ABERTO") return res.status(400).json({ message: "Esse balanço já foi lançado." });

        if (acao === "salvar") {
            const itens = Array.isArray(body.itens) ? body.itens.map(normalizarItem) : [];
            if (itens.length > 8000) return res.status(400).json({ message: "A contagem passa de 8000 linhas." });
            const longo = itens.map(tamanhoInvalido).find(Boolean);
            if (longo) return res.status(400).json({ message: longo });
            const anoVivo = await anoKardex(pool);
            const refs = await saldoReferencia(pool, anoVivo);
            const codigos = [...new Set(itens.map((item) => item.codigo).filter(Boolean))];
            const descricoes = new Map();
            for (let i = 0; i < codigos.length; i += 400) {
                const fatia = codigos.slice(i, i + 400);
                const pedido = pool.request();
                const params = fatia.map((codigo, idx) => {
                    pedido.input("c" + idx, sql.VarChar, codigo);
                    return "@c" + idx;
                });
                const achou = await pedido.query(`SELECT CODIGO, DESCRICAO FROM dbo.CAD_PROD WHERE CODIGO IN (${params.join(", ")})`);
                for (const row of achou.recordset) descricoes.set(String(row.CODIGO).trim().toUpperCase(), row.DESCRICAO || "");
            }
            if (anoVivo === balanco.ANO) {
                return res.status(400).json({ message: "Esse ano já é o estoque vivo. Não dá para reservar lote da contagem." });
            }
            const transaction = pool.transaction();
            await transaction.begin();
            try {
                await sincronizarLotes(transaction, {
                    idBalanco: id,
                    ano: balanco.ANO,
                    usuario,
                    linhas: itens,
                    cadastrados: descricoes,
                });
                await transaction.request().input("ID", sql.Int, id).query("DELETE FROM dbo.TB_BALANCO_ANUAL_ITEM WHERE ID_BALANCO = @ID");
                const linhas = itens.filter((item) => item.codigo);
                const tamanho = 50;
                for (let i = 0; i < linhas.length; i += tamanho) {
                    const fatia = linhas.slice(i, i + tamanho);
                    const pedido = transaction.request();
                    pedido.input("ID", sql.Int, id);
                    const values = fatia.map((item, idx) => {
                        pedido.input("c" + idx, sql.NVarChar, item.codigo);
                        pedido.input("d" + idx, sql.NVarChar, String(descricoes.get(item.codigo) || "").slice(0, 255));
                        pedido.input("a" + idx, sql.NVarChar, item.armazem);
                        pedido.input("e" + idx, sql.NVarChar, item.endereco);
                        pedido.input("q" + idx, sql.Float, item.quantidade);
                        pedido.input("r" + idx, sql.Float, refs.porEndereco.get(chave(item.codigo, item.armazem, item.endereco)) || 0);
                        const reservado = numero(item.quantidade) > 0 ? (item.idLote || null) : null;
                        pedido.input("l" + idx, sql.Int, reservado);
                        return `(@ID, @c${idx}, @d${idx}, @a${idx}, @e${idx}, @q${idx}, @r${idx}, @l${idx})`;
                    });
                    await pedido.query(`
                        INSERT INTO dbo.TB_BALANCO_ANUAL_ITEM
                            (ID_BALANCO, CODIGO, DESCRICAO, ARMAZEM, ENDERECO, QUANTIDADE, SALDO_REF, ID_LOTE)
                        VALUES ${values.join(",")}
                    `);
                }
                await limparLotesSoltos(transaction, id, balanco.ANO);
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
            return res.status(200).json({ balanco: await lerBalanco(pool, id) });
        }

        if (acao === "comparar") {
            const anoVivo = await anoKardex(pool);
            return res.status(200).json(await comparar(pool, balanco, anoVivo, true));
        }

        if (acao === "revisar" || acao === "simular") {
            const analise = await analisar(pool, balanco);
            return res.status(200).json({
                erros: analise.erros,
                fora: analise.fora,
                lotes: analise.paraSubir.length,
                totalContado: analise.totalContado,
                anoVivo: analise.anoVivo,
                anoBalanco: balanco.ANO,
            });
        }

        if (acao === "subir") {
            if (!podeSubir(req)) {
                return res.status(403).json({ message: "Somente o administrador pode virar o ano." });
            }
            const analise = await analisar(pool, balanco);
            if (analise.erros.length) {
                return res.status(400).json({ message: "A contagem ainda tem pendência.", erros: analise.erros, fora: analise.fora });
            }
            if (!analise.paraSubir.length) {
                return res.status(400).json({ message: "Nenhuma quantidade maior que zero para lançar." });
            }
            if (analise.fora.length && !body.confirmarFora) {
                return res.status(400).json({
                    message: "Há endereços com saldo que não foram contados. Confirme para deixá-los de fora do ano novo.",
                    fora: analise.fora,
                    precisaConfirmar: true,
                });
            }
            const transaction = pool.transaction();
            await transaction.begin();
            try {
                const anoAgora = await anoKardex(transaction);
                if (anoAgora === balanco.ANO) {
                    throw new Error("Esse ano já é o ano vivo do estoque.");
                }
                const comparativo = await comparar(transaction, balanco, anoAgora, false);
                await gravarComparativo(transaction, id, anoAgora, comparativo);
                const { criados, dt, hr } = await prepararLotesVirada(transaction, id, balanco.ANO, usuario, analise.paraSubir);
                await inserirMovimentos(transaction, balanco.ANO, usuario, dt, hr, criados);
                await transaction.request()
                    .input("ANO", sql.Int, balanco.ANO)
                    .input("USUARIO", sql.NVarChar, usuario)
                    .query(`
                        UPDATE dbo.TB_KARDEX_ANO
                        SET ANO_VIVO = @ANO, DT_VIRADA = GETDATE(), USUARIO_VIRADA = @USUARIO
                        WHERE ID = 1
                    `);
                const fechou = await transaction.request()
                    .input("ID", sql.Int, id)
                    .input("USUARIO", sql.NVarChar, usuario)
                    .query(`
                        UPDATE dbo.TB_BALANCO_ANUAL
                        SET STATUS = 'FINALIZADO', USUARIO_SUBIDA = @USUARIO, DT_SUBIDA = GETDATE()
                        WHERE ID = @ID AND STATUS = 'ABERTO'
                    `);
                if (!fechou.rowsAffected || !fechou.rowsAffected[0]) {
                    throw new Error("O balanço não estava aberto.");
                }
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
            let comparativoGravado = null;
            try {
                comparativoGravado = await lerDiferenca(pool, id);
            } catch (err) {
                console.error("balancoAnual leitura da diferença:", err);
            }
            return res.status(200).json({
                message: `Saldo de ${balanco.ANO} lançado. O estoque vivo passou para ${balanco.ANO}. A diferença ficou gravada.`,
                lotes: analise.paraSubir.length,
                totalContado: analise.totalContado,
                comparativo: comparativoGravado,
            });
        }

        return res.status(400).json({ message: "Ação não reconhecida." });
    } catch (err) {
        console.error("balancoAnual:", err);
        return res.status(500).json({ message: err.message || "Erro no balanço anual." });
    }
}
