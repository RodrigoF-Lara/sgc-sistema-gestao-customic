# Script para atualizar automaticamente a lista de imagens de fundo
# Executa: .\atualizar_fundos_menu.ps1

$pastaFundos = "img\fundo_menu_principal"
$arquivoJson = "$pastaFundos\index.json"

Write-Output "🎨 Atualizando lista de fundos do menu..."

# Buscar todas as imagens na pasta
$imagens = Get-ChildItem -Path $pastaFundos -File | 
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp)$' } |
    Select-Object -ExpandProperty Name |
    Sort-Object

if ($imagens.Count -eq 0) {
    Write-Warning "⚠️ Nenhuma imagem encontrada em $pastaFundos"
    exit 1
}

# Criar objeto JSON
$json = @{
    imagens = @($imagens)
} | ConvertTo-Json -Depth 10

# Salvar arquivo
$json | Out-File -FilePath $arquivoJson -Encoding UTF8 -Force

Write-Output "✓ Arquivo atualizado: $arquivoJson"
Write-Output "✓ Total de imagens: $($imagens.Count)"
Write-Output ""
Write-Output "Imagens encontradas:"
$imagens | ForEach-Object { Write-Output "  - $_" }
