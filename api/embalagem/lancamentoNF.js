import { getConnection, sql } from "../db.js";

// ============================================================
// API de LanÃ§amento de NF
// Rotas:
//   GET  ?action=fornecedor&cod=XXX            â†’ busca fornecedor
//   GET  ?action=nfs_fornecedor&cod=XXX        â†’ lista NFs do fornecedor
//   GET  ?action=cabecalho&id_nf=XXX           â†’ dados do cabeÃ§alho de uma NF
//   GET  ?action=produtos&id_nf=XXX            â†’ produtos de uma NF
//   GET  ?action=saldo_produto&codigo=XXX      â†’ saldo e custo atual do produto
//   GET  ?action=pesquisa_nf&num_nf=XXX        â†’ pesquisa NF por nÃºmero
//   POST ?action=criar_cabecalho               â†’ insere NF_CABECALHO
//   POST ?action=inserir_produto               â†’ insere item em NF_PRODUTOS
//   POST ?action=alterar_produto               â†’ atualiza item de NF_PRODUTOS
//   POST ?action=remover_produto               â†’ remove item de NF_PRODUTOS
//   POST ?action=finalizar_nf                  â†’ marca NF como LANÃ‡ADA + valida totais
//   POST ?action=excluir_nf                    â†’ remove cabeÃ§alho e produtos
//   PUT  ?action=atualizar_cabecalho           â†’ atualiza campo especÃ­fico do cabeÃ§alho
//   POST ?action=primeiro_custo                â†’ insere/atualiza custo base de produto
// ============================================================

export default async function handler(req, res) {
    const action = req.query.action || req.body?.action;

    try {
        const pool = await getConnection();

        // â”€â”€ GET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (req.method === "GET") {

            // Autocomplete de fornecedor por cÃ³digo ou razÃ£o social
            if (action === "buscar_fornecedor") {
                const q   = req.query.q;
                const cod = req.query.cod;

                if (cod) {
                    const result = await pool.request()
                        .input("COD", sql.VarChar, cod)
                        .query(`
                            SELECT COD_FORNECEDOR, RAZAO_SOCIAL
                            FROM [dbo].[CAD_FORNECEDOR]
                            WHERE COD_FORNECEDOR = @COD
                        `);
                    if (result.recordset.length === 0)
                        return res.status(404).json({ message: "Fornecedor nÃ£o encontrado." });
                    return res.status(200).json(result.recordset[0]);
                }

                if (q) {
                    const result = await pool.request()
                        .input("Q", sql.VarChar, `%${q}%`)
                        .query(`
                            SELECT TOP 20 COD_FORNECEDOR, RAZAO_SOCIAL
                            FROM [dbo].[CAD_FORNECEDOR]
                            WHERE COD_FORNECEDOR LIKE @Q OR RAZAO_SOCIAL LIKE @Q
                            ORDER BY RAZAO_SOCIAL
                        `);
                    return res.status(200).json(result.recordset);
                }

                return res.status(400).json({ message: "Informe 'q' ou 'cod'." });
            }

            // Busca fornecedor pelo cÃ³digo (busca exata)
            if (action === "fornecedor") {
                const cod = req.query.cod;
                if (!cod) return res.status(400).json({ message: "ParÃ¢metro 'cod' obrigatÃ³rio." });

                const result = await pool.request()
                    .input("COD", sql.VarChar, cod)
                    .query(`
                        SELECT COD_FORNECEDOR, RAZAO_SOCIAL, TIPO_FORN
                        FROM [dbo].[CAD_FORNECEDOR]
                        WHERE COD_FORNECEDOR = @COD
                    `);

                if (result.recordset.length === 0)
                    return res.status(404).json({ message: "Fornecedor nÃ£o encontrado." });

                return res.status(200).json(result.recordset[0]);
            }

            // Lista NFs existentes de um fornecedor (para o ComboBox de NF)
            if (action === "nfs_fornecedor") {
                const cod = req.query.cod;
                if (!cod) return res.status(400).json({ message: "ParÃ¢metro 'cod' obrigatÃ³rio." });

                const result = await pool.request()
                    .input("COD", sql.VarChar, cod)
                    .query(`
                        SELECT CAB_NUM_NF, CAB_ID_NF, CAB_STATUS
                        FROM [dbo].[NF_CABECALHO]
                        WHERE CAB_NUM_FORN = @COD
                        ORDER BY CAB_NUM_NF DESC
                    `);

                return res.status(200).json(result.recordset);
            }

            // CabeÃ§alho completo de uma NF
            if (action === "cabecalho") {
                const id_nf = req.query.id_nf;
                if (!id_nf) return res.status(400).json({ message: "ParÃ¢metro 'id_nf' obrigatÃ³rio." });

                const result = await pool.request()
                    .input("ID_NF", sql.Int, Number(id_nf))
                    .query(`
                        SELECT 
                            c.*,
                            f.RAZAO_SOCIAL
                        FROM [dbo].[NF_CABECALHO] c
                        LEFT JOIN [dbo].[CAD_FORNECEDOR] f ON c.CAB_NUM_FORN = f.COD_FORNECEDOR
                        WHERE c.CAB_ID_NF = @ID_NF
                    `);

                if (result.recordset.length === 0)
                    return res.status(404).json({ message: "NF nÃ£o encontrada." });

                return res.status(200).json(result.recordset[0]);
            }

            // Produtos de uma NF
            if (action === "produtos") {
                const id_nf = req.query.id_nf;
                if (!id_nf) return res.status(400).json({ message: "ParÃ¢metro 'id_nf' obrigatÃ³rio." });

                const result = await pool.request()
                    .input("ID_NF", sql.Int, Number(id_nf))
                    .query(`
                        SELECT p.*, cp.DESCRICAO
                        FROM [dbo].[NF_PRODUTOS] p
                        LEFT JOIN [dbo].[CAD_PROD] cp ON p.PROD_COD_PROD = cp.CODIGO
                        WHERE p.PROD_ID_NF = @ID_NF
                        ORDER BY p.PROD_ID_PROD
                    `);

                return res.status(200).json(result.recordset);
            }

            // Saldo e custo atual de um produto
            if (action === "saldo_produto") {
                const codigo = req.query.codigo;
                if (!codigo) return res.status(400).json({ message: "ParÃ¢metro 'codigo' obrigatÃ³rio." });

                const [descResult, saldoResult, custoResult] = await Promise.all([
                    pool.request()
                        .input("COD", sql.VarChar, codigo)
                        .query("SELECT DESCRICAO FROM [dbo].[CAD_PROD] WHERE CODIGO = @COD"),

                    pool.request()
                        .input("COD", sql.VarChar, codigo)
                        .query(`
                            SELECT ISNULL(SUM(SALDO), 0) AS SALDO
                            FROM [dbo].[KARDEX_2026_EMBALAGEM]
                            WHERE CODIGO = @COD AND D_E_L_E_T_ <> '*' AND KARDEX = 2026
                        `),

                    pool.request()
                        .input("COD", sql.VarChar, codigo)
                        .query(`
                            SELECT TOP 1
                                PROD_CUSTO_CONTABIL_MEDIO_NOVO,
                                PROD_CUSTO_FISCAL_MEDIO_NOVO,
                                PROD_CUSTO_PAGO,
                                PROD_DT_EMISSAO
                            FROM [dbo].[NF_PRODUTOS]
                            WHERE PROD_COD_PROD = @COD
                            ORDER BY PROD_DT_EMISSAO DESC
                        `)
                ]);

                if (descResult.recordset.length === 0)
                    return res.status(404).json({ message: "Produto nÃ£o encontrado." });

                return res.status(200).json({
                    descricao: descResult.recordset[0].DESCRICAO,
                    saldo: saldoResult.recordset[0].SALDO,
                    custo: custoResult.recordset[0] || null
                });
            }

            // Pesquisa NF por nÃºmero (para a aba Pesquisa)
            if (action === "pesquisa_nf") {
                const num_nf = req.query.num_nf;
                if (!num_nf) return res.status(400).json({ message: "ParÃ¢metro 'num_nf' obrigatÃ³rio." });

                const result = await pool.request()
                    .input("NUM_NF", sql.VarChar, `%${num_nf}%`)
                    .query(`
                        SELECT 
                            c.CAB_ID_NF,
                            c.CAB_NUM_NF,
                            c.CAB_NUM_FORN,
                            f.RAZAO_SOCIAL,
                            c.CAB_DT_DIGITACAO,
                            c.CAB_VALOR_TT_NF,
                            c.CAB_TP_FORN,
                            c.CAB_STATUS,
                            c.CAB_DT_EMISSAO
                        FROM [dbo].[NF_CABECALHO] c
                        LEFT JOIN [dbo].[CAD_FORNECEDOR] f ON c.CAB_NUM_FORN = f.COD_FORNECEDOR
                        WHERE c.CAB_NUM_NF LIKE @NUM_NF
                        ORDER BY c.CAB_DT_DIGITACAO DESC
                    `);

                return res.status(200).json(result.recordset);
            }

            return res.status(400).json({ message: `Action GET '${action}' nÃ£o reconhecida.` });
        }

        // â”€â”€ POST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (req.method === "POST") {

            // Cria o cabeÃ§alho da NF
            if (action === "criar_cabecalho") {
                const {
                    cod_forn: _cod_forn, num_nf: _num_nf, qnt_itens, pedido_compra, razao,
                    dt_emissao, dt_receb, tipo_forn, aliquota,
                    icms, st, frete, desconto, ipi,
                    valor_prod, valor_total_nf, bc_icms, usuario
                } = req.body;

                // mssql v10 exige string para VarChar — converte explicitamente
                const cod_forn = _cod_forn != null ? String(_cod_forn) : null;
                const num_nf   = _num_nf   != null ? String(_num_nf)   : null;

                if (!cod_forn || !num_nf || !usuario)
                    return res.status(400).json({ message: "Campos obrigatÃ³rios: cod_forn, num_nf, usuario." });

                if (!tipo_forn)
                    return res.status(400).json({ message: "Tipo de fornecedor Ã© obrigatÃ³rio." });

                if (tipo_forn === "SIMPLES NACIONAL" && !aliquota)
                    return res.status(400).json({ message: "AlÃ­quota obrigatÃ³ria para Simples Nacional." });

                // Verifica duplicata
                const dup = await pool.request()
                    .input("NUM_FORN", sql.VarChar, cod_forn)
                    .input("NUM_NF", sql.VarChar, num_nf)
                    .query("SELECT CAB_ID_NF FROM [dbo].[NF_CABECALHO] WHERE CAB_NUM_FORN = @NUM_FORN AND CAB_NUM_NF = @NUM_NF");

                if (dup.recordset.length > 0)
                    return res.status(409).json({ message: "NF jÃ¡ cadastrada para este fornecedor.", id_nf: dup.recordset[0].CAB_ID_NF });

                const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

                const result = await pool.request()
                    .input("COD_FORN",   sql.VarChar,    cod_forn)
                    .input("NUM_NF",     sql.VarChar,    num_nf)
                    .input("QNT_ITENS",  sql.Float,          Number(qnt_itens) || 0)
                    .input("PC",         sql.VarChar,    pedido_compra || "")
                    .input("RAZAO",      sql.VarChar,   razao || "")
                    .input("DT_EMISSAO", sql.Date,           dt_emissao ? new Date(dt_emissao + "T12:00:00") : null)
                    .input("DT_RECEB",   sql.Date,           dt_receb ? new Date(dt_receb + "T12:00:00") : null)
                    .input("DT_DIG",     sql.Date,           nowBRT)
                    .input("HR_DIG",     sql.VarChar,     nowBRT.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
                    .input("ICMS",       sql.Float,          Number(icms) || 0)
                    .input("ST",         sql.Float,          Number(st) || 0)
                    .input("FRETE",      sql.Float,          Number(frete) || 0)
                    .input("DESCONTO",   sql.Float,          Number(desconto) || 0)
                    .input("IPI",        sql.Float,          Number(ipi) || 0)
                    .input("VALOR_PROD", sql.Float,          Number(valor_prod) || 0)
                    .input("VALOR_TT",   sql.Float,          Number(valor_total_nf) || 0)
                    .input("USUARIO",    sql.VarChar,   usuario)
                    .input("TIPO_FORN",  sql.VarChar,    tipo_forn)
                    .input("BC_ICMS",    sql.Float,          Number(bc_icms) || 0)
                    .input("ALIQUOTA",   sql.Float,          Number(aliquota) || 0)
                    .input("STATUS",     sql.VarChar,    "ABERTA")
                    .query(`
                        INSERT INTO [dbo].[NF_CABECALHO] (
                            [CAB_NUM_FORN],[CAB_NUM_NF],[CAB_QNT_TOTAL_ITENS],[CAB_PC],
                            [CAB_RAZAO],[CAB_DT_EMISSAO],[CAB_DT_RECEB],[CAB_DT_DIGITACAO],
                            [CAB_ICMS],[CAB_ST],[CAB_FRETE],[CAB_DESCONTO],[CAB_IPI],
                            [CAB_VALOR_PROD],[CAB_VALOR_TT_NF],[CAB_USUARIO],[CAB_HR_DIGITACAO],
                            [CAB_TP_FORN],[CAB_BC_ICMS],[CAB_ALIQUOTA],[CAB_STATUS]
                        )
                        OUTPUT INSERTED.CAB_ID_NF
                        VALUES (
                            @COD_FORN,@NUM_NF,@QNT_ITENS,@PC,
                            @RAZAO,@DT_EMISSAO,@DT_RECEB,@DT_DIG,
                            @ICMS,@ST,@FRETE,@DESCONTO,@IPI,
                            @VALOR_PROD,@VALOR_TT,@USUARIO,@HR_DIG,
                            @TIPO_FORN,@BC_ICMS,@ALIQUOTA,@STATUS
                        )
                    `);

                const id_nf_novo = result.recordset[0].CAB_ID_NF;
                return res.status(201).json({ message: "CabeÃ§alho criado com sucesso.", id_nf: id_nf_novo });
            }

            // Insere produto na NF
            if (action === "inserir_produto") {
                const {
                    id_nf, codigo, qnt, valor_unit, valor_total,
                    ipi, ipi_unit, icms, icms_unit, st, st_unit,
                    frete, frete_unit, desconto, desconto_unit,
                    bc_icms, bc_icms_unit, importacao_unit, importacao_linha,
                    finalidade, tipo_forn, aliquota,
                    custo_contabil, custo_fiscal, custo_pago,
                    custo_contabil_medio_atual, custo_fiscal_medio_atual,
                    custo_contabil_medio_novo, custo_fiscal_medio_novo,
                    saldo_atual, dt_emissao, num_nf, usuario
                } = req.body;

                if (!id_nf || !codigo || !finalidade)
                    return res.status(400).json({ message: "Campos obrigatÃ³rios: id_nf, codigo, finalidade." });

                // Calcula PIS/COFINS automÃ¡tico conforme tipo do fornecedor
                let pis_valor = 0, pis_percent = 0, cofins_valor = 0, cofins_percent = 0;
                if (tipo_forn === "TRIBUTAÃ‡ÃƒO NORMAL") {
                    pis_percent = 0.0065;
                    cofins_percent = 0.03;
                    const base = (Number(valor_total) - Number(icms || 0) - Number(desconto || 0));
                    pis_valor = parseFloat((base * pis_percent).toFixed(4));
                    cofins_valor = parseFloat((base * cofins_percent).toFixed(4));
                }

                const result = await pool.request()
                    .input("ID_NF",                     sql.Int,    Number(id_nf))
                    .input("COD_PROD",                  sql.VarChar, codigo)
                    .input("QNT",                       sql.Float,  Number(qnt) || 0)
                    .input("VALOR_UNIT",                sql.Float,  Number(valor_unit) || 0)
                    .input("VALOR_TOTAL",               sql.Float,  Number(valor_total) || 0)
                    .input("IPI",                       sql.Float,  Number(ipi) || 0)
                    .input("IPI_UNIT",                  sql.Float,  Number(ipi_unit) || 0)
                    .input("ICMS",                      sql.Float,  Number(icms) || 0)
                    .input("ICMS_UNIT",                 sql.Float,  Number(icms_unit) || 0)
                    .input("ST",                        sql.Float,  Number(st) || 0)
                    .input("ST_UNIT",                   sql.Float,  Number(st_unit) || 0)
                    .input("FRETE",                     sql.Float,  Number(frete) || 0)
                    .input("FRETE_UNIT",                sql.Float,  Number(frete_unit) || 0)
                    .input("DESCONTO",                  sql.Float,  Number(desconto) || 0)
                    .input("DESCONTO_UNIT",             sql.Float,  Number(desconto_unit) || 0)
                    .input("BC_ICMS",                   sql.Float,  Number(bc_icms) || 0)
                    .input("BC_ICMS_UNIT",              sql.Float,  Number(bc_icms_unit) || 0)
                    .input("IMPORT_UNIT",               sql.Float,  Number(importacao_unit) || 0)
                    .input("IMPORT_LINHA",              sql.Float,  Number(importacao_linha) || 0)
                    .input("PIS_VALOR",                 sql.Float,  pis_valor)
                    .input("PIS_PERCENT",               sql.Float,  pis_percent)
                    .input("COFINS_VALOR",              sql.Float,  cofins_valor)
                    .input("COFINS_PERCENT",            sql.Float,  cofins_percent)
                    .input("FINALIDADE",                sql.VarChar, finalidade)
                    .input("CUSTO_CONTABIL",            sql.Float,  Number(custo_contabil) || 0)
                    .input("CUSTO_CONTABIL_MED_ATU",    sql.Float,  Number(custo_contabil_medio_atual) || 0)
                    .input("CUSTO_CONTABIL_MED_NOV",    sql.Float,  Number(custo_contabil_medio_novo) || 0)
                    .input("CUSTO_FISCAL",              sql.Float,  Number(custo_fiscal) || 0)
                    .input("CUSTO_FISCAL_MED_ATU",      sql.Float,  Number(custo_fiscal_medio_atual) || 0)
                    .input("CUSTO_FISCAL_MED_NOV",      sql.Float,  Number(custo_fiscal_medio_novo) || 0)
                    .input("CUSTO_PAGO",                sql.Float,  Number(custo_pago) || 0)
                    .input("SALDO_ATUAL",               sql.Float,  Number(saldo_atual) || 0)
                    .input("DT_EMISSAO",                sql.Date,   dt_emissao ? new Date(dt_emissao + "T12:00:00") : null)
                    .input("ALIQUOTA",                  sql.Float,  Number(aliquota) || 0)
                    .query(`
                        INSERT INTO [dbo].[NF_PRODUTOS] (
                            [PROD_ID_NF],[PROD_COD_PROD],[PROD_QNT],
                            [PROD_VALOR_UNIT],[PROD_VALOR_TOTAL],
                            [PROD_IPI],[PROD_IPI_UNIT],
                            [PROD_ICMS],[PROD_ICMS_UNIT],
                            [PROD_ST],[PROD_ST_UNIT],
                            [PROD_FRETE],[PROD_FRETE_UNIT],
                            [PROD_DESCONTO],[PROD_DESCONTO_UNIT],
                            [PROD_BC_ICMS],[PROD_BC_ICMS_UNIT],
                            [PROD_IMPORTACAO_UNIT],[PROD_IMPORTACAO_LINHA],
                            [PROD_PIS_VALOR],[PROD_PIS_PERCENT],
                            [PROD_COFINS_VALOR],[PROD_COFINS_PERCENT],
                            [PROD_FINALIDADE],
                            [PROD_CUSTO_CONTABIL],[PROD_CUSTO_CONTABIL_MEDIO_ATUAL],[PROD_CUSTO_CONTABIL_MEDIO_NOVO],
                            [PROD_CUSTO_FISCAL],[PROD_CUSTO_FISCAL_MEDIO_ATUAL],[PROD_CUSTO_FISCAL_MEDIO_NOVO],
                            [PROD_CUSTO_PAGO],[SALDO_ATUAL],[PROD_DT_EMISSAO],[PROD_ALIQUOTA]
                        )
                        OUTPUT INSERTED.PROD_ID_PROD
                        VALUES (
                            @ID_NF,@COD_PROD,@QNT,
                            @VALOR_UNIT,@VALOR_TOTAL,
                            @IPI,@IPI_UNIT,
                            @ICMS,@ICMS_UNIT,
                            @ST,@ST_UNIT,
                            @FRETE,@FRETE_UNIT,
                            @DESCONTO,@DESCONTO_UNIT,
                            @BC_ICMS,@BC_ICMS_UNIT,
                            @IMPORT_UNIT,@IMPORT_LINHA,
                            @PIS_VALOR,@PIS_PERCENT,
                            @COFINS_VALOR,@COFINS_PERCENT,
                            @FINALIDADE,
                            @CUSTO_CONTABIL,@CUSTO_CONTABIL_MED_ATU,@CUSTO_CONTABIL_MED_NOV,
                            @CUSTO_FISCAL,@CUSTO_FISCAL_MED_ATU,@CUSTO_FISCAL_MED_NOV,
                            @CUSTO_PAGO,@SALDO_ATUAL,@DT_EMISSAO,@ALIQUOTA
                        )
                    `);

                const id_prod = result.recordset[0].PROD_ID_PROD;

                // Grava log
                const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                await pool.request()
                    .input("ID_NF",    sql.Int,        Number(id_nf))
                    .input("ID_PROD",  sql.Int,        id_prod)
                    .input("NF",       sql.VarChar, num_nf || "")
                    .input("CODIGO",   sql.VarChar, codigo)
                    .input("USUARIO",  sql.VarChar, usuario || "WEB")
                    .input("DT",       sql.Date,        nowBRT)
                    .input("HH",       sql.VarChar,  nowBRT.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
                    .input("QNT",      sql.Float,       Number(qnt) || 0)
                    .query(`
                        INSERT INTO [dbo].[TB_LOG_NF]
                            ([ID_NF],[ID_NF_PROD],[NF],[CODIGO],[USUARIO],[DT],[HH],[PROCESSO],[APP],[QNT])
                        VALUES
                            (@ID_NF,@ID_PROD,@NF,@CODIGO,@USUARIO,@DT,@HH,'LANCAMENTO NF','SGC-WEB',@QNT)
                    `);

                return res.status(201).json({ message: "Produto inserido com sucesso.", id_prod });
            }

            // Altera produto da NF
            if (action === "alterar_produto") {
                const {
                    id_prod, codigo, qnt, valor_unit, valor_total,
                    ipi, ipi_unit, icms, icms_unit, st, st_unit,
                    frete, frete_unit, desconto, desconto_unit,
                    bc_icms, bc_icms_unit, importacao_unit, importacao_linha,
                    finalidade, tipo_forn,
                    custo_contabil, custo_fiscal, custo_pago,
                    custo_contabil_medio_atual, custo_fiscal_medio_atual,
                    custo_contabil_medio_novo, custo_fiscal_medio_novo,
                    saldo_atual, dt_emissao, usuario, id_nf, num_nf
                } = req.body;

                if (!id_prod) return res.status(400).json({ message: "Campo 'id_prod' obrigatÃ³rio." });

                let pis_valor = 0, pis_percent = 0, cofins_valor = 0, cofins_percent = 0;
                if (tipo_forn === "TRIBUTAÃ‡ÃƒO NORMAL") {
                    pis_percent = 0.0065;
                    cofins_percent = 0.03;
                    const base = (Number(valor_total) - Number(icms || 0) - Number(desconto || 0));
                    pis_valor = parseFloat((base * pis_percent).toFixed(4));
                    cofins_valor = parseFloat((base * cofins_percent).toFixed(4));
                }

                await pool.request()
                    .input("ID_PROD",               sql.Int,         Number(id_prod))
                    .input("COD_PROD",               sql.VarChar, codigo)
                    .input("QNT",                    sql.Float,       Number(qnt) || 0)
                    .input("VALOR_UNIT",             sql.Float,       Number(valor_unit) || 0)
                    .input("VALOR_TOTAL",            sql.Float,       Number(valor_total) || 0)
                    .input("IPI",                    sql.Float,       Number(ipi) || 0)
                    .input("IPI_UNIT",               sql.Float,       Number(ipi_unit) || 0)
                    .input("ICMS",                   sql.Float,       Number(icms) || 0)
                    .input("ICMS_UNIT",              sql.Float,       Number(icms_unit) || 0)
                    .input("ST",                     sql.Float,       Number(st) || 0)
                    .input("ST_UNIT",                sql.Float,       Number(st_unit) || 0)
                    .input("FRETE",                  sql.Float,       Number(frete) || 0)
                    .input("FRETE_UNIT",             sql.Float,       Number(frete_unit) || 0)
                    .input("DESCONTO",               sql.Float,       Number(desconto) || 0)
                    .input("DESCONTO_UNIT",          sql.Float,       Number(desconto_unit) || 0)
                    .input("BC_ICMS",                sql.Float,       Number(bc_icms) || 0)
                    .input("BC_ICMS_UNIT",           sql.Float,       Number(bc_icms_unit) || 0)
                    .input("IMPORT_UNIT",            sql.Float,       Number(importacao_unit) || 0)
                    .input("IMPORT_LINHA",           sql.Float,       Number(importacao_linha) || 0)
                    .input("PIS_VALOR",              sql.Float,       pis_valor)
                    .input("PIS_PERCENT",            sql.Float,       pis_percent)
                    .input("COFINS_VALOR",           sql.Float,       cofins_valor)
                    .input("COFINS_PERCENT",         sql.Float,       cofins_percent)
                    .input("FINALIDADE",             sql.VarChar, finalidade || "")
                    .input("CUSTO_CONTABIL",         sql.Float,       Number(custo_contabil) || 0)
                    .input("CUSTO_CONTABIL_MED_ATU", sql.Float,       Number(custo_contabil_medio_atual) || 0)
                    .input("CUSTO_CONTABIL_MED_NOV", sql.Float,       Number(custo_contabil_medio_novo) || 0)
                    .input("CUSTO_FISCAL",           sql.Float,       Number(custo_fiscal) || 0)
                    .input("CUSTO_FISCAL_MED_ATU",   sql.Float,       Number(custo_fiscal_medio_atual) || 0)
                    .input("CUSTO_FISCAL_MED_NOV",   sql.Float,       Number(custo_fiscal_medio_novo) || 0)
                    .input("CUSTO_PAGO",             sql.Float,       Number(custo_pago) || 0)
                    .input("SALDO_ATUAL",            sql.Float,       Number(saldo_atual) || 0)
                    .input("DT_EMISSAO",             sql.Date,        dt_emissao ? new Date(dt_emissao + "T12:00:00") : null)
                    .query(`
                        UPDATE [dbo].[NF_PRODUTOS] SET
                            [PROD_COD_PROD]=@COD_PROD,[PROD_QNT]=@QNT,
                            [PROD_VALOR_UNIT]=@VALOR_UNIT,[PROD_VALOR_TOTAL]=@VALOR_TOTAL,
                            [PROD_IPI]=@IPI,[PROD_IPI_UNIT]=@IPI_UNIT,
                            [PROD_ICMS]=@ICMS,[PROD_ICMS_UNIT]=@ICMS_UNIT,
                            [PROD_ST]=@ST,[PROD_ST_UNIT]=@ST_UNIT,
                            [PROD_FRETE]=@FRETE,[PROD_FRETE_UNIT]=@FRETE_UNIT,
                            [PROD_DESCONTO]=@DESCONTO,[PROD_DESCONTO_UNIT]=@DESCONTO_UNIT,
                            [PROD_BC_ICMS]=@BC_ICMS,[PROD_BC_ICMS_UNIT]=@BC_ICMS_UNIT,
                            [PROD_IMPORTACAO_UNIT]=@IMPORT_UNIT,[PROD_IMPORTACAO_LINHA]=@IMPORT_LINHA,
                            [PROD_PIS_VALOR]=@PIS_VALOR,[PROD_PIS_PERCENT]=@PIS_PERCENT,
                            [PROD_COFINS_VALOR]=@COFINS_VALOR,[PROD_COFINS_PERCENT]=@COFINS_PERCENT,
                            [PROD_FINALIDADE]=@FINALIDADE,
                            [PROD_CUSTO_CONTABIL]=@CUSTO_CONTABIL,
                            [PROD_CUSTO_CONTABIL_MEDIO_ATUAL]=@CUSTO_CONTABIL_MED_ATU,
                            [PROD_CUSTO_CONTABIL_MEDIO_NOVO]=@CUSTO_CONTABIL_MED_NOV,
                            [PROD_CUSTO_FISCAL]=@CUSTO_FISCAL,
                            [PROD_CUSTO_FISCAL_MEDIO_ATUAL]=@CUSTO_FISCAL_MED_ATU,
                            [PROD_CUSTO_FISCAL_MEDIO_NOVO]=@CUSTO_FISCAL_MED_NOV,
                            [PROD_CUSTO_PAGO]=@CUSTO_PAGO,
                            [SALDO_ATUAL]=@SALDO_ATUAL,[PROD_DT_EMISSAO]=@DT_EMISSAO
                        WHERE [PROD_ID_PROD] = @ID_PROD
                    `);

                // Atualiza log
                const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                await pool.request()
                    .input("ID_PROD",  sql.Int,         Number(id_prod))
                    .input("CODIGO",   sql.VarChar,  codigo)
                    .input("USUARIO",  sql.VarChar, usuario || "WEB")
                    .input("DT",       sql.Date,         nowBRT)
                    .input("HH",       sql.VarChar,   nowBRT.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
                    .input("QNT",      sql.Float,        Number(qnt) || 0)
                    .query(`
                        UPDATE [dbo].[TB_LOG_NF]
                        SET [CODIGO]=@CODIGO,[USUARIO]=@USUARIO,[DT]=@DT,[HH]=@HH,[QNT]=@QNT
                        WHERE [ID_NF_PROD] = @ID_PROD
                    `);

                return res.status(200).json({ message: "Produto alterado com sucesso." });
            }

            // Remove produto da NF
            if (action === "remover_produto") {
                const { id_prod } = req.body;
                if (!id_prod) return res.status(400).json({ message: "Campo 'id_prod' obrigatÃ³rio." });

                await pool.request()
                    .input("ID_PROD", sql.Int, Number(id_prod))
                    .query("DELETE FROM [dbo].[NF_PRODUTOS] WHERE [PROD_ID_PROD] = @ID_PROD");

                await pool.request()
                    .input("ID_PROD", sql.Int, Number(id_prod))
                    .query("DELETE FROM [dbo].[TB_LOG_NF] WHERE [ID_NF_PROD] = @ID_PROD");

                return res.status(200).json({ message: "Produto removido com sucesso." });
            }

            // Finaliza a NF: valida totais e marca como LANÃ‡ADA
            if (action === "finalizar_nf") {
                const { id_nf } = req.body;
                if (!id_nf) return res.status(400).json({ message: "Campo 'id_nf' obrigatÃ³rio." });

                // Busca dados do cabeÃ§alho
                const cab = await pool.request()
                    .input("ID_NF", sql.Int, Number(id_nf))
                    .query(`
                        SELECT CAB_QNT_TOTAL_ITENS, CAB_VALOR_PROD, CAB_IPI, CAB_ICMS,
                               CAB_ST, CAB_FRETE, CAB_DESCONTO, CAB_BC_ICMS
                        FROM [dbo].[NF_CABECALHO] WHERE CAB_ID_NF = @ID_NF
                    `);

                // Soma dos produtos
                const prod = await pool.request()
                    .input("ID_NF", sql.Int, Number(id_nf))
                    .query(`
                        SELECT
                            SUM(PROD_QNT)           AS SUM_QNT,
                            SUM(PROD_VALOR_TOTAL)   AS SUM_VALOR,
                            SUM(PROD_IPI)           AS SUM_IPI,
                            SUM(PROD_ICMS)          AS SUM_ICMS,
                            SUM(PROD_ST)            AS SUM_ST,
                            SUM(PROD_FRETE)         AS SUM_FRETE,
                            SUM(PROD_DESCONTO)      AS SUM_DESCONTO,
                            SUM(PROD_BC_ICMS)       AS SUM_BC_ICMS,
                            SUM(PROD_PIS_VALOR)     AS SUM_PIS,
                            SUM(PROD_COFINS_VALOR)  AS SUM_COFINS
                        FROM [dbo].[NF_PRODUTOS]
                        WHERE PROD_ID_NF = @ID_NF
                    `);

                const c = cab.recordset[0] || {};
                const p = prod.recordset[0] || {};

                const diferencas = {
                    qnt:      round2(c.CAB_QNT_TOTAL_ITENS - (p.SUM_QNT || 0)),
                    valor:    round2(c.CAB_VALOR_PROD - (p.SUM_VALOR || 0)),
                    ipi:      round2(c.CAB_IPI - (p.SUM_IPI || 0)),
                    icms:     round2(c.CAB_ICMS - (p.SUM_ICMS || 0)),
                    st:       round2(c.CAB_ST - (p.SUM_ST || 0)),
                    frete:    round2(c.CAB_FRETE - (p.SUM_FRETE || 0)),
                    desconto: round2(c.CAB_DESCONTO - (p.SUM_DESCONTO || 0)),
                    bc_icms:  round2(c.CAB_BC_ICMS - (p.SUM_BC_ICMS || 0)),
                };

                const temErro = Object.values(diferencas).some(v => Math.abs(v) > 0.01);

                if (!temErro) {
                    // Marca como LANÃ‡ADA
                    await pool.request()
                        .input("ID_NF", sql.Int, Number(id_nf))
                        .query("UPDATE [dbo].[NF_CABECALHO] SET CAB_STATUS = 'LANÃ‡ADA' WHERE CAB_ID_NF = @ID_NF");
                }

                return res.status(200).json({
                    temErro,
                    diferencas,
                    cabecalho: c,
                    somaProdutos: p,
                    status: temErro ? "COM ERRO" : "LANÃ‡ADA"
                });
            }

            // Exclui NF e todos os produtos
            if (action === "excluir_nf") {
                const { id_nf, num_nf } = req.body;
                if (!id_nf) return res.status(400).json({ message: "Campo 'id_nf' obrigatÃ³rio." });

                const transaction = pool.transaction();
                await transaction.begin();
                try {
                    await transaction.request()
                        .input("ID_NF", sql.Int, Number(id_nf))
                        .query("DELETE FROM [dbo].[NF_PRODUTOS] WHERE PROD_ID_NF = @ID_NF");

                    await transaction.request()
                        .input("ID_NF", sql.Int, Number(id_nf))
                        .query("DELETE FROM [dbo].[NF_CABECALHO] WHERE CAB_ID_NF = @ID_NF");

                    await transaction.commit();
                    return res.status(200).json({ message: `NF ${num_nf || id_nf} excluÃ­da com sucesso.` });
                } catch (err) {
                    await transaction.rollback();
                    throw err;
                }
            }

            // Insere/atualiza primeiro custo de um produto
            if (action === "primeiro_custo") {
                const { codigo, custo_contabil, custo_fiscal, custo_pago } = req.body;
                if (!codigo) return res.status(400).json({ message: "Campo 'codigo' obrigatÃ³rio." });

                const existe = await pool.request()
                    .input("COD", sql.VarChar, codigo)
                    .query("SELECT PROD_ID_PROD FROM [dbo].[NF_PRODUTOS] WHERE PROD_COD_PROD = @COD AND PROD_DT_EMISSAO = '2000-01-01'");

                if (existe.recordset.length === 0) {
                    await pool.request()
                        .input("COD",    sql.VarChar, codigo)
                        .input("CC",     sql.Float, Number(custo_contabil) || 0)
                        .input("CF",     sql.Float, Number(custo_fiscal) || 0)
                        .input("CP",     sql.Float, Number(custo_pago) || 0)
                        .query(`
                            INSERT INTO [dbo].[NF_PRODUTOS]
                                ([PROD_COD_PROD],[PROD_CUSTO_CONTABIL_MEDIO_NOVO],[PROD_CUSTO_CONTABIL],
                                 [PROD_CUSTO_FISCAL_MEDIO_NOVO],[PROD_CUSTO_FISCAL],[PROD_CUSTO_PAGO],[PROD_DT_EMISSAO])
                            VALUES (@COD,@CC,@CC,@CF,@CF,@CP,'2000-01-01')
                        `);
                } else {
                    await pool.request()
                        .input("ID",   sql.Int,     existe.recordset[0].PROD_ID_PROD)
                        .input("CC",   sql.Float,   Number(custo_contabil) || 0)
                        .input("CF",   sql.Float,   Number(custo_fiscal) || 0)
                        .input("CP",   sql.Float,   Number(custo_pago) || 0)
                        .query(`
                            UPDATE [dbo].[NF_PRODUTOS] SET
                                [PROD_CUSTO_CONTABIL_MEDIO_NOVO]=@CC,[PROD_CUSTO_CONTABIL]=@CC,
                                [PROD_CUSTO_FISCAL_MEDIO_NOVO]=@CF,[PROD_CUSTO_FISCAL]=@CF,
                                [PROD_CUSTO_PAGO]=@CP
                            WHERE PROD_ID_PROD = @ID
                        `);
                }

                return res.status(200).json({ message: "Primeiro custo salvo com sucesso." });
            }

            return res.status(400).json({ message: `Action POST '${action}' nÃ£o reconhecida.` });
        }

        // â”€â”€ PUT: atualiza campo individual do cabeÃ§alho â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (req.method === "PUT") {
            if (action === "atualizar_cabecalho") {
                const { id_nf, campo, valor } = req.body;
                if (!id_nf || !campo) return res.status(400).json({ message: "Campos 'id_nf' e 'campo' obrigatÃ³rios." });

                // Whitelist de campos permitidos para evitar SQL injection
                const camposPermitidos = {
                    "CAB_QNT_TOTAL_ITENS": sql.Float,
                    "CAB_PC":              sql.VarChar,
                    "CAB_DT_EMISSAO":      sql.Date,
                    "CAB_DT_RECEB":        sql.Date,
                    "CAB_ICMS":            sql.Float,
                    "CAB_ST":              sql.Float,
                    "CAB_FRETE":           sql.Float,
                    "CAB_DESCONTO":        sql.Float,
                    "CAB_IPI":             sql.Float,
                    "CAB_VALOR_PROD":      sql.Float,
                    "CAB_VALOR_TT_NF":     sql.Float,
                    "CAB_BC_ICMS":         sql.Float,
                    "CAB_TP_FORN":         sql.VarChar,
                    "CAB_ALIQUOTA":        sql.Float,
                };

                if (!camposPermitidos[campo])
                    return res.status(400).json({ message: `Campo '${campo}' nÃ£o permitido para atualizaÃ§Ã£o.` });

                const tipo = camposPermitidos[campo];
                let valorConv = valor;
                if (tipo === sql.Float) valorConv = Number(valor) || 0;
                if (tipo === sql.Date && valor) valorConv = new Date(valor + "T12:00:00");

                await pool.request()
                    .input("ID_NF", sql.Int, Number(id_nf))
                    .input("VALOR", tipo, valorConv)
                    .query(`UPDATE [dbo].[NF_CABECALHO] SET [${campo}] = @VALOR WHERE CAB_ID_NF = @ID_NF`);

                return res.status(200).json({ message: `${campo} atualizado com sucesso.` });
            }

            return res.status(400).json({ message: `Action PUT '${action}' nÃ£o reconhecida.` });
        }

        return res.status(405).json({ message: "MÃ©todo nÃ£o permitido." });

    } catch (err) {
        console.error("ERRO /api/lancamentoNF:", err);
        return res.status(500).json({ message: "Erro interno do servidor.", error: err.message });
    }
}

function round2(v) {
    return Math.round((v || 0) * 100) / 100;
}

