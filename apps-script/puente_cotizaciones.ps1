# PUENTE DE COTIZACIONES · Armor Market
# Toma de la página "Pedidos entre sedes" las cotizaciones pendientes de ESTA sede
# y las crea en Profit Plus (cotiz_c + reng_cac), a COSTO y con impuesto tipo 6.
# Devuelve el número de cotización a la página.
#
# Probar SIN grabar nada (hace todo y al final deshace):
#     powershell -ExecutionPolicy Bypass -File puente_cotizaciones.ps1 -Prueba
# Uso normal (Programador de tareas cada 1 minuto):
#     powershell -ExecutionPolicy Bypass -File C:\ListaPrecios\puente_cotizaciones.ps1
param([switch]$Prueba)

# ================== CONFIGURA ESTO EN CADA SEDE ==================
$SEDE      = "CHAG"           # BOLEITA | CHAG | GUAIRA (como en la página)
$SERVIDOR  = "localhost"
$BASE      = "ARMOR"
$ALMACEN   = "CHAG"           # almacén de Profit desde donde se despacha (lleva el correlativo cotc_num)
$SUCURSAL  = "CHAG"           # co_sucu de Profit
# Código de cliente en ESTE Profit para cada sede que pide:
$CLIENTES  = @{
    "BOLEITA" = "J500198170"  # ARMOR MARKET BOLEITA
    "GUAIRA"  = ""            # <-- cliente de La Guaira en este Profit
    "CHAG"    = ""            # <-- cliente de Chaguaramos en este Profit
}
$VENDEDOR  = "OF"             # Oficina
$TRANSP    = "CLIENT"         # Cliente retira
$FORMA_PAG = "01"             # Contado
$TIPO_IMP  = "6"              # impuesto entre sedes
$USUARIO   = "WEB"            # aparece como usuario que creó la cotización
$API_URL   = "https://script.google.com/macros/s/AKfycbzQtjcr1rg-neB1mNUnAqgcVc_P2_fC8P5JrrEkixfwXasLJtO8XF05lDJDp3-hEQTE/exec"
$TOKEN     = "PEGAR_TOKEN_PUENTE"
# =================================================================

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$log = Join-Path $PSScriptRoot "cotizaciones_$SEDE.log"
function Log($m) { $l = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $m; Write-Host $l; Add-Content -Path $log -Value $l -Encoding UTF8 }

function Api($body) {
    $body.token = $TOKEN; $body.sede = $SEDE
    $json = $body | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri $API_URL -Method Post -Body $bytes -ContentType "text/plain; charset=utf-8" -TimeoutSec 120
}

function Crear-Cotizacion($cn, $ped) {
    $cliente = $CLIENTES[$ped.destino]
    if (-not $cliente) { throw "No hay código de cliente configurado para la sede $($ped.destino)" }
    $ref = "Pedido $($ped.numero)"
    $tx = $cn.BeginTransaction()
    try {
        $cmd = $cn.CreateCommand(); $cmd.Transaction = $tx; $cmd.CommandTimeout = 60

        # 0) ¿ya existe? (por si el puente se cayó después de grabar y antes de avisar)
        $cmd.CommandText = "SELECT TOP 1 fact_num FROM cotiz_c WHERE descrip = @ref AND co_sucu = @suc AND anulada = 0"
        $cmd.Parameters.Clear()
        [void]$cmd.Parameters.AddWithValue("@ref", $ref); [void]$cmd.Parameters.AddWithValue("@suc", $SUCURSAL)
        $ya = $cmd.ExecuteScalar()
        if ($ya) { $tx.Rollback(); Log "$($ped.numero): ya existía como cotización $ya"; return [string]$ya }

        # 1) renglones: costo y unidad desde Profit
        $rengs = @(); $total = 0.0; $i = 0
        foreach ($it in $ped.items) {
            $cmd.CommandText = "SELECT ult_cos_un, uni_venta FROM art WHERE co_art = @art"
            $cmd.Parameters.Clear(); [void]$cmd.Parameters.AddWithValue("@art", $it.cod)
            $rd = $cmd.ExecuteReader()
            if (-not $rd.Read()) { $rd.Close(); throw "El artículo $($it.cod) no existe en $BASE" }
            $costo = [decimal]$rd["ult_cos_un"]; $uni = ([string]$rd["uni_venta"]).Trim(); $rd.Close()
            $cant = [decimal]$it.cantidad
            if ($cant -le 0) { continue }
            $i++; $neto = [math]::Round($cant * $costo, 2); $total += $neto
            $rengs += [pscustomobject]@{ n = $i; art = $it.cod; cant = $cant; costo = $costo; uni = $uni; neto = $neto }
        }
        if ($rengs.Count -eq 0) { throw "No hay cantidades asignadas" }

        # 2) correlativo del almacén (igual que Profit)
        $cmd.CommandText = "SELECT cotc_num FROM almacen WITH (UPDLOCK, ROWLOCK) WHERE co_alma = @alma"
        $cmd.Parameters.Clear(); [void]$cmd.Parameters.AddWithValue("@alma", $ALMACEN)
        $num = [int]$cmd.ExecuteScalar() + 1
        $cmd.CommandText = "UPDATE almacen SET cotc_num = @n WHERE co_alma = @alma"
        [void]$cmd.Parameters.AddWithValue("@n", $num)
        [void]$cmd.ExecuteNonQuery()

        # 3) encabezado
        $hoy = (Get-Date).Date; $ahora = Get-Date
        $cmd.CommandText = @"
INSERT INTO cotiz_c (fact_num, contrib, nombre, rif, nit, status, comentario, descrip, saldo, fec_emis, fec_venc,
  co_cli, co_ven, co_tran, dir_ent, forma_pag, tot_bruto, tot_neto, glob_desc, tot_reca, porc_gdesc, porc_reca,
  total_uc, total_cp, tot_flete, monto_dev, totklu, anulada, impresa, iva, iva_dev, feccom, numcom, tasa, moneda,
  cta_contab, seriales, tasag, tasag10, tasag20, campo1, campo2, campo3, campo4, campo5, campo6, campo7, campo8,
  co_us_in, fe_us_in, co_us_mo, fe_us_mo, co_us_el, fe_us_el, revisado, trasnfe, co_sucu, mon_ilc, otros1, otros2,
  otros3, aux01, aux02, salestax, origen, origen_d, sta_prod, telefono)
VALUES (@num, 1, ' ', '', '', '0', ' ', @ref, @tot, @hoy, @hoy,
  @cli, @ven, @tran, ' ', @fpag, @tot, @tot, 0, 0, '', '',
  0, 0, 0, 0, 0, 0, 0, 0, 0, @hoy, 0, 1, 'BS',
  '', 0, 16, 0, 0, ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  @usr, @ahora, '', @ahora, '', @ahora, ' ', ' ', @suc, 0, 0, 0,
  0, 0, ' ', '', ' ', '', ' ', ' ')
"@
        $cmd.Parameters.Clear()
        foreach ($kv in @{ "@num"=$num; "@ref"=$ref; "@tot"=[decimal]$total; "@hoy"=$hoy; "@cli"=$cliente; "@ven"=$VENDEDOR;
                          "@tran"=$TRANSP; "@fpag"=$FORMA_PAG; "@usr"=$USUARIO; "@ahora"=$ahora; "@suc"=$SUCURSAL }.GetEnumerator()) {
            [void]$cmd.Parameters.AddWithValue($kv.Key, $kv.Value)
        }
        [void]$cmd.ExecuteNonQuery()

        # 4) renglones
        $cmd.CommandText = @"
INSERT INTO reng_cac (fact_num, reng_num, tipo_doc, reng_doc, num_doc, co_art, co_alma, total_art, stotal_art, pendiente,
  uni_venta, prec_vta, porc_desc, tipo_imp, reng_neto, cos_pro_un, ult_cos_un, ult_cos_om, cos_pro_om, total_dev, monto_dev,
  prec_vta2, anulado, des_art, seleccion, cant_imp, comentario, total_uni, mon_ilc, otros, nro_lote, fec_lote, pendiente2,
  tipo_doc2, reng_doc2, num_doc2, co_alma2, aux01, aux02, cant_prod, imp_prod)
VALUES (@num, @rn, ' ', 0, 0, @art, @alma, @cant, 0, @cant,
  @uni, @costo, '', @imp, @neto, 0, @costo, 0, 0, 0, 0,
  @costo, 0, ' ', 0, 0, '', 1, 0, 0, '', @hoy, 0,
  ' ', 0, 0, '', 0, ' ', 0, 0)
"@
        foreach ($r in $rengs) {
            $cmd.Parameters.Clear()
            foreach ($kv in @{ "@num"=$num; "@rn"=$r.n; "@art"=$r.art; "@alma"=$ALMACEN; "@cant"=$r.cant; "@uni"=$r.uni;
                              "@costo"=$r.costo; "@imp"=$TIPO_IMP; "@neto"=[decimal]$r.neto; "@hoy"=$hoy }.GetEnumerator()) {
                [void]$cmd.Parameters.AddWithValue($kv.Key, $kv.Value)
            }
            [void]$cmd.ExecuteNonQuery()
        }

        if ($Prueba) {
            $tx.Rollback()
            Log "PRUEBA $($ped.numero): se habría creado la cotización $num para $cliente con $($rengs.Count) renglones, total $total (NO se grabó)"
            foreach ($r in $rengs) { Log ("   {0} x {1} @ {2} = {3}" -f $r.art, $r.cant, $r.costo, $r.neto) }
            return $null
        }
        $tx.Commit()
        Log "$($ped.numero): creada cotización $num para $cliente, $($rengs.Count) renglones, total $total"
        return [string]$num
    } catch {
        try { $tx.Rollback() } catch {}
        throw
    }
}

try {
    $res = Api @{ accion = "cola" }
    if (-not $res.ok) { throw "API: $($res.error)" }
    $cola = @($res.cola)
    if ($cola.Count -eq 0) { exit 0 }
    $cn = New-Object System.Data.SqlClient.SqlConnection "Server=$SERVIDOR;Database=$BASE;Integrated Security=SSPI;Connect Timeout=20"
    $cn.Open()
    foreach ($ped in $cola) {
        try {
            $nro = Crear-Cotizacion $cn $ped
            if ($Prueba) { [void](Api @{ accion = "cola_error"; numero = $ped.numero; error = "Prueba hecha en el servidor (no se grabó). Vuelve a generar." }) }
            elseif ($nro) { [void](Api @{ accion = "cola_ok"; numero = $ped.numero; nro_cotizacion = $nro }) }
        } catch {
            Log "ERROR $($ped.numero): $($_.Exception.Message)"
            try { [void](Api @{ accion = "cola_error"; numero = $ped.numero; error = $_.Exception.Message }) } catch {}
        }
    }
    $cn.Close()
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
