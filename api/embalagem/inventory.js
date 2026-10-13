import { getConnection, sql } from "../../db.js";
import { exigirPermissao, exigirQualquerPermissao } from "../../lib/permissoesHelper.js";
import { handleMapaEnderecos } from "../../lib/mapaEnderecosApi.js";

function agoraSaoPaulo() {
  return {
    dt: new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })),
    hr: new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false }),
  };
}

/**
 * Zera o saldo numa instrução só.
 * O laço antigo (update + insert por lote) passava de 60s na Vercel
 * quando o endereço tinha muitos lotes e a plataforma devolvia texto, não JSON.
 */
async function zerarSaldos(transaction, { codigo, usuario, motivo, observacao, armazem, endereco }) {
  const { dt, hr } = agoraSaoPaulo();
  const filtraEndereco = armazem != null && endereco != null;
  const request = transaction.request();
  request.timeout = 50000;
  const result = await request
    .input("CODIGO", sql.VarChar(10), codigo)
    .input("USUARIO", sql.VarChar, usuario)
    .input("DT", sql.Date, dt)
    .input("HR", sql.VarChar, hr)
    .input("MOTIVO", sql.VarChar, motivo)
    .input("OBS", sql.VarChar, observacao || "")
    .input("FILTRA_ENDERECO", sql.Bit, filtraEndereco)
    .input("ARMAZEM", sql.VarChar(20), armazem || "")
    .input("ENDERECO", sql.VarChar(50), endereco || "")
    .query(`
      SET NOCOUNT ON;

      DECLARE @zerados TABLE (
        ID INT NOT NULL,
        SALDO FLOAT NULL,
        QNT FLOAT NULL,
        ENDERECO VARCHAR(200) NULL,
        ARMAZEM VARCHAR(40) NULL
      );

      UPDATE e
      SET [QNT_SAIDA] = ISNULL(e.[QNT_SAIDA], 0) + e.[SALDO],
          [USUARIO_SAIDA] = @USUARIO,
          [DT_SAIDA] = @DT,
          [HR_SAIDA] = @HR
      OUTPUT inserted.[ID], deleted.[SALDO], inserted.[QNT], inserted.[ENDERECO], inserted.[ARMAZEM]
      INTO @zerados (ID, SALDO, QNT, ENDERECO, ARMAZEM)
      FROM [dbo].[KARDEX_2026_EMBALAGEM] e
      WHERE e.[D_E_L_E_T_] = ''
        AND e.[CODIGO] = @CODIGO
        AND e.[SALDO] > 0
        AND e.[KARDEX] = 2026
        AND (
          @FILTRA_ENDERECO = 0
          OR (e.[ARMAZEM] = @ARMAZEM AND e.[ENDERECO] = @ENDERECO)
        );

      INSERT INTO [dbo].[KARDEX_2026]
        ([D_E_L_E_T_],[APLICATIVO],[ID_TB_RESUMO],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[OPERACAO],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[KARDEX],[CAIXA])
      SELECT
        '', 'SGC-WEB', z.ID, @CODIGO, ISNULL(z.ENDERECO, ''), ISNULL(z.ARMAZEM, ''),
        -z.SALDO, 'SAÍDA', @USUARIO, @DT, @HR, @MOTIVO, @OBS, 2026, z.QNT
      FROM @zerados z;

      SELECT COUNT(*) AS LOTES, ISNULL(SUM(SALDO), 0) AS TOTAL FROM @zerados;
    `);

  const conjuntos = result.recordsets || [];
  const linha = (conjuntos.length ? conjuntos[conjuntos.length - 1][0] : result.recordset?.[0]) || {};
  return {
    lotes: Number(linha.LOTES) || 0,
    total: Number(linha.TOTAL) || 0,
  };
}

/** tipo de movimento (API) → link_id da matriz de permissões */
const TIPO_PARA_LINK = {
  ENTRADA: "estoque-entrada",
  SAIDA: "estoque-saida",
  SAÍDA: "estoque-saida",
  ZERAR_ENDERECO: "estoque-zerar-endereco",
  ZERAR_CODIGO: "estoque-zerar-codigo",
  ALTERAR_ENDERECO: "estoque-alterar-endereco",
};

export default async function handler(req, res) {
  try {
    const pool = await getConnection();

    if (req.method === "GET") {
      const { codigo, action } = req.query;

      if (action && String(action).startsWith("mapa")) {
        return await handleMapaEnderecos(req, res, pool);
      }

      // Ação para buscar saldo agrupado por local
      if (action === 'saldoLocal' && codigo) {
        const result = await pool.request()
          .input("CODIGO", sql.VarChar(10), codigo)
          .query(`
            SELECT 
              ARMAZEM,
              ENDERECO,
              QNT AS TAM_LOTE,
              COUNT(*) AS QNT_CAIXAS,
              SUM(SALDO) AS SALDO
            FROM [dbo].[KARDEX_2026_EMBALAGEM]
            WHERE [D_E_L_E_T_] = '' 
              AND CODIGO = @CODIGO 
              AND SALDO > 0
              AND KARDEX = 2026
            GROUP BY ARMAZEM, ENDERECO, QNT
            ORDER BY ARMAZEM, ENDERECO
          `);
        return res.status(200).json({ locais: result.recordset });
      }

      // Ação para buscar info de um lote específico pelo ID (usado no scan de QR)
      if (action === 'loteById' && req.query.id) {
        const result = await pool.request()
          .input('ID', sql.Int, parseInt(req.query.id, 10))
          .query(`
            SELECT TOP 1 
              k.ID,
              k.CODIGO,
              k.ARMAZEM,
              k.ENDERECO,
              k.QNT AS TAM_LOTE,
              k.SALDO,
              k.QNT_SAIDA,
              cp.DESCRICAO
            FROM [dbo].[KARDEX_2026_EMBALAGEM] k
            LEFT JOIN [dbo].[CAD_PROD] cp ON cp.CODIGO = k.CODIGO
            WHERE k.ID = @ID AND k.D_E_L_E_T_ <> '*'
          `);
        if (result.recordset.length === 0) {
          return res.status(404).json({ message: 'Lote não encontrado' });
        }
        return res.status(200).json({ lote: result.recordset[0] });
      }

      // Nova ação para buscar saldo individual por lote
      if (action === 'saldoPorLote' && codigo) {
        const result = await pool.request()
          .input("CODIGO", sql.VarChar(10), codigo)
          .query(`
            SELECT 
              ID,
              ARMAZEM,
              ENDERECO,
              QNT AS TAM_LOTE,
              SALDO
            FROM [dbo].[KARDEX_2026_EMBALAGEM]
            WHERE [D_E_L_E_T_] = '' 
              AND CODIGO = @CODIGO 
              AND SALDO > 0
              AND KARDEX = 2026
            ORDER BY ID DESC
          `);
        return res.status(200).json({ lotes: result.recordset });
      }
      
      // Endpoint original de consulta
      const codigoQuery = String((req.query && req.query.codigo) || "").trim();
      if (!codigoQuery) return res.status(400).json({ message: "codigo é obrigatório" });

      const prod = await pool.request()
        .input("CODIGO", sql.VarChar(10), codigoQuery)
        .query(`
          SELECT TOP 1
            CODIGO,
            DESCRICAO,
            ESTOQUE_MINIMO,
            ESTOQUE_IDEAL,
            ESTOQUE_MAXIMO
          FROM [dbo].[CAD_PROD]
          WHERE CODIGO = @CODIGO
        `);

      const saldoRes = await pool.request()
        .input("CODIGO", sql.VarChar(10), codigoQuery)
        .query("SELECT ISNULL(SUM(SALDO),0) AS SALDO FROM [dbo].[KARDEX_2026_EMBALAGEM] WHERE CODIGO = @CODIGO AND D_E_L_E_T_ <> '*' AND KARDEX = 2026");

      // Totais reais no kardex do ano (não limitados ao TOP do histórico).
      // Aceita SAÍDA / SAIDA (com ou sem acento) e usa QNT < 0 como fallback.
      const statsRes = await pool.request()
        .input("CODIGO", sql.VarChar(10), codigoQuery)
        .query(`
          SELECT
            SUM(CASE
                  WHEN UPPER(LTRIM(RTRIM(OPERACAO))) COLLATE Latin1_General_CI_AI = 'ENTRADA'
                    OR (OPERACAO IS NULL AND QNT > 0)
                  THEN 1 ELSE 0
                END) AS TOTAL_ENTRADAS,
            SUM(CASE
                  WHEN UPPER(LTRIM(RTRIM(OPERACAO))) COLLATE Latin1_General_CI_AI = 'SAIDA'
                    OR (OPERACAO IS NULL AND QNT < 0)
                  THEN 1 ELSE 0
                END) AS TOTAL_SAIDAS,
            ISNULL(SUM(CASE
                  WHEN UPPER(LTRIM(RTRIM(OPERACAO))) COLLATE Latin1_General_CI_AI = 'ENTRADA'
                    OR (OPERACAO IS NULL AND QNT > 0)
                  THEN ABS(QNT) ELSE 0
                END), 0) AS QTD_ENTRADAS,
            ISNULL(SUM(CASE
                  WHEN UPPER(LTRIM(RTRIM(OPERACAO))) COLLATE Latin1_General_CI_AI = 'SAIDA'
                    OR (OPERACAO IS NULL AND QNT < 0)
                  THEN ABS(QNT) ELSE 0
                END), 0) AS QTD_SAIDAS,
            convert(varchar, MAX(DT), 23) AS ULTIMA_DT
          FROM [dbo].[KARDEX_2026]
          WHERE CODIGO = @CODIGO
            AND D_E_L_E_T_ <> '*'
            AND USUARIO <> 'BJULHAO'
            AND KARDEX = 2026
        `);

      // Histórico recente (limite maior para não “esconder” saídas entre muitas entradas)
      const mov = await pool.request()
        .input("CODIGO", sql.VarChar(10), codigoQuery)
        .query(`
          SELECT TOP 200
            ID, 
            CODIGO, 
            OPERACAO, 
            QNT, 
            USUARIO, 
            ENDERECO,
            ARMAZEM,
            convert(varchar, DT, 23) AS DT, 
            convert(varchar, HR, 8) AS HR, 
            MOTIVO, 
            ID_TB_RESUMO
          FROM [dbo].[KARDEX_2026]
          WHERE CODIGO = @CODIGO 
            AND D_E_L_E_T_ <> '*' 
            AND USUARIO <> 'BJULHAO'
            AND KARDEX = 2026
          ORDER BY DT DESC, HR DESC, ID DESC
        `);

      const stats = statsRes.recordset[0] || {};

      return res.status(200).json({
        codigo: codigoQuery,
        descricao: (prod.recordset[0] && prod.recordset[0].DESCRICAO) || null,
        estoqueMinimo: (prod.recordset[0] && prod.recordset[0].ESTOQUE_MINIMO) || null,
        estoqueIdeal: (prod.recordset[0] && prod.recordset[0].ESTOQUE_IDEAL) || null,
        estoqueMaximo: (prod.recordset[0] && prod.recordset[0].ESTOQUE_MAXIMO) || null,
        saldo: (saldoRes.recordset[0] && saldoRes.recordset[0].SALDO) || 0,
        movimentos: mov.recordset,
        totalEntradas: stats.TOTAL_ENTRADAS || 0,
        totalSaidas: stats.TOTAL_SAIDAS || 0,
        qtdEntradas: stats.QTD_ENTRADAS || 0,
        qtdSaidas: stats.QTD_SAIDAS || 0,
        ultimaMovimentacao: stats.ULTIMA_DT || null,
      });
    }

    if (req.method === "POST") {
      const acaoMapa = String((req.body && (req.body.acao || req.body.action)) || "").trim();
      if (acaoMapa.startsWith("mapa")) {
        return await handleMapaEnderecos(req, res, pool);
      }

      const {
        codigo,
        tipo,
        quantidade,
        usuario,
        endereco,
        armazem,
        observacao,
        idTbResumo, // ID do lote para a saída
      } = req.body;
      
      if (!codigo || !tipo || !usuario) {
        return res.status(400).json({ message: "Dados insuficientes para registrar movimento." });
      }

      // Operações que não usam quantidade direta não precisam valida-la
      const operacoesSeQuantidade = ['ZERAR_ENDERECO', 'ZERAR_CODIGO', 'ALTERAR_ENDERECO'];
      if (!operacoesSeQuantidade.includes(tipo.toUpperCase()) && !quantidade) {
        return res.status(400).json({ message: "Dados insuficientes para registrar movimento." });
      }

      const operacao = tipo.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Autorização por ação (ADM bypass no helper).
      // SAÍDA: quem tem Gerenciar Estoque OU Saída Rápida (QR) pode registrar.
      if (operacao === "SAIDA") {
        const ok = await exigirQualquerPermissao(
          req,
          res,
          ["estoque-saida", "saida-rapida"],
          "Sem permissão para registrar saída."
        );
        if (!ok) return;
      } else {
        const linkId = TIPO_PARA_LINK[operacao] || TIPO_PARA_LINK[tipo.toUpperCase()];
        if (linkId) {
          const ok = await exigirPermissao(
            req,
            res,
            linkId,
            `Sem permissão para a ação: ${tipo}`
          );
          if (!ok) return;
        }
      }

      const transaction = pool.transaction();
      let responseData = { message: "Movimento registrado com sucesso!" };
      
      try {
        await transaction.begin();

        if (operacao === 'ENTRADA') {
          // Lógica de ENTRADA
          const embResult = await transaction
            .request()
            .input("D_E_L_E_T_", sql.VarChar, "")
            .input("CODIGO", sql.VarChar, codigo)
            .input("ENDERECO", sql.VarChar, endereco || "")
            .input("ARMAZEM", sql.VarChar, armazem || "")
            .input("QNT", sql.Float, quantidade)
            .input("USUARIO", sql.VarChar, usuario)
            .input("DT", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
            .input("HR", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
            .input("MOTIVO", sql.VarChar, "NOVO")
            .input("OBS", sql.VarChar, observacao || "")
            .input("QNT_SAIDA", sql.Float, 0)
            .input("USUARIO_SAIDA", sql.VarChar, "")
            .input("DT_SAIDA", sql.VarChar, "")
            .input("HR_SAIDA", sql.VarChar, "")
            .input("KARDEX", sql.Int, 2026)
            .query(`
              INSERT INTO [dbo].[KARDEX_2026_EMBALAGEM] 
              ([D_E_L_E_T_], [CODIGO], [ENDERECO], [ARMAZEM], [QNT], [USUARIO], [DT], [HR], [MOTIVO], [OBS], [QNT_SAIDA], [USUARIO_SAIDA], [DT_SAIDA], [HR_SAIDA], [KARDEX])
              OUTPUT INSERTED.ID
              VALUES (@D_E_L_E_T_, @CODIGO, @ENDERECO, @ARMAZEM, @QNT, @USUARIO, @DT, @HR, @MOTIVO, @OBS, @QNT_SAIDA, @USUARIO_SAIDA, @DT_SAIDA, @HR_SAIDA, @KARDEX);
            `);

          const ultimoId = embResult.recordset[0]?.ID;
          if (!ultimoId) {
            throw new Error("Falha ao obter o ID da inserção em EMBALAGEM.");
          }

          // Inserir em KARDEX_2026
          await transaction
            .request()
            .input("D_E_L_E_T_", sql.VarChar, "")
            .input("APLICATIVO", sql.VarChar, "SGC-WEB")
            .input("ID_TB_RESUMO", sql.Int, ultimoId)
            .input("CODIGO_log", sql.VarChar, codigo)
            .input("ENDERECO_log", sql.VarChar, endereco || "")
            .input("ARMAZEM_log", sql.VarChar, armazem || "")
            .input("QNT_log", sql.Float, quantidade)
            .input("OPERACAO_log", sql.VarChar, "ENTRADA")
            .input("USUARIO_log", sql.VarChar, usuario)
            .input("DT_log", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
            .input("HR_log", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
            .input("MOTIVO_log", sql.VarChar, "NOVO")
            .input("OBS_log", sql.VarChar, observacao || "")
            .input("KARDEX_log", sql.Int, 2026)
            .input("CAIXA_log", sql.VarChar, "")
            .query(`
              INSERT INTO [dbo].[KARDEX_2026] 
              ([D_E_L_E_T_], [APLICATIVO], [ID_TB_RESUMO], [CODIGO], [ENDERECO], [ARMAZEM], [QNT], [OPERACAO], [USUARIO], [DT], [HR], [MOTIVO], [OBS], [KARDEX], [CAIXA])
              VALUES (@D_E_L_E_T_, @APLICATIVO, @ID_TB_RESUMO, @CODIGO_log, @ENDERECO_log, @ARMAZEM_log, @QNT_log, @OPERACAO_log, @USUARIO_log, @DT_log, @HR_log, @MOTIVO_log, @OBS_log, @KARDEX_log, @CAIXA_log);
            `);
          
          // Busca a descrição do produto para retornar para a etiqueta
          const prod = await transaction.request()
              .input("CODIGO_PROD", sql.VarChar, codigo)
              .query("SELECT DESCRICAO FROM [dbo].[CAD_PROD] WHERE CODIGO = @CODIGO_PROD");
          const descricaoProduto = (prod.recordset[0] && prod.recordset[0].DESCRICAO) || 'N/A';

          responseData.labelData = {
              idMovimento: ultimoId,
              codigo: codigo,
              descricao: descricaoProduto,
              quantidade: quantidade,
              endereco: endereco || '',
              armazem: armazem || '',
              usuario: usuario,
              dataHora: null, // será preenchido pelo frontend com horário local
              tipoMovimento: 'ENTRADA'
          };

        } else if (operacao === 'SAIDA') {
          // Lógica de SAÍDA (refeita)
          if (!idTbResumo) {
            throw new Error("ID do lote é obrigatório para a saída.");
          }

          const loteInfo = await transaction.request()
            .input('ID', sql.Int, idTbResumo)
            .query("SELECT SALDO, QNT_SAIDA, ENDERECO, ARMAZEM, QNT FROM [dbo].[KARDEX_2026_EMBALAGEM] WHERE ID = @ID");

          if (loteInfo.recordset.length === 0) {
            throw new Error(`Lote com ID ${idTbResumo} não encontrado.`);
          }

          const { SALDO, QNT_SAIDA, ENDERECO, ARMAZEM, QNT: TAM_LOTE } = loteInfo.recordset[0];

          if (quantidade > SALDO) {
            throw new Error(`Saldo insuficiente. O lote possui ${SALDO}, mas a tentativa foi de retirar ${quantidade}.`);
          }

          const novaQntSaida = (QNT_SAIDA || 0) + quantidade;

          await transaction.request()
            .input('ID_upd', sql.Int, idTbResumo)
            .input('NOVA_QNT_SAIDA', sql.Float, novaQntSaida)
            .input('USUARIO_SAIDA', sql.VarChar, usuario)
            .input('DT_SAIDA', sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
            .input('HR_SAIDA', sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
            .query(`
                UPDATE [dbo].[KARDEX_2026_EMBALAGEM] 
                SET [QNT_SAIDA] = @NOVA_QNT_SAIDA,
                    [USUARIO_SAIDA] = @USUARIO_SAIDA,
                    [DT_SAIDA] = @DT_SAIDA,
                    [HR_SAIDA] = @HR_SAIDA 
                WHERE ID = @ID_upd
            `);

          await transaction.request()
            .input("D_E_L_E_T_", sql.VarChar, "")
            .input("APLICATIVO", sql.VarChar, "SGC-WEB")
            .input("ID_TB_RESUMO", sql.Int, idTbResumo)
            .input("CODIGO_log", sql.VarChar, codigo)
            .input("ENDERECO_log", sql.VarChar, ENDERECO)
            .input("ARMAZEM_log", sql.VarChar, ARMAZEM)
            .input("QNT_log", sql.Float, -quantidade)
            .input("OPERACAO_log", sql.VarChar, "SAÍDA")
            .input("USUARIO_log", sql.VarChar, usuario)
            .input("DT_log", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
            .input("HR_log", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
            .input("MOTIVO_log", sql.VarChar, "")
            .input("OBS_log", sql.VarChar, observacao || "")
            .input("KARDEX_log", sql.Int, 2026)
            .input("CAIXA_log", sql.Float, TAM_LOTE)
            .query(`
                INSERT INTO [dbo].[KARDEX_2026] 
                ([D_E_L_E_T_],[APLICATIVO],[ID_TB_RESUMO],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[OPERACAO],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[KARDEX],[CAIXA])
                VALUES (@D_E_L_E_T_, @APLICATIVO, @ID_TB_RESUMO, @CODIGO_log, @ENDERECO_log, @ARMAZEM_log, @QNT_log, @OPERACAO_log, @USUARIO_log, @DT_log, @HR_log, @MOTIVO_log, @OBS_log, @KARDEX_log, @CAIXA_log);
            `);
        } else if (operacao === 'ZERAR_ENDERECO') {
          const { armazem: arm, endereco: end } = req.body;
          if (!arm || !end) {
            throw new Error("Armazém e endereço são obrigatórios para zerar endereço.");
          }
          const { lotes, total } = await zerarSaldos(transaction, {
            codigo,
            usuario,
            motivo: "ZERAR ENDEREÇO",
            observacao,
            armazem: arm,
            endereco: end,
          });
          if (!lotes) {
            throw new Error("Nenhum lote com saldo encontrado neste endereço.");
          }
          responseData = { message: `Endereço zerado com sucesso! ${total} unidade(s) removida(s) em ${lotes} lote(s).`, totalZerado: total };
        } else if (operacao === 'ZERAR_CODIGO') {
          const { lotes, total } = await zerarSaldos(transaction, {
            codigo,
            usuario,
            motivo: "ZERAR CÓDIGO",
            observacao,
          });
          if (!lotes) {
            throw new Error("Nenhum lote com saldo encontrado para este código.");
          }
          responseData = { message: `Código zerado com sucesso! ${total} unidade(s) removida(s) em ${lotes} lote(s).`, totalZerado: total };
        } else if (operacao === 'ALTERAR_ENDERECO') {
          // Lógica de ALTERAR ENDEREÇO: saída no endereço antigo + entrada no novo
          const { armazem: armAtual, endereco: endAtual, novoArmazem, novoEndereco } = req.body;
          if (!armAtual || !endAtual || !novoArmazem || !novoEndereco) {
            throw new Error("Armazém/endereço atual e novo são obrigatórios.");
          }

          const obsTransferencia = `TRANSFERIDO DE ARM:${armAtual} END:${endAtual} PARA ARM:${novoArmazem} END:${novoEndereco}`;

          const lotesResult = await transaction.request()
            .input("CODIGO", sql.VarChar(10), codigo)
            .input("ARMAZEM", sql.VarChar(20), armAtual)
            .input("ENDERECO", sql.VarChar(50), endAtual)
            .query(`
              SELECT ID, SALDO, QNT_SAIDA, QNT
              FROM [dbo].[KARDEX_2026_EMBALAGEM]
              WHERE [D_E_L_E_T_] = ''
                AND CODIGO = @CODIGO
                AND ARMAZEM = @ARMAZEM
                AND ENDERECO = @ENDERECO
                AND SALDO > 0
                AND KARDEX = 2026
            `);

          if (lotesResult.recordset.length === 0) {
            throw new Error("Nenhum lote com saldo encontrado neste endereço.");
          }

          let totalTransferido = 0;
          for (const lote of lotesResult.recordset) {
            const { ID, SALDO, QNT_SAIDA, QNT: TAM_LOTE } = lote;
            const novaQntSaida = (QNT_SAIDA || 0) + SALDO;

            // 1. Atualiza EMBALAGEM: registra saída no lote original
            await transaction.request()
              .input('ID_upd', sql.Int, ID)
              .input('NOVA_QNT_SAIDA', sql.Float, novaQntSaida)
              .input('USUARIO_SAIDA', sql.VarChar, usuario)
              .input('DT_SAIDA', sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
              .input('HR_SAIDA', sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
              .query(`
                UPDATE [dbo].[KARDEX_2026_EMBALAGEM]
                SET [QNT_SAIDA] = @NOVA_QNT_SAIDA,
                    [USUARIO_SAIDA] = @USUARIO_SAIDA,
                    [DT_SAIDA] = @DT_SAIDA,
                    [HR_SAIDA] = @HR_SAIDA
                WHERE ID = @ID_upd
              `);

            // 2. Log de SAÍDA no KARDEX_2026
            await transaction.request()
              .input("D_E_L_E_T_", sql.VarChar, "")
              .input("APLICATIVO", sql.VarChar, "SGC-WEB")
              .input("ID_TB_RESUMO", sql.Int, ID)
              .input("CODIGO_log", sql.VarChar, codigo)
              .input("ENDERECO_log", sql.VarChar, endAtual)
              .input("ARMAZEM_log", sql.VarChar, armAtual)
              .input("QNT_log", sql.Float, -SALDO)
              .input("OPERACAO_log", sql.VarChar, "SAÍDA")
              .input("USUARIO_log", sql.VarChar, usuario)
              .input("DT_log", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
              .input("HR_log", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
              .input("MOTIVO_log", sql.VarChar, "ALTERAR ENDEREÇO")
              .input("OBS_log", sql.VarChar, obsTransferencia)
              .input("KARDEX_log", sql.Int, 2026)
              .input("CAIXA_log", sql.Float, TAM_LOTE)
              .query(`
                INSERT INTO [dbo].[KARDEX_2026]
                ([D_E_L_E_T_],[APLICATIVO],[ID_TB_RESUMO],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[OPERACAO],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[KARDEX],[CAIXA])
                VALUES (@D_E_L_E_T_, @APLICATIVO, @ID_TB_RESUMO, @CODIGO_log, @ENDERECO_log, @ARMAZEM_log, @QNT_log, @OPERACAO_log, @USUARIO_log, @DT_log, @HR_log, @MOTIVO_log, @OBS_log, @KARDEX_log, @CAIXA_log);
              `);

            // 3. Cria novo registro na EMBALAGEM com novo endereço
            const embNovoResult = await transaction.request()
              .input("D_E_L_E_T_", sql.VarChar, "")
              .input("CODIGO", sql.VarChar, codigo)
              .input("ENDERECO", sql.VarChar, novoEndereco)
              .input("ARMAZEM", sql.VarChar, novoArmazem)
              .input("QNT", sql.Float, TAM_LOTE)
              .input("USUARIO", sql.VarChar, usuario)
              .input("DT", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
              .input("HR", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
              .input("MOTIVO", sql.VarChar, "ALTERAR ENDEREÇO")
              .input("OBS", sql.VarChar, obsTransferencia)
              .input("QNT_SAIDA", sql.Float, 0)
              .input("USUARIO_SAIDA", sql.VarChar, "")
              .input("DT_SAIDA", sql.VarChar, "")
              .input("HR_SAIDA", sql.VarChar, "")
              .input("KARDEX", sql.Int, 2026)
              .query(`
                INSERT INTO [dbo].[KARDEX_2026_EMBALAGEM]
                ([D_E_L_E_T_],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[QNT_SAIDA],[USUARIO_SAIDA],[DT_SAIDA],[HR_SAIDA],[KARDEX])
                OUTPUT INSERTED.ID
                VALUES (@D_E_L_E_T_, @CODIGO, @ENDERECO, @ARMAZEM, @QNT, @USUARIO, @DT, @HR, @MOTIVO, @OBS, @QNT_SAIDA, @USUARIO_SAIDA, @DT_SAIDA, @HR_SAIDA, @KARDEX);
              `);

            const novoId = embNovoResult.recordset[0]?.ID;

            // 4. Log de ENTRADA no KARDEX_2026
            await transaction.request()
              .input("D_E_L_E_T_", sql.VarChar, "")
              .input("APLICATIVO", sql.VarChar, "SGC-WEB")
              .input("ID_TB_RESUMO", sql.Int, novoId)
              .input("CODIGO_log", sql.VarChar, codigo)
              .input("ENDERECO_log", sql.VarChar, novoEndereco)
              .input("ARMAZEM_log", sql.VarChar, novoArmazem)
              .input("QNT_log", sql.Float, SALDO)
              .input("OPERACAO_log", sql.VarChar, "ENTRADA")
              .input("USUARIO_log", sql.VarChar, usuario)
              .input("DT_log", sql.Date, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })))
              .input("HR_log", sql.VarChar, new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
              .input("MOTIVO_log", sql.VarChar, "ALTERAR ENDEREÇO")
              .input("OBS_log", sql.VarChar, obsTransferencia)
              .input("KARDEX_log", sql.Int, 2026)
              .input("CAIXA_log", sql.Float, TAM_LOTE)
              .query(`
                INSERT INTO [dbo].[KARDEX_2026]
                ([D_E_L_E_T_],[APLICATIVO],[ID_TB_RESUMO],[CODIGO],[ENDERECO],[ARMAZEM],[QNT],[OPERACAO],[USUARIO],[DT],[HR],[MOTIVO],[OBS],[KARDEX],[CAIXA])
                VALUES (@D_E_L_E_T_, @APLICATIVO, @ID_TB_RESUMO, @CODIGO_log, @ENDERECO_log, @ARMAZEM_log, @QNT_log, @OPERACAO_log, @USUARIO_log, @DT_log, @HR_log, @MOTIVO_log, @OBS_log, @KARDEX_log, @CAIXA_log);
              `);

            totalTransferido += SALDO;
          }

          responseData = { message: `Endereço alterado com sucesso! ${totalTransferido} unidade(s) transferida(s) em ${lotesResult.recordset.length} lote(s) de ARM:${armAtual} END:${endAtual} ? ARM:${novoArmazem} END:${novoEndereco}.`, totalTransferido };
        }

        await transaction.commit();
        return res.status(201).json(responseData);

      } catch (err) {
        await transaction.rollback();
        console.error("Erro ao registrar movimento:", err);
        return res
          .status(500)
          .json({ message: err.message || "Erro no servidor ao registrar movimento." });
      }
    }
  } catch (error) {
    console.error("Erro na API de inventário:", error);
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  }
}