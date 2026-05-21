const sql = require('mssql');

// Carrega as variáveis de ambiente do arquivo .env
try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (e) {
    console.log('⚠️ dotenv não encontrado, usando variáveis de ambiente do sistema');
}

const config = {
    user: process.env.AZURE_SQL_USER || process.env.DB_USER,
    password: process.env.AZURE_SQL_PASSWORD || process.env.DB_PASS,
    database: process.env.AZURE_SQL_DATABASE || process.env.DB_NAME,
    server: process.env.AZURE_SQL_SERVER || process.env.DB_SERVER,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

async function createConfigTable() {
    if (!config.server) {
        console.error('❌ ERRO: Variáveis de ambiente não configuradas!');
        console.log('Configure as variáveis no arquivo .env ou nas variáveis de ambiente do sistema.');
        return;
    }

    try {
        const pool = await sql.connect(config);
        
        console.log('✓ Conectado ao banco de dados!');
        
        // Tabela de configurações do inventário
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_CONFIG_INVENTARIO]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[TB_CONFIG_INVENTARIO] (
                    [ID_CONFIG] INT IDENTITY(1,1) PRIMARY KEY,
                    [BLOCO1_QTD_ITENS] INT DEFAULT 10,
                    [BLOCO1_DIAS_MOVIMENTACAO] INT DEFAULT 21,
                    [BLOCO2_QTD_ITENS] INT DEFAULT 10,
                    [BLOCO2_ACURACIDADE_MIN] FLOAT DEFAULT 95,
                    [BLOCO3_QTD_ITENS] INT DEFAULT 3,
                    [USUARIO_ALTERACAO] NVARCHAR(100),
                    [DT_ALTERACAO] DATETIME DEFAULT GETDATE()
                );
                PRINT 'Tabela TB_CONFIG_INVENTARIO criada!';
                
                -- Insere configuração padrão
                INSERT INTO [dbo].[TB_CONFIG_INVENTARIO] 
                (BLOCO1_QTD_ITENS, BLOCO1_DIAS_MOVIMENTACAO, BLOCO2_QTD_ITENS, BLOCO2_ACURACIDADE_MIN, BLOCO3_QTD_ITENS, USUARIO_ALTERACAO)
                VALUES (10, 21, 10, 95, 3, 'SISTEMA');
                PRINT 'Configuração padrão inserida!';
            END
            ELSE
            BEGIN
                PRINT 'Tabela TB_CONFIG_INVENTARIO já existe!';
            END
        `);
        
        console.log('✓ Tabela TB_CONFIG_INVENTARIO verificada/criada');
        
        // Verifica se a tabela foi criada
        const checkTable = await pool.request().query(`
            SELECT COUNT(*) AS QTD FROM [dbo].[TB_CONFIG_INVENTARIO];
        `);
        
        console.log(`✓ Registros na tabela: ${checkTable.recordset[0].QTD}`);
        
        await pool.close();
        console.log('\n✅ Script executado com sucesso!');
        
    } catch (err) {
        console.error('❌ Erro ao executar script:', err);
    }
}

createConfigTable();
