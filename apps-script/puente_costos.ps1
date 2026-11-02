# PUENTE DE COSTOS · Armor Market (versión PowerShell, no necesita Python)
# Lee el ÚLTIMO COSTO (art.ult_cos_un) de Profit de ESTA sede y lo manda al
# Apps Script de "Pedidos entre sedes". Los costos NO pasan por GitHub.
# Prueba:  powershell -ExecutionPolicy Bypass -File puente_costos.ps1

# ================== CONFIGURA ESTO EN CADA SEDE ==================
$SEDE     = "CHAG"          # BOLEITA | CHAG | GUAIRA
$SERVIDOR = "localhost"
$BASE     = "ARMOR"
$USUARIO  = ""              # vacío = entra con la sesión de Windows
$CLAVE    = ""
$API_URL  = "https://script.google.com/macros/s/AKfycbzQtjcr1rg-neB1mNUnAqgcVc_P2_fC8P5JrrEkixfwXasLJtO8XF05lDJDp3-hEQTE/exec"
$TOKEN    = "PEGAR_TOKEN_PUENTE"
# =================================================================

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$inv = [Globalization.CultureInfo]::InvariantCulture
$log = Join-Path $PSScriptRoot "costos_$SEDE.log"
function Log($m) { $l = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $m; Write-Host $l; Add-Content -Path $log -Value $l -Encoding UTF8 }

try {
    if ($USUARIO) { $auth = "User ID=$USUARIO;Password=$CLAVE" } else { $auth = "Integrated Security=SSPI" }
    $cn = New-Object System.Data.SqlClient.SqlConnection "Server=$SERVIDOR;Database=$BASE;$auth;Connect Timeout=20"
    $cn.Open()
    $cmd = $cn.CreateCommand()
    $cmd.CommandTimeout = 120
    $cmd.CommandText = "SELECT RTRIM(LTRIM(co_art)) AS codigo, ult_cos_un FROM art WHERE ult_cos_un IS NOT NULL AND ult_cos_un > 0"
    $rd = $cmd.ExecuteReader()
    $sb = New-Object System.Text.StringBuilder
    $n = 0
    while ($rd.Read()) {
        $cod = ([string]$rd["codigo"]).Replace('\', '\\').Replace('"', '\"')
        $cos = ([double]$rd["ult_cos_un"]).ToString("0.####", $inv)
        if ($n -gt 0) { [void]$sb.Append(',') }
        [void]$sb.Append('["').Append($cod).Append('",').Append($cos).Append(']')
        $n++
    }
    $rd.Close(); $cn.Close()
    Log "$n costos leídos de $BASE"

    $json = '{"accion":"costos","token":"' + $TOKEN + '","sede":"' + $SEDE + '","costos":[' + $sb.ToString() + ']}'
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $res = Invoke-RestMethod -Uri $API_URL -Method Post -Body $bytes -ContentType "text/plain; charset=utf-8" -TimeoutSec 180
    Log ("Respuesta: ok=" + $res.ok + " recibidos=" + $res.recibidos + " " + $res.error)
    if (-not $res.ok) { exit 1 }
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
