// filepath: api/db.js
import sql from "mssql";

const config = {
    user: process.env.AZURE_SQL_USER || process.env.DB_USER,
    password: process.env.AZURE_SQL_PASSWORD || process.env.DB_PASS,
    database: process.env.AZURE_SQL_DATABASE || process.env.DB_NAME,
    server: process.env.AZURE_SQL_SERVER || process.env.DB_SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    requestTimeout: 60000, // 60s para queries pesadas (saving, relatórios)
    connectionTimeout: 30000,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

let pool;

export async function getConnection() {
    try {
        if (!pool) {
            console.log("Criando novo pool de conexões...");
            pool = await sql.connect(config);
            console.log("Pool de conexões criado com sucesso.");
        }
        return pool;
    } catch (err) {
        console.error("Falha ao conectar ao banco de dados:", err);
        pool = null; 
        throw err;
    }
}

export { sql };