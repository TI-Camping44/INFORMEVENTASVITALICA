// ============================================================================
//  WEB APP DE CARGA DE OBJETIVOS — VITÁLICA  (v2)
//  Agregá este archivo COMO ARCHIVO NUEVO dentro del MISMO proyecto de Apps
//  Script de tu planilla (Archivo ▸ Nuevo ▸ Secuencia de comandos). No pisa tu .gs.
//
//  Novedades v2:
//   • LEE por la MISMA URL publicada que usa el dashboard  ➜ trae TODO real:
//     días, fechas, global, canales, vendedores (con su canal) y MARCAS.
//   • SELECTOR DE MES: "Mes en vivo" (editable) + cada mes archivado del
//     histórico (agosto, etc.) para ver cómo quedó. Botón "copiar al vivo".
//   • MARCAS por vendedor, editables.
//   • Auto-suma vendedor ➜ canal ➜ global.
//   • Guarda SOLO el mes en vivo, en las celdas normales del CONFIG
//     (fechas B3/B4/B5, global D4, canales F/G, vendedores I/J/K, marcas L+).
//     No toca el histórico base64 (eso lo sigue haciendo tu botón "Archivar").
//
//  Publicar (una vez): Implementar ▸ Nueva implementación ▸ Aplicación web ▸
//  Ejecutar como: Yo · Acceso: Solo yo (o quien elijas) ▸ copiar URL.
//  IMPORTANTE: pegá este archivo en el MISMO proyecto de la planilla (para que
//  pueda guardar). Si editás el código, Implementar ▸ Gestionar implementaciones
//  ▸ editar la existente ▸ nueva versión (así la URL no cambia).
// ============================================================================

// gid de la hoja CONFIG publicada (el mismo que usa el dashboard).
// ⚠️ COMPLETAR con la planilla de VITÁLICA: Archivo ▸ Compartir ▸ Publicar en la web.
//    Es la misma URL base que usa el index.html del dashboard.
const WA_PUB_BASE = "PEGAR_AQUI_LA_URL_PUB_DE_VITALICA";
const WA_GID_CONFIG = "PEGAR_GID_CONFIG";
const WA_GID_DATA = "PEGAR_GID_DATA";   // hoja DATA (ventas de Odoo). Col 18 = Vendedor.
const WA_HOJA = "CONFIG";
const WA_CANALES = ["Salon", "Online", "E-commerce", "Mayoristas", "Venta Externa", "Directorio", "Reparaciones"];
const WA_MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
// Vitálica arranca sin histórico previo: se va llenando mes a mes desde esta web app.
const WA_SEED_B64 = "";

function doGet(e) {
  return HtmlService.createHtmlOutput(WA_HTML())
    .setTitle("Carga de Objetivos — Vitálica")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Helpers (misma lógica que el dashboard) ----------
function wa_limpiarNombre(t) {
  if (!t) return "";
  return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\s*-\s*(SALON|ONLINE|E-COMMERCE|MAYORISTAS|VENTA EXTERNA|REPARACIONES|DIRECTORIO)\s*$/g, "")
    .trim();
}
function wa_handleNum(v) {
  if (!v && v !== 0) return 0;
  var s = String(v).replace(/\./g, "");
  if (s.indexOf(",") >= 0) s = s.split(",")[0];
  return parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
}
function wa_getMonthFromDate(d) {
  if (!d) return 0;
  var p = String(d).split(" ")[0];
  if (p.indexOf("/") >= 0) return parseInt(p.split("/")[1], 10) || 0;
  if (p.indexOf("-") >= 0) return parseInt(p.split("-")[1], 10) || 0;
  return 0;
}
// Detecta el canal a partir del sufijo del nombre crudo ("Juan Perez - Mayoristas").
function wa_canalDesdeRaw(raw) {
  var m = String(raw || "").match(/-\s*([A-Za-zÀ-ÿ\- ]+?)\s*$/);
  if (!m) return "";
  return wa_canalReal("", m[1]);
}
function wa_canalReal(vendedor, canalCSV) {
  var v = wa_limpiarNombre(vendedor), c = wa_limpiarNombre(canalCSV);
  // Clientes/grupos de E-commerce: Contimarket (= Julia Olmedo), Tupi y Porter caen siempre en E-commerce.
  if (v.indexOf("CONTIMARKET") >= 0 || c.indexOf("CONTIMARKET") >= 0) return "E-commerce";
  if (v.indexOf("TUPI") >= 0 || c.indexOf("TUPI") >= 0) return "E-commerce";
  if (v.indexOf("PORTER") >= 0 || c.indexOf("PORTER") >= 0) return "E-commerce";
  if (v.indexOf("JULIA OLMEDO") >= 0) return "E-commerce";
  var t = (v + " " + c);
  if (t.indexOf("DIRECTORIO") >= 0) return "Directorio";
  if (t.indexOf("EXTERNA") >= 0) return "Venta Externa";
  if (t.indexOf("REPARACION") >= 0 || t.indexOf("TALLER") >= 0 || t.indexOf("SERVICIO") >= 0) return "Reparaciones";
  if (t.indexOf("MAYORISTA") >= 0) return "Mayoristas";
  if (t.indexOf("ECOMMERCE") >= 0 || t.indexOf("E-COMMERCE") >= 0) return "E-commerce";
  if (t.indexOf("ONLINE") >= 0) return "Online";
  if (t.indexOf("SALON") >= 0) return "Salon";
  return "";
}
function wa_parseCSV(text) {
  var ret = [['']], i = 0, j = 0, s = true;
  for (var k = 0; k < text.length; k++) {
    var l = text[k];
    if (l === '"') s = !s;
    else if (l === ',' && s) ret[i][++j] = '';
    else if (l === '\n' && s) { if (ret[i][j].slice(-1) === '\r') ret[i][j] = ret[i][j].slice(0, -1); ret[++i] = ['']; j = 0; }
    else ret[i][j] += l;
  }
  return ret.map(function (r) { return r.map(function (c) { return c.trim(); }); });
}

// ---------- LECTURA: primero la planilla EN VIVO (instantánea), si no el CSV publicado ----------
function wa_getTodo() {
  var diag = { hojas: [], fuente: "", filas: 0, nVend: 0, nCanales: 0, nHist: 0, nota: "" };
  var filas = null, bound = false;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { diag.nota = "getActiveSpreadsheet()=null → el script NO está dentro de la planilla."; }
    else {
      var sheets = ss.getSheets();
      diag.hojas = sheets.map(function (s) { return s.getName() + " #" + s.getSheetId(); });
      // 1) Buscar la pestaña por su gid (la misma que usa el dashboard). 2) Por nombre "CONFIG".
      var sh = null;
      for (var i = 0; i < sheets.length; i++) { if (String(sheets[i].getSheetId()) === WA_GID_CONFIG) { sh = sheets[i]; break; } }
      if (!sh) sh = ss.getSheetByName(WA_HOJA);
      if (!sh) { diag.nota = "No encontré la pestaña por gid " + WA_GID_CONFIG + " ni por nombre '" + WA_HOJA + "'."; }
      else {
        var vals = sh.getDataRange().getValues();
        var ok = false;
        for (var r = 0; r < vals.length && r < 15; r++) { if (String(vals[r][0] || "").trim() === "Fecha Inicio:") { ok = true; break; } }
        if (!ok) { diag.nota = "La pestaña '" + sh.getName() + "' (#" + sh.getSheetId() + ") no tiene 'Fecha Inicio:' en la columna A. Filas: " + vals.length + "."; }
        else {
          var tz = Session.getScriptTimeZone();
          for (var a = 0; a < vals.length; a++) for (var b = 0; b < vals[a].length; b++) { if (vals[a][b] instanceof Date) vals[a][b] = Utilities.formatDate(vals[a][b], tz, "dd/MM/yyyy"); }
          filas = vals; bound = true;
          diag.fuente = "planilla en vivo → pestaña '" + sh.getName() + "' (#" + sh.getSheetId() + ")";
        }
      }
    }
  } catch (e) { diag.nota = "Error leyendo en vivo: " + e.message; }

  if (!filas) {
    try { filas = wa_leerCSV(); diag.fuente = diag.fuente || "CSV publicado (puede tener demora)"; }
    catch (e2) { diag.nota += " | Tampoco pude leer el CSV: " + e2.message; filas = [['']]; }
  }

  var vivo = wa_parseVivo(filas);
  var canalMap = {};
  vivo.vendedores.forEach(function (v) { if (v.canal) canalMap[wa_limpiarNombre(v.nombre)] = v.canal; });
  var historico = wa_parseHistorico(filas, canalMap);

  var vendedoresOdoo = [];
  try { if (typeof ss !== "undefined" && ss) vendedoresOdoo = wa_vendedoresOdoo(ss); } catch (e3) { }

  diag.filas = filas.length;
  diag.nVend = vivo.vendedores.length;
  diag.nCanales = vivo.canales.filter(function (c) { return c.monto > 0; }).length;
  diag.nHist = Object.keys(historico).length;
  diag.nOdoo = vendedoresOdoo.length;

  return {
    canalesDisponibles: WA_CANALES,
    meses: WA_MESES,
    vivo: vivo,
    historico: historico,
    vendedoresOdoo: vendedoresOdoo,
    mesVivo: wa_getMonthFromDate(vivo.control.fechaCorte),
    bound: bound,
    fuente: diag.fuente,
    diag: diag
  };
}

// Devuelve la pestaña del CONFIG: primero por gid (la que usa el dashboard), si no por nombre.
function wa_hojaConfig(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) { if (String(sheets[i].getSheetId()) === WA_GID_CONFIG) return sheets[i]; }
  return ss.getSheetByName(WA_HOJA);
}

// Lista de vendedores REALES de Odoo (columna 18 de la hoja DATA), únicos y ordenados.
// Sirve para el autocompletado al agregar un vendedor nuevo (nombre exacto de Odoo).
function wa_vendedoresOdoo(ss) {
  try {
    var sheets = ss.getSheets(), sh = null;
    for (var i = 0; i < sheets.length; i++) { if (String(sheets[i].getSheetId()) === WA_GID_DATA) { sh = sheets[i]; break; } }
    if (!sh) sh = ss.getSheetByName("DATA");
    if (!sh || sh.getLastRow() < 2) return [];
    var col = sh.getRange(2, 18, sh.getLastRow() - 1, 1).getValues();
    var vistos = {}, out = [];
    for (var r = 0; r < col.length; r++) {
      var v = String(col[r][0] || "").trim();
      if (!v || v === "Sin Vendedor") continue;
      var k = v.toUpperCase();
      if (!(k in vistos)) { vistos[k] = 1; out.push(v); }
    }
    out.sort();
    return out;
  } catch (e) { return []; }
}

// Lee la hoja CONFIG desde el CSV publicado (no requiere enlace, pero puede estar desactualizado).
function wa_leerCSV() {
  var url = WA_PUB_BASE + "?gid=" + WA_GID_CONFIG + "&single=true&output=csv&cb=" + (new Date().getTime());
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error("No pude leer la planilla (HTTP " + resp.getResponseCode() + ").");
  return wa_parseCSV(resp.getContentText());
}

// Parsea el mes EN VIVO (celdas actuales del CONFIG)
function wa_parseVivo(filas) {
  var out = {
    control: { fechaInicio: "", fechaFin: "", fechaCorte: "", diasMes: "", diasTrans: "" },
    global: 0, canales: [], vendedores: [], marcasPorVendedor: {}
  };
  var canalMap = {};
  for (var r = 0; r < filas.length; r++) {
    var row = filas[r], c0 = String(row[0] || "").trim();
    if (c0 === "Fecha Inicio:") out.control.fechaInicio = String(row[1] || "");
    else if (c0 === "Fecha Fin:") out.control.fechaFin = String(row[1] || "");
    else if (c0.indexOf("Fecha Actual") === 0) out.control.fechaCorte = String(row[1] || "");
    else if (c0 === "Días Hábiles del Mes:") out.control.diasMes = String(row[1] || "");
    else if (c0 === "Días Hábiles Transcurridos:") out.control.diasTrans = String(row[1] || "");

    if (r === 3) out.global = wa_handleNum(row[3]);

    // Canales col F/G (índice 5/6), filas 4-9 (r 3..8)
    if (row[5] && r >= 3 && r <= 9) {
      var cn = wa_canalReal("", row[5]);
      if (WA_CANALES.indexOf(cn) >= 0 && !(cn in canalMap)) { canalMap[cn] = true; out.canales.push({ canal: cn, monto: wa_handleNum(row[6]) }); }
    }
    // Vendedores col I/J/K (8/9/10), r>=3
    if (row[8] && r >= 3 && String(row[8]).trim() !== "Vendedor") {
      var raw = String(row[8]).trim();
      var nombre = wa_limpiarNombre(raw);
      var canalV = wa_canalReal("", String(row[10] || "")) || wa_canalDesdeRaw(raw) || wa_canalReal(raw, "");
      out.vendedores.push({ nombre: nombre, rawNombre: raw, total: wa_handleNum(row[9]), canal: canalV, fila: r });
    }
  }
  // Asegura los 6 canales base
  WA_CANALES.forEach(function (cn) { if (cn !== "Reparaciones" && !(cn in canalMap)) out.canales.push({ canal: cn, monto: 0 }); });

  // E-commerce = Tupi + Porter + Contimarket(=Julia Olmedo). Tupi y Porter son clientes (no están en
  // la lista de vendedores de Odoo), así que los aseguramos en 0. Contimarket NO se agrega aparte:
  // es la vendedora "Maria Julia Olmedo Cuevas", que ya está en la lista. Los tres, al ser canal
  // E-commerce, suman al objetivo del canal cuando tocás "Auto-sumar canales".
  ["TUPI", "PORTER"].forEach(function (nm) {
    var existe = out.vendedores.some(function (v) { return wa_limpiarNombre(v.nombre).indexOf(nm) >= 0; });
    if (!existe) out.vendedores.push({ nombre: nm, rawNombre: nm, total: 0, canal: "E-commerce", fila: -1 });
  });

  // Marcas: tripletes desde col 11 (L). Vendedor en fila 3 (índice 2), luego pares marca/meta.
  if (filas[2]) {
    for (var col = 11; col < filas[2].length; col += 3) {
      var vend = String(filas[2][col] || "").trim();
      if (!vend) continue;
      var vClean = wa_limpiarNombre(vend);
      var lista = [];
      for (var rr = 3; rr < filas.length; rr++) {
        var marc = String((filas[rr] && filas[rr][col]) || "").trim();
        if (!marc || marc.indexOf("---") === 0 || marc.indexOf("[") === 0 || marc.toUpperCase() === "MARCA" || marc.toUpperCase() === "MARCAS") continue;
        lista.push({ marca: marc, meta: wa_handleNum(filas[rr][col + 1]), fila: rr, col: col });
      }
      if (lista.length) out.marcasPorVendedor[vClean] = { vendedor: vend, col: col, marcas: lista };
    }
  }
  return out;
}

// Semilla del histórico (Enero-Julio) migrada del dashboard. Editable desde la web app.
function wa_seedHistorico() {
  try {
    var json = Utilities.newBlob(Utilities.base64Decode(WA_SEED_B64)).getDataAsString("UTF-8");
    return JSON.parse(json);
  } catch (e) { return {}; }
}

// Devuelve el histórico CRUDO {mes:{diasMes,diasTranscurridos,global,canales,vendedoresTotales,vendedorMarca}}
// = semilla, pisada por lo que haya en base64 en la planilla (la planilla manda).
function wa_histRawFrom(rows) {
  var out = {};
  var seed = wa_seedHistorico();
  Object.keys(seed).forEach(function (m) { out[m] = seed[m]; });
  var chunks = [];
  rows.forEach(function (row) {
    var c0 = String(row[0] || "").trim();
    if (c0.indexOf("HISTORICO_B64_") === 0) chunks.push({ idx: parseInt(c0.replace("HISTORICO_B64_", ""), 10) || 0, val: String(row[1] || "").trim() });
  });
  if (chunks.length) {
    chunks.sort(function (a, b) { return a.idx - b.idx; });
    try {
      var b64 = chunks.map(function (c) { return c.val; }).join("");
      var json = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString("UTF-8");
      var hist = JSON.parse(json);
      Object.keys(hist).forEach(function (m) { out[m] = hist[m]; });
    } catch (e) { }
  }
  return out;
}

// Convierte el histórico crudo al formato editable que consume la web app.
// canalMap: {NOMBRE_LIMPIO: canal} para completar el canal de cada vendedor (es fijo por vendedor).
function wa_parseHistorico(filas, canalMap) {
  canalMap = canalMap || {};
  var raw = wa_histRawFrom(filas);
  var out = {};
  Object.keys(raw).forEach(function (mes) {
    var h = raw[mes] || {};
    var vendedores = [];
    Object.keys(h.vendedoresTotales || {}).forEach(function (v) {
      var vc = wa_limpiarNombre(v);
      var canal = canalMap[vc] || wa_canalDesdeRaw(v) || wa_canalReal(v, "");
      vendedores.push({ nombre: v, total: wa_handleNum(h.vendedoresTotales[v]), canal: canal });
    });
    var marcasPorVendedor = {};
    Object.keys(h.vendedorMarca || {}).forEach(function (key) {
      var parts = key.split("|||"); if (parts.length < 2) return;
      var vClean = wa_limpiarNombre(parts[0]);
      var mv = h.vendedorMarca[key];
      var meta = wa_handleNum(typeof mv === "object" ? mv.meta : mv);
      if (!marcasPorVendedor[vClean]) marcasPorVendedor[vClean] = { vendedor: parts[0], marcas: [] };
      marcasPorVendedor[vClean].marcas.push({ marca: parts[1], meta: meta });
    });
    out[String(mes)] = {
      label: WA_MESES[parseInt(mes, 10)] || ("Mes " + mes),
      global: wa_handleNum(h.global),
      diasMes: (h.diasMes || h.diasMes === 0) ? h.diasMes : "",
      diasTrans: (h.diasTranscurridos || h.diasTranscurridos === 0) ? h.diasTranscurridos : "",
      canales: h.canales || {},
      vendedores: vendedores,
      marcasPorVendedor: marcasPorVendedor
    };
  });
  return out;
}

function wa_numDec(v) {
  if (typeof v === "number") return v;
  var s = String(v || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ---------- ESCRITURA HISTÓRICO: guarda un mes pasado en la planilla (base64 chunked) ----------
function wa_guardarHistorico(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return { ok: false, msg: "El script no está enlazado a la planilla (Extensiones ▸ Apps Script)." };
    var sh = wa_hojaConfig(ss);
    if (!sh) return { ok: false, msg: "No encontré la hoja 'CONFIG'." };
    var data = sh.getDataRange().getValues();
    var okStruct = false;
    for (var r = 0; r < data.length && r < 12; r++) { if (String(data[r][0] || "").trim() === "Fecha Inicio:") { okStruct = true; break; } }
    if (!okStruct) return { ok: false, msg: "La hoja 'CONFIG' no tiene la estructura esperada. ¿Script en la planilla correcta?" };

    var mes = String(payload.mes);
    var d = payload.data || {};
    // Reconstruye el objeto del mes en formato histórico
    var vt = {};
    (d.vendedores || []).forEach(function (v) { if (v.nombre && String(v.nombre).trim()) vt[wa_limpiarNombre(v.nombre)] = wa_handleNum(v.total); });
    var vm = {};
    (d.marcas || []).forEach(function (m) { if (m.vendedor && m.marca && String(m.marca).trim()) vm[wa_limpiarNombre(m.vendedor) + "|||" + String(m.marca).trim()] = wa_handleNum(m.meta); });
    var canales = {};
    (d.canales || []).forEach(function (c) { var cn = wa_canalReal("", c.canal); if (cn) canales[cn] = wa_handleNum(c.monto); });

    var raw = wa_histRawFrom(data);
    var prev = raw[mes] || {};
    raw[mes] = {
      diasMes: d.diasMes !== undefined && d.diasMes !== "" ? wa_numDec(d.diasMes) : (prev.diasMes || 0),
      diasTranscurridos: d.diasTrans !== undefined && d.diasTrans !== "" ? wa_numDec(d.diasTrans) : (prev.diasTranscurridos || 0),
      global: wa_handleNum(d.global),
      canales: canales,
      vendedoresTotales: vt,
      vendedorMarca: vm
    };

    // Codifica todo el histórico y lo parte en pedazos <= 45000 chars (celda soporta 50000).
    var json = JSON.stringify(raw);
    var b64 = Utilities.base64Encode(Utilities.newBlob(json).getBytes());
    var CH = 45000, chunks = [];
    for (var p = 0; p < b64.length; p += CH) chunks.push(b64.substr(p, CH));

    // Limpia filas HISTORICO_B64_* previas
    for (var rr = 0; rr < data.length; rr++) {
      if (String(data[rr][0] || "").indexOf("HISTORICO_B64_") === 0) { sh.getRange(rr + 1, 1).clearContent(); sh.getRange(rr + 1, 2).clearContent(); }
    }
    SpreadsheetApp.flush();
    // Escribe los nuevos chunks al final de la hoja (col A/B), sin tocar la grilla.
    var startRow = sh.getLastRow() + 2;
    for (var i = 0; i < chunks.length; i++) {
      sh.getRange(startRow + i, 1).setValue("HISTORICO_B64_" + i);
      sh.getRange(startRow + i, 2).setValue(chunks[i]);
    }
    SpreadsheetApp.flush();
    return { ok: true, msg: "✅ " + (WA_MESES[parseInt(mes, 10)] || ("Mes " + mes)) + " guardado en el histórico. Actualizá el dashboard para verlo." };
  } catch (err) {
    return { ok: false, msg: "Error al guardar histórico: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ESCRITURA: guarda SOLO el mes en vivo en las celdas del CONFIG ----------
function wa_guardarVivo(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return { ok: false, msg: "El script no está enlazado a la planilla. Pegá este archivo en el proyecto de Apps Script DE la planilla (Extensiones ▸ Apps Script)." };
    var sh = wa_hojaConfig(ss);
    if (!sh) return { ok: false, msg: "No encontré la hoja 'CONFIG' en esta planilla." };
    var data = sh.getDataRange().getValues();

    // Verifica que sea la hoja correcta (debe tener 'Fecha Inicio:')
    var ok = false;
    for (var r = 0; r < data.length && r < 12; r++) { if (String(data[r][0] || "").trim() === "Fecha Inicio:") { ok = true; break; } }
    if (!ok) return { ok: false, msg: "La hoja 'CONFIG' de esta planilla no tiene la estructura esperada. ¿El script está en la planilla correcta?" };

    // 1) Fechas (B3/B4/B5) por etiqueta
    for (var r2 = 0; r2 < data.length; r2++) {
      var c0 = String(data[r2][0] || "").trim();
      if (c0 === "Fecha Inicio:" && payload.control.fechaInicio) sh.getRange(r2 + 1, 2).setValue(payload.control.fechaInicio);
      else if (c0 === "Fecha Fin:" && payload.control.fechaFin) sh.getRange(r2 + 1, 2).setValue(payload.control.fechaFin);
      else if (c0.indexOf("Fecha Actual") === 0 && payload.control.fechaCorte) sh.getRange(r2 + 1, 2).setValue(payload.control.fechaCorte);
    }
    // (Días hábiles son fórmula =CALCULAR_HABILES: se recalculan solos con las fechas y feriados.)

    // 2) Global D4
    sh.getRange(4, 4).setValue(wa_handleNum(payload.global));

    // 3) Canales col G (7); busca la fila donde col F es ese canal
    var mCanal = {};
    (payload.canales || []).forEach(function (c) { mCanal[wa_canalReal("", c.canal)] = wa_handleNum(c.monto); });
    for (var r3 = 0; r3 < data.length; r3++) {
      var cn = wa_canalReal("", data[r3][5]);
      if (WA_CANALES.indexOf(cn) >= 0 && (cn in mCanal)) sh.getRange(r3 + 1, 7).setValue(mCanal[cn]);
    }

    // 4) Vendedores col I/J/K (9/10/11) desde fila 4
    var startRow = 4, oldEnd = 3;
    for (var rr = 3; rr < data.length; rr++) {
      var nm = String(data[rr][8] || "").trim();
      if (nm && nm !== "Vendedor") oldEnd = rr + 1; else if (rr >= 3) break;
    }
    var vends = payload.vendedores || [];
    for (var i = 0; i < vends.length; i++) {
      var fila = startRow + i;
      sh.getRange(fila, 9).setValue(vends[i].nombre || "");
      sh.getRange(fila, 10).setValue(wa_handleNum(vends[i].total));
      sh.getRange(fila, 11).setValue(wa_canalReal("", vends[i].canal) || "");
    }
    var newEnd = startRow + vends.length - 1;
    for (var f = newEnd + 1; f <= oldEnd; f++) { sh.getRange(f, 9).clearContent(); sh.getRange(f, 10).clearContent(); sh.getRange(f, 11).clearContent(); }

    // 5) Marcas existentes: actualiza el objetivo (col+1) en la posición de cada marca
    (payload.marcas || []).forEach(function (m) {
      if (m.fila >= 0 && m.col >= 0) sh.getRange(m.fila + 1, m.col + 2).setValue(wa_handleNum(m.meta));
    });

    // 5b) Marcas de vendedores NUEVOS (Tupi, Porter, duplicados, agregados): crea/appendea su columna.
    if (payload.marcasNuevas && payload.marcasNuevas.length) {
      var data2 = sh.getDataRange().getValues();
      var lastCol = 8;
      if (data2[2]) { for (var cc = 11; cc < data2[2].length; cc += 3) { if (String(data2[2][cc] || "").trim()) lastCol = cc; } }
      var nextCol = lastCol >= 11 ? lastCol + 3 : 11;
      payload.marcasNuevas.forEach(function (blk) {
        var ms = (blk.marcas || []).filter(function (m) { return String(m.marca || "").trim(); });
        if (!ms.length || !blk.vendedor) return;
        if (blk.col >= 11) {
          // append a la columna existente del vendedor
          var col = blk.col, lastR = 4;
          for (var rr = 4; rr < data2.length; rr++) { if (String(data2[rr][col] || "").trim()) lastR = rr + 1; }
          var rowsA = ms.map(function (m) { return [String(m.marca), wa_handleNum(m.meta)]; });
          sh.getRange(lastR + 1, col + 1, rowsA.length, 2).setValues(rowsA);
        } else {
          // crea nueva columna: vendedor en fila 3, encabezados en fila 4, marcas desde fila 5
          sh.getRange(3, nextCol + 1).setValue(blk.vendedor);
          sh.getRange(4, nextCol + 1).setValue("Marca");
          sh.getRange(4, nextCol + 2).setValue("Monto Objetivo");
          var rowsC = ms.map(function (m) { return [String(m.marca), wa_handleNum(m.meta)]; });
          sh.getRange(5, nextCol + 1, rowsC.length, 2).setValues(rowsC);
          nextCol += 3;
        }
      });
    }

    SpreadsheetApp.flush();
    return { ok: true, msg: "✅ Guardado en el CONFIG. Actualizá el dashboard (botón Actualizar Base) para verlo." };
  } catch (err) {
    return { ok: false, msg: "Error al guardar: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ---------- HTML ----------
function WA_HTML() {
  return '' +
'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
'<style>' +
':root{--bg:#eef1f6;--card:#fff;--ink:#1a2233;--mut:#7b8794;--line:#e6eaf0;--accent:#0f9d8f;--accent2:#0b7d72;--shadow:0 1px 3px rgba(20,30,50,.06),0 6px 20px rgba(20,30,50,.05)}' +
'*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
'html,body{margin:0}body{background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;padding-bottom:90px}' +
'input,select,button{font-family:inherit}' +
// top bar
'.top{position:sticky;top:0;z-index:20;background:linear-gradient(120deg,#0b7d72,#0f9d8f);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 14px rgba(11,125,114,.35)}' +
'.top .logo{font-size:22px}.top h1{font-size:16px;font-weight:700;margin:0;letter-spacing:.2px}.top .sp{flex:1}' +
'.top select{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer}' +
'.top select option{color:#1a2233}' +
'.wrap{max-width:1080px;margin:0 auto;padding:16px}' +
// resumen canales
'.resumen{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}' +
'.kpi{background:var(--card);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);border:1px solid var(--line);position:relative;overflow:hidden}' +
'.kpi .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--mut);display:flex;align-items:center;gap:6px}' +
'.kpi .dot{width:9px;height:9px;border-radius:50%;flex:none}' +
'.kpi .val{font-size:17px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-.3px}' +
'.kpi input{width:100%;border:none;background:transparent;font-size:17px;font-weight:800;color:var(--ink);padding:2px 0;font-variant-numeric:tabular-nums;letter-spacing:-.3px;border-bottom:1px dashed transparent}' +
'.kpi input:focus{outline:none;border-bottom-color:var(--accent)}' +
'.kpi .bar{height:5px;border-radius:4px;background:var(--line);margin-top:9px;overflow:hidden}.kpi .bar span{display:block;height:100%;border-radius:4px;transition:width .35s ease}' +
'.kpi .sub{font-size:10.5px;color:var(--mut);margin-top:5px;font-variant-numeric:tabular-nums}' +
'.kpi.global{background:linear-gradient(120deg,#111827,#1f2937);color:#fff;grid-column:span 2}' +
'.kpi.global .lbl{color:#9fb4c9}.kpi.global .val{font-size:24px;color:#fff}' +
// cards
'.card{background:var(--card);border-radius:14px;box-shadow:var(--shadow);border:1px solid var(--line);margin-bottom:14px;overflow:hidden}' +
'.card>.hd{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}' +
'.card>.hd h2{font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);margin:0}' +
'.card>.bd{padding:14px 16px}' +
'label.f{font-size:11px;color:var(--mut);display:block;margin-bottom:4px;font-weight:600}' +
'.grid{display:grid;gap:12px}.g5{grid-template-columns:repeat(5,1fr)}' +
'.inp{width:100%;padding:9px 11px;border:1px solid #d4dae3;border-radius:9px;font-size:13.5px;background:#fff;transition:border .15s,box-shadow .15s}' +
'.inp:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(15,157,143,.13)}' +
'.inp:disabled{background:#f2f4f8;color:#6b7686}' +
'.hint{font-size:11px;color:var(--mut);margin-top:8px}' +
// toolbar
'.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}' +
'.search{flex:1;min-width:180px;position:relative}.search input{width:100%;padding:10px 12px 10px 34px;border:1px solid #d4dae3;border-radius:10px;font-size:13.5px;background:#fff}' +
'.search input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(15,157,143,.13)}' +
'.search .ic{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--mut)}' +
'.btn{border:none;border-radius:10px;padding:10px 15px;font-size:13px;font-weight:700;cursor:pointer;transition:transform .08s,filter .15s;white-space:nowrap}' +
'.btn:active{transform:translateY(1px)}.btn:hover{filter:brightness(.97)}' +
'.btn-p{background:var(--accent);color:#fff}.btn-g{background:linear-gradient(120deg,#0b7d72,#0f9d8f);color:#fff;box-shadow:0 4px 14px rgba(15,157,143,.4)}' +
'.btn-s{background:#eef1f6;color:#2d3748;border:1px solid var(--line)}.btn-x{background:#fff0f0;color:#d64545;padding:6px 9px;border:1px solid #ffd9d9}' +
// vendor rows
'.vend{display:grid;grid-template-columns:1fr 148px 168px 34px;gap:10px;align-items:start;padding:11px 0;border-bottom:1px solid var(--line)}' +
'.vend:last-child{border-bottom:none}' +
'.vend .name{width:100%;padding:8px 10px;border:1px solid transparent;border-radius:8px;font-size:13.5px;font-weight:600;background:#f7f9fc}' +
'.vend .name:focus{outline:none;border-color:var(--accent);background:#fff}' +
'.chanwrap{position:relative}.chanwrap select{width:100%;padding:8px 8px 8px 26px;border:1px solid #d4dae3;border-radius:8px;font-size:12.5px;font-weight:700;background:#fff;appearance:none;cursor:pointer}' +
'.chanwrap .cdot{position:absolute;left:9px;top:50%;transform:translateY(-50%);width:10px;height:10px;border-radius:50%;pointer-events:none}' +
'.vend .obj{width:100%;padding:8px 10px;border:1px solid #d4dae3;border-radius:8px;font-size:13.5px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}' +
'.vend .obj:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(15,157,143,.13)}' +
'.mkline{grid-column:1 / -1;margin-top:2px}' +
'.mktog{cursor:pointer;color:var(--accent2);font-size:12px;font-weight:700;background:#eefaf8;border:1px solid #cdeee9;padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}' +
'.mkpanel{margin-top:8px;background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:10px}' +
'.mkbar{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}' +
'.mkbar input.q{flex:1;min-width:120px;padding:7px 10px;border:1px solid #d4dae3;border-radius:8px;font-size:12.5px}' +
'.mkgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;max-height:280px;overflow:auto}' +
'.mkrow{display:flex;gap:6px;align-items:center}.mkrow input.mn{flex:1;padding:6px 8px;border:1px solid #e0e5ec;border-radius:7px;font-size:12px;background:#fff}' +
'.mkrow input.mv{width:118px;padding:6px 8px;border:1px solid #e0e5ec;border-radius:7px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums;background:#fff}' +
'.mkrow input.mv.has{border-color:#9ad6cf;background:#f2fbf9;font-weight:700}' +
'.chip{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px}' +
// sticky save
'.savebar{position:fixed;left:0;right:0;bottom:0;z-index:25;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 -4px 20px rgba(20,30,50,.08)}' +
'.savebar .g{flex:1}.savebar .gl{font-size:10.5px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:.4px}' +
'.savebar .gv{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.4px}' +
'.roflag{background:#fff8ec;border:1px solid #f6d58a;color:#8a5a12;padding:9px 12px;border-radius:10px;font-size:12.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px}' +
'#loading{padding:70px 20px;text-align:center;color:var(--mut);font-size:14px}' +
'.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;margin:0 auto 14px;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}' +
'#msg{position:fixed;left:50%;bottom:82px;transform:translateX(-50%) translateY(20px);opacity:0;background:#111827;color:#fff;padding:11px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:40;transition:opacity .25s,transform .25s;pointer-events:none}' +
'#msg.show{opacity:1;transform:translateX(-50%) translateY(0)}#msg.err{background:#c0392b}#msg.ok{background:#0b7d72}' +
'@media(max-width:720px){.g5{grid-template-columns:1fr 1fr}.vend{grid-template-columns:1fr 110px;gap:8px}.vend .chanwrap{grid-column:1}.vend .obj{grid-column:2}.vend .xbtn{grid-column:2;justify-self:end}.kpi.global{grid-column:span 2}}' +
'</style></head><body>' +

'<div class="top"><span class="logo">🌿</span><h1>Vitálica · Objetivos</h1><span class="sp"></span>' +
'<select id="selMes" onchange="cambiarMes()"></select></div>' +

'<div id="loading"><div class="spin"></div>Cargando datos reales de la planilla…</div>' +

'<datalist id="odooVends"></datalist>' +
'<div id="pickerBg" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:30" onclick="cerrarPicker()">' +
'<div style="max-width:520px;margin:50px auto;background:#fff;border-radius:14px;padding:16px;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)" onclick="event.stopPropagation()">' +
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:15px;font-weight:800">Agregar vendedor</h2><button class="btn btn-s" style="padding:5px 10px" onclick="cerrarPicker()">✕</button></div>' +
'<input id="pickerSearch" class="inp" placeholder="🔍 Buscar en Odoo…" oninput="renderPicker()">' +
'<div id="pickerList" style="overflow:auto;margin-top:10px;flex:1"></div>' +
'<button class="btn btn-s" style="margin-top:10px" onclick="agregarVend(\'\')">✎ Agregar uno en blanco (escribir a mano)</button>' +
'</div></div>' +
'<div id="mkPickerBg" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:31" onclick="cerrarMkPicker()">' +
'<div style="max-width:520px;margin:50px auto;background:#fff;border-radius:14px;padding:16px;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)" onclick="event.stopPropagation()">' +
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:15px;font-weight:800">Agregar marca a <span id="mkPickerVend" style="color:#0b7d72"></span></h2><button class="btn btn-s" style="padding:5px 10px" onclick="cerrarMkPicker()">✕</button></div>' +
'<input id="mkPickerSearch" class="inp" placeholder="🔍 Buscar marca…" oninput="renderMkPicker()">' +
'<div id="mkPickerList" style="overflow:auto;margin-top:10px;flex:1"></div>' +
'<div style="display:flex;gap:6px;margin-top:10px"><input id="mkPickerNueva" class="inp" style="flex:1" placeholder="…o escribí una marca nueva"><button class="btn btn-p" onclick="agregarMarcaNueva()">Agregar</button></div>' +
'</div></div>' +
'<div class="wrap" id="app" style="display:none">' +
'<div id="boundFlag" style="display:none;background:#fff5f5;border:1px solid #feb2b2;color:#9b2c2c;padding:10px 14px;border-radius:10px;font-size:12.5px;margin-bottom:12px;line-height:1.5"></div>' +
'<details id="diagBox" style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#4a5568"><summary style="cursor:pointer;font-weight:700;color:#2d3748">🔎 Diagnóstico (tocá para ver / mandame una foto de esto)</summary><div id="diagBody" style="margin-top:8px;font-family:monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-word"></div></details>' +
'<div id="roFlag" class="roflag" style="display:none">👁️ Viendo un mes <b style="margin:0 4px">archivado</b> (solo lectura). <button class="btn btn-s" style="margin-left:auto;padding:6px 12px" onclick="copiarAlVivo()">⬇ Copiar al mes en vivo</button></div>' +

'<div class="resumen" id="resumen"></div>' +

'<div class="card"><div class="hd"><h2>📅 Período</h2><span id="hoyTxt" style="font-size:12px;color:#718096;font-weight:600;margin-left:10px"></span><span style="flex:1"></span>' +
'<button class="btn btn-s" id="btnArch" style="margin-right:8px" onclick="archivarVivo()">📌 Archivar mes actual</button>' +
'<select id="selPrep" class="inp" style="width:auto;padding:8px 10px;font-weight:600" onchange="prepararMes()"></select>' +
'<button class="btn btn-s" id="btnPrep" style="margin-left:8px" onclick="prepararMes()">Aplicar</button>' +
'</div><div class="bd">' +
'<div id="prepBanner" style="display:none;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;padding:9px 12px;border-radius:10px;font-size:12.5px;margin-bottom:12px;align-items:center;gap:8px"></div>' +
'<div class="grid g5">' +
'<div><label class="f">Fecha Inicio</label><input class="inp" id="fInicio"></div>' +
'<div><label class="f">Fecha Fin</label><input class="inp" id="fFin"></div>' +
'<div><label class="f">Fecha Corte (mes vivo)</label><input class="inp" id="fCorte"></div>' +
'<div><label class="f">Días háb. del mes</label><input class="inp" id="dMes" disabled></div>' +
'<div><label class="f">Días transcurridos</label><input class="inp" id="dTrans" disabled></div>' +
'</div><div class="hint">💡 La <b>Fecha Corte</b> solo mueve el cálculo del mes (el %). Para pasar a otro mes usá <b>“Preparar mes nuevo”</b> arriba. Los días hábiles se calculan solos (fechas + feriados).</div></div></div>' +

'<div class="card"><div class="hd"><h2>👥 Vendedores y marcas</h2><span id="vendCount" class="chip" style="background:#eef1f6;color:#7b8794"></span></div><div class="bd">' +
'<div class="toolbar">' +
'<div class="search"><span class="ic">🔍</span><input id="buscar" placeholder="Buscar vendedor…" oninput="filtrar()"></div>' +
'<button class="btn btn-s" id="btnAdd" onclick="abrirPicker()">＋ Vendedor</button>' +
'<button class="btn btn-s" id="btnDedup" onclick="quitarDuplicados()">🧹 Quitar duplicados</button>' +
'<button class="btn btn-p" id="btnAuto" onclick="autoSumar()">↺ Auto-sumar canales</button>' +
'</div>' +
'<div id="tbody"></div>' +
'</div></div>' +

'</div>' +

'<div class="savebar" id="savebar" style="display:none">' +
'<div class="g"><div class="gl">Global del mes</div><div class="gv" id="gvBar">₲ 0</div></div>' +
'<button class="btn btn-g" id="btnSave" style="padding:12px 22px;font-size:14px" onclick="guardarActual()">💾 Guardar mes en vivo</button>' +
'</div>' +
'<div id="msg"></div>' +

'<script>' +
'var TODO=null,MES="vivo",VIVO=null,VISTA=null,FILTRO="",MARCAS_MASTER=[];' +
'function construirMaster(){var set={},out=[];function scan(mp){Object.keys(mp||{}).forEach(function(k){(mp[k].marcas||[]).forEach(function(m){var mk=String(m.marca||"").trim();if(mk&&!(mk.toUpperCase() in set)){set[mk.toUpperCase()]=1;out.push(mk);}});});}scan(VIVO&&VIVO.marcasPorVendedor);Object.keys(TODO.historico||{}).forEach(function(mm){scan(TODO.historico[mm].marcasPorVendedor);});return out;}' +
'function aplicarMaster(vista){if(!MARCAS_MASTER.length)return;vista.vendedores.forEach(function(v){var mk=vista.marcasPorVendedor[v.nombre];if(!mk||!mk.marcas||!mk.marcas.length){vista.marcasPorVendedor[v.nombre]={vendedor:v.nombre,col:-1,marcas:MARCAS_MASTER.map(function(m){return {marca:m,meta:0,fila:-1,col:-1};})};}});}' +
'var CC={"Salon":"#3b82f6","Online":"#8b5cf6","E-commerce":"#0f9d8f","Mayoristas":"#f59e0b","Venta Externa":"#ec4899","Directorio":"#64748b","Reparaciones":"#a16207"};' +
'function col(c){return CC[c]||"#94a3b8";}' +
'function fmt(n){n=Math.round(n||0);return "₲ "+n.toLocaleString("es-PY");}' +
'function fmtShort(n){n=Math.round(n||0);if(n>=1e9)return "₲ "+(n/1e9).toFixed(2).replace(/\\.?0+$/,"")+" mil M";if(n>=1e6)return "₲ "+(n/1e6).toFixed(0)+" M";return "₲ "+n.toLocaleString("es-PY");}' +
'function parseNum(v){var s=String(v||"").replace(/[^0-9]/g,"");return s?parseInt(s,10):0;}' +
'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}' +
'function jkey(s){return String(s).replace(/[\'\\\\]/g,"");}' +
'function clonar(o){return JSON.parse(JSON.stringify(o));}' +
'function canalOptions(sel){var o=TODO.canalesDisponibles.map(function(c){return "<option"+(c===sel?" selected":"")+">"+c+"</option>";}).join("");return "<option value=\\"\\">—</option>"+o;}' +

'function armarVista(mesKey){' +
' if(mesKey==="vivo")return clonar(VIVO);' +
' var h=TODO.historico[mesKey];' +
' var canales=TODO.canalesDisponibles.filter(function(c){return c!=="Reparaciones";}).map(function(c){return {canal:c,monto:(h.canales&&h.canales[c])||0};});' +
' var vend=h.vendedores.map(function(v){return {nombre:v.nombre,total:v.total,canal:v.canal||"",fila:-1};});' +
' var mk={};Object.keys(h.marcasPorVendedor||{}).forEach(function(k){mk[k]={vendedor:h.marcasPorVendedor[k].vendedor,col:-1,marcas:h.marcasPorVendedor[k].marcas.map(function(m){return {marca:m.marca,meta:m.meta,fila:-1,col:-1};})};});' +
' return {control:{fechaInicio:"",fechaFin:"",fechaCorte:"",diasMes:h.diasMes,diasTrans:h.diasTrans},global:h.global,canales:canales,vendedores:vend,marcasPorVendedor:mk};' +
'}' +

'function labelMes(){return (TODO.historico[MES]&&TODO.historico[MES].label)||("Mes "+MES);}' +
'function render(){' +
' var esVivo=(MES==="vivo");' +
' var rf=document.getElementById("roFlag");' +
' if(esVivo){rf.style.display="none";}else{rf.style.display="flex";' +
'  rf.innerHTML="<span style=\\"flex:1\\">✏️ Estás editando el <b>histórico de "+labelMes()+"</b>. Se guarda en la planilla y <b>no pisa el mes en vivo</b>.</span><button class=\\"btn btn-s\\" style=\\"padding:6px 12px;white-space:nowrap\\" onclick=\\"copiarAlVivo()\\">⬇ Copiar al mes en vivo</button>";}' +
' document.getElementById("savebar").style.display="flex";' +
' document.getElementById("btnAdd").style.display="inline-block";' +
' document.getElementById("btnAuto").style.display="inline-block";' +
' var sb=document.getElementById("btnSave");sb.textContent=esVivo?"💾 Guardar mes en vivo":("💾 Guardar "+labelMes()+" en histórico");' +
' var c=VISTA.control;' +
' set("fInicio",c.fechaInicio,!esVivo);set("fFin",c.fechaFin,!esVivo);set("fCorte",c.fechaCorte,!esVivo);' +
' var dm=document.getElementById("dMes"),dt=document.getElementById("dTrans");' +
' dm.value=c.diasMes||"";dt.value=c.diasTrans||"";dm.disabled=esVivo;dt.disabled=esVivo;' +
' dm.oninput=function(){VISTA.control.diasMes=this.value;};dt.oninput=function(){VISTA.control.diasTrans=this.value;};' +
' aplicarMaster(VISTA);renderVend(false);renderResumen();recalc();' +
'}' +
'function set(id,v,ro){var e=document.getElementById(id);e.value=v||"";e.disabled=ro;}' +

'function renderVend(ro){' +
' var tb=document.getElementById("tbody");tb.innerHTML="";' +
' var vis=0;' +
' VISTA.vendedores.forEach(function(v,i){' +
'  if(FILTRO&&(v.nombre||"").toLowerCase().indexOf(FILTRO)<0)return;vis++;' +
'  var d=ro?"disabled":"";var mk=VISTA.marcasPorVendedor[v.nombre];' +
'  var conObj=mk?mk.marcas.filter(function(m){return m.meta>0;}).length:0;var totM=mk?mk.marcas.length:0;' +
'  var row=document.createElement("div");row.className="vend";' +
'  row.innerHTML=' +
'   "<div><input class=\\"name\\" list=\\"odooVends\\" placeholder=\\"nombre (elegí de Odoo)\\" "+d+" value=\\""+esc(v.nombre)+"\\" oninput=\\"renombrarVend("+i+",this.value)\\">"+' +
'     "<div class=\\"mkline\\"><span class=\\"mktog\\" onclick=\\"toggleMk("+i+")\\">🏷️ marcas <b>"+conObj+"</b>/"+totM+"</span>"+' +
'      (ro?"":" <span class=\\"mktog\\" style=\\"background:#eef2f7;border-color:#dfe6ef;color:#4a5568\\" onclick=\\"duplicarVend("+i+")\\">⧉ duplicar</span>")+' +
'      "<div class=\\"mkpanel\\" id=\\"mk"+i+"\\" style=\\"display:none\\"></div></div></div>"+' +
'   "<div class=\\"chanwrap\\"><span class=\\"cdot\\" id=\\"cdot"+i+"\\" style=\\"background:"+col(v.canal)+"\\"></span>"+' +
'     "<select "+d+" onchange=\\"VISTA.vendedores["+i+"].canal=this.value;document.getElementById(\'cdot"+i+"\').style.background=this.value?colFromJs(this.value):\'#cbd5e1\';recalc()\\">"+canalOptions(v.canal)+"</select></div>"+' +
'   "<input class=\\"obj\\" "+d+" value=\\""+fmt(v.total)+"\\" oninput=\\"VISTA.vendedores["+i+"].total=parseNum(this.value);this.value=fmt(VISTA.vendedores["+i+"].total);recalc()\\">"+' +
'   "<div class=\\"xbtn\\">"+(ro?"":"<button class=\\"btn btn-x\\" onclick=\\"delVend("+i+")\\">✕</button>")+"</div>";' +
'  tb.appendChild(row);' +
' });' +
' document.getElementById("vendCount").textContent=VISTA.vendedores.length+" vendedores";' +
' if(vis===0)tb.innerHTML="<div style=\\"padding:20px;text-align:center;color:#7b8794\\">Sin resultados para \\""+esc(FILTRO)+"\\"</div>";' +
'}' +
'function colFromJs(c){return {"Salon":"#3b82f6","Online":"#8b5cf6","E-commerce":"#0f9d8f","Mayoristas":"#f59e0b","Venta Externa":"#ec4899","Directorio":"#64748b","Reparaciones":"#a16207"}[c]||"#94a3b8";}' +

'function toggleMk(i){var p=document.getElementById("mk"+i);if(p.style.display==="none"){p.innerHTML=marcaPanel(i);p.style.display="block";}else p.style.display="none";}' +
'function marcaPanel(i){' +
' var ro=false;var v=VISTA.vendedores[i];var vName=v.nombre;var mk=VISTA.marcasPorVendedor[vName];' +
' var jk=jkey(vName);' +
' var head="<div class=\\"mkbar\\"><input class=\\"q\\" placeholder=\\"filtrar marcas…\\" oninput=\\"filtMk("+i+",this.value)\\">"+' +
'   (ro?"":"<button class=\\"btn btn-s\\" style=\\"padding:6px 10px\\" onclick=\\"abrirMkPicker("+i+")\\">＋ marca</button>")+"</div>";' +
' var grid="<div class=\\"mkgrid\\" id=\\"mkg"+i+"\\">"+marcaRows(i)+"</div>";' +
' return head+grid;' +
'}' +
'function marcaRows(i){' +
' var ro=false;var vName=VISTA.vendedores[i].nombre;var mk=VISTA.marcasPorVendedor[vName];var jk=jkey(vName);' +
' if(!mk||!mk.marcas.length)return "<div style=\\"color:#7b8794;font-size:12px;padding:6px\\">Sin marcas.</div>";' +
' var q=(mk._q||"");' +
' return mk.marcas.map(function(m,mi){' +
'   if(q&&(m.marca||"").toLowerCase().indexOf(q)<0)return "";' +
'   var has=m.meta>0?"has":"";' +
'   return "<div class=\\"mkrow\\"><input class=\\"mn\\" "+(ro?"disabled":"")+" value=\\""+esc(m.marca)+"\\" oninput=\\"VISTA.marcasPorVendedor[\'"+jk+"\'].marcas["+mi+"].marca=this.value\\">"+' +
'     "<input class=\\"mv "+has+"\\" "+(ro?"disabled":"")+" value=\\""+fmt(m.meta)+"\\" oninput=\\"var mm=VISTA.marcasPorVendedor[\'"+jk+"\'].marcas["+mi+"];mm.meta=parseNum(this.value);this.value=fmt(mm.meta);this.className=\'mv \'+(mm.meta>0?\'has\':\'\')\\"></div>";' +
' }).join("");' +
'}' +
'function filtMk(i,q){var vName=VISTA.vendedores[i].nombre;VISTA.marcasPorVendedor[vName]._q=(q||"").toLowerCase();document.getElementById("mkg"+i).innerHTML=marcaRows(i);}' +
'function addMarca(jk,i){var vName=VISTA.vendedores[i].nombre;if(!VISTA.marcasPorVendedor[vName])VISTA.marcasPorVendedor[vName]={vendedor:vName,col:-1,marcas:[]};VISTA.marcasPorVendedor[vName].marcas.push({marca:"",meta:0,fila:-1,col:-1});document.getElementById("mkg"+i).innerHTML=marcaRows(i);}' +
'var MK_PICKER_VI=-1;' +
'function abrirMkPicker(i){MK_PICKER_VI=i;document.getElementById("mkPickerVend").textContent=VISTA.vendedores[i].nombre||"vendedor";document.getElementById("mkPickerBg").style.display="block";var s=document.getElementById("mkPickerSearch");s.value="";document.getElementById("mkPickerNueva").value="";renderMkPicker();setTimeout(function(){s.focus();},50);}' +
'function cerrarMkPicker(){document.getElementById("mkPickerBg").style.display="none";}' +
'function renderMkPicker(){var i=MK_PICKER_VI;if(i<0)return;var vName=VISTA.vendedores[i].nombre;var mk=VISTA.marcasPorVendedor[vName];' +
' var tiene={};if(mk)mk.marcas.forEach(function(m){tiene[String(m.marca||"").trim().toUpperCase()]=1;});' +
' var q=(document.getElementById("mkPickerSearch").value||"").toLowerCase();' +
' var faltan=MARCAS_MASTER.filter(function(n){return !tiene[String(n).trim().toUpperCase()];});' +
' var vis=faltan.filter(function(n){return !q||n.toLowerCase().indexOf(q)>=0;});' +
' var cont=document.getElementById("mkPickerList");' +
' var head="<div style=\\"font-size:11.5px;color:#718096;margin-bottom:6px;font-weight:700\\">Marcas de la lista que faltan: "+faltan.length+"</div>";' +
' if(!MARCAS_MASTER.length){cont.innerHTML="<div style=\\"color:#718096;font-size:12.5px;padding:6px\\">Escribí la marca abajo y tocá Agregar.</div>";return;}' +
' if(!vis.length){cont.innerHTML=head+"<div style=\\"color:#2f855a;font-size:12.5px;padding:8px\\">"+(faltan.length?"Sin resultados.":"✅ Ya tiene todas las marcas de la lista. Podés agregar una nueva abajo.")+"</div>";return;}' +
' cont.innerHTML=head+vis.map(function(n){return "<div style=\\"display:flex;justify-content:space-between;align-items:center;padding:7px 6px;border-bottom:1px solid #f1f5f9\\"><span style=\\"font-size:13px\\">"+esc(n)+"</span><button class=\\"btn btn-p\\" style=\\"padding:5px 12px;flex:none\\" data-n=\\""+esc(n)+"\\" onclick=\\"agregarMarcaAV(this.getAttribute(\'data-n\'))\\">+ agregar</button></div>";}).join("");' +
'}' +
'function agregarMarcaAV(nombre){var i=MK_PICKER_VI;var vName=VISTA.vendedores[i].nombre;if(!VISTA.marcasPorVendedor[vName])VISTA.marcasPorVendedor[vName]={vendedor:vName,col:-1,marcas:[]};VISTA.marcasPorVendedor[vName].marcas.push({marca:nombre,meta:0,fila:-1,col:-1});var g=document.getElementById("mkg"+i);if(g)g.innerHTML=marcaRows(i);renderMkPicker();toast("Marca agregada: "+nombre,"ok");}' +
'function agregarMarcaNueva(){var v=document.getElementById("mkPickerNueva").value.trim();if(!v){toast("Escribí el nombre de la marca","err");return;}agregarMarcaAV(v);document.getElementById("mkPickerNueva").value="";}' +

'function addVend(){VISTA.vendedores.push({nombre:"",canal:"",total:0,fila:-1});FILTRO="";document.getElementById("buscar").value="";renderVend(false);}' +
'function guessCanal(n){var u=(n||"").toUpperCase();if(u.indexOf("CONTIMARKET")>=0||u.indexOf("TUPI")>=0||u.indexOf("PORTER")>=0)return "E-commerce";return "";}' +
'function abrirPicker(){document.getElementById("pickerBg").style.display="block";var s=document.getElementById("pickerSearch");s.value="";renderPicker();setTimeout(function(){s.focus();},50);}' +
'function cerrarPicker(){document.getElementById("pickerBg").style.display="none";}' +
'function renderPicker(){' +
' var q=(document.getElementById("pickerSearch").value||"").toLowerCase();' +
' var enLista={};VISTA.vendedores.forEach(function(v){enLista[(v.nombre||"").trim().toUpperCase()]=1;});' +
' var odoo=(TODO.vendedoresOdoo||[]);' +
' var cont=document.getElementById("pickerList");' +
' if(!odoo.length){cont.innerHTML="<div style=\\"color:#c53030;font-size:12.5px;padding:8px\\">⚠️ No pude leer los vendedores de Odoo (hoja DATA). Puede ser que el script no esté enlazado, o que la hoja DATA esté vacía. Igual podés agregar a mano abajo.</div>";return;}' +
' var faltan=odoo.filter(function(n){return !enLista[String(n).trim().toUpperCase()];});' +
' var vis=faltan.filter(function(n){return !q||n.toLowerCase().indexOf(q)>=0;});' +
' var head="<div style=\\"font-size:11.5px;color:#718096;margin-bottom:6px;font-weight:700\\">Faltan agregar: "+faltan.length+" de "+odoo.length+" (los que ya están, no aparecen)</div>";' +
' if(!vis.length){cont.innerHTML=head+"<div style=\\"color:#2f855a;font-size:12.5px;padding:8px\\">"+(faltan.length?"Sin resultados para tu búsqueda.":"✅ Ya agregaste a todos los de Odoo.")+"</div>";return;}' +
' cont.innerHTML=head+vis.map(function(n){return "<div style=\\"display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid #f1f5f9\\"><span style=\\"font-size:13px\\">"+esc(n)+"</span><button class=\\"btn btn-p\\" style=\\"padding:5px 12px;flex:none\\" data-n=\\""+esc(n)+"\\" onclick=\\"agregarVend(this.getAttribute(\'data-n\'))\\">+ agregar</button></div>";}).join("");' +
'}' +
'function agregarVend(nombre){VISTA.vendedores.push({nombre:nombre||"",canal:guessCanal(nombre),total:0,fila:-1});FILTRO="";var bs=document.getElementById("buscar");if(bs)bs.value="";renderVend(MES!=="vivo");recalc();if(nombre){renderPicker();toast("Agregado: "+nombre,"ok");}else{cerrarPicker();}}' +
'function quitarDuplicados(){var seen={},out=[],q=0;VISTA.vendedores.forEach(function(v){var k=(v.nombre||"").trim().toUpperCase();if(!k){out.push(v);return;}if(seen[k]!==undefined){q++;if((v.total||0)>(out[seen[k]].total||0))out[seen[k]]=v;}else{seen[k]=out.length;out.push(v);}});VISTA.vendedores=out;renderVend(MES!=="vivo");recalc();toast(q>0?("Quité "+q+" duplicado(s) — dejé el de mayor objetivo. Revisá y guardá."):"No había duplicados.","ok");}' +
'function delVend(i){var v=VISTA.vendedores[i];if(v&&v.nombre&&VISTA.marcasPorVendedor[v.nombre])delete VISTA.marcasPorVendedor[v.nombre];VISTA.vendedores.splice(i,1);renderVend(MES!=="vivo");recalc();}' +
'function renombrarVend(i,nuevo){var v=VISTA.vendedores[i];var viejo=v.nombre;if(viejo!==nuevo){if(VISTA.marcasPorVendedor[viejo]){VISTA.marcasPorVendedor[nuevo]=VISTA.marcasPorVendedor[viejo];VISTA.marcasPorVendedor[nuevo].vendedor=nuevo;VISTA.marcasPorVendedor[nuevo].col=-1;if(nuevo!==viejo)delete VISTA.marcasPorVendedor[viejo];}v.nombre=nuevo;v.fila=-1;}}' +
'function duplicarVend(i){var v=VISTA.vendedores[i];var mk=VISTA.marcasPorVendedor[v.nombre];var nn=(v.nombre||"vendedor")+" (copia)";var k=2;while(VISTA.marcasPorVendedor[nn]||VISTA.vendedores.some(function(x){return x.nombre===nn;})){nn=(v.nombre||"vendedor")+" (copia "+(k++)+")";}' +
' VISTA.vendedores.splice(i+1,0,{nombre:nn,canal:v.canal,total:v.total,fila:-1});' +
' if(mk)VISTA.marcasPorVendedor[nn]={vendedor:nn,col:-1,marcas:mk.marcas.map(function(m){return {marca:m.marca,meta:m.meta,fila:-1,col:-1};})};' +
' renderVend(MES!=="vivo");recalc();toast("Duplicado ✓ Cambiale el nombre, canal y objetivo.","ok");}' +
'function filtrar(){FILTRO=(document.getElementById("buscar").value||"").toLowerCase();renderVend(MES!=="vivo");}' +

'function sumaPorCanal(){var m={};VISTA.vendedores.forEach(function(v){if(v.canal)m[v.canal]=(m[v.canal]||0)+(v.total||0);});return m;}' +
'function autoSumar(){var m=sumaPorCanal();VISTA.canales.forEach(function(c){c.monto=m[c.canal]||0;});renderResumen();recalc();toast("Canales auto-sumados desde vendedores","ok");}' +

'function renderResumen(){' +
' var esVivo=(MES==="vivo");' +
' var cont=document.getElementById("resumen");cont.innerHTML="";' +
' var g=document.createElement("div");g.className="kpi global";' +
' if(esVivo){g.innerHTML="<div class=\\"lbl\\">🎯 Global compañía</div><div class=\\"val\\" id=\\"kpiGlobal\\">₲ 0</div><div class=\\"sub\\" id=\\"kpiGlobalSub\\"></div>";}' +
' else{g.innerHTML="<div class=\\"lbl\\">🎯 Global compañía · editable</div><input id=\\"kpiGlobalInp\\" style=\\"width:100%;border:none;background:transparent;color:#fff;font-size:24px;font-weight:800;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,.4);font-variant-numeric:tabular-nums\\" value=\\""+fmt(VISTA.global)+"\\" oninput=\\"VISTA.global=parseNum(this.value);this.value=fmt(VISTA.global);var gv=document.getElementById(\'gvBar\');if(gv)gv.textContent=fmt(VISTA.global)\\"><div class=\\"sub\\" id=\\"kpiGlobalSub\\"></div>";}' +
' cont.appendChild(g);' +
' VISTA.canales.forEach(function(c,i){' +
'  var d=document.createElement("div");d.className="kpi";' +
'  d.innerHTML="<div class=\\"lbl\\"><span class=\\"dot\\" style=\\"background:"+col(c.canal)+"\\"></span>"+c.canal+"</div>"+' +
'   "<input id=\\"kc"+i+"\\" value=\\""+fmt(c.monto)+"\\" oninput=\\"VISTA.canales["+i+"].monto=parseNum(this.value);this.value=fmt(VISTA.canales["+i+"].monto);recalc()\\">"+' +
'   "<div class=\\"bar\\"><span id=\\"kb"+i+"\\" style=\\"width:0%;background:"+col(c.canal)+"\\"></span></div>"+' +
'   "<div class=\\"sub\\" id=\\"ks"+i+"\\"></div>";' +
'  cont.appendChild(d);' +
' });' +
'}' +
'function recalc(){' +
' var esVivo=(MES==="vivo");var m=sumaPorCanal();var g=0;' +
' VISTA.canales.forEach(function(c,i){g+=(c.monto||0);' +
'  var s=m[c.canal]||0;var bar=document.getElementById("kb"+i);var sub=document.getElementById("ks"+i);' +
'  if(bar){var pct=c.monto>0?Math.min(100,Math.round(s/c.monto*100)):(s>0?100:0);bar.style.width=pct+"%";}' +
'  if(sub){sub.textContent="vend: "+fmtShort(s)+(c.monto>0?"  ·  "+Math.round(s/c.monto*100)+"%":"");sub.style.color=(s!==c.monto&&s>0)?"#dd6b20":"#7b8794";}' +
' });' +
' if(esVivo)VISTA.global=g;' +
' var kg=document.getElementById("kpiGlobal");if(kg)kg.textContent=fmt(VISTA.global);' +
' var kgi=document.getElementById("kpiGlobalInp");if(kgi&&document.activeElement!==kgi)kgi.value=fmt(VISTA.global);' +
' var gv=document.getElementById("gvBar");if(gv)gv.textContent=fmt(VISTA.global);' +
' var sub=document.getElementById("kpiGlobalSub");if(sub){var nv=VISTA.vendedores.filter(function(v){return v.total>0;}).length;sub.textContent=nv+" vendedores con objetivo";}' +
'}' +

'function cambiarMes(){MES=document.getElementById("selMes").value;VISTA=armarVista(MES);FILTRO="";var b=document.getElementById("buscar");if(b)b.value="";var pb=document.getElementById("prepBanner");if(pb)pb.style.display="none";render();}' +
'function pad2(n){return (n<10?"0":"")+n;}' +
'function prepararMes(){var mm=parseInt(document.getElementById("selPrep").value,10);if(!mm){return;}' +
' var mesAnt=mesDeFecha(VIVO.control.fechaCorte)||TODO.mesVivo;var mesAntTxt=TODO.meses[mesAnt]||"el mes actual";' +
' if(MES!=="vivo"){document.getElementById("selMes").value="vivo";MES="vivo";VISTA=clonar(VIVO);}' +
' var yr=(VISTA.control.fechaFin&&VISTA.control.fechaFin.split("/")[2])||"2026";var last=new Date(parseInt(yr,10),mm,0).getDate();' +
' VISTA.control.fechaInicio="01/"+pad2(mm)+"/"+yr;VISTA.control.fechaFin=pad2(last)+"/"+pad2(mm)+"/"+yr;VISTA.control.fechaCorte="01/"+pad2(mm)+"/"+yr;' +
' document.getElementById("selPrep").value="";render();' +
' var bn=document.getElementById("prepBanner");bn.style.display="flex";bn.style.flexWrap="wrap";' +
'  bn.innerHTML="<span style=\\"flex:1;min-width:240px\\">🗓️ <b>Preparando "+TODO.meses[mm]+".</b> Abajo están los objetivos del mes anterior de base. <b>⚠️ Al Guardar vas a reemplazar "+mesAntTxt+"</b> — si querés conservarlo, archivalo primero.</span>"+' +
'   "<button class=\\"btn btn-p\\" style=\\"padding:6px 10px;white-space:nowrap\\" onclick=\\"archivarVivo()\\">📌 Archivar "+mesAntTxt+"</button>"+' +
'   "<button class=\\"btn btn-s\\" style=\\"padding:6px 10px;white-space:nowrap\\" onclick=\\"vaciarObjetivos()\\">🧹 Empezar de cero</button>";' +
' toast("Preparando "+TODO.meses[mm]+". Archivá "+mesAntTxt+" si querés conservarlo.","ok");' +
' window.scrollTo({top:0,behavior:"smooth"});' +
'}' +
'function mesDeFecha(f){if(!f)return 0;var p=String(f).split(" ")[0];if(p.indexOf("/")>=0)return parseInt(p.split("/")[1],10)||0;if(p.indexOf("-")>=0)return parseInt(p.split("-")[1],10)||0;return 0;}' +
'function archivarVivo(){' +
' var mes=mesDeFecha(VIVO.control.fechaCorte)||TODO.mesVivo;' +
' if(!mes){toast("No sé qué mes archivar (revisá la Fecha Corte del mes en vivo)","err");return;}' +
' var nom=TODO.meses[mes]||("Mes "+mes);' +
' if(!confirm("¿Archivar "+nom+" en el histórico?\\n\\nSe guarda una FOTO del mes en vivo actual. Después podés editarla eligiendo "+nom+" en el menú de arriba. Así no se pierde cuando cargues el mes nuevo.")) return;' +
' var marcas=[];Object.keys(VIVO.marcasPorVendedor||{}).forEach(function(k){VIVO.marcasPorVendedor[k].marcas.forEach(function(m){if(m.marca)marcas.push({vendedor:k,marca:m.marca,meta:m.meta});});});' +
' var payload={mes:String(mes),data:{global:VIVO.global,diasMes:VIVO.control.diasMes,diasTrans:VIVO.control.diasTrans,canales:VIVO.canales,vendedores:VIVO.vendedores,marcas:marcas}};' +
' toast("Archivando "+nom+"…","ok");' +
' google.script.run.withSuccessHandler(function(r){toast(r.msg,r.ok?"ok":"err");if(r.ok)recargarDatos();}).withFailureHandler(function(e){toast("Error: "+e.message,"err");}).wa_guardarHistorico(payload);' +
'}' +
'function vaciarObjetivos(){VISTA.vendedores.forEach(function(v){v.total=0;});VISTA.canales.forEach(function(c){c.monto=0;});Object.keys(VISTA.marcasPorVendedor).forEach(function(k){VISTA.marcasPorVendedor[k].marcas.forEach(function(m){m.meta=0;});});render();toast("Objetivos en 0. Cargá los nuevos y guardá.","ok");}' +
'function copiarAlVivo(){VIVO=clonar(VISTA);document.getElementById("selMes").value="vivo";MES="vivo";VISTA=clonar(VIVO);render();toast("Copiado al mes en vivo. Revisá y guardá.","ok");}' +

'function toast(t,tipo){var m=document.getElementById("msg");m.textContent=t;m.className="show "+(tipo||"");setTimeout(function(){m.className=(tipo||"");},tipo==="err"?6000:3000);}' +
'function guardar(){' +
' VISTA.control.fechaInicio=document.getElementById("fInicio").value;' +
' VISTA.control.fechaFin=document.getElementById("fFin").value;' +
' VISTA.control.fechaCorte=document.getElementById("fCorte").value;' +
' var marcas=[],nuevas={};' +
' Object.keys(VISTA.marcasPorVendedor).forEach(function(k){var mk=VISTA.marcasPorVendedor[k];var vcol=(mk.col===undefined?-1:mk.col);' +
'  mk.marcas.forEach(function(m){' +
'   if(m.fila>=0&&m.col>=0){marcas.push({fila:m.fila,col:m.col,meta:m.meta});}' +
'   else if(String(m.marca||"").trim()){if(!nuevas[k])nuevas[k]={vendedor:(mk.vendedor||k),col:vcol,marcas:[]};nuevas[k].marcas.push({marca:m.marca,meta:m.meta});}' +
'  });});' +
' var marcasNuevas=Object.keys(nuevas).map(function(k){return nuevas[k];}).filter(function(b){return b.marcas.some(function(m){return (m.meta||0)>0;});});' +
' var payload={control:VISTA.control,global:VISTA.global,canales:VISTA.canales,vendedores:VISTA.vendedores,marcas:marcas,marcasNuevas:marcasNuevas};' +
' toast("Guardando…","ok");' +
' google.script.run.withSuccessHandler(function(r){toast(r.msg,r.ok?"ok":"err");if(r.ok)recargarDatos();}).withFailureHandler(function(e){toast("Error: "+e.message,"err");}).wa_guardarVivo(payload);' +
'}' +
'function guardarActual(){if(MES==="vivo")guardar();else guardarHistorico();}' +
'function guardarHistorico(){' +
' var marcas=[];Object.keys(VISTA.marcasPorVendedor).forEach(function(k){VISTA.marcasPorVendedor[k].marcas.forEach(function(m){if(m.marca&&String(m.marca).trim())marcas.push({vendedor:k,marca:m.marca,meta:m.meta});});});' +
' var payload={mes:MES,data:{global:VISTA.global,diasMes:document.getElementById("dMes").value,diasTrans:document.getElementById("dTrans").value,canales:VISTA.canales,vendedores:VISTA.vendedores,marcas:marcas}};' +
' toast("Guardando "+labelMes()+" en histórico…","ok");' +
' google.script.run.withSuccessHandler(function(r){toast(r.msg,r.ok?"ok":"err");if(r.ok)recargarDatos();}).withFailureHandler(function(e){toast("Error: "+e.message,"err");}).wa_guardarHistorico(payload);' +
'}' +

'function aplicarBound(){var bf=document.getElementById("boundFlag");if(bf){' +
' if(TODO.bound){bf.style.display="none";}else{bf.style.display="block";' +
'  bf.innerHTML="⚠️ <b>El script no está enlazado a tu planilla</b> — podés VER pero <b>NO guardar</b>, y los datos pueden estar desactualizados. Solución: abrí tu planilla ▸ <b>Extensiones ▸ Apps Script</b>, pegá este archivo ahí y volvé a implementar. (Fuente actual: "+(TODO.fuente||"CSV")+")";}}' +
' var db=document.getElementById("diagBody");if(db){var g=TODO.diag||{};' +
'  db.textContent="enlazado (puede guardar): "+(TODO.bound?"SÍ":"NO")+"\\nfuente: "+(TODO.fuente||"?")+"\\nfilas leídas: "+(g.filas||0)+"\\nvendedores: "+(g.nVend||0)+"\\ncanales con monto: "+(g.nCanales||0)+"\\nmeses histórico: "+(g.nHist||0)+"\\nnota: "+(g.nota||"(ok)")+"\\npestañas de la planilla: "+((g.hojas||[]).join(", ")||"?");}}' +
'function refrescarSelMes(){var sel=document.getElementById("selMes");var opts="<option value=\\"vivo\\">📝 Mes en vivo · editable</option>";' +
' Object.keys(TODO.historico).sort(function(a,b){return parseInt(b)-parseInt(a);}).forEach(function(m){opts+="<option value=\\""+m+"\\">📅 "+TODO.historico[m].label+" · editable</option>";});sel.innerHTML=opts;sel.value=MES;}' +
'function recargarDatos(){google.script.run.withSuccessHandler(function(d){TODO=d;VIVO=d.vivo;MARCAS_MASTER=construirMaster();aplicarBound();refrescarSelMes();VISTA=armarVista(MES);render();}).withFailureHandler(function(e){toast("No pude releer: "+e.message,"err");}).wa_getTodo();}' +
'function init(d){TODO=d;VIVO=d.vivo;aplicarBound();MARCAS_MASTER=construirMaster();' +
' MES="vivo";VISTA=clonar(VIVO);refrescarSelMes();' +
' var sp=document.getElementById("selPrep");var so="<option value=\\"\\">🗓️ Preparar mes nuevo…</option>";for(var i=1;i<=12;i++)so+="<option value=\\""+i+"\\">"+d.meses[i]+"</option>";sp.innerHTML=so;' +
' var dl=document.getElementById("odooVends");if(dl&&d.vendedoresOdoo){dl.innerHTML=d.vendedoresOdoo.map(function(n){return "<option value=\\""+String(n).replace(/"/g,"&quot;")+"\\">";}).join("");}' +
' var ht=document.getElementById("hoyTxt");if(ht){try{ht.textContent="📆 Hoy: "+(new Date()).toLocaleDateString("es-PY")+" · Mes en vivo: "+((TODO.meses[TODO.mesVivo])||"?");}catch(e){}}' +
' document.getElementById("loading").style.display="none";document.getElementById("app").style.display="block";render();' +
'}' +
'google.script.run.withSuccessHandler(init).withFailureHandler(function(e){document.getElementById("loading").innerHTML="⚠️ "+e.message;}).wa_getTodo();' +
'</script></body></html>';
}
