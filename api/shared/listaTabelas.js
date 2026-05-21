// filepath: api/listaTabelas.js
import { getConnection } from "../db.js";

// Esta função vai se conectar ao banco e listar todas as tabelas visíveis.
export default async function handler(req, res) {
    console.log("DIAGNOSTICO: Listando todas as tabelas do banco de dados...");

    try {
        const pool = await getConnection();
        
        // Query padrão para listar todas as tabelas de usuário em um banco de dados SQL Server
        const result = await pool.request().query(`
            SELECT 
                *
            FROM [dbo].[TB_REQUISICOES]
        `);
        
        console.log("DIAGNOSTICO: Tabelas encontradas:", result.recordset);
        
        // Retorna a lista de tabelas como resposta
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error("DIAGNOSTICO_ERRO:", err);
        res.status(500).json({ message: "Erro ao listar tabelas", error: err.message });
    }
}