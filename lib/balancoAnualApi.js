import { getConnection, sql } from "../db.js";
import { exigirPermissao, podeAcessar, nivelDoRequest, isAdmin, invalidarCachePermissoes } from "./permissoesHelper.js";
import { anoKardex, LOTE, MOVIMENTO } from "./kardex.js";

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
    return { codigo, armazem, endereco, quantidade };
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

async function podeSubir(req) {
    const nivel = nivelDoRequest(req);
    if (isAdmin(nivel)) return true;
    if (!nivel) return false;
    return podeAcessar("balanco-subir", nivel);
}

async function lerBalanco(pool, id) {
    const cab = await pool.request()
        .input("ID", sql.Int, id)
        .query("SELECT ID, ANO, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA FROM dbo.TB_BALANCO_ANUAL WHERE ID = @ID");
    if (!cab.recordset.length) return null;
    const itens = await pool.request()
        .input("ID", sql.Int, id)
        .query(`
            SELECT CODIGO, DESCRICAO, ARMAZEM, ENDERECO, QUANTIDADE, SALDO_REF
            FROM dbo.TB_BALANCO_ANUAL_ITEM
            WHERE ID_BALANCO = @ID
            ORDER BY CODIGO, ENDERECO
        `);
    return { ...cab.recordset[0], itens: itens.recordset };
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

async function analisar(pool, balanco) {
    const itens = (balanco.itens || []).map((item) => ({
        codigo: String(item.CODIGO || item.codigo || "").trim().toUpperCase(),
        descricao: item.DESCRICAO || item.descricao || "",
        armazem: String(item.ARMAZEM ?? item.armazem ?? "").trim(),
        endereco: String(item.ENDERECO ?? item.endereco ?? "").trim(),
        quantidade: item.QUANTIDADE ?? item.quantidade,
    }));
    const erros = [];
    const vistos = new Map();
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
        const id = chave(item.codigo, item.armazem, item.endereco);
        if (vistos.has(id)) {
            erros.push({ tipo: "repetido", codigo: item.codigo, mensagem: `Código ${item.codigo} repetido no endereço ${item.endereco || "(sem endereço)"}.` });
        }
        vistos.set(id, true);
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
            pedido.input("c" + idx, sql.VarChar, linha.codigo);
            pedido.input("e" + idx, sql.VarChar, linha.endereco || "");
            pedido.input("a" + idx, sql.VarChar, linha.armazem || "");
            pedido.input("q" + idx, sql.Float, numero(linha.quantidade));
            return `('', @c${idx}, @e${idx}, @a${idx}, @q${idx}, @USUARIO, @DT, @HR, 'inventario', '', 0, '', '', '', @ANO)`;
        });
        const gravou = await pedido.query(`
            INSERT INTO ${LOTE}
                ([D_E_L_E_T_],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[QNT_SAIDA],[USUARIO_SAIDA],[DT_SAIDA],[HR_SAIDA],[KARDEX])
            OUTPUT INSERTED.ID, INSERTED.CODIGO, INSERTED.ARMAZEM, INSERTED.ENDERECO, INSERTED.QNT
            VALUES ${values.join(",")}
        `);
        criados.push(...gravou.recordset);
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

export default async function handler(req, res) {
    try {
        const pool = await getConnection();
        await garantirTabelas(pool);
        if (!(await exigirPermissao(req, res, "balanco-anual", "Sem permissão para o balanço anual."))) return;

        if (req.method === "GET") {
            const anoVivo = await anoKardex(pool);
            const aberto = await pool.request().query(`
                SELECT TOP 1 ID, ANO, STATUS, USUARIO_ABERTURA, DT_ABERTURA, USUARIO_SUBIDA, DT_SUBIDA
                FROM dbo.TB_BALANCO_ANUAL
                WHERE STATUS = 'ABERTO'
                ORDER BY ID DESC
            `);
            const balanco = aberto.recordset[0] ? await lerBalanco(pool, aberto.recordset[0].ID) : null;
            return res.status(200).json({
                anoVivo,
                podeSubir: await podeSubir(req),
                balanco,
            });
        }

        if (req.method !== "POST") return res.status(405).json({ message: "Método não permitido." });
        const body = corpo(req);
        const acao = body.acao;
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
            const transaction = pool.transaction();
            await transaction.begin();
            try {
                await transaction.request().input("ID", sql.Int, id).query("DELETE FROM dbo.TB_BALANCO_ANUAL_ITEM WHERE ID_BALANCO = @ID");
                const linhas = itens.filter((item) => item.codigo);
                const tamanho = 70;
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
                        return `(@ID, @c${idx}, @d${idx}, @a${idx}, @e${idx}, @q${idx}, @r${idx})`;
                    });
                    await pedido.query(`
                        INSERT INTO dbo.TB_BALANCO_ANUAL_ITEM
                            (ID_BALANCO, CODIGO, DESCRICAO, ARMAZEM, ENDERECO, QUANTIDADE, SALDO_REF)
                        VALUES ${values.join(",")}
                    `);
                }
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
            return res.status(200).json({ balanco: await lerBalanco(pool, id) });
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
            if (!(await podeSubir(req))) {
                return res.status(403).json({ message: "Sem permissão para subir o saldo." });
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
                const { criados, dt, hr } = await inserirLotes(transaction, balanco.ANO, usuario, analise.paraSubir);
                if (criados.length !== analise.paraSubir.length) {
                    throw new Error("A quantidade de lotes gravados não fechou com a contagem.");
                }
                await inserirMovimentos(transaction, balanco.ANO, usuario, dt, hr, criados);
                await transaction.request()
                    .input("ANO", sql.Int, balanco.ANO)
                    .input("USUARIO", sql.NVarChar, usuario)
                    .query(`
                        UPDATE dbo.TB_KARDEX_ANO
                        SET ANO_VIVO = @ANO, DT_VIRADA = GETDATE(), USUARIO_VIRADA = @USUARIO
                        WHERE ID = 1
                    `);
                await transaction.request()
                    .input("ID", sql.Int, id)
                    .input("USUARIO", sql.NVarChar, usuario)
                    .query(`
                        UPDATE dbo.TB_BALANCO_ANUAL
                        SET STATUS = 'FINALIZADO', USUARIO_SUBIDA = @USUARIO, DT_SUBIDA = GETDATE()
                        WHERE ID = @ID AND STATUS = 'ABERTO'
                    `);
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
            return res.status(200).json({
                message: `Saldo de ${balanco.ANO} lançado. O estoque vivo passou para ${balanco.ANO}.`,
                lotes: analise.paraSubir.length,
                totalContado: analise.totalContado,
            });
        }

        return res.status(400).json({ message: "Ação não reconhecida." });
    } catch (err) {
        console.error("balancoAnual:", err);
        return res.status(500).json({ message: err.message || "Erro no balanço anual." });
    }
}
