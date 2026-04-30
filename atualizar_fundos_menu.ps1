# Script para atualizar automaticamente a lista de imagens de fundo
# Executa: .\atualizar_fundos_menu_v2.ps1

$pastaFundos = "img\fundo_menu_principal"
$arquivoIndex = "$pastaFundos\index.json"

Write-Output "Atualizando lista de fundos do menu..."

# Buscar todas as imagens na pasta
$imagens = Get-ChildItem -Path $pastaFundos -File | 
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp)$' } |
    Select-Object -ExpandProperty Name |
    Sort-Object

if ($imagens.Count -eq 0) {
    Write-Warning "Nenhuma imagem encontrada em $pastaFundos"
    exit 1
}

# Criar JSON com a lista de imagens
$jsonData = @{
    imagens = @($imagens)
} | ConvertTo-Json -Depth 3

# Salvar no index.json
$jsonData | Out-File -FilePath $arquivoIndex -Encoding UTF8 -NoNewline -Force

Write-Output "Arquivo atualizado: $arquivoIndex"
Write-Output "Total de imagens: $($imagens.Count)"
Write-Output ""
Write-Output "Imagens encontradas:"
$imagens | ForEach-Object { Write-Output "  - $_" }
Write-Output ""
Write-Output "Proximos passos:"
Write-Output "   git add $arquivoIndex"
Write-Output "   git commit -m 'chore: atualiza lista de fundos do menu'"
Write-Output "   git push"
