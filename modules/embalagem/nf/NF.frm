VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} NF 
   Caption         =   "LANÇAR NOTAS FISCAIS"
   ClientHeight    =   9588.001
   ClientLeft      =   120
   ClientTop       =   468
   ClientWidth     =   17760
   OleObjectBlob   =   "NF.frx":0000
   ShowModal       =   0   'False
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "NF"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Private Sub CB_ALTERAR_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant


    

If IsNull(NF.LB_LINHAS.List(NF.LB_LINHAS.ListIndex, 9)) Then

Else

StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
XX_ID_PROD = NF.LB_LINHAS.List(NF.LB_LINHAS.ListIndex, 9)
   
   If Rs.State = 1 Then Rs.Close
        STRRS = "SELECT B.DESCRICAO,A.* FROM [dbo].[NF_PRODUTOS]A INNER JOIN [dbo].[CAD_PROD]B ON A.PROD_COD_PROD=B.CODIGO where A.[PROD_ID_PROD]='" & XX_ID_PROD & "' "
        Rs.Open STRRS, Cn
    
 ALTERAR.ID_PROD = XX_ID_PROD
 ALTERAR.TXT_ID_NF = Rs("PROD_ID_NF")
 ALTERAR.TXT_COD_FORN1 = NF.TXT_COD_FORN1
 ALTERAR.TXT_NUM_NF1 = NF.TXT_NUM_NF1
 ALTERAR.LB_RAZAO1 = NF.LB_RAZAO1
 ALTERAR.TXT_COD_PROD = Rs("PROD_COD_PROD")
 ALTERAR.TXT_QNT_LINHA = Rs("PROD_QNT")
 ALTERAR.LB_DESC = Rs("DESCRICAO")
 ALTERAR.TXT_VALOR_UN_LINHA = Rs("PROD_VALOR_UNIT")
 ALTERAR.TXT_VALOR_TOTAL_LINHA = Rs("PROD_VALOR_TOTAL")
 ALTERAR.TXT_IPI_LINHA = Rs("PROD_IPI")
 ALTERAR.TXT_IPI_LINHA_UNIT = Rs("PROD_IPI_UNIT")
 ALTERAR.TXT_ICMS_LINHA = Rs("PROD_ICMS")
 ALTERAR.TXT_ICMS_LINHA_UNIT = Rs("PROD_ICMS_UNIT")
 ALTERAR.TXT_ST_LINHA = Rs("PROD_ST")
 ALTERAR.TXT_ST_LINHA_UNIT = Rs("PROD_ST_UNIT")
 ALTERAR.TXT_FRETE_LINHA = Rs("PROD_FRETE")
 ALTERAR.TXT_FRETE_LINHA_UNIT = Rs("PROD_FRETE_UNIT")
ALTERAR.TXT_IMPORT_LINHA = Rs("PROD_IMPORTACAO_UNIT") * Rs("PROD_QNT")
ALTERAR.TXT_IMPORT_LINHA_UNIT = Rs("PROD_IMPORTACAO_UNIT")
 ALTERAR.TXT_DESCONTO_LINHA = Rs("PROD_DESCONTO")
 ALTERAR.TXT_DESCONTO_LINHA_UNIT = Rs("PROD_DESCONTO_UNIT")
 ALTERAR.CB_FINALIDADE = Rs("PROD_FINALIDADE")
 ALTERAR.TXT_BC_ICMS_LINHA = Rs("PROD_BC_ICMS")
  ALTERAR.TXT_BC_ICMS_LINHA_UNIT = Rs("PROD_BC_ICMS_UNIT")
 
 COD = ALTERAR.TXT_COD_PROD
 
 'ATUALIZAR LIST SALDO
    
    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
    ALTERAR.TXT_SALDO = SALDO



ALTERAR.Show
End If

FIM:
End Sub

Private Sub CB_FINALIZAR_Click()
Call FINALIZAR_NF
End Sub

Private Sub CB_HJ_Click()
HJ = Date
NF.TXT_DT_EMISSAO = HJ
End Sub

Private Sub CB_HJJ_Click()
HJ = Date
NF.TXT_DT_RECEB = HJ

End Sub

Private Sub CB_INSERIR_Click()

Call INSERIR_PRODUTOS

Call INICIAR_PRODUTOS

End Sub

Private Sub CB_INSERIR_CUSTO_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant
Dim STR As String

StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   COD = NF.TXT_COD_PROD_CUSTOS
    
    CUSTO_CONTABIL = NF.TXT_CUSTO_CONTABIL
    If CUSTO_CONTABIL = "" Then
    CUSTO_CONTABIL = 0
    End If
    CUSTO_CONTABIL = Replace(CUSTO_CONTABIL, ",", ".")
    CUSTO_FISCAL = NF.TXT_CUSTO_FISCAL
    If CUSTO_FISCAL = "" Then
    CUSTO_FISCAL = 0
    End If
    CUSTO_FISCAL = Replace(CUSTO_FISCAL, ",", ".")
    CUSTO_PAGO = NF.TXT_CUSTO_PAGO
    If CUSTO_PAGO = "" Then
    CUSTO_PAGO = 0
    End If
    CUSTO_PAGO = Replace(CUSTO_PAGO, ",", ".")
    DTT = "2000-01-01"

If Rs.State = 1 Then Rs.Close
STR = "SELECT [PROD_ID_PROD] FROM [dbo].[NF_PRODUTOS] WHERE [PROD_COD_PROD]='" & COD & "' AND [PROD_DT_EMISSAO]='2000-01-01'"
Rs.Open STR, Cn

If Rs.EOF Then

If Rs.State = 1 Then Rs.Close
STR = "INSERT INTO [dbo].[NF_PRODUTOS] ([PROD_COD_PROD],[PROD_CUSTO_CONTABIL_MEDIO_NOVO],[PROD_CUSTO_CONTABIL],[PROD_CUSTO_FISCAL_MEDIO_NOVO],[PROD_CUSTO_FISCAL],[PROD_CUSTO_PAGO],[PROD_DT_EMISSAO])VALUES('" & COD & "'," & CUSTO_CONTABIL & "," & CUSTO_CONTABIL & "," & CUSTO_FISCAL & "," & CUSTO_FISCAL & "," & CUSTO_PAGO & ",'" & DTT & "')"
Rs.Open STR, Cn


Else
PROD_ID = Rs(0)
If Rs.State = 1 Then Rs.Close
STR = "UPDATE [dbo].[NF_PRODUTOS] SET [PROD_CUSTO_CONTABIL_MEDIO_NOVO]=" & CUSTO_CONTABIL & ",[PROD_CUSTO_CONTABIL]=" & CUSTO_CONTABIL & ",[PROD_CUSTO_FISCAL_MEDIO_NOVO]=" & CUSTO_FISCAL & ",[PROD_CUSTO_FISCAL]=" & CUSTO_FISCAL & ",[PROD_CUSTO_PAGO]=" & CUSTO_PAGO & ",[PROD_DT_EMISSAO]='" & DTT & "' WHERE [PROD_ID_PROD]=" & PROD_ID
Rs.Open STR, Cn
End If
MsgBox "PRIMEIRO CUSTO INSERIDO COM SUCESSO!", vbInformation, "CUSTOMIC"

If TXT_COD_PROD_CUSTOS = "" Then
Else

   
   COD = NF.TXT_COD_PROD_CUSTOS
    NF.LB_DESC_CUSTOS = ""
    NF.TXT_CUSTO_CONTABIL = ""
    NF.TXT_CUSTO_FISCAL = ""
    NF.TXT_CUSTO_PAGO = ""
    NF.TXT_SALDO_ATUAL = ""
    NF.LB_CUSTOS.Clear
   
If Rs.State = 1 Then Rs.Close
STR = "SELECT [DESCRICAO] FROM [dbo].[CAD_PROD] WHERE [CODIGO]='" & COD & "'"
Rs.Open STR, Cn

If Rs.EOF Then
PAI.Show
Else
NF.LB_DESC_CUSTOS = Rs(0)
End If

'ATUALIZAR LIST SALDO
    
    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
    NF.TXT_SALDO_ATUAL = SALDO
    
'INICIO SELECT CUSTOS

 If Rs.State = 1 Then Rs.Close
STRRS = "SELECT TOP(1) [PROD_CUSTO_CONTABIL_MEDIO_NOVO],[PROD_CUSTO_FISCAL_MEDIO_NOVO],[PROD_CUSTO_PAGO] FROM [dbo].[NF_PRODUTOS] WHERE [PROD_COD_PROD]='" & COD & "' ORDER BY [PROD_DT_EMISSAO] DESC"
 Rs.Open STRRS, Cn
 
 If Rs.EOF Then
 GoTo FIM
 Else
 
    If IsNull(Rs("PROD_CUSTO_CONTABIL_MEDIO_NOVO")) Then
    Else
    NF.TXT_CUSTO_CONTABIL = Rs("PROD_CUSTO_CONTABIL_MEDIO_NOVO")
    End If
    
    If IsNull(Rs("PROD_CUSTO_FISCAL_MEDIO_NOVO")) Then
    Else
    NF.TXT_CUSTO_FISCAL = Rs("PROD_CUSTO_FISCAL_MEDIO_NOVO")
    End If
    
    If IsNull(Rs("PROD_CUSTO_PAGO")) Then
    Else
    NF.TXT_CUSTO_PAGO = Rs("PROD_CUSTO_PAGO")
    End If
 
  If Rs.State = 1 Then Rs.Close
STRRS = "SELECT A.[PROD_CUSTO_CONTABIL],A.[PROD_CUSTO_FISCAL],A.[PROD_CUSTO_PAGO],A.[PROD_DT_EMISSAO],B.[CAB_NUM_NF] FROM [dbo].[NF_PRODUTOS]A LEFT JOIN [dbo].[NF_CABECALHO]B ON A.[PROD_ID_NF]=B.[CAB_ID_NF] WHERE A.[PROD_COD_PROD]='" & COD & "' ORDER BY A.[PROD_DT_EMISSAO] DESC"
 Rs.Open STRRS, Cn
 
 If Rs.EOF Then
 GoTo FIM
 Else
 
     dbvetor = Rs.GetRows

    numero_de_colunas = UBound(dbvetor, 1)
    numero_de_registros = UBound(dbvetor, 2)
    
   NF.LB_CUSTOS.Clear
    NF.LB_CUSTOS.ColumnCount = 10
    NF.LB_CUSTOS.ColumnWidths = "60;60;60"
    
    With NF.LB_CUSTOS
    .AddItem
    .List(contador, 0) = "CONTABIL NF"
    .List(contador, 1) = "FISCAL NF"
    .List(contador, 2) = "PAGO NF"
    .List(contador, 3) = "EMISSAO"
    .List(contador, 4) = "SALDO NA DT"
    .List(contador, 5) = "NF"
   ' .List(contador, 4) = "IPI"
   ' .List(contador, 5) = "ICMS"
   ' .List(contador, 6) = "ST"
   ' .List(contador, 7) = "SALDO ATUAL"
   ' .List(contador, 8) = "CUSTO"
    End With
    
    
     With NF.LB_CUSTOS
    For contador = 0 To numero_de_registros
    .AddItem
    If IsNull(dbvetor(0, contadoor)) Then
    Else
    .List(contador + 1, 0) = dbvetor(0, contador)
    End If
    If IsNull(dbvetor(1, contador)) Then
    Else
    .List(contador + 1, 1) = dbvetor(1, contador)
    End If
    If IsNull(dbvetor(2, contador)) Then
    Else
    .List(contador + 1, 2) = dbvetor(2, contador)
    End If
    If IsNull(dbvetor(3, contador)) Then
    Else
    .List(contador + 1, 3) = dbvetor(3, contador)
    End If
    If IsNull(dbvetor(4, contador)) Then
    Else
    .List(contador + 1, 5) = dbvetor(4, contador)
    End If
    
 'INICIO SALDO NA DATA
 
DT_POSICAO1 = dbvetor(3, contador)
DT_POSICAO1 = Year(DT_POSICAO1) & "-" & Month(DT_POSICAO1) & "-" & Day(DT_POSICAO1)
'POSICAO.LB_DT_EM.Caption = POSICAO.DT_POSICAO


    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' AND DT <= '" & DT_POSICAO1 & "' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA' AND DT <= '" & DT_POSICAO1 & "'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
     If IsNull(SALDO) Then
    Else
    .List(contador + 1, 4) = SALDO
    End If
    'POSICAO.LB_SALDO.Caption = SALDO
'FIM ATUALIZAR LIST SALDO



    Next
    End With
 
 End If
 End If
 End If
 
FIM:
'FIM SELECT CUSTOS


End Sub

Private Sub CB_LANÇAR_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant
Dim STR As String

StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn

If NF.CB_TIPO = "" Then
MsgBox "PREENCHA O TIPO DE FORNECEDOR PRIMEIRO!", vbCritical, "CUSTOMIC"
GoTo FIM
End If

If NF.CB_TIPO = "SIMPLES NACIONAL" Then
    If NF.TXT_ALIQUOTA = "" Then
        MsgBox "PREENCHA O % DE ALIQUOTA PRIMEIRO!", vbCritical, "CUSTOMIC"
        GoTo FIM
    End If
End If

XX_CB_TIPO = NF.CB_TIPO
XX_TXT_COD_FORN = NF.TXT_COD_FORN
XX_TXT_NUM_NF = NF.TXT_NUM_NF
If NF.TXT_QNT_ITENS_NF = "" Then
XX_TXT_QNT_ITENS_NF = 0
Else
XX_TXT_QNT_ITENS_NF = NF.TXT_QNT_ITENS_NF
End If
XX_TXT_PC_NF = NF.TXT_PC_NF
XX_LB_FORN = NF.LB_FORN.Caption
If NF.TXT_DT_EMISSAO = "" Then
XX_TXT_DT_EMISSAO = ""
Else
XX_TXT_DT_EMISSAO = Year(NF.TXT_DT_EMISSAO) & "-" & Month(NF.TXT_DT_EMISSAO) & "-" & Day(NF.TXT_DT_EMISSAO)
End If
If NF.TXT_DT_RECEB = "" Then
XX_TXT_DT_RECEB = " "
Else
XX_TXT_DT_RECEB = Year(NF.TXT_DT_RECEB) & "-" & Month(NF.TXT_DT_RECEB) & "-" & Day(NF.TXT_DT_RECEB)
End If
XX_DT_DIGITACAO = Year(Date) & "-" & Month(Date) & "-" & Day(Date)
XX_HR_DIGITACAO = Time
XX_ALIQUOTA = NF.TXT_ALIQUOTA

'ICMS
    If NF.TXT_ICMS_NF = "" Then
    XX_TXT_ICMS_NF = 0
    Else
    XX_TXT_ICMS_NF = Replace(NF.TXT_ICMS_NF, ".", "")
    XX_TXT_ICMS_NF = Replace(XX_TXT_ICMS_NF, ",", ".")
    End If

'ST
If NF.TXT_ST_NF = "" Then
XX_TXT_ST_NF = 0
Else
XX_TXT_ST_NF = Replace(NF.TXT_ST_NF, ".", "")
XX_TXT_ST_NF = Replace(XX_TXT_ST_NF, ",", ".")
End If

'FRETE
    If NF.TXT_FRETE_NF = "" Then
    XX_TXT_FRETE_NF = 0
    Else
    XX_TXT_FRETE_NF = Replace(NF.TXT_FRETE_NF, ".", "")
    XX_TXT_FRETE_NF = Replace(XX_TXT_FRETE_NF, ",", ".")
    End If
    
'DESCONTO
If NF.TXT_DESCONTO_NF = "" Then
XX_TXT_DESCONTO_NF = 0
Else
XX_TXT_DESCONTO_NF = Replace(NF.TXT_DESCONTO_NF, ".", "")
XX_TXT_DESCONTO_NF = Replace(XX_TXT_DESCONTO_NF, ",", ".")
End If

'IPI
If NF.TXT_IPI_NF = "" Then
XX_TXT_IPI_NF = 0
Else
XX_TXT_IPI_NF = Replace(NF.TXT_IPI_NF, ".", "")
XX_TXT_IPI_NF = Replace(XX_TXT_IPI_NF, ",", ".")
End If

'VALOR PRODUTOS
    If NF.TXT_VALOR_TOTAL_PROD = "" Then
    XX_VALOR_PROD = 0
    Else
    XX_VALOR_PROD = Replace(NF.TXT_VALOR_TOTAL_PROD, ".", "")
    XX_VALOR_PROD = Replace(XX_VALOR_PROD, ",", ".")
    End If
    
'VALOR TOTAL
If NF.TXT_VALOR_TOTAL_NF = "" Then
XX_VALOR_TT_NF = 0
Else
XX_VALOR_TT_NF = Replace(NF.TXT_VALOR_TOTAL_NF, ".", "")
XX_VALOR_TT_NF = Replace(XX_VALOR_TT_NF, ",", ".")
End If


'IMPORTACAO
If CB_TIPO = "IMPORTAÇÃO" Then
XX_IMPORT = 1000
Else
XX_IMPORT = 0
End If

'BC_ICMS
If NF.TXT_BC_ICMS_NF = "" Then
XX_BC_ICMS_TT_NF = 0
Else
XX_BC_ICMS_TT_NF = Replace(NF.TXT_BC_ICMS_NF, ".", "")
XX_BC_ICMS_TT_NF = Replace(XX_BC_ICMS_TT_NF, ",", ".")
End If

'ALIQUOTA
If NF.TXT_ALIQUOTA = "" Then
XX_ALIQUOTA = 0
Else
XX_ALIQUOTA = Replace(NF.TXT_ALIQUOTA, ".", "")
XX_ALIQUOTA = Replace(XX_ALIQUOTA, ",", ".")
End If


'USUARIO
XX_USUARIO = NF.TEXT_NOME.Caption
XX_LB_ID = NF.LB_ID.Caption


XX_CONC = "'" & XX_TXT_COD_FORN & "','" & XX_TXT_NUM_NF & "'," & XX_TXT_QNT_ITENS_NF & ",'" & XX_TXT_PC_NF & "','" & XX_LB_FORN & "','" & XX_TXT_DT_EMISSAO & "'"
XX_CONC1 = XX_CONC & ",'" & XX_TXT_DT_RECEB & "','" & XX_DT_DIGITACAO & "'," & XX_TXT_ICMS_NF & "," & XX_TXT_ST_NF & "," & XX_TXT_FRETE_NF & "," & XX_TXT_DESCONTO_NF & "," & XX_TXT_IPI_NF & "," & XX_VALOR_PROD & "," & XX_VALOR_TT_NF & ",'" & XX_USUARIO & "','" & XX_HR_DIGITACAO & "','" & XX_CB_TIPO & "'," & XX_IMPORT & "," & XX_BC_ICMS_TT_NF & "," & XX_ALIQUOTA




If Rs.State = 1 Then Rs.Close
STR = "SELECT CAB_ID_NF FROM [dbo].[NF_CABECALHO] WHERE [CAB_NUM_FORN]='" & XX_TXT_COD_FORN & "' AND [CAB_NUM_NF]='" & XX_TXT_NUM_NF & "'"
Rs.Open STR, Cn

If Rs.EOF Then
       
       NF.TXT_NUM_NF.Locked = False
       NF.TXT_QNT_ITENS_NF.Locked = True
       NF.TXT_PC_NF.Locked = True
       NF.TXT_DT_EMISSAO.Locked = True
       NF.TXT_DT_RECEB.Locked = True
       NF.CB_HJ.Locked = True
       NF.CB_TIPO.Locked = True
       NF.CB_HJJ.Locked = True
       NF.TXT_ICMS_NF.Locked = True
       NF.TXT_ST_NF.Locked = True
       NF.TXT_FRETE_NF.Locked = True
       NF.TXT_DESCONTO_NF.Locked = True
       NF.TXT_IPI_NF.Locked = True
       NF.TXT_VALOR_TOTAL_PROD.Locked = True
       NF.TXT_VALOR_TOTAL_NF.Locked = True
       NF.TXT_BC_ICMS_NF.Locked = True
       NF.TXT_ALIQUOTA.Locked = True
     
       
       
       NF.TXT_NUM_NF.BackColor = &HC0C0C0
       NF.TXT_QNT_ITENS_NF.BackColor = &HC0C0C0
       NF.TXT_PC_NF.BackColor = &HC0C0C0
       NF.TXT_DT_EMISSAO.BackColor = &HC0C0C0
       NF.TXT_DT_RECEB.BackColor = &HC0C0C0
       NF.CB_TIPO.BackColor = &HC0C0C0
       NF.TXT_ICMS_NF.BackColor = &HC0C0C0
       NF.TXT_ST_NF.BackColor = &HC0C0C0
       NF.TXT_FRETE_NF.BackColor = &HC0C0C0
       NF.TXT_DESCONTO_NF.BackColor = &HC0C0C0
       NF.TXT_IPI_NF.BackColor = &HC0C0C0
       NF.TXT_VALOR_TOTAL_PROD.BackColor = &HC0C0C0
       NF.TXT_VALOR_TOTAL_NF.BackColor = &HC0C0C0
       NF.TXT_BC_ICMS_NF.BackColor = &HC0C0C0
       NF.TXT_ALIQUOTA.BackColor = &HC0C0C0
       
       
       If Rs.State = 1 Then Rs.Close
       STR = "INSERT INTO [dbo].[NF_CABECALHO] ([CAB_NUM_FORN],[CAB_NUM_NF],[CAB_QNT_TOTAL_ITENS],[CAB_PC],[CAB_RAZAO],[CAB_DT_EMISSAO],[CAB_DT_RECEB],[CAB_DT_DIGITACAO],[CAB_ICMS],[CAB_ST],[CAB_FRETE],[CAB_DESCONTO],[CAB_IPI],[CAB_VALOR_PROD],[CAB_VALOR_TT_NF],[CAB_USUARIO],[CAB_HR_DIGITACAO],[CAB_TP_FORN],[CAB_IMPORTACAO],[CAB_BC_ICMS],[CAB_ALIQUOTA]) VALUES(" & XX_CONC1 & ")"
        Rs.Open STR, Cn

        If Rs.State = 1 Then Rs.Close
        STR = "SELECT CAB_ID_NF FROM [dbo].[NF_CABECALHO] WHERE [CAB_NUM_FORN]='" & XX_TXT_COD_FORN & "' AND [CAB_NUM_NF]='" & XX_TXT_NUM_NF & "'"
        Rs.Open STR, Cn
        
        

       
        If MsgBox("NF LANÇADA COM SUCESSO! DESEJA LANÇAR OS PRODUTOS DESSA NF AGORA?", vbYesNo, "Confirmação") = vbYes Then
       ' NF.TXT_ID_NF
        NF.TXT_NUM_NF1 = NF.TXT_NUM_NF
        NF.TXT_COD_FORN1 = NF.TXT_COD_FORN
        NF.LB_RAZAO1 = NF.LB_FORN
        NF.TXT_ID_NF = Rs(0)
        NF.LB_ID.Caption = Rs(0)
         MultiPage1.Pages(1).Enabled = True
        MultiPage1.Value = 1
        End If
        
        
Else
NF.TXT_NUM_NF1 = NF.TXT_NUM_NF
        NF.TXT_COD_FORN1 = NF.TXT_COD_FORN
        NF.LB_RAZAO1 = NF.LB_FORN
        NF.TXT_ID_NF = Rs(0)
         MultiPage1.Pages(1).Enabled = True
        MultiPage1.Value = 1
End If
 

MultiPage1.Pages(2).Enabled = True
FIM:
End Sub

Private Sub CB_REMOVER_Click()
REMOVER
End Sub

Private Sub CommandButton1_Click()

End Sub

Private Sub CB_TIPO_AfterUpdate()

If NF.CB_TIPO = "SIMPLES NACIONAL" Then
 NF.TXT_ALIQUOTA.Enabled = True
 NF.TXT_ALIQUOTA.BackColor = &H80000005
Else
 NF.TXT_ALIQUOTA.Enabled = False
 NF.TXT_ALIQUOTA.BackColor = &HC0C0C0
End If

End Sub


Private Sub CommandButton12_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_IPI_NF = "" Then
X = 0
Else
X = NF.TXT_IPI_NF
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_IPI]=" & X & "  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "IPI ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton13_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_VALOR_TOTAL_NF = "" Then
X = 0
Else
X = NF.TXT_VALOR_TOTAL_NF
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_VALOR_TT_NF]=" & X & "  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "VALOR TOTAL DA NF ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton14_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_FRETE_NF = "" Then
X = 0
Else
X = NF.TXT_FRETE_NF
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_FRETE]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "DESCONTO ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton15_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_ST_NF = "" Then
X = 0
Else
X = NF.TXT_ST_NF
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_ST]=" & X & "  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "ST ATUALIZADA!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton16_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_FRETE_NF = "" Then
X = 0
Else
X = NF.TXT_FRETE_NF
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_FRETE]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "FRETE ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton17_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_ICMS_NF = "" Then
X = 0
Else
X = NF.TXT_ICMS_NF
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_ICMS]=" & X & " where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "ICMS ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton18_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
If MsgBox("DESEJA REALMENTE EXCLUIR A NOTA " & NUM_NF & " E TODOS SEUS PRODUTOS?", vbYesNo, "Confirmação") = vbYes Then

StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
 If Rs.State = 1 Then Rs.Close
        STRRS = "DELETE [dbo].[NF_CABECALHO] WHERE [CAB_ID_NF]=" & ID
        Rs.Open STRRS, Cn
        
If Rs.State = 1 Then Rs.Close
        STRRS = "DELETE [dbo].[NF_PRODUTOS] WHERE [PROD_ID_NF]=" & ID
        Rs.Open STRRS, Cn

MsgBox "NF " & NUM_NF & " EXCLUÍDA COM SUCESSO!", vbInformation, "CUSTOMIC"

      NF.TXT_COD_FORN = ""
       NF.TXT_NUM_NF = ""
       TXT_NUM_NF.Clear
       NF.TXT_QNT_ITENS_NF = ""
       NF.LB_FORN.Caption = ""
       NF.TXT_PC_NF = ""
       NF.TXT_DT_EMISSAO = ""
       NF.TXT_DT_RECEB = ""
       NF.TXT_ICMS_NF = ""
       NF.TXT_ST_NF = ""
       NF.TXT_FRETE_NF = ""
       NF.TXT_DESCONTO_NF = ""
       NF.TXT_IPI_NF = ""
       NF.TXT_VALOR_TOTAL_PROD = ""
       NF.TXT_VALOR_TOTAL_NF = ""
       NF.TXT_BC_ICMS_NF = ""
       NF.CB_TIPO = ""
       NF.LB_ID.Caption = ""
       
       NF.CB_TIPO.BackColor = &H80000005
       
       NF.MultiPage1.Pages(1).Enabled = False
       NF.TXT_ID_NF = ""
       NF.TXT_COD_FORN1 = ""
       NF.TXT_NUM_NF1 = ""
       

End If
End If
        
End Sub

Private Sub CommandButton2_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
If NF.TXT_QNT_ITENS_NF = "" Then
X = 0
Else
X = NF.TXT_QNT_ITENS_NF * 1
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_QNT_TOTAL_ITENS]=" & X & "  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "QUANTIDADE ATUALIZADA!", vbInformation, "CUSTOMIC"
End If

End Sub

Private Sub CommandButton19_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
If NF.TXT_ALIQUOTA = "" Then
X = 0
Else
X = NF.TXT_ALIQUOTA
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_ALIQUOTA]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "ALIQUOTA ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton20_Click()
PESQ_FORN.Show
End Sub

Private Sub CommandButton21_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

NUM_NF = NF.TXT_PESQ_NF
NF.LIST_PESQ_NF.Clear
NF.LIST_PESQ_NF.ColumnCount = 7
NF.LIST_PESQ_NF.ColumnWidths = "30;50;80;50;60;90"

If NUM_NF = "" Then
Else

With NF.LIST_PESQ_NF
.AddItem
.List(0, 0) = "ID"
.List(0, 1) = "NUM_FORN"
.List(0, 2) = "RAZAO"
.List(0, 3) = "DIGITAÇÃO"
.List(0, 4) = "VALOR TT"
.List(0, 5) = "TP FORN"
.List(0, 6) = "STATUS"
End With
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn

        If Rs.State = 1 Then Rs.Close
        STRRS = "SELECT [CAB_ID_NF],[CAB_NUM_FORN],[CAB_DT_DIGITACAO],[CAB_VALOR_TT_NF],[CAB_TP_FORN],[CAB_STATUS] FROM [dbo].[NF_CABECALHO] where [CAB_NUM_NF]='" & NUM_NF & "'"
        Rs.Open STRRS, Cn
        
        If Rs.EOF Then
        Else
        dbvetor = Rs.GetRows

            numero_de_colunas = UBound(dbvetor, 1)
            numero_de_registros = UBound(dbvetor, 2)
    
    With NF.LIST_PESQ_NF
     
        For contador = 0 To numero_de_registros
        .AddItem
            If IsNull(dbvetor(0, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 0) = dbvetor(0, contador)
            End If
            
            If IsNull(dbvetor(1, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 1) = dbvetor(1, contador)
            End If
            
            
            If Rs.State = 1 Then Rs.Close
            STRRS = "SELECT [RAZAO_SOCIAL] FROM [dbo].[CAD_FORNECEDOR] where [COD_FORNECEDOR]='" & dbvetor(1, contador) & "'"
            Rs.Open STRRS, Cn
            If Rs.EOF Then
            Else
            
            If IsNull(Rs(0)) Then
            Else
            .AddItem
            .List(contador + 1, 2) = RTrim(Rs(0))
            End If
            End If
            
            If IsNull(dbvetor(2, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 3) = dbvetor(2, contador)
            End If
            
            If IsNull(dbvetor(3, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 4) = dbvetor(3, contador)
            End If
            
            If IsNull(dbvetor(4, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 5) = dbvetor(4, contador)
            End If
            
             If IsNull(dbvetor(5, contador)) Then
            Else
            .AddItem
            .List(contador + 1, 6) = dbvetor(5, contador)
            End If
            
            
         Next
    End With
        
        End If
        
End If


End Sub

Private Sub CommandButton3_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
If NF.TXT_PC_NF = "" Then
X = 0
Else
X = NF.TXT_PC_NF
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_PC]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "PEDIDO DE COMPRAS ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton4_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
If NF.TXT_DT_RECEB = "" Then
X = 0
Else
X = NF.TXT_DT_RECEB
X = Year(X) & "-" & Month(X) & "-" & Day(X)
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_DT_RECEB]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "DATA DE RECEBIMENTO ATUALIZADA!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton5_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
If NF.TXT_DT_EMISSAO = "" Then
X = 0
Else
X = NF.TXT_DT_EMISSAO
X = Year(X) & "-" & Month(X) & "-" & Day(X)
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_DT_EMISSAO]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "DATA DE EMISSAO ATUALIZADA!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton6_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.CB_TIPO = "" Then
X = 0
Else
X = NF.CB_TIPO
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_TP_FORN]='" & X & "'  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "TIPO ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton8_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_BC_ICMS_NF = "" Then
X = 0
Else
X = NF.TXT_BC_ICMS_NF
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_BC_ICMS]='" & X &   where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "BC ATUALIZADA!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub CommandButton9_Click()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset

ID = NF.LB_ID
COD_FORN = NF.TXT_COD_FORN
NUM_NF = NF.TXT_NUM_NF

If ID = "" Or COD_FORN = "" Or NUM_NF = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   
If NF.TXT_VALOR_TOTAL_PROD = "" Then
X = 0
Else
X = NF.TXT_VALOR_TOTAL_PROD
X = Replace(Round(X, 4), ",", ".")
End If
 If Rs.State = 1 Then Rs.Close
        STRRS = "UPDATE [dbo].[NF_CABECALHO] SET [CAB_VALOR_PROD]=" & X & "  where [CAB_ID_NF]='" & ID & "'"
        Rs.Open STRRS, Cn

MsgBox "VALOR TOTAL DOS PRODUTOS ATUALIZADO!", vbInformation, "CUSTOMIC"
End If
End Sub

Private Sub Label34_Click()
HELP_IPI.Show
End Sub





Private Sub LB_CUSTOS_Click()

End Sub

Private Sub MultiPage1_Change()

End Sub

Private Sub TXT_BC_ICMS_LINHA_AfterUpdate()
NF.TXT_BC_ICMS_LINHA_UNIT = Round(NF.TXT_BC_ICMS_LINHA / NF.TXT_QNT_LINHA, 2)
End Sub


Private Sub TXT_COD_FORN_AfterUpdate()
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant

       NF.TXT_NUM_NF.Locked = False
      
       NF.TXT_QNT_ITENS_NF.Locked = True
       NF.TXT_PC_NF.Locked = True
       NF.TXT_DT_EMISSAO.Locked = True
       NF.TXT_DT_RECEB.Locked = True
       NF.CB_HJ.Locked = True
       NF.CB_HJJ.Locked = True
       NF.TXT_ICMS_NF.Locked = True
       NF.TXT_ST_NF.Locked = True
       NF.TXT_FRETE_NF.Locked = True
       NF.TXT_DESCONTO_NF.Locked = True
       NF.TXT_IPI_NF.Locked = True
       NF.TXT_VALOR_TOTAL_PROD.Locked = True
       NF.TXT_VALOR_TOTAL_NF.Locked = True
       
       
       NF.TXT_NUM_NF.BackColor = &HC0C0C0
       NF.TXT_QNT_ITENS_NF.BackColor = &HC0C0C0
       NF.TXT_PC_NF.BackColor = &HC0C0C0
       NF.TXT_DT_EMISSAO.BackColor = &HC0C0C0
       NF.TXT_DT_RECEB.BackColor = &HC0C0C0
       NF.TXT_ICMS_NF.BackColor = &HC0C0C0
       NF.TXT_ST_NF.BackColor = &HC0C0C0
       NF.TXT_FRETE_NF.BackColor = &HC0C0C0
       NF.TXT_DESCONTO_NF.BackColor = &HC0C0C0
       NF.TXT_IPI_NF.BackColor = &HC0C0C0
       NF.TXT_VALOR_TOTAL_PROD.BackColor = &HC0C0C0
       NF.TXT_VALOR_TOTAL_NF.BackColor = &HC0C0C0

   
       NF.TXT_NUM_NF = ""
       NF.TXT_QNT_ITENS_NF = ""
       NF.LB_FORN.Caption = ""
       NF.TXT_PC_NF = ""
       NF.TXT_DT_EMISSAO = ""
       NF.TXT_DT_RECEB = ""
       NF.TXT_ICMS_NF = ""
       NF.TXT_ST_NF = ""
       NF.TXT_FRETE_NF = ""
       NF.TXT_DESCONTO_NF = ""
       NF.TXT_IPI_NF = ""
       NF.TXT_VALOR_TOTAL_PROD = ""
       NF.TXT_VALOR_TOTAL_NF = ""
    
    
    
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn


COD = NF.TXT_COD_FORN

If IsNumeric(COD) = False Then
Else
If NF.TXT_COD_FORN <> "" Then

        If Rs.State = 1 Then Rs.Close
        STRRS = "SELECT * FROM [dbo].[CAD_FORNECEDOR] where [COD_FORNECEDOR]='" & COD & "'"
        Rs.Open STRRS, Cn
        
        If Rs.EOF Then
        MsgBox "CÓDIGO DE FORNECEDOR NAO CADASTRADO!", vbCritical, "CUSTOMIC"
        GoTo FIM
        Else
'LISTA DAS NF'S

     '   NF.LB_FORN.Caption = Trim(Rs("RAZAO_SOCIAL"))
     '   FORNECEDOR.LB_FORNECEDOR = Trim(Rs("RAZAO_SOCIAL"))
     '   FORNECEDOR.Show
        
        TXT_NUM_NF.Clear
         If Rs.State = 1 Then Rs.Close
        STRRS = "SELECT [CAB_NUM_NF] FROM [dbo].[NF_CABECALHO] where [CAB_NUM_FORN]='" & COD & "' ORDER BY CAB_NUM_NF DESC"
        Rs.Open STRRS, Cn
        
        If Rs.EOF Then
        Else
         dbvetor = Rs.GetRows

            numero_de_colunas = UBound(dbvetor, 1)
            numero_de_registros = UBound(dbvetor, 2)
    
             
    With NF.TXT_NUM_NF
    For contador = 0 To numero_de_registros
    .AddItem
    If IsNull(dbvetor(0, contador)) Then
    Else
    .List(contador, 0) = dbvetor(0, contador)
    End If
    Next
    End With
        End If
     End If
    NF.TXT_NUM_NF.Locked = False
   

    NF.TXT_NUM_NF.BackColor = &H80000005
  
    
Else
FIM:
       NF.TXT_NUM_NF.Locked = flase

       NF.TXT_QNT_ITENS_NF.Locked = True
       NF.TXT_PC_NF.Locked = True
       NF.TXT_DT_EMISSAO.Locked = True
       NF.TXT_DT_RECEB.Locked = True
       NF.CB_HJ.Locked = True
       NF.CB_HJJ.Locked = True
       
       NF.TXT_NUM_NF.BackColor = &HC0C0C0
       NF.TXT_QNT_ITENS_NF.BackColor = &HC0C0C0
       NF.TXT_PC_NF.BackColor = &HC0C0C0
       NF.TXT_DT_EMISSAO.BackColor = &HC0C0C0
       NF.TXT_DT_RECEB.BackColor = &HC0C0C0

   
    NF.TXT_NUM_NF = ""
    NF.TXT_QNT_ITENS_NF = ""
    NF.LB_FORN.Caption = ""
    NF.TXT_PC_NF = ""
    NF.TXT_DT_EMISSAO = ""
    NF.TXT_DT_RECEB = ""
    
End If
End If
End Sub

Private Sub TXT_COD_PROD_CUSTOS_Exit(ByVal Cancel As MSForms.ReturnBoolean)
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant
Dim STR As String

If TXT_COD_PROD_CUSTOS = "" Then
Else
StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   COD = NF.TXT_COD_PROD_CUSTOS
    NF.LB_DESC_CUSTOS = ""
    NF.TXT_CUSTO_CONTABIL = ""
    NF.TXT_CUSTO_FISCAL = ""
    NF.TXT_CUSTO_PAGO = ""
    NF.TXT_SALDO_ATUAL = ""
    NF.LB_CUSTOS.Clear
   
If Rs.State = 1 Then Rs.Close
STR = "SELECT [DESCRICAO] FROM [dbo].[CAD_PROD] WHERE [CODIGO]='" & COD & "'"
Rs.Open STR, Cn

If Rs.EOF Then
PAI.Show
Else
NF.LB_DESC_CUSTOS = Rs(0)
End If

'ATUALIZAR LIST SALDO
    
    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
    NF.TXT_SALDO_ATUAL = SALDO
    
'INICIO SELECT CUSTOS

 If Rs.State = 1 Then Rs.Close
STRRS = "SELECT TOP(1) [PROD_CUSTO_CONTABIL_MEDIO_NOVO],[PROD_CUSTO_FISCAL_MEDIO_NOVO],[PROD_CUSTO_PAGO] FROM [dbo].[NF_PRODUTOS] WHERE [PROD_COD_PROD]='" & COD & "' ORDER BY [PROD_DT_EMISSAO] DESC"
 Rs.Open STRRS, Cn
 
 If Rs.EOF Then
 GoTo FIM
 Else
 
    If IsNull(Rs("PROD_CUSTO_CONTABIL_MEDIO_NOVO")) Then
    Else
    NF.TXT_CUSTO_CONTABIL = Rs("PROD_CUSTO_CONTABIL_MEDIO_NOVO")
    End If
    
    If IsNull(Rs("PROD_CUSTO_FISCAL_MEDIO_NOVO")) Then
    Else
    NF.TXT_CUSTO_FISCAL = Rs("PROD_CUSTO_FISCAL_MEDIO_NOVO")
    End If
    
    If IsNull(Rs("PROD_CUSTO_PAGO")) Then
    Else
    NF.TXT_CUSTO_PAGO = Rs("PROD_CUSTO_PAGO")
    End If
 
  If Rs.State = 1 Then Rs.Close
STRRS = "SELECT A.[PROD_CUSTO_CONTABIL],A.[PROD_CUSTO_FISCAL],A.[PROD_CUSTO_PAGO],A.[PROD_DT_EMISSAO],B.[CAB_NUM_NF] FROM [dbo].[NF_PRODUTOS]A LEFT JOIN [dbo].[NF_CABECALHO]B ON A.[PROD_ID_NF]=B.[CAB_ID_NF] WHERE A.[PROD_COD_PROD]='" & COD & "' ORDER BY A.[PROD_DT_EMISSAO] DESC"
 Rs.Open STRRS, Cn
 
 If Rs.EOF Then
 GoTo FIM
 Else
 
     dbvetor = Rs.GetRows

    numero_de_colunas = UBound(dbvetor, 1)
    numero_de_registros = UBound(dbvetor, 2)
    
   NF.LB_CUSTOS.Clear
    NF.LB_CUSTOS.ColumnCount = 10
    NF.LB_CUSTOS.ColumnWidths = "60;60;60"
    
    With NF.LB_CUSTOS
    .AddItem
    .List(contador, 0) = "CONTABIL NF"
    .List(contador, 1) = "FISCAL NF"
    .List(contador, 2) = "PAGO NF"
    .List(contador, 3) = "EMISSAO"
    .List(contador, 4) = "SALDO NA DT"
    .List(contador, 5) = "NF"
   ' .List(contador, 4) = "IPI"
   ' .List(contador, 5) = "ICMS"
   ' .List(contador, 6) = "ST"
   ' .List(contador, 7) = "SALDO ATUAL"
   ' .List(contador, 8) = "CUSTO"
    End With
    
    
     With NF.LB_CUSTOS
    For contador = 0 To numero_de_registros
    .AddItem
    If IsNull(dbvetor(0, contadoor)) Then
    Else
    .List(contador + 1, 0) = dbvetor(0, contador)
    End If
    If IsNull(dbvetor(1, contador)) Then
    Else
    .List(contador + 1, 1) = dbvetor(1, contador)
    End If
    If IsNull(dbvetor(2, contador)) Then
    Else
    .List(contador + 1, 2) = dbvetor(2, contador)
    End If
    If IsNull(dbvetor(3, contador)) Then
    Else
    .List(contador + 1, 3) = dbvetor(3, contador)
    End If
    If IsNull(dbvetor(4, contador)) Then
    Else
    .List(contador + 1, 5) = dbvetor(4, contador)
    End If
    
 'INICIO SALDO NA DATA
 
DT_POSICAO1 = dbvetor(3, contador)
DT_POSICAO1 = Year(DT_POSICAO1) & "-" & Month(DT_POSICAO1) & "-" & Day(DT_POSICAO1)
'POSICAO.LB_DT_EM.Caption = POSICAO.DT_POSICAO


    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' AND DT <= '" & DT_POSICAO1 & "' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA' AND DT <= '" & DT_POSICAO1 & "'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
     If IsNull(SALDO) Then
    Else
    .List(contador + 1, 4) = SALDO
    End If
    'POSICAO.LB_SALDO.Caption = SALDO
'FIM ATUALIZAR LIST SALDO



    Next
    End With
 
 End If
 End If
 End If
 
FIM:
'FIM SELECT CUSTOS
End Sub

Private Sub TXT_COD_PROD_Exit(ByVal Cancel As MSForms.ReturnBoolean)
Dim Cn As New ADODB.Connection
Dim Rs As New ADODB.Recordset
Dim dbvetor As Variant
Dim STR As String

If NF.TXT_COD_PROD = "" Then
Else

StrCn = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:producao2.database.windows.net,1433;Database=KARDEX;Uid=sa1;Pwd=customic23*;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
   Cn.Open StrCn
   
   COD = NF.TXT_COD_PROD
   
If Rs.State = 1 Then Rs.Close
STR = "SELECT [DESCRICAO] FROM [dbo].[CAD_PROD] WHERE [CODIGO]='" & COD & "'"
Rs.Open STR, Cn

If Rs.EOF Then
PAI.Show
Else
NF.LB_DESC.Caption = Rs(0)
End If

'ATUALIZAR LIST SALDO
    
    'POSITIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='ENTRADA' "
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    POSITIVO = 0
    Else
    POSITIVO = Rs(0)
    End If
    
     'NEGATIVO
     If Rs.State = 1 Then Rs.Close
    STRRS = "SELECT SUM([QNT])FROM [dbo].[KARDEX_2026] where [CODIGO]='" & COD & "' AND [OPERACAO]='SAIDA'"
     Rs.Open STRRS, Cn
     
    If IsNull(Rs(0)) Then
    NEGATIVO = 0
    Else
    NEGATIVO = Rs(0)
    End If
    
    SALDO = POSITIVO - NEGATIVO
    
    NF.TXT_SALDO = SALDO
End If
End Sub

Private Sub TXT_CUSTO_CONTABIL_Change()

End Sub

Private Sub TXT_CUSTO_FISCAL_Change()

End Sub

Private Sub TXT_CUSTO_PAGO_Change()

End Sub

Private Sub TXT_DESCONTO_LINHA_AfterUpdate()
NF.TXT_DESCONTO_LINHA_UNIT = Round(NF.TXT_DESCONTO_LINHA / NF.TXT_QNT_LINHA, 2)
End Sub
Private Sub TXT_DT_EMISSAO_Exit(ByVal Cancel As MSForms.ReturnBoolean)
If NF.TXT_DT_EMISSAO = "" Then
Else
If NF.TXT_DT_EMISSAO.SelStart < 10 Then
MsgBox "DATA DEVE ESTAR NO FORMATO DD/MM/AAAA", vbInformation, "CUSTOMIC"
Cancel = True
End If
End If
End Sub

Private Sub TXT_DT_EMISSAO_KeyPress(ByVal KeyAscii As MSForms.ReturnInteger)
Dim DIA As Integer
Dim MES As Integer

On Error GoTo FIM
NF.TXT_DT_EMISSAO.MaxLength = 10 '10/10/2014
 Select Case KeyAscii
      Case 8       'Aceita o BACK SPACE
      Case 13: SendKeys "{TAB}"    'Emula o TAB
      Case 48 To 57
         If NF.TXT_DT_EMISSAO = "" Then GoTo FIM
         
         DIA = Mid(NF.TXT_DT_EMISSAO, 1, 2)
         If NF.TXT_DT_EMISSAO.SelStart = 2 Then
         
         If DIA > 31 Then
         NF.TXT_DT_EMISSAO = ""
         Else
         NF.TXT_DT_EMISSAO.SelText = "/"
         End If
         End If
         
         If NF.TXT_DT_EMISSAO.SelStart = 5 Then
         MES = Mid(NF.TXT_DT_EMISSAO, 4, 2)
         If MES > 12 Then
         NF.TXT_DT_EMISSAO = DIA & "/"
         Else
         NF.TXT_DT_EMISSAO.SelText = "/"
         End If
         End If
         
      
      
FIM:
      Case Else: KeyAscii = 0     'Ignora os outros caracteres
   End Select
End Sub

Private Sub TXT_DT_RECEB_Exit(ByVal Cancel As MSForms.ReturnBoolean)
If NF.TXT_DT_RECEB = "" Then
Else
If NF.TXT_DT_RECEB.SelStart < 10 Then
MsgBox "DATA DEVE ESTAR NO FORMATO DD/MM/AAAA", vbInformation, "CUSTOMIC"
Cancel = True
End If
End If
End Sub

Private Sub TXT_DT_RECEB_KeyPress(ByVal KeyAscii As MSForms.ReturnInteger)
Dim DIA As Integer
Dim MES As Integer
Dim HR_DIGITACAO As Date

NF.TXT_DT_RECEB.MaxLength = 10 '10/10/2014
 Select Case KeyAscii
      Case 8       'Aceita o BACK SPACE
      Case 13: SendKeys "{TAB}"    'Emula o TAB
      Case 48 To 57
         If NF.TXT_DT_RECEB = "" Then GoTo FIM
         DIA = Mid(NF.TXT_DT_RECEB, 1, 2)
         If NF.TXT_DT_RECEB.SelStart = 2 Then
         
         If DIA > 31 Then
         NF.TXT_DT_RECEB = ""
         Else
         NF.TXT_DT_RECEB.SelText = "/"
         End If
         End If
         
         If NF.TXT_DT_RECEB.SelStart = 5 Then
         MES = Mid(NF.TXT_DT_RECEB, 4, 2)
         If MES > 12 Then
         NF.TXT_DT_RECEB = DIA & "/"
         Else
         NF.TXT_DT_RECEB.SelText = "/"
         End If
         End If
         
      
      
FIM:
      Case Else: KeyAscii = 0     'Ignora os outros caracteres
   End Select
End Sub




Private Sub TXT_ICMS_LINHA_AfterUpdate()
NF.TXT_ICMS_LINHA_UNIT = Round(NF.TXT_ICMS_LINHA / NF.TXT_QNT_LINHA, 2)
End Sub
Private Sub TXT_ID_NF_Change()
INICIAR_PRODUTOS
End Sub

Private Sub TXT_IMPORT_LINHA_Change()

End Sub

Private Sub TXT_IPI_LINHA_AfterUpdate()

NF.TXT_IPI_LINHA_UNIT = Round(NF.TXT_IPI_LINHA / NF.TXT_QNT_LINHA, 2)
End Sub

Private Sub TXT_IPI_LINHA_Change()

End Sub

Private Sub TXT_NUM_NF_AfterUpdate()
VERIFICA_NUM_NF
NF.MultiPage1.Value = 1
End Sub

Private Sub TXT_QNT_LINHA_AfterUpdate()

QNT = NF.TXT_QNT_LINHA

'VALOR UNIT
If NF.TXT_VALOR_UN_LINHA <> "" Then
    NF.TXT_VALOR_TOTAL_LINHA = NF.TXT_VALOR_UN_LINHA * QNT
End If

'IPI
If NF.TXT_IPI_LINHA <> "" Then
    NF.TXT_IPI_LINHA_UNIT = NF.TXT_IPI_LINHA / QNT
End If

'ICMS
If NF.TXT_ICMS_LINHA <> "" Then
    NF.TXT_ICMS_LINHA_UNIT = NF.TXT_ICMS_LINHA / QNT
End If


'ST
If NF.TXT_ST_LINHA <> "" Then
    NF.TXT_ST_LINHA_UNIT = NF.TXT_ST_LINHA / QNT
End If


'BC ICMS
If NF.TXT_BC_ICMS_LINHA <> "" Then
    NF.TXT_BC_ICMS_LINHA_UNIT = NF.TXT_BC_ICMS_LINHA / QNT
End If

'DESCONTO
If NF.TXT_DESCONTO_LINHA <> "" Then
    NF.TXT_DESCONTO_LINHA_UNIT = NF.TXT_DESCONTO_LINHA / QNT
End If

'FRETE
QNT_PROD_NF = NF.TXT_QNT_ITENS_NF
QNT_DESSE_COD = NF.TXT_QNT_LINHA

If NF.TXT_FRETE_NF = "" Or NF.TXT_FRETE_NF = 0 Then
FRETE_NF = 0
FRETE_UNIT = 0
Else
FRETE_NF = NF.TXT_FRETE_NF * 1
FRETE_UNIT = FRETE_NF / QNT_PROD_NF * 1
End If

FRETE_LINHA = QNT_DESSE_COD * FRETE_UNIT

NF.TXT_FRETE_LINHA_UNIT = FRETE_UNIT
NF.TXT_FRETE_LINHA = FRETE_LINHA



'IMPORTAÇÃO
If NF.CB_TIPO = "IMPORTAÇÃO" Then

IMPORT_NF = 1000
If QNT_PROD_NF = 0 Then
IMPORT_UNIT = IMPORT_NF / 1
Else
IMPORT_UNIT = IMPORT_NF / QNT_PROD_NF
End If
Else
IMPORT_NF = 0
IMPORT_UNIT = 0
End If
QNT_PROD_NF = NF.TXT_QNT_ITENS_NF * 1
QNT_DESSE_COD = NF.TXT_QNT_LINHA * 1


IMPORT_LINHA = QNT_DESSE_COD * IMPORT_UNIT

NF.TXT_IMPORT_LINHA = IMPORT_LINHA
NF.TXT_IMPORT_LINHA_UNIT = IMPORT_UNIT


End Sub

Private Sub TXT_SALDO_ATUAL_Change()

End Sub

Private Sub TXT_ST_LINHA_AfterUpdate()
NF.TXT_ST_LINHA_UNIT = Round(NF.TXT_ST_LINHA / NF.TXT_QNT_LINHA, 2)
End Sub
Private Sub TXT_VALOR_UN_LINHA_AfterUpdate()

VALOR = NF.TXT_QNT_LINHA * NF.TXT_VALOR_UN_LINHA
VALOR = Round(VALOR, 2)
NF.TXT_VALOR_TOTAL_LINHA = VALOR
End Sub
Private Sub UserForm_Initialize()
NF.MultiPage1.Value = 0
NF.CB_TIPO.AddItem "SIMPLES NACIONAL"
NF.CB_TIPO.AddItem "TRIBUTAÇÃO NORMAL"
NF.CB_TIPO.AddItem "IMPORTAÇÃO"

NF.CB_FINALIDADE.AddItem "INDUSTRIALIZAÇÃO"
NF.CB_FINALIDADE.AddItem "REVENDA"
NF.CB_FINALIDADE.AddItem "AMOSTRA"

If NIVEL = 1 Then
NF.MultiPage1.Pages(2).Enabled = True
Else
NF.MultiPage1.Pages(2).Enabled = False
End If
End Sub
