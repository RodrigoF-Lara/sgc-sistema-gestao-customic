import { getConnection, sql } from "../../db.js";

/**
 * API unificada de Cadastros
 * Gerencia produtos e fornecedores
 * 
 * Rotas:
 * - /api/cadastros?tipo=produtos (GET/POST)
 * - /api/cadastros?tipo=fornecedores (GET/POST/PUT/DELETE)
 */
export default async function handler(req, res) {
  const { method, query } = req;
  const { tipo } = query;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const pool = await getConnection();

    if (tipo === 'fornecedores') {
      return await handleFornecedores(req, res, pool, method);
    } else if (tipo === 'produtos') {
      return await handleProdutos(req, res, pool, method);
    } else if (ATRIBUTO_TIPO[tipo]) {
      return await handleAtributo(req, res, pool, method, tipo);
    } else {
      return res.status(400).json({ error: "Parâmetro 'tipo' é obrigatório (produtos ou fornecedores)" });
    }
  } catch (error) {
    console.error("Erro na API de cadastros:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

// =========================================================================
// FORNECEDORES
// =========================================================================

async function handleFornecedores(req, res, pool, method) {
  switch (method) {
    case "GET":
      return await listarFornecedores(req, res, pool);
    
    case "POST":
      return await criarFornecedor(req, res, pool);
    
    case "PUT":
      return await atualizarFornecedor(req, res, pool);
    
    case "DELETE":
      return await excluirFornecedor(req, res, pool);

    default:
      return res.status(405).json({ error: "Método não permitido" });
  }
}

async function listarFornecedores(req, res, pool) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize) || 50));
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * pageSize;

    const request = pool.request()
      .input('offset', sql.Int, offset)
      .input('pageSize', sql.Int, pageSize);

    let whereClause = '';
    if (search) {
      whereClause = `WHERE 
        RAZAO_SOCIAL COLLATE Latin1_General_CI_AI LIKE @search 
        OR CAST(COD_FORNECEDOR AS NVARCHAR) LIKE @search 
        OR CNPJ LIKE @search`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    // Total de registros (com filtro aplicado)
    const totalResult = await request.query(`
      SELECT COUNT(*) AS total FROM [dbo].[CAD_FORNECEDOR] ${whereClause}
    `);
    const total = totalResult.recordset[0].total;

    // Página atual
    const dataResult = await request.query(`
      SELECT 
        COD_FORNECEDOR,
        RAZAO_SOCIAL,
        CNPJ
      FROM [dbo].[CAD_FORNECEDOR]
      ${whereClause}
      ORDER BY RAZAO_SOCIAL
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `);

    return res.status(200).json({ 
      success: true,
      fornecedores: dataResult.recordset,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    console.error("Erro ao listar fornecedores:", error);
    return res.status(500).json({ 
      error: "Erro ao listar fornecedores", 
      message: error.message 
    });
  }
}

async function criarFornecedor(req, res, pool) {
  const { codFornecedor, razaoSocial, cnpj } = req.body;

  if (!codFornecedor || !razaoSocial) {
    return res.status(400).json({ error: "Código e razão social são obrigatórios" });
  }

  try {
    // Verifica duplicação
    const exists = await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .query('SELECT COD_FORNECEDOR FROM CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod');

    if (exists.recordset.length > 0) {
      return res.status(409).json({ error: "Este código de fornecedor já existe" });
    }

    // Insere
    await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .input('razao', sql.NVarChar, razaoSocial)
      .input('cnpj', sql.NVarChar, cnpj || null)
      .query(`
        INSERT INTO [dbo].[CAD_FORNECEDOR] (COD_FORNECEDOR, RAZAO_SOCIAL, CNPJ)
        VALUES (@cod, @razao, @cnpj)
      `);

    return res.status(201).json({ 
      success: true, 
      message: "Fornecedor cadastrado com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao criar fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao criar fornecedor", 
      message: error.message 
    });
  }
}

async function atualizarFornecedor(req, res, pool) {
  const { codFornecedorOriginal, codFornecedor, razaoSocial, cnpj } = req.body;

  if (!codFornecedorOriginal || !codFornecedor || !razaoSocial) {
    return res.status(400).json({ error: "Dados obrigatórios faltando" });
  }

  try {
    // Se mudou o código, verifica se o novo já existe
    if (codFornecedorOriginal !== codFornecedor) {
      const exists = await pool.request()
        .input('cod', sql.Int, codFornecedor)
        .query('SELECT COD_FORNECEDOR FROM CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod');

      if (exists.recordset.length > 0) {
        return res.status(409).json({ error: "Este código de fornecedor já existe" });
      }
    }

    await pool.request()
      .input('codOriginal', sql.Int, codFornecedorOriginal)
      .input('cod', sql.Int, codFornecedor)
      .input('razao', sql.NVarChar, razaoSocial)
      .input('cnpj', sql.NVarChar, cnpj || null)
      .query(`
        UPDATE [dbo].[CAD_FORNECEDOR]
        SET COD_FORNECEDOR = @cod,
            RAZAO_SOCIAL = @razao,
            CNPJ = @cnpj
        WHERE COD_FORNECEDOR = @codOriginal
      `);

    return res.status(200).json({ 
      success: true, 
      message: "Fornecedor atualizado com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao atualizar fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao atualizar fornecedor", 
      message: error.message 
    });
  }
}

async function excluirFornecedor(req, res, pool) {
  const { codFornecedor } = req.query;

  if (!codFornecedor) {
    return res.status(400).json({ error: "Código do fornecedor é obrigatório" });
  }

  try {
    await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .query('DELETE FROM [dbo].[CAD_FORNECEDOR] WHERE COD_FORNECEDOR = @cod');

    return res.status(200).json({ 
      success: true, 
      message: "Fornecedor excluído com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao excluir fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao excluir fornecedor", 
      message: error.message 
    });
  }
}

// =========================================================================
// LINHA, MARCA E MODELO (listas padronizadas do planejamento)
// =========================================================================

const ATRIBUTO_TIPO = {
  linhas: {
    tipo: "LINHA",
    coluna: "LINHA",
    max: 80,
    link: "cadastro-linhas",
    sementes: ["Impactor Ultra", "Soft Series", "Vidro 3D"],
  },
  marcas: {
    tipo: "MARCA",
    coluna: "MARCA",
    max: 60,
    link: "cadastro-marcas",
    sementes: ["Ovvi", "Customic", "JBL"],
  },
  modelos: {
    tipo: "MODELO",
    coluna: "MODELO",
    max: 80,
    link: "cadastro-modelos",
    sementes: ["iPhone 17", "iPhone 18"],
  },
};

let atributosReady = false;

async function ensureAtributos(pool) {
  if (atributosReady) return;
  const criado = await pool.request().query(`
    IF OBJECT_ID(N'dbo.CAD_ATRIBUTO', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CAD_ATRIBUTO (
        ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TIPO NVARCHAR(20) NOT NULL,
        NOME NVARCHAR(80) NOT NULL
      );
      CREATE UNIQUE INDEX UX_CAD_ATRIBUTO_TIPO_NOME ON dbo.CAD_ATRIBUTO (TIPO, NOME);
      SELECT 1 AS criado;
    END
    ELSE SELECT 0 AS criado;
  `);
  if (criado.recordset[0] && criado.recordset[0].criado === 1) {
    for (const cfg of Object.values(ATRIBUTO_TIPO)) {
      for (const nome of cfg.sementes) {
        await pool.request()
          .input("tipo", sql.NVarChar(20), cfg.tipo)
          .input("nome", sql.NVarChar(80), nome)
          .query("INSERT INTO dbo.CAD_ATRIBUTO (TIPO, NOME) VALUES (@tipo, @nome)");
      }
    }
  }
  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SHR_PERMISSOES_MENU', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.SHR_NIVEIS_USUARIO', N'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.SHR_PERMISSOES_MENU (LINK_ID, NIVEL, PERMITIDO, USUARIO_ATUALIZACAO)
        SELECT l.LINK_ID, n.CODIGO, 1, 'SEED-ATRIBUTO'
        FROM dbo.SHR_NIVEIS_USUARIO n
        CROSS JOIN (VALUES (N'cadastro-linhas'), (N'cadastro-marcas'), (N'cadastro-modelos')) l(LINK_ID)
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.SHR_PERMISSOES_MENU x
          WHERE x.LINK_ID = l.LINK_ID AND x.NIVEL = n.CODIGO
        );
      END
    `);
  } catch (_) { /* permissão segue o que já estiver gravado */ }
  atributosReady = true;
}

function nomeAtributo(valor, max) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

async function atributoDuplicado(conn, tipo, nome, id) {
  const reqDup = new sql.Request(conn)
    .input("tipo", sql.NVarChar(20), tipo)
    .input("nome", sql.NVarChar(80), nome)
    .input("id", sql.Int, id || 0);
  const dup = await reqDup.query(`
    SELECT ID FROM dbo.CAD_ATRIBUTO
    WHERE TIPO = @tipo
      AND NOME COLLATE Latin1_General_CI_AI = @nome COLLATE Latin1_General_CI_AI
      AND ID <> @id
  `);
  return dup.recordset.length > 0;
}

async function handleAtributo(req, res, pool, method, tipoUrl) {
  await ensureAtributos(pool);
  const cfg = ATRIBUTO_TIPO[tipoUrl];
  if (method === "GET") {
    const result = await pool.request()
      .input("tipo", sql.NVarChar(20), cfg.tipo)
      .query(`
        SELECT ID, NOME FROM dbo.CAD_ATRIBUTO
        WHERE TIPO = @tipo
        ORDER BY NOME
      `);
    return res.status(200).json({
      itens: result.recordset.map((r) => ({ id: r.ID, nome: r.NOME })),
    });
  }
  if (method !== "POST") {
    return res.status(405).json({ message: "Método não permitido" });
  }

  const acao = req.body && req.body.acao;
  const nome = nomeAtributo(req.body && req.body.nome, cfg.max);
  const id = parseInt(req.body && req.body.id, 10);

  try {
    if (acao === "criar") {
      if (!nome) return res.status(400).json({ message: "Informe o nome." });
      if (await atributoDuplicado(pool, cfg.tipo, nome, 0)) {
        return res.status(409).json({ message: "Já existe um cadastro com esse nome." });
      }
      const ins = await pool.request()
        .input("tipo", sql.NVarChar(20), cfg.tipo)
        .input("nome", sql.NVarChar(80), nome)
        .query(`
          INSERT INTO dbo.CAD_ATRIBUTO (TIPO, NOME)
          OUTPUT INSERTED.ID AS ID
          VALUES (@tipo, @nome)
        `);
      return res.status(201).json({ id: ins.recordset[0].ID, nome });
    }

    if (acao === "atualizar") {
      if (!id) return res.status(400).json({ message: "Informe o item." });
      if (!nome) return res.status(400).json({ message: "Informe o nome." });
      const atual = await pool.request()
        .input("id", sql.Int, id)
        .input("tipo", sql.NVarChar(20), cfg.tipo)
        .query("SELECT NOME FROM dbo.CAD_ATRIBUTO WHERE ID = @id AND TIPO = @tipo");
      if (!atual.recordset.length) {
        return res.status(404).json({ message: "Cadastro não encontrado." });
      }
      if (await atributoDuplicado(pool, cfg.tipo, nome, id)) {
        return res.status(409).json({ message: "Já existe um cadastro com esse nome." });
      }
      const antigo = atual.recordset[0].NOME;
      if (antigo !== nome) await ensurePlanejamento(pool);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input("id", sql.Int, id)
          .input("tipo", sql.NVarChar(20), cfg.tipo)
          .input("nome", sql.NVarChar(80), nome)
          .query("UPDATE dbo.CAD_ATRIBUTO SET NOME = @nome WHERE ID = @id AND TIPO = @tipo");
        if (antigo !== nome) {
          await new sql.Request(transaction)
            .input("antigo", sql.NVarChar(80), antigo)
            .input("novo", sql.NVarChar(80), nome)
            .query(`UPDATE dbo.CAD_PROD_PLANEJAMENTO SET ${cfg.coluna} = @novo WHERE ${cfg.coluna} = @antigo`);
        }
        await transaction.commit();
      } catch (erro) {
        try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
        throw erro;
      }
      return res.status(200).json({ id, nome });
    }

    if (acao === "excluir") {
      if (!id) return res.status(400).json({ message: "Informe o item." });
      const del = await pool.request()
        .input("id", sql.Int, id)
        .input("tipo", sql.NVarChar(20), cfg.tipo)
        .query("DELETE FROM dbo.CAD_ATRIBUTO WHERE ID = @id AND TIPO = @tipo");
      if (!del.rowsAffected[0]) {
        return res.status(404).json({ message: "Cadastro não encontrado." });
      }
      return res.status(200).json({ message: "Excluído." });
    }

    return res.status(400).json({ message: "Ação inválida." });
  } catch (error) {
    console.error("Erro no cadastro de atributo:", error);
    return res.status(500).json({ message: "Erro ao salvar o cadastro", error: error.message });
  }
}

// =========================================================================
// PRODUTOS (mantém compatibilidade com API antiga)
// =========================================================================

let planejamentoReady = false;

async function ensurePlanejamento(pool) {
  if (planejamentoReady) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.CAD_PROD_PLANEJAMENTO', N'U') IS NULL
    CREATE TABLE dbo.CAD_PROD_PLANEJAMENTO (
      CODIGO NVARCHAR(100) NOT NULL PRIMARY KEY,
      LINHA NVARCHAR(80) NULL,
      MARCA NVARCHAR(60) NULL,
      MODELO NVARCHAR(80) NULL,
      COR NVARCHAR(40) NULL,
      EAN NVARCHAR(20) NULL,
      NCM NVARCHAR(10) NULL,
      SAP_VIVO NVARCHAR(40) NULL,
      COD_CLARO NVARCHAR(40) NULL
    );
  `);
  planejamentoReady = true;
}

function textoPlano(valor, max) {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function planoDe(body) {
  return {
    linha: textoPlano(body.linha, 80),
    marca: textoPlano(body.marca, 60),
    modelo: textoPlano(body.modelo, 80),
    cor: textoPlano(body.cor, 40),
    ean: textoPlano(body.ean, 20),
    ncm: textoPlano(body.ncm, 10),
    sapVivo: textoPlano(body.sapVivo, 40),
    codClaro: textoPlano(body.codClaro, 40),
  };
}

const CAMPOS_IMPORTACAO = [
  ["linha", "LINHA", 80],
  ["marca", "MARCA", 60],
  ["modelo", "MODELO", 80],
  ["cor", "COR", 40],
  ["ean", "EAN", 20],
  ["ncm", "NCM", 10],
  ["sapVivo", "SAP_VIVO", 40],
  ["codClaro", "COD_CLARO", 40],
];
const CATALOGO_IMPORTACAO = { linha: "LINHA", marca: "MARCA", modelo: "MODELO" };
const ROTULO_IMPORTACAO = {
  linha: "Linha", marca: "Marca", modelo: "Modelo", cor: "Cor",
  ean: "EAN", ncm: "NCM", sapVivo: "SAP Vivo", codClaro: "Cód. Claro",
};

export function semAcento(valor) {
  return String(valor ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function nomeNoCatalogo(atributos, tipo, valor) {
  const alvo = semAcento(valor);
  const nomes = atributos.filter((item) => item.tipo === tipo).map((item) => item.nome);
  return nomes.find((nome) => semAcento(nome) === alvo) || "";
}

export function prepararImportacao(itens, produtos, atributos) {
  const porCodigo = new Map();
  for (const produto of produtos || []) {
    porCodigo.set(String(produto.CODIGO || "").trim().toUpperCase(), produto);
  }
  const gravar = [];
  const erros = [];
  const avisos = [];
  const vistos = new Map();

  (itens || []).forEach((item, indice) => {
    const codigo = String(item?.codigo ?? "").trim();
    const linhaArquivo = indice + 2;
    if (!codigo) {
      erros.push({ codigo: "", motivo: `Linha ${linhaArquivo}: informe o código.` });
      return;
    }
    const chave = codigo.toUpperCase();
    if (vistos.has(chave)) {
      avisos.push({ codigo, motivo: "Código repetido no arquivo. Vale a última linha." });
      const anterior = vistos.get(chave);
      const pos = gravar.findIndex((row) => row.codigo.toUpperCase() === chave);
      if (pos >= 0) gravar.splice(pos, 1);
      const erroPos = erros.findIndex((row) => row.codigo.toUpperCase() === chave && row.linhaArquivo === anterior);
      if (erroPos >= 0) erros.splice(erroPos, 1);
    }
    vistos.set(chave, linhaArquivo);

    const produto = porCodigo.get(chave);
    if (!produto) {
      erros.push({ codigo, linhaArquivo, motivo: "Produto não encontrado. Este arquivo não cria produto." });
      return;
    }

    const campos = {};
    const problemas = [];
    for (const [chaveCampo, coluna, max] of CAMPOS_IMPORTACAO) {
      if (!Object.prototype.hasOwnProperty.call(item, chaveCampo)) continue;
      const texto = String(item[chaveCampo] ?? "").trim();
      if (!texto) {
        campos[coluna] = null;
        continue;
      }
      if (texto.length > max) {
        problemas.push(`${ROTULO_IMPORTACAO[chaveCampo]} passa de ${max} caracteres.`);
        continue;
      }
      const tipoCatalogo = CATALOGO_IMPORTACAO[chaveCampo];
      if (tipoCatalogo) {
        const oficial = nomeNoCatalogo(atributos, tipoCatalogo, texto);
        if (oficial) {
          campos[coluna] = oficial;
          continue;
        }
        problemas.push(`${ROTULO_IMPORTACAO[chaveCampo]} "${texto}" não está no cadastro. Use um nome da página Cadastros.`);
        continue;
      }
      campos[coluna] = texto;
    }

    if (problemas.length) {
      erros.push({ codigo, linhaArquivo, motivo: problemas.join(" ") });
      return;
    }
    if (!Object.keys(campos).length) return;
    gravar.push({ codigo: String(produto.CODIGO).trim(), campos });
  });

  return { gravar, erros, avisos };
}

async function gravarPlanejamentoParcial(conn, codigo, campos) {
  const reqUp = new sql.Request(conn).input("codigo", sql.NVarChar(100), codigo);
  const colunas = [];
  const valores = [];
  const updates = [];
  CAMPOS_IMPORTACAO.forEach(([chaveCampo, coluna]) => {
    if (!Object.prototype.hasOwnProperty.call(campos, coluna)) return;
    const param = chaveCampo;
    reqUp.input(param, sql.NVarChar(80), campos[coluna]);
    colunas.push(coluna);
    valores.push("@" + param);
    updates.push(`${coluna}=@${param}`);
  });
  if (!colunas.length) return;
  await reqUp.query(`
    MERGE dbo.CAD_PROD_PLANEJAMENTO AS alvo
    USING (SELECT @codigo AS CODIGO) AS origem ON alvo.CODIGO = origem.CODIGO
    WHEN MATCHED THEN UPDATE SET ${updates.join(", ")}
    WHEN NOT MATCHED THEN INSERT (CODIGO, ${colunas.join(", ")})
    VALUES (@codigo, ${valores.join(", ")});
  `);
}

async function importarPlanejamento(req, res, pool) {
  await ensureAtributos(pool);
  const itens = req.body && req.body.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ message: "Nenhuma linha no arquivo." });
  }
  if (itens.length > 8000) {
    return res.status(400).json({ message: "O arquivo tem mais de 8000 linhas. Divida a planilha." });
  }

  const codigos = [...new Set(itens.map((item) => String(item?.codigo ?? "").trim()).filter(Boolean))];
  const produtos = [];
  for (let i = 0; i < codigos.length; i += 200) {
    const fatia = codigos.slice(i, i + 200);
    const pedido = pool.request();
    const params = fatia.map((codigo, idx) => {
      pedido.input("c" + idx, sql.NVarChar(100), codigo);
      return "@c" + idx;
    });
    const achados = await pedido.query(`
      SELECT p.CODIGO, pl.LINHA, pl.MARCA, pl.MODELO, pl.COR, pl.EAN, pl.NCM, pl.SAP_VIVO, pl.COD_CLARO
      FROM [dbo].[CAD_PROD] p
      LEFT JOIN dbo.CAD_PROD_PLANEJAMENTO pl ON pl.CODIGO = p.CODIGO
      WHERE p.CODIGO IN (${params.join(", ")})
    `);
    produtos.push(...achados.recordset);
  }
  const attrs = await pool.request().query("SELECT TIPO, NOME FROM dbo.CAD_ATRIBUTO");
  const atributos = (attrs.recordset || []).map((row) => ({ tipo: row.TIPO, nome: row.NOME }));
  const preparado = prepararImportacao(itens, produtos, atributos);

  if (!preparado.gravar.length) {
    return res.status(400).json({
      message: preparado.erros.length
        ? "Nenhum produto foi atualizado."
        : "O arquivo não tem os campos de planejamento.",
      atualizados: 0,
      erros: preparado.erros,
      avisos: preparado.avisos,
    });
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const item of preparado.gravar) {
      await gravarPlanejamentoParcial(transaction, item.codigo, item.campos);
    }
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch (_) { /* já encerrada */ }
    console.error("Erro ao importar planejamento:", error);
    return res.status(500).json({ message: "Erro ao importar o planejamento", error: error.message });
  }

  const atualizados = preparado.gravar.length;
  const falhas = preparado.erros.length;
  return res.status(200).json({
    message: falhas
      ? `${atualizados} produto(s) atualizados. ${falhas} não entraram.`
      : `${atualizados} produto(s) atualizados.`,
    atualizados,
    erros: preparado.erros,
    avisos: preparado.avisos,
  });
}

async function gravarPlanejamento(conn, codigo, plano) {
  await new sql.Request(conn)
    .input("codigo", sql.NVarChar(100), String(codigo).trim())
    .input("linha", sql.NVarChar(80), plano.linha)
    .input("marca", sql.NVarChar(60), plano.marca)
    .input("modelo", sql.NVarChar(80), plano.modelo)
    .input("cor", sql.NVarChar(40), plano.cor)
    .input("ean", sql.NVarChar(20), plano.ean)
    .input("ncm", sql.NVarChar(10), plano.ncm)
    .input("sapVivo", sql.NVarChar(40), plano.sapVivo)
    .input("codClaro", sql.NVarChar(40), plano.codClaro)
    .query(`
      MERGE dbo.CAD_PROD_PLANEJAMENTO AS alvo
      USING (SELECT @codigo AS CODIGO) AS origem ON alvo.CODIGO = origem.CODIGO
      WHEN MATCHED THEN UPDATE SET
        LINHA=@linha, MARCA=@marca, MODELO=@modelo, COR=@cor,
        EAN=@ean, NCM=@ncm, SAP_VIVO=@sapVivo, COD_CLARO=@codClaro
      WHEN NOT MATCHED THEN INSERT
        (CODIGO, LINHA, MARCA, MODELO, COR, EAN, NCM, SAP_VIVO, COD_CLARO)
        VALUES (@codigo, @linha, @marca, @modelo, @cor, @ean, @ncm, @sapVivo, @codClaro);
    `);
}

async function handleProdutos(req, res, pool, method) {
  await ensurePlanejamento(pool);
  if (method === 'GET') {
    return await listarProdutos(req, res, pool);
  } else if (method === 'POST') {
    const acao = req.body && req.body.acao;
    if (acao === 'criar') {
      return await criarProduto(req, res, pool);
    }
    if (acao === 'atualizar') {
      return await atualizarProdutosAlteracoes(req, res, pool);
    }
    if (acao === 'importar-planejamento') {
      return await importarPlanejamento(req, res, pool);
    }
    return await atualizarProdutos(req, res, pool);
  }

  return res.status(405).json({ message: "Método não permitido" });
}

async function listarProdutos(req, res, pool) {
  try {
    const { codigo, descricao, curva, ativo } = req.query || {};

    const request = pool.request();
    const where = [];

    if (codigo) {
      request.input('codigo', sql.NVarChar, String(codigo).trim());
      where.push('p.CODIGO LIKE @codigo + \'%\'');
    }
    if (descricao) {
      request.input('descricao', sql.NVarChar, String(descricao).trim());
      where.push('p.DESCRICAO COLLATE Latin1_General_CI_AI LIKE \'%\' + @descricao + \'%\'');
    }
    if (curva) {
      request.input('curva', sql.NVarChar, String(curva).trim());
      where.push('p.CURVA_A_B_C = @curva');
    }
    if (ativo !== undefined && ativo !== '' && ativo !== null) {
      request.input('ativo', sql.Int, parseInt(ativo, 10));
      where.push('p.ATIVO = @ativo');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limite = String(req.query.exportar || "") === "1" ? "" : "TOP 500";

    const result = await request.query(`
      SELECT ${limite} p.CODIGO, p.DESCRICAO, p.TIPO, p.DEPOSITO, p.CURVA_A_B_C, p.ATIVO,
             p.ESTOQUE_MINIMO, p.ESTOQUE_IDEAL, p.ESTOQUE_MAXIMO,
             pl.LINHA AS PLN_LINHA, pl.MARCA AS PLN_MARCA, pl.MODELO AS PLN_MODELO,
             pl.COR AS PLN_COR, pl.EAN AS PLN_EAN, pl.NCM AS PLN_NCM,
             pl.SAP_VIVO AS PLN_SAP_VIVO, pl.COD_CLARO AS PLN_COD_CLARO
      FROM [dbo].[CAD_PROD] p
      LEFT JOIN dbo.CAD_PROD_PLANEJAMENTO pl ON pl.CODIGO = p.CODIGO
      ${whereSql}
      ORDER BY p.CODIGO
    `);

    const produtos = result.recordset.map(p => ({
      ...p,
      ATIVO: (p.ATIVO && p.ATIVO.type === 'Buffer' && p.ATIVO.data)
        ? p.ATIVO.data[0]
        : (typeof p.ATIVO === 'boolean' ? (p.ATIVO ? 1 : 0) : p.ATIVO)
    }));

    return res.status(200).json({ produtos });
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    return res.status(500).json({ message: "Erro ao buscar produtos", error: error.message });
  }
}

async function atualizarProdutosAlteracoes(req, res, pool) {
  const { alteracoes } = req.body;

  if (!Array.isArray(alteracoes) || alteracoes.length === 0) {
    return res.status(400).json({ message: "Envie um array de alterações" });
  }

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const alt of alteracoes) {
      const sets = [];
      const reqUp = new sql.Request(transaction);
      reqUp.input('codigo', sql.NVarChar, alt.codigo);

      if (alt.descricao !== undefined) {
        reqUp.input('descricao', sql.NVarChar, alt.descricao);
        sets.push('DESCRICAO = @descricao');
      }
      if (alt.tipo !== undefined) {
        reqUp.input('tipo', sql.NVarChar, alt.tipo);
        sets.push('TIPO = @tipo');
      }
      if (alt.curva !== undefined) {
        reqUp.input('curva', sql.NVarChar, alt.curva);
        sets.push('CURVA_A_B_C = @curva');
      }
      if (alt.ativo !== undefined) {
        reqUp.input('ativo', sql.Int, parseInt(alt.ativo, 10));
        sets.push('ATIVO = @ativo');
      }
      if (alt.estoqueMinimo !== undefined) {
        reqUp.input('estoqueMinimo', sql.Decimal(18, 3), alt.estoqueMinimo === null || alt.estoqueMinimo === '' ? null : Number(alt.estoqueMinimo));
        sets.push('ESTOQUE_MINIMO = @estoqueMinimo');
      }
      if (alt.estoqueIdeal !== undefined) {
        reqUp.input('estoqueIdeal', sql.Decimal(18, 3), alt.estoqueIdeal === null || alt.estoqueIdeal === '' ? null : Number(alt.estoqueIdeal));
        sets.push('ESTOQUE_IDEAL = @estoqueIdeal');
      }
      if (alt.estoqueMaximo !== undefined) {
        reqUp.input('estoqueMaximo', sql.Decimal(18, 3), alt.estoqueMaximo === null || alt.estoqueMaximo === '' ? null : Number(alt.estoqueMaximo));
        sets.push('ESTOQUE_MAXIMO = @estoqueMaximo');
      }

      const temPlano = ["linha", "marca", "modelo", "cor", "ean", "ncm", "sapVivo", "codClaro"]
        .some((campo) => alt[campo] !== undefined);
      if (sets.length === 0 && !temPlano) continue;

      if (sets.length) {
        await reqUp.query(`
          UPDATE [dbo].[CAD_PROD]
          SET ${sets.join(', ')}
          WHERE CODIGO = @codigo
        `);
      }
      if (temPlano) await gravarPlanejamento(transaction, alt.codigo, planoDe(alt));
    }

    await transaction.commit();

    return res.status(200).json({
      message: `${alteracoes.length} alteração(ões) salva(s)`
    });
  } catch (error) {
    console.error("Erro ao atualizar produtos (alteracoes):", error);
    return res.status(500).json({ message: "Erro ao salvar alterações", error: error.message });
  }
}

async function criarProduto(req, res, pool) {
  const { codigo, descricao, tipo } = req.body;

  if (!codigo || !descricao || !tipo) {
    return res.status(400).json({ message: "Preencha todos os campos" });
  }

  const tiposValidos = [
    'EMBALAGEM',
    'CAPAS',
    'MAQUINA DE FILMES',
    'ALCAS',
    'WALLETS',
    'CABOS',
    'MATERIAL DE ESCRITORIO',
    'MATERIAL DE LIMPEZA',
    'OUTROS'
  ];
  const tipoUpper = String(tipo).toUpperCase().trim();
  if (!tiposValidos.includes(tipoUpper)) {
    return res.status(400).json({ message: "Tipo inválido" });
  }

  try {
    const checkResult = await pool.request()
      .input('CODIGO', sql.NVarChar, codigo)
      .query('SELECT CODIGO FROM [dbo].[CAD_PROD] WHERE CODIGO = @CODIGO');

    if (checkResult.recordset.length > 0) {
      return res.status(409).json({ message: "Código já existe" });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input('CODIGO', sql.NVarChar, codigo)
      .input('DESCRICAO', sql.NVarChar, descricao)
      .input('TIPO', sql.NVarChar, tipoUpper)
      .query(`
        INSERT INTO [dbo].[CAD_PROD] ([CODIGO], [DESCRICAO], [DEPOSITO], [TIPO])
        VALUES (@CODIGO, @DESCRICAO, 'CUSTOMIC-01', @TIPO)
      `);

    await new sql.Request(transaction)
      .input('CODIGO', sql.NVarChar, codigo)
      .query(`
        INSERT INTO [dbo].[BOM] ([COD_PAI], [COD_FILHO], [QNT_FILHO])
        VALUES (@CODIGO, @CODIGO, 1)
      `);

    const plano = planoDe(req.body);
    if (Object.values(plano).some(Boolean)) {
      await gravarPlanejamento(transaction, codigo, plano);
    }

    await transaction.commit();

    return res.status(201).json({ message: "Produto criado com sucesso!" });
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    return res.status(500).json({ message: "Erro ao criar produto" });
  }
}

async function atualizarProdutos(req, res, pool) {
  const { produtos } = req.body;

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({ message: "Envie um array de produtos" });
  }

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const prod of produtos) {
      await new sql.Request(transaction)
        .input('CODIGO', sql.NVarChar, prod.CODIGO)
        .input('DESCRICAO', sql.NVarChar, prod.DESCRICAO)
        .input('TIPO', sql.NVarChar, prod.TIPO)
        .query(`
          UPDATE [dbo].[CAD_PROD]
          SET DESCRICAO = @DESCRICAO, TIPO = @TIPO
          WHERE CODIGO = @CODIGO
        `);
    }

    await transaction.commit();

    return res.status(200).json({ 
      message: `${produtos.length} produto(s) atualizado(s)` 
    });
  } catch (error) {
    console.error("Erro ao atualizar produtos:", error);
    return res.status(500).json({ message: "Erro ao atualizar produtos" });
  }
}
