// filepath: api/db.js
import sql from "mssql";

const config = {
    user: process.env.AZURE_SQL_USER || process.env.DB_USER,
    password: process.env.AZURE_SQL_PASSWORD || process.env.DB_PASS,
    database: process.env.AZURE_SQL_DATABASE || process.env.DB_NAME,
    server: process.env.AZURE_SQL_SERVER || process.env.DB_SERVER,
    pool: {
        // Serverless (Vercel): pool pequeno evita conexões presas após timeout
        max: 5,
        min: 0,
        idleTimeoutMillis: 10000
    },
    // Timeouts mais curtos: falha com JSON em vez de FUNCTION_INVOCATION_TIMEOUT do Vercel
    requestTimeout: 25000,
    connectionTimeout: 15000,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

let pool;

export async function getConnection() {
    try {
        if (pool && pool.connected) {
            return pool;
        }
        // Pool morto/preso após timeout anterior
        if (pool) {
            try { await pool.close(); } catch (_) { /* ignore */ }
            pool = null;
        }
        console.log("Criando novo pool de conexões...");
        pool = await sql.connect(config);
        console.log("Pool de conexões criado com sucesso.");
        return pool;
    } catch (err) {
        console.error("Falha ao conectar ao banco de dados:", err);
        pool = null;
        throw err;
    }
}

/** Força recriação do pool (usar após timeout/query presa). */
export async function resetPool() {
    if (pool) {
        try { await pool.close(); } catch (_) { /* ignore */ }
        pool = null;
        console.log("Pool SQL resetado.");
    }
}

export { sql };
