# Script PowerShell para criar tabelas de Inventário Cíclico
# Data: 2025-12-25

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Criando tabelas de Inventário Cíclico..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Carrega o SQL do arquivo
$sqlScript = Get-Content "C:\Users\ADM\Documents\Projetos\requisicoes\SQL_Scripts\create_inventario_tables.sql" -Raw

# Remove comandos GO que não funcionam via PowerShell
$sqlCommands = $sqlScript -split '\r?\nGO\r?\n'

# Conecta ao banco
$connectionString = "Server=$env:DB_SERVER;Database=$env:DB_NAME;User Id=$env:DB_USER;Password=$env:DB_PASS;TrustServerCertificate=True;"

try {
    $connection = New-Object System.Data.SqlClient.SqlConnection
    $connection.ConnectionString = $connectionString
    $connection.Open()
    
    Write-Host "`nConexão estabelecida com sucesso!" -ForegroundColor Green
    
    foreach ($sqlCommand in $sqlCommands) {
        if ($sqlCommand.Trim() -ne "") {
            $command = New-Object System.Data.SqlClient.SqlCommand
            $command.Connection = $connection
            $command.CommandText = $sqlCommand
            
            try {
                $reader = $command.ExecuteReader()
                
                # Lê as mensagens PRINT
                while ($reader.Read()) {
                    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                        Write-Host $reader.GetValue($i) -ForegroundColor Yellow
                    }
                }
                $reader.Close()
            }
            catch {
                Write-Host "Erro ao executar comando: $_" -ForegroundColor Red
            }
        }
    }
    
    $connection.Close()
    Write-Host "`n==================================================" -ForegroundColor Cyan
    Write-Host "Tabelas criadas com sucesso!" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
}
catch {
    Write-Host "Erro na conexão: $_" -ForegroundColor Red
}
