const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function addValorTotalColumn() {
    try {
        const pool = await sql.connect(config);
        
        console.log('Conectado ao banco de dados!');
        
        // Adiciona coluna VALOR_TOTAL_GERAL na tabela TB_INVENTARIO_CICLICO
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO]') 
                AND name = 'VALOR_TOTAL_GERAL'
            )
            BEGIN
                ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO]
                ADD VALOR_TOTAL_GERAL FLOAT NULL;
                PRINT 'Coluna VALOR_TOTAL_GERAL adicionada com sucesso!';
            END
            ELSE
            BEGIN
                PRINT 'Coluna VALOR_TOTAL_GERAL já existe!';
            END
        `);
        
        console.log('✓ Coluna VALOR_TOTAL_GERAL verificada/criada');
        
        await pool.close();
        console.log('\n✅ Script executado com sucesso!');
        
    } catch (err) {
        console.error('❌ Erro ao executar script:', err);
    }
}

addValorTotalColumn();
