"""
PUENTE DE COSTOS · Armor Market
Lee el ÚLTIMO COSTO (art.ult_cos_un) de Profit Plus de ESTA sede y lo manda
al Apps Script de "Pedidos entre sedes". Los costos NO pasan por GitHub.

Se instala en el servidor de Profit de cada sede (igual que el puente del catálogo)
y se programa en el Programador de tareas cada 30 minutos.

Requisitos:  py -m pip install pyodbc
Prueba:      py puente_costos.py
"""
import json, sys, urllib.request, datetime

# ================== CONFIGURA ESTO EN CADA SEDE ==================
SEDE      = "BOLEITA"          # BOLEITA | CHAG | GUAIRA
SERVIDOR  = "SERVERMCH"        # servidor SQL de esta sede (el mismo del puente del catálogo)
BASE      = "BOLEITA"          # base de datos de Profit de esta sede
USUARIO   = "sa"               # usuario SQL (el mismo que usa el puente del catálogo)
CLAVE     = "CAMBIAR"
API_URL   = "PEGAR_URL_/exec_DEL_APPS_SCRIPT"
TOKEN     = "PEGAR_TOKEN_PUENTE"   # sale al ejecutar "configurar" en el Apps Script
# =================================================================

SQL = """
SELECT RTRIM(LTRIM(co_art)) AS codigo, ult_cos_un
FROM art
WHERE ult_cos_un IS NOT NULL AND ult_cos_un > 0
"""

def log(msg):
    print(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)

def leer_costos():
    import pyodbc
    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    driver = next((d for d in drivers if "ODBC Driver" in d), drivers[0] if drivers else "SQL Server")
    cn = pyodbc.connect(
        f"DRIVER={{{driver}}};SERVER={SERVIDOR};DATABASE={BASE};UID={USUARIO};PWD={CLAVE};TrustServerCertificate=yes",
        timeout=20)
    try:
        cur = cn.cursor()
        cur.execute(SQL)
        return [[r.codigo, round(float(r.ult_cos_un), 4)] for r in cur.fetchall()]
    finally:
        cn.close()

def enviar(costos):
    body = json.dumps({"accion": "costos", "token": TOKEN, "sede": SEDE, "costos": costos}).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=120) as r:   # Apps Script redirige; urllib lo sigue
        return json.loads(r.read().decode("utf-8"))

if __name__ == "__main__":
    try:
        costos = leer_costos()
        log(f"{len(costos)} costos leídos de {BASE}")
        res = enviar(costos)
        log(f"Respuesta: {res}")
        sys.exit(0 if res.get("ok") else 1)
    except Exception as e:
        log(f"ERROR: {e}")
        sys.exit(1)
