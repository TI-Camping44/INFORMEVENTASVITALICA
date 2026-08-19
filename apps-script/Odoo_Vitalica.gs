// ==================================================================
//  BI COMERCIAL — VITÁLICA   ·   PULL DE VENTAS DESDE ODOO
// ------------------------------------------------------------------
//  Misma instancia de Odoo del grupo. Vitálica es la EMPRESA ID 2
//  (Camping 44 es la 1), así que todo el filtro pasa por EMPRESA_ID.
//
//  ⚠️ CREDENCIALES: la API key NO va escrita en este archivo porque el
//  archivo vive en un repositorio de GitHub. Se carga UNA sola vez desde
//  el menú  ⚙️ Menú Vitálica ▸ 🔐 Configurar credenciales de Odoo
//  (queda guardada en las Propiedades del Script, privada de la planilla).
// ==================================================================
const ODOO_URL  = "https://camping44.odoo.com/jsonrpc";
const ODOO_DB   = "gcaceres93-camping-main-15845610";
const ODOO_USER = "facundocolman@camping44.com.py";

// 🏢 Empresa a traer:  1 = Camping 44 · 2 = VITÁLICA
const EMPRESA_ID = 2;
const EMPRESA_NOMBRE = "VITÁLICA";

/** API key de Odoo (guardada en Propiedades del Script, no en el código). */
function getOdooPwd_() {
  var p = PropertiesService.getScriptProperties().getProperty("ODOO_API_KEY");
  if (!p) throw new Error("Falta la API key de Odoo. Usá el menú ⚙️ Menú Vitálica ▸ 🔐 Configurar credenciales de Odoo.");
  return p;
}

/** Pide la API key una sola vez y la guarda en las Propiedades del Script. */
function configurarCredencialesOdoo() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("🔐 Credenciales de Odoo", "Pegá la API key de Odoo del usuario " + ODOO_USER + ":", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var key = r.getResponseText().trim();
  if (!key) { ui.alert("No se guardó nada (la clave vino vacía)."); return; }
  PropertiesService.getScriptProperties().setProperty("ODOO_API_KEY", key);
  ui.alert("✅ Credencial guardada. Ya podés usar «Descargar Ventas Odoo».");
}

const HOJA_DESTINO   = "DATA";
const HOJA_CONFIG    = "CONFIG";
const HOJA_DASHBOARD = "DASHBOARD COMERCIAL";
const HOJA_DESCUBRIMIENTO = "DESCUBRIMIENTO";

// ==================================================================
//  REGLAS DE NEGOCIO DE VITÁLICA   (todo lo editable vive acá abajo)
// ------------------------------------------------------------------
//  Cargadas con lo que muestra el informe (Looker) actual de Vitálica:
//  importes SIN IVA, sin Merchandising ni Muestrario, canales Mayorista /
//  Distribuidor / Consumidor Final / Gimnasios y Muestrarios / Sin Comisiones
//  y el análisis por CATEGORÍA de producto (Proteínas, Creatinas, ...).
//  Para confirmar los nombres exactos que tiene Odoo, corré
//  🔎 Descubrir estructura de Vitálica y ajustá estas listas.
// ==================================================================

// 💰 Base de los importes del panel:
//    "SIN_IVA"  = subtotal, igual que el Looker actual ("Monto Fact. Año s/IVA")
//    "CON_IVA"  = total con impuestos
const MONTO_BASE = "SIN_IVA";

// 🏷️ Eje principal del análisis:
//    "CATEGORIA" = Vitálica (Proteínas, Creatinas, Pre Entrenos...)
//    "MARCA"     = Camping 44 (marca del producto)
//    Con "CATEGORIA" se toma el último tramo de la categoría de Odoo
//    ("ALL / Suplementos (Padre) / Proteínas"  ➜  "Proteínas").
const EJE_PRINCIPAL = "CATEGORIA";

// 📅 Un cliente cuenta como ACTIVO si compró en los últimos N meses.
const MESES_CLIENTE_ACTIVO = 3;

// 🚫 Vendedores que no se traen NUNCA (administrativos, sin comisión...).
//    Coincidencia por "contiene", en MAYÚSCULAS y sin tildes.
const VENDEDORES_EXCLUIDOS = [];

// 🚫 Vendedores que sí se traen a DATA pero NO se muestran en tablas/rankings.
const VENDEDORES_IGNORADOS = [];

// 🚫 Equipos de venta de Odoo excluidos del panel.
const EQUIPOS_EXCLUIDOS = [];

// 🚫 Las facturas SIN vendedor asignado, ¿se descartan?
//    En Vitálica NO: hay ventas reales sin vendedor (ej. Gimnasios y Muestrarios),
//    y en el Looker aparecen como "null". Se muestran como "Sin Vendedor".
const EXCLUIR_FACTURAS_SIN_VENDEDOR = false;

// 🚫 Categorías que no entran en el informe.
//    El Looker actual aclara: "Filtrado excluyendo Merchandising y Muestrario".
const CATEGORIAS_EXCLUIDAS = ["MERCHANDISING", "MUESTRARIO"];

// 🚫 Productos/descripciones que no se traen.
const PRODUCTOS_EXCLUIDOS = [];

// 🚫 Clientes que no se traen. Bambu Group y Garage quedan fuera del informe:
//    sus movimientos son remisiones/cotizaciones, no venta facturada.
const CLIENTES_EXCLUIDOS = ["BAMBU", "GARAGE"];

// 🎯 Canales del panel (los del informe actual de Vitálica).
//    OJO: si se cambian, hay que cambiarlos también en index.html y en la web app.
const CANALES = ["Mayorista", "Consumidor Final", "Gimnasios y Muestrarios", "Sin Comisiones", "E-commerce"];
const CANAL_POR_DEFECTO = "Consumidor Final";

// 🎯 Cómo se clasifica cada factura: se mira el EQUIPO de ventas de Odoo
//    (y si no, el nombre del vendedor). Primera coincidencia gana.
//    Equipos reales que devolvió el descubrimiento (facturación 2026):
//      Mayorista Vitalica · Distribuidor · Muestrario - Gimnasio · Consumidor final ·
//      Consumidor Final Vitalica · Sin Comisiones · Sales · E-commerce
//    OJO con el orden: "Muestrario - Gimnasio" tiene que caer en Gimnasios y
//    Muestrarios antes de que lo agarre cualquier otra regla.
const MAPEO_CANALES = [
  { match: "MUESTRARIO",       canal: "Gimnasios y Muestrarios" },
  { match: "GIMNASIO",         canal: "Gimnasios y Muestrarios" },
  { match: "MAYORISTA",        canal: "Mayorista" },
  // Mayorista y Distribuidor se muestran unificados como Mayorista. El equipo
  // original queda igual en la columna "Equipo Odoo" de DATA, por si hace falta.
  { match: "DISTRIBUIDOR",     canal: "Mayorista" },
  { match: "DISTRIBUCION",     canal: "Mayorista" },
  { match: "CONSUMIDOR FINAL", canal: "Consumidor Final" },
  // "Sales" es el equipo por defecto de Odoo. En el informe actual su facturación
  // entra en la página de Consumidor Final, así que se mapea ahí.
  { match: "SALES",            canal: "Consumidor Final" },
  { match: "SIN COMISION",     canal: "Sin Comisiones" },
  { match: "E-COMMERCE",       canal: "E-commerce" },
  { match: "ECOMMERCE",        canal: "E-commerce" }
];

// 🛒 Clientes de e-commerce con nombre propio (Vitálica hoy no usa este bloque).
const CLIENTES_ECOMMERCE = [];
const GRUPO_ECOMMERCE_RESTO = "";

// 🏷️ Líneas de negocio de Vitálica = categorías del informe actual.
//    (Con EJE_PRINCIPAL = "CATEGORIA" el panel trabaja con estas.)
//    Nombres tal cual los tiene Odoo (salidos del descubrimiento).
const LISTA_MARCAS = [
  "Proteínas", "Pre Entrenos", "Creatinas", "Bebidas Isotónicos",
  "Vitaminas y Minerales", "Ácidos Grasos", "Salud Articular",
  "Proteína Vitálica", "Descuentos Comerciales",
  "Accesorios", "Indumentaria Vitalica", "Hidratación"
];

// 🏷️ Segunda línea de negocio (en Camping eran Armas y Municiones).
//    Vitálica no la usa por ahora.
const LISTA_ARMAS = [];

// 🏷️ Alias: si la categoría/marca/descripción contiene la clave, se guarda
//    con el nombre del valor. Sirve para unificar nombres de Odoo.
const MARCA_ALIAS = { "DESCUENTOS COMERCIALES": "Descuentos Comerciales" };

// Nota: la categoría "ALL / Proteína / VITALICA" es la línea propia de Vitálica;
// como su último tramo es "VITALICA" a secas, se renombra con CATEGORIA_A_MARCA.

// 🏷️ Si la CATEGORÍA COMPLETA de Odoo contiene la clave, el eje pasa a ser el valor.
//    Se evalúa antes que el último tramo, así se arreglan las categorías cuyo
//    último tramo no dice nada por sí solo.
const CATEGORIA_A_MARCA = {
  "PROTEINA / VITALICA": "Proteína Vitálica",
  "NO USAR": "Sin Categoría"
};

// 💸 Palabras que marcan una línea como descuento (resta venta).
const PALABRAS_DESCUENTO = ["DESCUENTO"];

/** MAYÚSCULAS sin tildes, para comparar sin sorpresas. */
function normTxt_(s) {
  return (s === null || s === undefined ? "" : String(s)).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
/** ¿el texto contiene alguna de las palabras de la lista? */
function contieneAlguna_(txt, lista) {
  if (!lista || !lista.length) return false;
  for (var i = 0; i < lista.length; i++) { if (lista[i] && txt.indexOf(normTxt_(lista[i])) >= 0) return true; }
  return false;
}


function CALCULAR_HABILES(inicio, fin, feriados) {
  function toDateStr(v) { if (!v || v === "") return null; let d; if (v instanceof Date) d = v; else { let p = v.toString().trim().split("/"); if(p.length === 3) d = new Date(p[2], p[1] - 1, p[0]); else return null; } return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  function parseDateObj(v) { if (!v || v === "") return null; if (v instanceof Date) return v; let p = v.toString().trim().split("/"); if(p.length === 3) return new Date(p[2], p[1] - 1, p[0]); return new Date(); }
  if (!inicio || !fin) return 0; let d1 = parseDateObj(inicio), d2 = parseDateObj(fin); if (!d1 || !d2) return 0; d1.setHours(0,0,0,0); d2.setHours(0,0,0,0);
  let feriadosArr = []; if (feriados) { if (!Array.isArray(feriados)) feriados = [[feriados]]; for (let r = 0; r < feriados.length; r++) for (let c = 0; c < feriados[r].length; c++) { let fStr = toDateStr(feriados[r][c]); if (fStr) feriadosArr.push(fStr); } }
  let total = 0; while (d1 <= d2) { let day = d1.getDay(), currentStr = Utilities.formatDate(d1, Session.getScriptTimeZone(), "yyyy-MM-dd"); if (!feriadosArr.includes(currentStr)) { if (day >= 1 && day <= 5) total += 1; else if (day === 6) total += 0.5; } d1.setDate(d1.getDate() + 1); } return total;
}

function obtenerMarcaReal(categoriaOdoo, marcaOdoo, descripcionOdoo, productoNombre) {
  var cat = normTxt_(categoriaOdoo), mar = normTxt_(marcaOdoo), desc = normTxt_(descripcionOdoo), prod = normTxt_(productoNombre);

  // 0) Eje por CATEGORÍA (Vitálica): se usa el último tramo de la categoría de Odoo.
  //    "ALL / Suplementos (Padre) / Proteínas"  ➜  "Proteínas"
  if (EJE_PRINCIPAL === "CATEGORIA") {
    // Primero la categoría COMPLETA (ej. "ALL / Proteína / VITALICA").
    for (var claveFull in CATEGORIA_A_MARCA) {
      if (cat.indexOf(normTxt_(claveFull)) >= 0) return CATEGORIA_A_MARCA[claveFull];
    }
    var partes = (categoriaOdoo || "").toString().split("/");
    var hoja = partes[partes.length - 1].trim();
    if (hoja) {
      for (var aliasK in MARCA_ALIAS) { if (normTxt_(hoja).indexOf(normTxt_(aliasK)) >= 0) return MARCA_ALIAS[aliasK]; }
      // Si la categoría coincide con una de las configuradas, se usa ese nombre prolijo.
      for (var iL = 0; iL < LISTA_MARCAS.length; iL++) { if (normTxt_(LISTA_MARCAS[iL]) === normTxt_(hoja)) return LISTA_MARCAS[iL]; }
      return hoja;
    }
    return "Sin Categoría";
  }

  // 1) Descuentos / anticipos
  if (contieneAlguna_(prod, PALABRAS_DESCUENTO) || contieneAlguna_(desc, PALABRAS_DESCUENTO)) return "Descuentos";

  // 2) Alias configurables (marca, descripcion o nombre del producto)
  for (var clave in MARCA_ALIAS) {
    var k = normTxt_(clave);
    if (k && (mar.indexOf(k) >= 0 || desc.indexOf(k) >= 0 || prod.indexOf(k) >= 0)) return MARCA_ALIAS[clave];
  }

  // 3) Categoria de Odoo -> marca
  for (var claveCat in CATEGORIA_A_MARCA) {
    var kc = normTxt_(claveCat);
    if (kc && cat.indexOf(kc) >= 0) return CATEGORIA_A_MARCA[claveCat];
  }

  // 4) Contra las listas de marcas configuradas (exacto primero, despues "contiene")
  var todas = LISTA_MARCAS.concat(LISTA_ARMAS);
  for (var i = 0; i < todas.length; i++) { if (normTxt_(todas[i]) === mar) return todas[i]; }
  for (var j = 0; j < todas.length; j++) { var nm = normTxt_(todas[j]); if (nm && mar.indexOf(nm) >= 0) return todas[j]; }

  // 5) Se respeta la marca tal cual viene de Odoo
  var orig = (marcaOdoo || "").toString().trim();
  return orig === "" ? "Sin Marca" : orig;
}

function restaurarConfig() { const ss = SpreadsheetApp.getActiveSpreadsheet(); let configSheet = ss.getSheetByName(HOJA_CONFIG); if (!configSheet) configSheet = ss.insertSheet(HOJA_CONFIG); crearEstructuraConfig(configSheet); SpreadsheetApp.getUi().alert(`✅ ¡Estructura Restaurada!`); }

function sincronizarMarcasConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); let configSheet = ss.getSheetByName(HOJA_CONFIG), sheetData = ss.getSheetByName(HOJA_DESTINO);
  if (!configSheet) { configSheet = ss.insertSheet(HOJA_CONFIG); crearEstructuraConfig(configSheet); return; }
  var data = configSheet.getDataRange().getValues(), vendedores = [], metasTotalesExistentes = {};
  for (var i = 3; i < data.length; i++) {
    if (data[i][8]) {
      let vStr = data[i][8].toString().trim(), vNorm = vStr.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (VENDEDORES_IGNORADOS.some(ign => vNorm.includes(ign))) continue;
      if (!vendedores.includes(vStr)) vendedores.push(vStr);
      metasTotalesExistentes[vStr] = data[i][9] || "";
    }
  }
  if (sheetData && sheetData.getLastRow() > 1) {
    let dataVals = sheetData.getRange(2, 1, sheetData.getLastRow() - 1, sheetData.getLastColumn()).getValues();
    dataVals.forEach(row => {
      let v = row[17] ? row[17].toString().trim() : "";
      if (v && v !== "Sin Vendedor") {
        let vNorm = v.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (VENDEDORES_IGNORADOS.some(ign => vNorm.includes(ign))) return;
        if (!vendedores.includes(v) && v !== "Sin Vendedor") vendedores.push(v);
      }
    });
  }
  let maxR = configSheet.getMaxRows(); if (maxR > 3) configSheet.getRange(4, 9, maxR - 3, 2).clearContent();
  let outI = vendedores.map(v => [v, metasTotalesExistentes[v] || ""]); configSheet.getRange(4, 9, outI.length, 2).setValues(outI);
  var existingGoals = {};
  if (data[2]) {
    for (var col = 11; col < data[2].length; col += 3) {
      var vend = data[2][col]; if (vend) { vend = vend.toString().trim(); let vNorm = vend.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); for (var r = 4; r < data.length; r++) { var marc = data[r][col]; if (marc && !marc.toString().startsWith("---") && !marc.toString().startsWith("[")) existingGoals[vend + "|||" + marc.toString().trim()] = Number(data[r][col+1] || 0); } }
    }
  }
  let requiredCols = 11 + (vendedores.length * 3); if (configSheet.getMaxColumns() < requiredCols) configSheet.insertColumnsAfter(configSheet.getMaxColumns(), requiredCols - configSheet.getMaxColumns());
  let requiredRows = 10 + LISTA_MARCAS.length + LISTA_ARMAS.length; if (configSheet.getMaxRows() < requiredRows) configSheet.insertRowsAfter(configSheet.getMaxRows(), requiredRows - configSheet.getMaxRows());
  if (configSheet.getMaxColumns() > 11) configSheet.getRange(1, 12, configSheet.getMaxRows(), configSheet.getMaxColumns() - 11).clearContent().clearFormat();
  configSheet.getRange(2, 12).setValue("METAS INDIVIDUALES POR VENDEDOR Y CATEGORÍA").setFontWeight("bold").setFontColor("#2C7A7B");
  let colAct = 12;
  vendedores.forEach(v => { configSheet.getRange(3, colAct, 1, 2).merge().setValue(v).setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF").setHorizontalAlignment("center"); configSheet.getRange(4, colAct).setValue("Categoría").setFontWeight("bold").setBackground("#E2E8F0"); configSheet.getRange(4, colAct+1).setValue("Monto Objetivo").setFontWeight("bold").setBackground("#E2E8F0"); var rows = [["--- CATEGORÍAS ---", ""]]; LISTA_MARCAS.forEach(b => rows.push([b, existingGoals[v + "|||" + b] || 0])); if (LISTA_ARMAS.length) rows.push(["--- SEGUNDA LÍNEA ---", ""]); LISTA_ARMAS.forEach(b => rows.push([b, existingGoals[v + "|||" + b] || 0])); configSheet.getRange(5, colAct, rows.length, 2).setValues(rows); configSheet.getRange(5, colAct+1, rows.length, 1).setNumberFormat("₲ #,##0"); configSheet.setColumnWidth(colAct, 250); configSheet.setColumnWidth(colAct+1, 120); configSheet.setColumnWidth(colAct+2, 30); colAct += 3; });
  SpreadsheetApp.flush(); SpreadsheetApp.getUi().alert(`✅ ¡Catálogo Sincronizado!`);
}

function autoRellenarMetasPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); let configSheet = ss.getSheetByName(HOJA_CONFIG); if (!configSheet) return;
  let ui = SpreadsheetApp.getUi(); let response = ui.alert('Carga Rápida de Pruebas', '¿Querés inyectar una meta de ₲ 10.000.000 a todas las marcas?', ui.ButtonSet.YES_NO);
  if (response == ui.Button.YES) {
     var data = configSheet.getDataRange().getValues(); let metaPorMarca = 10000000, totalMarcas = LISTA_MARCAS.length + LISTA_ARMAS.length, metaGlobalVendedor = metaPorMarca * totalMarcas;
     if (data[2]) { for (var col = 11; col < data[2].length; col += 3) { var vend = data[2][col]; if (vend && vend.toString().trim() !== "") { for (var r = 4; r < data.length; r++) { var marc = data[r][col]; if (marc && !marc.toString().startsWith("---") && !marc.toString().startsWith("[")) configSheet.getRange(r+1, col+2).setValue(metaPorMarca); } for (var i = 3; i < data.length; i++) { if (data[i][8] && data[i][8].toString().trim() === vend.toString().trim()) configSheet.getRange(i+1, 10).setValue(metaGlobalVendedor); } } } }
     SpreadsheetApp.flush(); ui.alert(`✅ ¡Metas inyectadas con éxito!`);
  }
}

function actualizarDatosOdoo() { return actualizarDatosOdoo_(false); }

/** La corre el trigger automático: sin ventanas ni avisos (un trigger no tiene interfaz). */
function actualizarAutomatico() { return actualizarDatosOdoo_(true); }

function actualizarDatosOdoo_(silencioso) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); let sheetData = ss.getSheetByName(HOJA_DESTINO), configSheet = ss.getSheetByName(HOJA_CONFIG);
  if (!sheetData) { sheetData = ss.insertSheet(HOJA_DESTINO); }
  // Planilla nueva: si todavía no está la hoja CONFIG, se arma sola con el mes en curso.
  if (!configSheet) { configSheet = ss.insertSheet(HOJA_CONFIG); crearEstructuraConfig(configSheet); SpreadsheetApp.flush(); }
  if (sheetData.getMaxColumns() < 36) sheetData.insertColumnsAfter(sheetData.getMaxColumns(), 36 - sheetData.getMaxColumns());

  let valFin = configSheet.getRange("B4").getValue();
  let anioCorte = valFin instanceof Date ? valFin.getFullYear() : parseInt(valFin.toString().split("/")[2]);
  let fechaInicioOdoo = `${anioCorte}-01-01`;
  let fechaFinOdoo = formatearFechaParaOdoo(valFin);

  sheetData.clear();

  if (!silencioso) ss.toast("Conectando con Odoo...", "⏳ Procesando", 5); var pwd = getOdooPwd_(); var uid = login(ODOO_URL, ODOO_DB, ODOO_USER, pwd); if (!uid) return;

  var lines = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move.line", "search_read", [[
    ["move_id.state", "=", "posted"],
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.company_id", "=", EMPRESA_ID],
    ["date", ">=", fechaInicioOdoo],
    ["date", "<=", fechaFinOdoo]
  ]], { fields: ["date", "quantity", "name", "price_unit", "discount", "price_total", "price_subtotal", "balance", "amount_currency", "product_id", "partner_id", "move_id", "currency_id"], limit: 80000 });

  var rowsOut = [];
  if (lines && lines.length > 0) {
    var moveIds = []; var productIds = []; lines.forEach(l => { if (l.move_id) moveIds.push(l.move_id[0]); if (l.product_id) productIds.push(l.product_id[0]); });
    // 🏷️ Detecta el campo "Etiquetas" (Studio) de la factura, por si se usa para marcar canales.
    var CAMPO_ETIQUETA = "";
    try {
      var _flds = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "fields_get", [], { attributes: ["string"] });
      Object.keys(_flds).forEach(function (fn) {
        var lbl = (_flds[fn] && _flds[fn].string ? _flds[fn].string : "").toUpperCase();
        if (!CAMPO_ETIQUETA && (lbl === "ETIQUETAS" || (fn.indexOf("x_studio") === 0 && fn.toUpperCase().indexOf("ETIQUETA") >= 0))) CAMPO_ETIQUETA = fn;
      });
    } catch (e) { CAMPO_ETIQUETA = ""; }
    var _moveFields = ["invoice_user_id", "team_id", "move_type", "name", "invoice_date", "invoice_date_due", "state"];
    if (CAMPO_ETIQUETA) _moveFields.push(CAMPO_ETIQUETA);
    var moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "read", [[...new Set(moveIds)]], { fields: _moveFields }); var moveMap = {}; moves.forEach(m => moveMap[m.id] = m);
    var products = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "product.product", "read", [[...new Set(productIds)]], { fields: ["categ_id", "product_brand_id"] }); var productMap = {}; products.forEach(p => productMap[p.id] = p);

    lines.forEach(line => {
      if (line.price_total == 0 && line.price_subtotal == 0 && !line.product_id) return;

      var move = moveMap[line.move_id[0]];
      if (!move || move.state !== 'posted') return;

      var productoNombre = line.product_id ? line.product_id[1] : (line.name ? line.name : "Varios"), product = line.product_id ? productMap[line.product_id[0]] : null, marcaOriginal = (product && product.product_brand_id) ? product.product_brand_id[1] : "Sin Marca", categoriaOriginal = (product && product.categ_id) ? product.categ_id[1] : "", vendedor = move.invoice_user_id ? move.invoice_user_id[1] : "Sin Vendedor", teamName = move.team_id ? move.team_id[1] : "", cliente = line.partner_id ? line.partner_id[1] : "";
      var vNorm = vendedor.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), pNorm = productoNombre.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), cNormCliente = cliente.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), tNorm = teamName.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      var descNorm = (line.name || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

      // 🛒 ¿Es una venta de E-commerce? Se mira la etiqueta de la factura (campo Studio
      // "Etiquetas"), el equipo de ventas y el nombre del cliente. Se calcula ANTES de los
      // filtros para que una exclusion de equipo no borre ventas de e-commerce.
      var etiquetaMove = "";
      if (CAMPO_ETIQUETA && move[CAMPO_ETIQUETA]) { etiquetaMove = Array.isArray(move[CAMPO_ETIQUETA]) ? (move[CAMPO_ETIQUETA][1] || "") : String(move[CAMPO_ETIQUETA]); }
      var etNorm = normTxt_(etiquetaMove);
      var esEquipoEcom = tNorm.indexOf("E-COMMERCE") >= 0 || tNorm.indexOf("ECOMMERCE") >= 0;
      var esClienteEcom = contieneAlguna_(cNormCliente, CLIENTES_ECOMMERCE);
      var esEcommerce = esEquipoEcom || esClienteEcom || contieneAlguna_(etNorm, CLIENTES_ECOMMERCE);

      // 🚫 Exclusiones (todas configurables en la cabecera del archivo)
      var descartar = false;
      if (contieneAlguna_(vNorm, VENDEDORES_EXCLUIDOS)) descartar = true;
      if (contieneAlguna_(pNorm, PRODUCTOS_EXCLUIDOS) || contieneAlguna_(descNorm, PRODUCTOS_EXCLUIDOS)) descartar = true;
      if (contieneAlguna_(cNormCliente, CLIENTES_EXCLUIDOS)) descartar = true;
      // Categorías fuera del informe (Merchandising / Muestrario en el Looker actual).
      if (contieneAlguna_(normTxt_(categoriaOriginal), CATEGORIAS_EXCLUIDAS)) descartar = true;
      // Equipo excluido (ej. "No Pagar Comision"): no se descarta si es E-commerce.
      if (contieneAlguna_(tNorm, EQUIPOS_EXCLUIDOS) && !esEcommerce) descartar = true;
      // Equipo excluido y ademas sin vendedor real: nunca suma.
      if (contieneAlguna_(tNorm, EQUIPOS_EXCLUIDOS) && (vNorm === "" || vNorm.indexOf("SIN VENDEDOR") >= 0)) descartar = true;

      if (descartar) return;

      var marcaFinal = obtenerMarcaReal(categoriaOriginal, marcaOriginal, descNorm, pNorm), unidadNegocio = "Otras Marcas";
      if (LISTA_MARCAS.includes(marcaFinal)) unidadNegocio = "MARCAS"; else if (LISTA_ARMAS.includes(marcaFinal)) unidadNegocio = "ARMAS Y MUNICIONES"; else if (marcaFinal === "Intereses Cobrados") unidadNegocio = "INTERESES";

      var pf = line.date.split("-"), fechaStr = `${Number(pf[2])}/${Number(pf[1])}/${Number(pf[0])}`, documento = (move.move_type === "out_refund") ? "Nota de Crédito" : "Factura", condicion = (move.invoice_date_due && move.invoice_date && move.invoice_date_due !== move.invoice_date) ? "Crédito" : "Contado", fechaVencStr = move.invoice_date_due ? `${move.invoice_date_due.split("-")[2]}/${move.invoice_date_due.split("-")[1]}/${move.invoice_date_due.split("-")[0]}` : fechaStr;

      // 🎯 Clasificacion de canal: primero E-commerce; despues el mapeo por EQUIPO de
      // ventas de Odoo (y como respaldo el nombre del vendedor). Primera coincidencia gana.
      var canalFinal = CANAL_POR_DEFECTO;
      if (esEcommerce) canalFinal = "E-commerce";
      else {
        for (var iC = 0; iC < MAPEO_CANALES.length; iC++) {
          var claveC = normTxt_(MAPEO_CANALES[iC].match);
          if (claveC && (tNorm.indexOf(claveC) >= 0 || vNorm.indexOf(claveC) >= 0)) { canalFinal = MAPEO_CANALES[iC].canal; break; }
        }
      }

      // Facturas sin vendedor asignado: se descartan solo si está configurado así.
      var sinVendedor = (vNorm === "" || vNorm.indexOf("SIN VENDEDOR") >= 0 || vNorm === "NULL" || vNorm === "FALSE");
      if (sinVendedor && EXCLUIR_FACTURAS_SIN_VENDEDOR) return;

      var vendedorEtiquetado = (sinVendedor ? "Sin Vendedor" : vendedor.trim()) + " - " + canalFinal;

      var total = Number(line.price_total || 0), subtotal = Number(line.price_subtotal || 0), precioUnit = Number(line.price_unit || 0), cantidad = Number(line.quantity || 0), moneda = line.currency_id ? line.currency_id[1] : "PYG", tipoCambio = 1;
      if (moneda.toUpperCase().includes("USD")) { var montoUSD = Math.abs(Number(line.amount_currency || 0)), montoPYG = Math.abs(Number(line.balance || 0)); if (montoUSD > 0) tipoCambio = montoPYG / montoUSD; precioUnit = precioUnit * tipoCambio; total = total * tipoCambio; subtotal = subtotal * tipoCambio; }

      var esDescuento = (marcaFinal === "Descuentos" || contieneAlguna_(pNorm, PALABRAS_DESCUENTO));
      if (move.move_type === "out_refund") {
          // Nota de crédito: el PRODUCTO va NEGATIVO (saca venta).
          // El DESCUENTO se INVIERTE respecto de lo que trae Odoo:
          //   si en la NC viene NEGATIVO  -> traer POSITIVO
          //   si en la NC viene POSITIVO  -> traer NEGATIVO
          if (esDescuento) { total = -total; subtotal = -subtotal; }
          else { total = -Math.abs(total); subtotal = -Math.abs(subtotal); }
          precioUnit = Math.abs(precioUnit); cantidad = -Math.abs(cantidad);
      } else {
          // Factura = producto positivo, descuento negativo.
          if (esDescuento) {
              total = -Math.abs(total); subtotal = -Math.abs(subtotal);
          } else {
              total = Math.abs(total); subtotal = Math.abs(subtotal);
          }
          precioUnit = Math.abs(precioUnit); cantidad = Math.abs(cantidad);
      }

      // 🛒 Grupo E-commerce (columna 32): lo que es E-commerce y NO es uno de los
      // clientes de CLIENTES_ECOMMERCE cae en el grupo "resto" (si esta configurado).
      var grupoEcom = (esEcommerce && GRUPO_ECOMMERCE_RESTO && !contieneAlguna_(cNormCliente, CLIENTES_ECOMMERCE)) ? GRUPO_ECOMMERCE_RESTO : "";

      // 💰 Importe con el que trabaja todo el panel: sin IVA (subtotal) o con IVA (total).
      var montoPanel = (MONTO_BASE === "SIN_IVA") ? subtotal : total;

      var precioPromedio = cantidad !== 0 ? (subtotal / cantidad) : 0;
      rowsOut.push(["Odoo", fechaStr, Number(pf[0]), Number(pf[1]), Number(pf[2]), documento, move.name || "", fechaVencStr, 0, condicion, total, total, tipoCambio, cliente, marcaOriginal, marcaFinal, unidadNegocio, vendedorEtiquetado, canalFinal, categoriaOriginal, productoNombre, precioUnit, Number(line.discount || 0), precioPromedio, cantidad, subtotal, total, total, subtotal, "PYG", montoPanel, grupoEcom, line.move_id[0], teamName]);
    });
  }

  if (sheetData.getMaxColumns() < 36) sheetData.insertColumnsAfter(sheetData.getMaxColumns(), 36 - sheetData.getMaxColumns());
  sheetData.getRange(1, 1, 1, 34).setValues([["Origen", "Fecha", "Año", "Mes", "Día", "Documento", "Nro. Movimiento", "Fecha Vencimiento", "Días Vencimiento", "Condición", "Total en Divisa", "Total Firmado", "Tipo Cambio", "Cliente", "Marca Original", "Filtro Marca", "Unidad de Negocio", "Vendedor", "Equipo/Canal", "Categoría", "Producto", "Precio Unitario", "Descuento", "Precio Promedio", "Cantidad", "Subtotal", "Total", "Total Factura", "Subtotal", "Moneda", "TOTAL GS", "Grupo E-commerce", "ID Factura Odoo", "Equipo Odoo"]]).setFontWeight("bold");
  if (rowsOut.length > 0) sheetData.getRange(2, 1, rowsOut.length, rowsOut[0].length).setValues(rowsOut);
  // Sello de última actualización: el dashboard lo muestra en el menú lateral.
  configSheet.getRange("A9").setValue("Última actualización:").setFontWeight("bold").setFontColor("#2C7A7B");
  configSheet.getRange("B9").setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"));
  SpreadsheetApp.flush();
  if (!silencioso) SpreadsheetApp.getUi().alert(`✅ ¡Base de Odoo Actualizada! ` + rowsOut.length + ` líneas.`);
}

function cargarMetasCentralesDesdeConfig(sheet) {
  let d = sheet.getDataRange().getValues();
  let valIni = sheet.getRange("B3").getValue(), valFin = sheet.getRange("B4").getValue(), valHoy = sheet.getRange("B5").getValue(), feriados = sheet.getRange("C3:C12").getValues();

  let diasMesCalc = CALCULAR_HABILES(valIni, valFin, feriados);
  let diasTransCalc = CALCULAR_HABILES(valIni, valHoy, feriados);

  let mapa = {
    metaGlobal: Number(d[3][3] || 0),
    diasMes: diasMesCalc > 0 ? diasMesCalc : 21.5,
    diasTranscurridos: diasTransCalc > 0 ? diasTransCalc : 1,
    canales: {}, vendedoresTotales: {}, vendedorMarca: {}
  };

  for (let i = 3; i < d.length; i++) { if (d[i][5] && i >= 3 && i <= (2 + CANALES.length)) mapa.canales[d[i][5].toString().trim()] = Number(d[i][6] || 0); if (d[i][8]) mapa.vendedoresTotales[d[i][8].toString().trim()] = Number(d[i][9] || 0); }
  if (d[2]) { for (let col = 11; col < d[2].length; col += 3) { let vend = d[2][col]; if (vend) { vend = vend.toString().trim(); let vNorm = vend.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); for (let r = 4; r < d.length; r++) { let marc = d[r][col]; if (marc && !marc.toString().startsWith("---") && !marc.toString().startsWith("[")) mapa.vendedorMarca[vend + "|||" + marc.toString().trim()] = { meta: Number(d[r][col + 1] || 0) }; } } } }
  return mapa;
}

function dibujarDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheetData = ss.getSheetByName(HOJA_DESTINO); let configSheet = ss.getSheetByName(HOJA_CONFIG);
  if (!sheetData || sheetData.getLastRow() <= 1) { SpreadsheetApp.getUi().alert(`⚠️ No hay información en DATA. Corré primero «🔄 Descargar Ventas Odoo».`); return; }
  if (!configSheet) { configSheet = ss.insertSheet(HOJA_CONFIG); crearEstructuraConfig(configSheet); SpreadsheetApp.flush(); }
  ss.toast("Calculando y Dibujando...", "⏳ Espere", 5);
  let metasConfig = cargarMetasCentralesDesdeConfig(configSheet), rowsOut = sheetData.getRange(2, 1, sheetData.getLastRow() - 1, 31).getValues();
  let diasHabilesMes = metasConfig.diasMes, diasHabilesTranscurridos = metasConfig.diasTranscurridos;
  let valHoyConfig = configSheet.getRange("B5").getValue(), hoy = new Date(); if (valHoyConfig instanceof Date) hoy = valHoyConfig; else if (valHoyConfig) { let p = valHoyConfig.toString().trim().split("/"); if (p.length === 3) hoy = new Date(p[2], p[1] - 1, p[0]); }
  hoy.setHours(23, 59, 59, 999);
  let anioFiltro = hoy.getFullYear();

  var cOrd = ["Salon", "Online", "E-commerce", "Mayoristas", "Directorio", "Venta Externa"],
      acumCanal = { "Salon": 0, "Online": 0, "E-commerce": 0, "Mayoristas": 0, "Directorio": 0, "Venta Externa": 0 };
  var acumMarcaGeneral = {}, ventasDiarias = {}, vAyer = 0, totalVentasBrutas = 0, totalNotasCredito = 0, estructuraVendedores = {}, vendedorCanalMap = {}, listaOtrasMarcasSet = new Set();
  var ncPorCanal = {}, ncPorFecha = {}, ncPorCliente = {}, ncPorVendedor = {}, totalNcAbs = 0;

  Object.keys(metasConfig.vendedoresTotales).forEach(v => { estructuraVendedores[v] = {}; });
  for (var clave in metasConfig.vendedorMarca) { var vend = clave.split("|||")[0], marc = clave.split("|||")[1]; if (!estructuraVendedores[vend]) estructuraVendedores[vend] = {}; estructuraVendedores[vend][marc] = { ventaReal: 0, ventaYTD: 0, metaAsignada: metasConfig.vendedorMarca[clave].meta }; }

  rowsOut.forEach(r => {
    let valFecha = r[1], dRow = new Date(); if (valFecha instanceof Date) dRow = new Date(valFecha.getTime()); else { let pF = valFecha.toString().trim().split("/"); if (pF.length === 3) dRow = new Date(pF[2], pF[1] - 1, pF[0]); }
    dRow.setHours(0, 0, 0, 0);
    if (dRow.getFullYear() !== anioFiltro) return;
    if (dRow.getTime() > hoy.getTime()) return;

    let isMesActual = (dRow.getMonth() === hoy.getMonth());
    var docR = r[5], marcaR = r[15], vendedorR = r[17], canalR = r[18], totalR = Number(r[30]) || 0;

    let isIgnoradoParaTabla = false;
    let isInteres = marcaR === "Intereses Cobrados" || r[20].toString().toUpperCase().includes("INTERES");

    if (vendedorR) {
      let vNormDash = vendedorR.toString().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

      if (VENDEDORES_IGNORADOS.some(ign => vNormDash.includes(ign)) || canalR === "Reparaciones") {
         isIgnoradoParaTabla = true;
      }
    }

    if (isIgnoradoParaTabla) return;

    let fechaStrFormateadaNC = Utilities.formatDate(dRow, Session.getScriptTimeZone(), "dd/MM/yyyy");
    if (docR === "Nota de Crédito") {
      if (isMesActual) {
        totalNotasCredito += totalR; let ncAbs = Math.abs(totalR); totalNcAbs += ncAbs; ncPorCanal[canalR] = (ncPorCanal[canalR] || 0) + ncAbs; ncPorFecha[fechaStrFormateadaNC] = (ncPorFecha[fechaStrFormateadaNC] || 0) + ncAbs; let nombreC = r[13] && r[13].toString().trim() !== "" ? r[13].toString().trim() : "Consumidor Final"; ncPorCliente[nombreC] = (ncPorCliente[nombreC] || 0) + ncAbs; if (vendedorR && vendedorR !== "Sin Vendedor") ncPorVendedor[vendedorR] = (ncPorVendedor[vendedorR] || 0) + ncAbs;
      }
    } else {
      if (isMesActual) totalVentasBrutas += totalR;
    }

    if (isMesActual) {
      if (acumCanal[canalR] !== undefined) acumCanal[canalR] = (acumCanal[canalR] || 0) + totalR;
      let fechaAyerObj = new Date(hoy.getTime()); fechaAyerObj.setDate(fechaAyerObj.getDate() - 1); fechaAyerObj.setHours(23, 59, 59, 999); if (dRow.getTime() <= fechaAyerObj.getTime()) vAyer += totalR;
      if (!ventasDiarias[fechaStrFormateadaNC]) ventasDiarias[fechaStrFormateadaNC] = { fechaObj: dRow.getTime(), total: 0 }; ventasDiarias[fechaStrFormateadaNC].total += totalR;
    }

    if (!isInteres) {
      if (isMesActual) acumMarcaGeneral[marcaR] = (acumMarcaGeneral[marcaR] || 0) + totalR;
      if (!LISTA_MARCAS.includes(marcaR) && !LISTA_ARMAS.includes(marcaR) && marcaR !== "Descuentos") listaOtrasMarcasSet.add(marcaR);
      if (vendedorR && vendedorR !== "Sin Vendedor") {
        if (!estructuraVendedores[vendedorR]) estructuraVendedores[vendedorR] = {};
        if (!estructuraVendedores[vendedorR][marcaR]) estructuraVendedores[vendedorR][marcaR] = { ventaReal: 0, ventaYTD: 0, metaAsignada: 0 };
        estructuraVendedores[vendedorR][marcaR].ventaYTD += totalR;
        if (isMesActual) {
          estructuraVendedores[vendedorR][marcaR].ventaReal += totalR;
          if (!vendedorCanalMap[vendedorR]) vendedorCanalMap[vendedorR] = {}; vendedorCanalMap[vendedorR][canalR] = (vendedorCanalMap[vendedorR][canalR] || 0) + totalR;
        }
      }
    }
  });

  var listaOtrasMarcas = Array.from(listaOtrasMarcasSet).sort(), arrVentasDiarias = Object.keys(ventasDiarias).map(f => { return { fechaStr: f, fechaObj: ventasDiarias[f].fechaObj, total: ventasDiarias[f].total }; }); arrVentasDiarias.sort((a, b) => a.fechaObj - b.fechaObj);
  let vendedoresPorCanal = {}; Object.keys(estructuraVendedores).sort().forEach(v => {
    // El vendedor viene etiquetado como "NOMBRE - Canal": de ahi sale su canal.
    let bestCanal = CANAL_POR_DEFECTO;
    let vUpper = normTxt_(v);
    CANALES.forEach(c => { if (vUpper.indexOf("- " + normTxt_(c)) >= 0) bestCanal = c; });

    // Si ademas facturo, manda el canal donde mas vendio.
    let maxSales = -1;
    if (vendedorCanalMap[v]) { for (let c in vendedorCanalMap[v]) { let act = Math.abs(vendedorCanalMap[v][c]); if (act > maxSales) { maxSales = act; bestCanal = c; } } }
    if (!vendedoresPorCanal[bestCanal]) vendedoresPorCanal[bestCanal] = []; vendedoresPorCanal[bestCanal].push(v);
  });

  let vTotalCia = (acumCanal["Salon"] || 0) + (acumCanal["Online"] || 0) + (acumCanal["E-commerce"] || 0) + (acumCanal["Mayoristas"] || 0) + (acumCanal["Directorio"] || 0) + (acumCanal["Venta Externa"] || 0),
      mTotalCia = metasConfig.metaGlobal > 0 ? metasConfig.metaGlobal : 0, esperadoHoy = (mTotalCia / diasHabilesMes) * diasHabilesTranscurridos, vHoy = vTotalCia - vAyer, proyeccion = (vTotalCia / diasHabilesTranscurridos) * diasHabilesMes, diasRestantes = diasHabilesMes - diasHabilesTranscurridos, factDiaNec = diasRestantes > 0 ? (mTotalCia - vTotalCia) / diasRestantes : 0, factNecesaria = mTotalCia - vTotalCia;
  let pctLogrado1 = esperadoHoy > 0 ? (vTotalCia / esperadoHoy) : 0, pctLogrado2 = mTotalCia > 0 ? (vTotalCia / mTotalCia) : 0, pctProyeccion = mTotalCia > 0 ? (proyeccion / mTotalCia) : 0, difEsperado = vTotalCia - esperadoHoy, difProy = proyeccion - mTotalCia;

  let dashSheet = ss.getSheetByName(HOJA_DASHBOARD);
  if (!dashSheet) { dashSheet = ss.insertSheet(HOJA_DASHBOARD); } else { dashSheet.clear(); }

  if (dashSheet.getMaxColumns() < 250) dashSheet.insertColumnsAfter(dashSheet.getMaxColumns(), 250 - dashSheet.getMaxColumns());
  dashSheet.setHiddenGridlines(true); dashSheet.getRange("A1:ZZ2000").setBackground("#FFFFFF");

  dashSheet.setColumnWidth(1, 20);
  for (let i = 0; i < 30; i++) {
    let base = (i * 6) + 2;
    dashSheet.setColumnWidth(base, 230);
    dashSheet.setColumnWidth(base + 1, 95);
    dashSheet.setColumnWidth(base + 2, 95);
    dashSheet.setColumnWidth(base + 3, 90);
    dashSheet.setColumnWidth(base + 4, 50);
    dashSheet.setColumnWidth(base + 5, 20);
  }

  dashSheet.getRange("B2:J2").merge().setValue(`META GLOBAL DEL MES: ₲ ${vTotalCia.toLocaleString("es-PY")} / ₲ ${mTotalCia.toLocaleString("es-PY")}`).setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center").setFontColor("#1A202C").setBackground("#EDF2F7");
  dashSheet.getRange("B3:J3").merge().setValue(`AVANCE GENERAL: ${(pctLogrado2 * 100).toFixed(1)}%`).setFontSize(14).setFontWeight("bold").setHorizontalAlignment("center").setFontColor(pctLogrado2 >= 1 ? "green" : "#C53030").setBackground("#EDF2F7");
  dashSheet.getRange("B2:J3").setBorder(true, true, true, true, false, false);
  dashSheet.getRange("I4").setValue("Días hábiles").setBackground("#EDF2F7").setBorder(true, true, true, true, false, false); dashSheet.getRange("J4").setValue(diasHabilesMes).setNumberFormat("0.0").setBorder(true, true, true, true, false, false).setHorizontalAlignment("right");
  dashSheet.getRange("I5").setValue(Utilities.formatDate(hoy, Session.getScriptTimeZone(), "dd/MM/yyyy")).setBackground("#EDF2F7").setBorder(true, true, true, true, false, false).setHorizontalAlignment("center"); dashSheet.getRange("J5").setValue(diasHabilesTranscurridos).setNumberFormat("0.0").setBorder(true, true, true, true, false, false).setHorizontalAlignment("right");
  dashSheet.getRange("I6").setValue("Hoy deberias estar -->").setBackground("#EDF2F7").setBorder(true, true, true, true, false, false); dashSheet.getRange("J6").setValue(esperadoHoy > 0 ? vTotalCia / mTotalCia : 0).setNumberFormat("0%").setBorder(true, true, true, true, false, false).setHorizontalAlignment("right");
  dashSheet.getRange("B6:H6").merge().setValue("Sobre el Objetivo").setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF").setHorizontalAlignment("center");

  dashSheet.getRange("B7:I7").setValues([["Canales", "Ventas Acumuladas", "Hoy deberías estar en:", "% Logrado a Hoy", "", "Objetivo mes", "% Logrado", "Proyección venta"]]).setFontWeight("bold").setBackground("#EDF2F7").setBorder(false, false, true, false, false, false);
  dashSheet.getRange("J7").setValue("% Proy.").setFontWeight("bold").setBackground("#EDF2F7").setBorder(false, false, true, false, false, false);

  dashSheet.getRange("B8:J8").setValues([["Todos los canales", vTotalCia, esperadoHoy, pctLogrado1, "", mTotalCia, pctLogrado2, proyeccion, pctProyeccion]]); dashSheet.getRange("B9:J9").setValues([["Acumulado día anterior", vAyer, difEsperado, "Diferencia", "", "", "Diferencia", difProy, "Diferencia"]]); dashSheet.getRange("B10:J10").setValues([["Facturado x diferencia (día anterior)", vHoy, "", "", "", "", "", "", ""]]);
  dashSheet.getRange("B12").setValue("Fact. x día p/ alcanzar OBJ >>").setFontWeight("bold"); dashSheet.getRange("C12").setValue(factDiaNec).setFontWeight("bold").setNumberFormat("#,##0").setFontColor("#2B6CB0");
  dashSheet.getRange("B13").setValue("Fact. neces. p/ alcanzar OBJ >>").setFontWeight("bold"); dashSheet.getRange("C13").setValue(factNecesaria).setFontWeight("bold").setNumberFormat("#,##0").setFontColor("#C53030");

  dashSheet.getRange("C8:C10").setNumberFormat("#,##0"); dashSheet.getRange("D8:D9").setNumberFormat("#,##0"); dashSheet.getRange("G8").setNumberFormat("#,##0"); dashSheet.getRange("I8:I9").setNumberFormat("#,##0");
  dashSheet.getRange("E8").setNumberFormat("0%").setFontColor(pctLogrado1 < 1 ? "red" : "green"); dashSheet.getRange("H8").setNumberFormat("0%").setFontColor(pctLogrado2 < 1 ? "red" : "green"); dashSheet.getRange("J8").setNumberFormat("0%").setFontColor(pctProyeccion < 1 ? "red" : "green");
  dashSheet.getRange("E9").setFontStyle("italic"); dashSheet.getRange("H9").setFontStyle("italic"); dashSheet.getRange("J9").setFontStyle("italic");

  dashSheet.getRange("E12:J12").merge().setValue("📌 GLOSARIO Y NOTAS ACLARATORIAS DEL REPORTE").setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  dashSheet.getRange("E13:J13").merge().setValue("🏢 Panel comercial de " + EMPRESA_NOMBRE + " (empresa " + EMPRESA_ID + " de Odoo). Exclusiones configuradas en la cabecera del script.").setFontSize(10).setBackground("#F7FAFC");
  dashSheet.getRange("E14:J14").merge().setValue("👥 Agrupaciones genéricas: 'SALON' y 'ONLINE' absorben los tickets 'Sin Vendedor' de sus canales, a Rahi y Jhamyl.").setFontSize(10).setBackground("#F7FAFC");
  dashSheet.getRange("E12:J14").setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);

  let rStartTablasMedio = 16;
  dashSheet.getRange(rStartTablasMedio, 2, 1, 2).merge().setValue("🔍 DESGLOSE DE COMPROBANTES").setFontWeight("bold").setBackground("#2C7A7B").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  dashSheet.getRange(rStartTablasMedio+1, 2).setValue("Total Facturas (Venta Bruta)").setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rStartTablasMedio+1, 3).setValue(totalVentasBrutas).setNumberFormat("#,##0").setFontColor("green");
  dashSheet.getRange(rStartTablasMedio+2, 2).setValue("Total Notas de Crédito").setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rStartTablasMedio+2, 3).setValue(totalNotasCredito).setNumberFormat("#,##0").setFontColor("red");
  dashSheet.getRange(rStartTablasMedio+3, 2).setValue("VENTA NETA (Real)").setFontWeight("bold").setBackground("#E2E8F0"); dashSheet.getRange(rStartTablasMedio+3, 3).setValue(vTotalCia).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#E2E8F0");
  dashSheet.getRange(`B${rStartTablasMedio}:C${rStartTablasMedio+3}`).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);

  rStartTablasMedio += 5;
  dashSheet.getRange(rStartTablasMedio, 2, 1, 4).setValues([["Canales", "Ventas", "Esperado Hoy", "% Log. Hoy"]]).setFontWeight("bold").setBorder(false, false, true, false, false, false);
  dashSheet.getRange(rStartTablasMedio, 8, 1, 2).setValues([["Objetivo", "% Logrado"]]).setFontWeight("bold").setBorder(false, false, true, false, false, false);

  let totalRC = 0, totalMC = 0, totalEsperadoCanales = 0, rCanalAct = rStartTablasMedio;
  cOrd.forEach(c => {
    rCanalAct++; let rc = acumCanal[c] || 0, mc = metasConfig.canales[c] || 0, pct = mc > 0 ? rc / mc : 0, esperadoCanal = (mc / diasHabilesMes) * diasHabilesTranscurridos, pctHoy = esperadoCanal > 0 ? rc / esperadoCanal : 0;
    dashSheet.getRange(rCanalAct, 2).setValue(c); dashSheet.getRange(rCanalAct, 3).setValue(rc).setNumberFormat("#,##0"); dashSheet.getRange(rCanalAct, 4).setValue(esperadoCanal).setNumberFormat("#,##0").setFontStyle("italic"); dashSheet.getRange(rCanalAct, 5).setValue(pctHoy).setNumberFormat("0%").setFontColor(pctHoy < 1 ? "red" : "green");
    dashSheet.getRange(rCanalAct, 8).setValue(mc).setNumberFormat("#,##0"); dashSheet.getRange(rCanalAct, 9).setValue(pct).setNumberFormat("0%").setFontColor(pct < 1 ? "red" : "green");
    totalRC += rc; totalMC += mc; totalEsperadoCanales += esperadoCanal;
  });

  rCanalAct++;
  let totalPctCanales = totalMC > 0 ? totalRC / totalMC : 0, totalPctHoyCanales = totalEsperadoCanales > 0 ? totalRC / totalEsperadoCanales : 0;
  dashSheet.getRange(rCanalAct, 2).setValue("TOTAL CANALES").setFontWeight("bold"); dashSheet.getRange(rCanalAct, 3).setValue(totalRC).setFontWeight("bold").setNumberFormat("#,##0"); dashSheet.getRange(rCanalAct, 4).setValue(totalEsperadoCanales).setFontWeight("bold").setNumberFormat("#,##0").setFontStyle("italic"); dashSheet.getRange(rCanalAct, 5).setValue(totalPctHoyCanales).setFontWeight("bold").setNumberFormat("0%").setFontColor(totalPctHoyCanales < 1 ? "red" : "green");
  dashSheet.getRange(rCanalAct, 8).setValue(totalMC).setFontWeight("bold").setNumberFormat("#,##0"); dashSheet.getRange(rCanalAct, 9).setValue(totalPctCanales).setFontWeight("bold").setNumberFormat("0%").setFontColor(totalPctCanales < 1 ? "red" : "green");
  dashSheet.getRange(rStartTablasMedio, 2, rCanalAct - rStartTablasMedio + 1, 4).setBorder(true, false, false, false, false, false);
  dashSheet.getRange(rStartTablasMedio, 8, rCanalAct - rStartTablasMedio + 1, 2).setBorder(true, false, false, false, false, false);

  let rVendAct = 16;
  dashSheet.getRange(rVendAct, 14, 1, 8).merge().setValue("👥 RESUMEN DE VENDEDORES POR CANAL").setFontWeight("bold").setBackground("#2C7A7B").setFontColor("#FFFFFF").setHorizontalAlignment("center"); rVendAct++;
  dashSheet.getRange(rVendAct, 14, 1, 8).setValues([["Vendedor", "Ventas Netas", "Devoluciones (NC)", "Esperado Hoy", "", "% Log. Hoy", "Objetivo", "% Logrado"]]).setFontWeight("bold").setBackground("#EDF2F7").setBorder(false, false, true, false, false, false);

  cOrd.forEach(c => {
    let vendsInChannel = vendedoresPorCanal[c];
    if (vendsInChannel && vendsInChannel.length > 0) {

      let vendsValidos = vendsInChannel.filter(v => !VENDEDORES_IGNORADOS.some(ign => v.toUpperCase().includes(ign)));
      if (vendsValidos.length === 0) return;

      rVendAct++; dashSheet.getRange(rVendAct, 14, 1, 8).merge().setValue(`--- ${c.toUpperCase()} ---`).setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF").setHorizontalAlignment("left");
      let subTotalCanalVenta = 0, subTotalCanalMeta = 0, subTotalCanalEsperado = 0, subTotalCanalNC = 0;

      vendsValidos.forEach(v => {
        rVendAct++; let subV = 0, subM = 0;
        for (let m in estructuraVendedores[v]) subV += estructuraVendedores[v][m].ventaReal;
        subM = metasConfig.vendedoresTotales[v] > 0 ? metasConfig.vendedoresTotales[v] : 0;
        if (subM === 0) for (let m in estructuraVendedores[v]) subM += estructuraVendedores[v][m].metaAsignada;

        let pct = subM > 0 ? subV / subM : 0;
        let esperadoVend = (subM / diasHabilesMes) * diasHabilesTranscurridos;
        let pctHoy = esperadoVend > 0 ? subV / esperadoVend : 0;
        let ncVend = ncPorVendedor[v] || 0;

        subTotalCanalVenta += subV; subTotalCanalMeta += subM; subTotalCanalEsperado += esperadoVend; subTotalCanalNC += ncVend;

        dashSheet.getRange(rVendAct, 14).setValue(v);
        dashSheet.getRange(rVendAct, 15).setValue(subV).setNumberFormat("#,##0");
        dashSheet.getRange(rVendAct, 16).setValue(-ncVend).setNumberFormat("#,##0").setFontColor(ncVend > 0 ? "red" : "black");
        dashSheet.getRange(rVendAct, 17).setValue(esperadoVend).setNumberFormat("#,##0").setFontStyle("italic");
        dashSheet.getRange(rVendAct, 19).setValue(pctHoy).setNumberFormat("0%").setFontColor(pctHoy < 1 ? "red" : "green");
        dashSheet.getRange(rVendAct, 20).setValue(subM).setNumberFormat("#,##0");
        dashSheet.getRange(rVendAct, 21).setValue(pct).setNumberFormat("0%").setFontColor(pct < 1 ? "red" : "green");
      });
      rVendAct++;
      let pctCanal = subTotalCanalMeta > 0 ? subTotalCanalVenta / subTotalCanalMeta : 0;
      let pctCanalHoy = subTotalCanalEsperado > 0 ? subTotalCanalVenta / subTotalCanalEsperado : 0;
      dashSheet.getRange(rVendAct, 14).setValue(`Total ${c}`).setFontWeight("bold").setBackground("#EDF2F7");
      dashSheet.getRange(rVendAct, 15).setValue(subTotalCanalVenta).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#EDF2F7");
      dashSheet.getRange(rVendAct, 16).setValue(-subTotalCanalNC).setFontWeight("bold").setNumberFormat("#,##0").setFontColor("red").setBackground("#EDF2F7");
      dashSheet.getRange(rVendAct, 17).setValue(subTotalCanalEsperado).setFontWeight("bold").setNumberFormat("#,##0").setFontStyle("italic").setBackground("#EDF2F7");
      dashSheet.getRange(rVendAct, 19).setValue(pctCanalHoy).setFontWeight("bold").setNumberFormat("0%").setBackground("#EDF2F7").setFontColor(pctCanalHoy < 1 ? "red" : "green");
      dashSheet.getRange(rVendAct, 20).setValue(subTotalCanalMeta).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#EDF2F7");
      dashSheet.getRange(rVendAct, 21).setValue(pctCanal).setFontWeight("bold").setNumberFormat("0%").setBackground("#EDF2F7").setFontColor(pctCanal < 1 ? "red" : "green");
    }
  });
  dashSheet.getRange(16, 14, rVendAct - 15, 8).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);

  let rDiaAct = 16, colDia = 26;
  dashSheet.getRange(rDiaAct, colDia, 1, 3).merge().setValue("📅 RESUMEN DE VENTAS POR DÍA").setFontWeight("bold").setBackground("#2C7A7B").setFontColor("#FFFFFF").setHorizontalAlignment("center"); rDiaAct++;
  dashSheet.getRange(rDiaAct, colDia, 1, 3).setValues([["Fecha", "Venta del Día", "Acumulado Mes"]]).setFontWeight("bold").setBackground("#EDF2F7").setBorder(false, false, true, false, false, false);
  let acumMesDiario = 0;
  arrVentasDiarias.forEach(vd => { rDiaAct++; acumMesDiario += vd.total; dashSheet.getRange(rDiaAct, colDia).setValue(vd.fechaStr).setHorizontalAlignment("center"); dashSheet.getRange(rDiaAct, colDia + 1).setValue(vd.total).setNumberFormat("#,##0"); dashSheet.getRange(rDiaAct, colDia + 2).setValue(acumMesDiario).setNumberFormat("#,##0").setFontColor("green").setFontWeight("bold"); });
  dashSheet.getRange(16, colDia, rDiaAct - 15, 3).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);

  let rAct = Math.max(rCanalAct, rVendAct, rDiaAct) + 3;
  if (totalNcAbs > 0) {
    dashSheet.getRange(rAct, 2, 1, 13).merge().setValue("📉 ANÁLISIS DE NOTAS DE CRÉDITO (DEVOLUCIONES)").setFontWeight("bold").setBackground("#C53030").setFontColor("#FFFFFF").setHorizontalAlignment("center"); rAct++; let rStartNC = rAct;
    dashSheet.getRange(rStartNC, 2, 1, 2).merge().setValue("Canal").setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rStartNC, 4).setValue("Monto NC").setFontWeight("bold").setBackground("#EDF2F7"); let rNC = rStartNC + 1;
    Object.keys(ncPorCanal).sort((a, b) => ncPorCanal[b] - ncPorCanal[a]).forEach(c => { dashSheet.getRange(rNC, 2, 1, 2).merge().setValue(c); dashSheet.getRange(rNC, 4).setValue(-ncPorCanal[c]).setNumberFormat("#,##0").setFontColor("red"); rNC++; });
    dashSheet.getRange(rStartNC, 8, 1, 2).merge().setValue("Top 5 Clientes").setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rStartNC, 10).setValue("Monto NC").setFontWeight("bold").setBackground("#EDF2F7"); let rCli = rStartNC + 1;
    Object.keys(ncPorCliente).sort((a, b) => ncPorCliente[b] - ncPorCliente[a]).slice(0, 5).forEach(cli => { dashSheet.getRange(rCli, 8, 1, 2).merge().setValue(cli); dashSheet.getRange(rCli, 10).setValue(-ncPorCliente[cli]).setNumberFormat("#,##0").setFontColor("red"); rCli++; });
    dashSheet.getRange(rStartNC, 14, 1, 2).merge().setValue("Fecha").setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rStartNC, 16).setValue("Monto NC").setFontWeight("bold").setBackground("#EDF2F7"); let rFec = rStartNC + 1;
    arrVentasDiarias.forEach(vd => { if (ncPorFecha[vd.fechaStr]) { dashSheet.getRange(rFec, 14, 1, 2).merge().setValue(vd.fechaStr).setHorizontalAlignment("center"); dashSheet.getRange(rFec, 16).setValue(-ncPorFecha[vd.fechaStr]).setNumberFormat("#,##0").setFontColor("red"); rFec++; } });
    let maxRowNC = Math.max(rNC, rCli, rFec); dashSheet.getRange(rStartNC, 2, rNC - rStartNC, 3).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID); dashSheet.getRange(rStartNC, 8, rCli - rStartNC, 3).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID); if (rFec > rStartNC) dashSheet.getRange(rStartNC, 14, rFec - rStartNC, 3).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);
    rAct = maxRowNC + 3;
  }

  let rFinTablas = rAct; dashSheet.getRange(rAct, 2, 1, 2).merge().setValue("MARCAS").setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF"); dashSheet.getRange(rAct, 8, 1, 2).merge().setValue("ARMAS Y MUNICIONES").setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF"); rAct++;
  dashSheet.getRange(rAct, 2, 1, 2).setValues([["Marca", "Ventas en GS"]]).setFontWeight("bold").setBackground("#EDF2F7"); dashSheet.getRange(rAct, 8, 1, 2).setValues([["Marca", "Ventas en GS"]]).setFontWeight("bold").setBackground("#EDF2F7");
  let startTablas = rAct + 1, maxFilasGrupos = Math.max(LISTA_MARCAS.length, LISTA_ARMAS.length), vGlobalMarcas = 0, vGlobalArmas = 0;
  for (let i = 0; i < maxFilasGrupos; i++) { let rM = rAct + i; if (i < LISTA_MARCAS.length) { let marca = LISTA_MARCAS[i], venta = acumMarcaGeneral[marca] || 0; dashSheet.getRange(rM, 2).setValue(marca); dashSheet.getRange(rM, 3).setValue(venta).setNumberFormat("#,##0").setBackground(venta === 0 ? "#FED7D7" : "#FFFFFF"); vGlobalMarcas += venta; } if (i < LISTA_ARMAS.length) { let arma = LISTA_ARMAS[i], venta = acumMarcaGeneral[arma] || 0; dashSheet.getRange(rM, 8).setValue(arma); dashSheet.getRange(rM, 9).setValue(venta).setNumberFormat("#,##0").setBackground(venta === 0 ? "#FED7D7" : "#FFFFFF"); vGlobalArmas += venta; } }
  rFinTablas = startTablas + maxFilasGrupos - 1;
  dashSheet.getRange(rFinTablas, 2).setValue("Total Ventas Marcas").setFontWeight("bold").setBackground("#E2E8F0"); dashSheet.getRange(rFinTablas, 3).setValue(vGlobalMarcas).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#E2E8F0"); dashSheet.getRange(rFinTablas+1, 2).setValue("% del valor total >>").setFontWeight("bold").setBackground("#A0AEC0"); dashSheet.getRange(rFinTablas+1, 3).setValue(vTotalCia>0 ? vGlobalMarcas/vTotalCia : 0).setFontWeight("bold").setNumberFormat("0.0%").setBackground("#A0AEC0"); dashSheet.getRange(startTablas - 2, 2, maxFilasGrupos + 4, 2).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);
  dashSheet.getRange(rFinTablas, 8).setValue("Total Ventas A&M").setFontWeight("bold").setBackground("#E2E8F0"); dashSheet.getRange(rFinTablas, 9).setValue(vGlobalArmas).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#E2E8F0"); dashSheet.getRange(rFinTablas+1, 8).setValue("% del valor total >>").setFontWeight("bold").setBackground("#A0AEC0"); dashSheet.getRange(rFinTablas+1, 9).setValue(vTotalCia>0 ? vGlobalArmas/vTotalCia : 0).setFontWeight("bold").setNumberFormat("0.0%").setBackground("#A0AEC0"); dashSheet.getRange(startTablas - 2, 8, maxFilasGrupos + 4, 2).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);
  let rOtrasGlobal = rFinTablas + 3;
  if (listaOtrasMarcas.length > 0) {
    dashSheet.getRange(rOtrasGlobal, 2, 1, 2).merge().setValue("RESTO DE MARCAS").setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF"); rOtrasGlobal++; dashSheet.getRange(rOtrasGlobal, 2, 1, 2).setValues([["Marca", "Ventas en GS"]]).setFontWeight("bold").setBackground("#EDF2F7");
    let startOtras = rOtrasGlobal + 1, vGlobalOtras = 0; listaOtrasMarcas.forEach((m, idx) => { let rM = startOtras + idx, venta = acumMarcaGeneral[m] || 0; dashSheet.getRange(rM, 2).setValue(m); dashSheet.getRange(rM, 3).setValue(venta).setNumberFormat("#,##0").setBackground(venta === 0 ? "#FED7D7" : "#FFFFFF"); vGlobalOtras += venta; });
    let finOtras = startOtras + listaOtrasMarcas.length - 1; dashSheet.getRange(finOtras + 1, 2).setValue("Total Resto Marcas").setFontWeight("bold").setBackground("#E2E8F0"); dashSheet.getRange(finOtras + 1, 3).setValue(vGlobalOtras).setFontWeight("bold").setNumberFormat("#,##0").setBackground("#E2E8F0"); dashSheet.getRange(startOtras - 2, 2, listaOtrasMarcas.length + 3, 2).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID); rAct = finOtras + 4;
  } else rAct = rFinTablas + 4;

  let canalesParaDibujar = ["Salon", "Online", "E-commerce", "Mayoristas", "Directorio", "Venta Externa"]; Object.keys(vendedoresPorCanal).forEach(c => { if (!canalesParaDibujar.includes(c)) canalesParaDibujar.push(c); });

  canalesParaDibujar.forEach(canal => {
     if (canal === "Reparaciones") return;
     let vends = vendedoresPorCanal[canal]; if (!vends || vends.length === 0) return;

     let vendsValidos = vends.filter(v => !VENDEDORES_IGNORADOS.some(ign => v.toUpperCase().includes(ign)));
     if (vendsValidos.length === 0) return;

     dashSheet.getRange(rAct, 2, 1, 5).merge().setValue(`👥 DESEMPEÑO POR VENDEDOR - ${canal.toUpperCase()}`).setFontWeight("bold").setFontSize(14).setFontColor("#2C7A7B"); rAct += 2;
     let valMatrix = [], formatMatrix = [], bgMatrix = [], fontColorMatrix = [], fontWeightMatrix = [], alignMatrix = [];
     let vendorOtras = {}, maxOtrasCount = 0; vendsValidos.forEach(v => { vendorOtras[v] = listaOtrasMarcas.filter(m => { return (estructuraVendedores[v][m] ? Math.abs(estructuraVendedores[v][m].ventaYTD) : 0) > 0; }); if (vendorOtras[v].length > maxOtrasCount) maxOtrasCount = vendorOtras[v].length; });

     vendsValidos.forEach((v, vIndex) => {
        let rM = 0;
        let subVM = 0, subMM = 0, subVA = 0, subMA = 0, subVO = 0, subMO = 0, subVYTD = 0, subVAYTD = 0, subVOYTD = 0;
        let cantMarcasConMeta = 0, cantMarcasLogradas = 0;

        const addCell = (val, fmt, bg, fc, fw, align) => { if (!valMatrix[rM]) { valMatrix[rM]=[]; formatMatrix[rM]=[]; bgMatrix[rM]=[]; fontColorMatrix[rM]=[]; fontWeightMatrix[rM]=[]; alignMatrix[rM]=[]; } valMatrix[rM].push(val); formatMatrix[rM].push(fmt); bgMatrix[rM].push(bg); fontColorMatrix[rM].push(fc); fontWeightMatrix[rM].push(fw); alignMatrix[rM].push(align); };
        const fillSpacer = () => { addCell("", "@", "#FFFFFF", "black", "normal", "left"); };

        addCell(`▶  ${v.toUpperCase()}`, "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); fillSpacer(); rM++;
        addCell("Marca", "@", "#EDF2F7", "#2D3748", "bold", "center"); addCell("V. Mes", "@", "#EDF2F7", "#2D3748", "bold", "center"); addCell("V. YTD", "@", "#EBF8FF", "#2B6CB0", "bold", "center"); addCell("Meta", "@", "#EDF2F7", "#2D3748", "bold", "center"); addCell("%", "@", "#EDF2F7", "#2D3748", "bold", "center"); fillSpacer(); rM++;
        addCell("[ MARCAS ]", "@", "#F7FAFC", "#4A5568", "bold", "left"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); fillSpacer(); rM++;

        LISTA_MARCAS.forEach(m => { let rM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaReal : 0, rM_ytd = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaYTD : 0, mM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].metaAsignada : 0, pct = mM_val > 0 ? rM_val / mM_val : 0; if (mM_val > 0) { cantMarcasConMeta++; if (rM_val >= mM_val) cantMarcasLogradas++; } addCell(`   ${m}`, "@", "#FFFFFF", "#718096", "normal", "left"); addCell(rM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(rM_ytd, "#,##0", "#EBF8FF", "#2B6CB0", "normal", "right"); addCell(mM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(pct, "0%", "#FFFFFF", pct < 1 ? "red" : "green", "bold", "center"); fillSpacer(); subVM += rM_val; subVYTD += rM_ytd; subMM += mM_val; rM++; });
        addCell("Subtotal Marcas", "@", "#EDF2F7", "#2D3748", "bold", "right"); addCell(subVM, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subVYTD, "#,##0", "#EBF8FF", "#2B6CB0", "bold", "right"); addCell(subMM, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subMM > 0 ? subVM / subMM : 0, "0%", "#EDF2F7", (subMM > 0 ? subVM / subMM : 0) < 1 ? "red" : "green", "bold", "center"); fillSpacer(); rM++;

        addCell("[ ARMAS Y MUNICIONES ]", "@", "#F7FAFC", "#4A5568", "bold", "left"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); fillSpacer(); rM++;

        LISTA_ARMAS.forEach(m => { let rM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaReal : 0, rM_ytd = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaYTD : 0, mM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].metaAsignada : 0, pct = mM_val > 0 ? rM_val / mM_val : 0; if (mM_val > 0) { cantMarcasConMeta++; if (rM_val >= mM_val) cantMarcasLogradas++; } addCell(`   ${m}`, "@", "#FFFFFF", "#718096", "normal", "left"); addCell(rM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(rM_ytd, "#,##0", "#EBF8FF", "#2B6CB0", "normal", "right"); addCell(mM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(pct, "0%", "#FFFFFF", pct < 1 ? "red" : "green", "bold", "center"); fillSpacer(); subVA += rM_val; subVAYTD += rM_ytd; subMA += mM_val; rM++; });
        addCell("Subtotal A&M", "@", "#EDF2F7", "#2D3748", "bold", "right"); addCell(subVA, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subVAYTD, "#,##0", "#EBF8FF", "#2B6CB0", "bold", "right"); addCell(subMA, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subMA > 0 ? subVA / subMA : 0, "0%", "#EDF2F7", (subMA > 0 ? subVA / subMA : 0) < 1 ? "red" : "green", "bold", "center"); fillSpacer(); rM++;

        if (maxOtrasCount > 0) {
            addCell("[ RESTO DE MARCAS ]", "@", "#F7FAFC", "#4A5568", "bold", "left"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); addCell("", "@", "#F7FAFC", "black", "bold", "center"); fillSpacer(); rM++;
            let misOtras = vendorOtras[v]; for (let k = 0; k < maxOtrasCount; k++) { if (k < misOtras.length) { let m = misOtras[k], rM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaReal : 0, rM_ytd = estructuraVendedores[v][m] ? estructuraVendedores[v][m].ventaYTD : 0, mM_val = estructuraVendedores[v][m] ? estructuraVendedores[v][m].metaAsignada : 0, pct = mM_val > 0 ? rM_val / mM_val : 0; if (mM_val > 0) { cantMarcasConMeta++; if (rM_val >= mM_val) cantMarcasLogradas++; } addCell(`   ${m}`, "@", "#FFFFFF", "#718096", "normal", "left"); addCell(rM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(rM_ytd, "#,##0", "#EBF8FF", "#2B6CB0", "normal", "right"); addCell(mM_val, "#,##0", "#FFFFFF", "black", "normal", "right"); addCell(pct, "0%", "#FFFFFF", pct < 1 ? "red" : "green", "bold", "center"); fillSpacer(); subVO += rM_val; subVOYTD += rM_ytd; subMO += mM_val; rM++; } else { addCell("", "@", "#FFFFFF", "black", "normal", "left"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "center"); fillSpacer(); rM++; } }
            addCell("Subtotal Resto", "@", "#EDF2F7", "#2D3748", "bold", "right"); addCell(subVO, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subVOYTD, "#,##0", "#EBF8FF", "#2B6CB0", "bold", "right"); addCell(subMO, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell(subMO > 0 ? subVO / subMO : 0, "0%", "#EDF2F7", (subMO > 0 ? subVO / subMO : 0) < 1 ? "red" : "green", "bold", "center"); fillSpacer(); rM++;
        }

        let vTotV = subVM + subVA + subVO, vTotYTD = subVYTD + subVAYTD + subVOYTD, mTotV = metasConfig.vendedoresTotales[v] > 0 ? metasConfig.vendedoresTotales[v] : (subMM + subMA + subMO);
        addCell(`TOTAL ${v.toUpperCase()}`, "@", "#E2E8F0", "black", "bold", "right"); addCell(vTotV, "#,##0", "#E2E8F0", "black", "bold", "right"); addCell(vTotYTD, "#,##0", "#90CDF4", "#2B6CB0", "bold", "right"); addCell(mTotV, "#,##0", "#E2E8F0", "black", "bold", "right"); addCell(mTotV > 0 ? vTotV / mTotV : 0, "0%", "#E2E8F0", (mTotV > 0 ? vTotV / mTotV : 0) < 1 ? "red" : "green", "bold", "center"); fillSpacer(); rM++;
        let proyVend = diasHabilesTranscurridos > 0 ? (vTotV / diasHabilesTranscurridos) * diasHabilesMes : 0, difProyVend = proyVend - mTotV, esperadoVendHoy = (mTotV / diasHabilesMes) * diasHabilesTranscurridos, difEsperadoVend = vTotV - esperadoVendHoy, ncVendTotal = ncPorVendedor[v] || 0;
        let pctHoyVend = esperadoVendHoy > 0 ? (vTotV / esperadoVendHoy) : 0;

        addCell("--- PROYECCIÓN Y KPIs ---", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); addCell("", "@", "#1C3D5A", "#FFFFFF", "bold", "center"); fillSpacer(); rM++;
        addCell("Notas de Crédito (Devoluciones)", "@", "#FFF5F5", "black", "normal", "left"); addCell(-ncVendTotal, "#,##0", "#FFF5F5", "red", "bold", "right"); addCell("", "@", "#FFF5F5", "black", "normal", "right"); addCell("", "@", "#FFF5F5", "black", "normal", "right"); addCell("", "@", "#FFF5F5", "black", "normal", "center"); fillSpacer(); rM++;
        addCell("Meta Esperada a Hoy", "@", "#EDF2F7", "black", "normal", "left"); addCell(esperadoVendHoy, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "center"); fillSpacer(); rM++;
        addCell("% Alcanzado a Hoy", "@", "#EDF2F7", "black", "bold", "left"); addCell(pctHoyVend, "0%", "#EDF2F7", (pctHoyVend < 1) ? "red" : "green", "bold", "center"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "center"); fillSpacer(); rM++;
        addCell("Diferencia contra Hoy", "@", "#FFFFFF", "black", "bold", "left"); addCell(difEsperadoVend, "#,##0", "#FFFFFF", difEsperadoVend >= 0 ? "green" : "red", "bold", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "center"); fillSpacer(); rM++;
        addCell("Cantidad de Marcas Asignadas", "@", "#EDF2F7", "black", "normal", "left"); addCell(cantMarcasConMeta, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "center"); fillSpacer(); rM++;
        addCell("Marcas Alcanzadas", "@", "#FFFFFF", "black", "bold", "left"); addCell(cantMarcasLogradas, "#,##0", "#FFFFFF", cantMarcasLogradas > 0 ? "green" : "red", "bold", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell("", "@", "#FFFFFF", "black", "normal", "right"); addCell(cantMarcasConMeta > 0 ? cantMarcasLogradas / cantMarcasConMeta : 0, "0%", "#FFFFFF", "black", "bold", "center"); fillSpacer(); rM++;
        addCell("Proyección Lineal Venta a Fin de Mes", "@", "#EDF2F7", "black", "bold", "left"); addCell(proyVend, "#,##0", "#EDF2F7", "black", "bold", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell("", "@", "#EDF2F7", "black", "normal", "right"); addCell(mTotV > 0 ? proyVend / mTotV : 0, "0%", "#EDF2F7", difProyVend >= 0 ? "green" : "red", "bold", "center"); fillSpacer(); rM++;
     });
     let totalRows = valMatrix.length, totalCols = vendsValidos.length * 6;
     if (totalRows > 0 && vendsValidos.length > 0) {
        for (let i = 0; i < vendsValidos.length; i++) { let base = (i * 6) + 2; dashSheet.getRange(rAct, base, 1, 5).merge(); }
        dashSheet.getRange(rAct, 2, totalRows, totalCols).setValues(valMatrix); dashSheet.getRange(rAct, 2, totalRows, totalCols).setNumberFormats(formatMatrix); dashSheet.getRange(rAct, 2, totalRows, totalCols).setBackgrounds(bgMatrix); dashSheet.getRange(rAct, 2, totalRows, totalCols).setFontColors(fontColorMatrix); dashSheet.getRange(rAct, 2, totalRows, totalCols).setFontWeights(fontWeightMatrix); dashSheet.getRange(rAct, 2, totalRows, totalCols).setHorizontalAlignments(alignMatrix);
        for (let i = 0; i < vendsValidos.length; i++) { let base = (i * 6) + 2; dashSheet.getRange(rAct, base, totalRows, 5).setBorder(true, true, true, true, false, false, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID); }
     }
     rAct += totalRows + 3;
  });

  SpreadsheetApp.flush();
}

function crearEstructuraConfig(sheet) {
  sheet.clear(); sheet.getRange("A1").setValue("⚙️ PANEL CENTRAL").setFontWeight("bold"); sheet.getRange("A3").setValue("Fecha Inicio:"); sheet.getRange("A4").setValue("Fecha Fin:");
  var _hoy = new Date(), _tz = Session.getScriptTimeZone();
  var _ini = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1), _fin = new Date(_hoy.getFullYear(), _hoy.getMonth() + 1, 0);
  sheet.getRange("B3").setValue(Utilities.formatDate(_ini, _tz, "dd/MM/yyyy"));
  sheet.getRange("B4").setValue(Utilities.formatDate(_fin, _tz, "dd/MM/yyyy")); sheet.getRange("A5").setValue("Fecha Actual (Corte):").setFontWeight("bold").setFontColor("#2C7A7B"); sheet.getRange("B5").setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy"));
  sheet.getRange("C2").setValue("🏖️ FERIADOS DEL MES").setFontWeight("bold").setFontColor("#C53030"); sheet.getRange("C3:C12").setBackground("#FFF5F5").setBorder(true, true, true, true, false, false, "#FEB2B2", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange("A6").setValue("Días Hábiles del Mes:").setFontWeight("bold").setFontColor("#2C7A7B"); sheet.getRange("B6").setValue("=CALCULAR_HABILES(B3; B4; C3:C12)").setNumberFormat("0.0"); sheet.getRange("A7").setValue("Días Hábiles Transcurridos:").setFontWeight("bold").setFontColor("#2C7A7B"); sheet.getRange("B7").setValue("=CALCULAR_HABILES(B3; B5; C3:C12)").setNumberFormat("0.0");
  sheet.getRange("D2").setValue("META GLOBAL DE LA COMPAÑÍA").setFontWeight("bold"); sheet.getRange("D4").setValue(0).setNumberFormat("₲ #,##0"); sheet.getRange("F2").setValue("METAS POR CANAL").setFontWeight("bold"); sheet.getRange("F3:G3").setValues([["Canal", "Monto"]]).setFontWeight("bold");

  sheet.getRange(4, 6, CANALES.length, 2).setValues(CANALES.map(c => [c, 0]));

  sheet.getRange("F11").setValue("METAS POR LÍNEA").setFontWeight("bold").setFontColor("#2C7A7B"); sheet.getRange("F12:G12").setValues([["Categoría", "Monto Objetivo"]]).setFontWeight("bold"); sheet.getRange("F13:G14").setValues([["SUPLEMENTOS", 0], ["OTROS", 0]]);
  sheet.getRange("I2").setValue("METAS TOTALES POR VENDEDOR").setFontWeight("bold").setFontColor("#2C7A7B"); sheet.getRange("I3:J3").setValues([["Vendedor", "Monto Objetivo Total"]]).setFontWeight("bold"); sheet.getRange("J4:J50").setNumberFormat("₲ #,##0"); sheet.autoResizeColumns(1, 10);
}

function guardarHistorial() {
  const ssOriginal = SpreadsheetApp.getActiveSpreadsheet(); const dash = ssOriginal.getSheetByName(HOJA_DASHBOARD), data = ssOriginal.getSheetByName(HOJA_DESTINO); if (!dash || !data) return;
  ssOriginal.toast("Creando copia de seguridad...", "⏳ Espere", 8); const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"], fecha = new Date();
  const nombreArchivo = "Dashboard - " + meses[fecha.getMonth()] + " " + fecha.getFullYear() + " (" + Utilities.formatDate(fecha, Session.getScriptTimeZone(), "dd/MM HH:mm") + ")";
  var nuevoSS = SpreadsheetApp.create(nombreArchivo), nuevoSSId = nuevoSS.getId(); dash.copyTo(nuevoSS).setName("DASHBOARD COMERCIAL"); data.copyTo(nuevoSS).setName("DATA");
  var hoja1 = nuevoSS.getSheetByName("Hoja 1"); if (!hoja1) hoja1 = nuevoSS.getSheets()[0]; if (nuevoSS.getSheets().length > 1) nuevoSS.deleteSheet(hoja1);
  var fileNuevo = DriveApp.getFileById(nuevoSSId), fileOriginal = DriveApp.getFileById(ssOriginal.getId()), carpetas = fileOriginal.getParents();
  if (carpetas.hasNext()) { var carpetaPadre = carpetas.next(), carpetasHistorial = carpetaPadre.getFoldersByName("Historial Dashboards"), carpetaDestino; if (carpetasHistorial.hasNext()) carpetaDestino = carpetasHistorial.next(); else carpetaDestino = carpetaPadre.createFolder("Historial Dashboards"); fileNuevo.moveTo(carpetaDestino); }
  SpreadsheetApp.getUi().alert("✅ ¡Historial guardado con éxito!");
}

function login(url, db, u, p) { var r = UrlFetchApp.fetch(url, {method:"post", contentType:"application/json", payload:JSON.stringify({jsonrpc:"2.0",method:"call",params:{service:"common",method:"login",args:[db,u,p]},id:1})}); return JSON.parse(r.getContentText()).result; }
function execute_kw(url, db, uid, p, model, method, args, kwargs) { var r = UrlFetchApp.fetch(url, {method:"post", contentType:"application/json", payload:JSON.stringify({jsonrpc:"2.0",method:"call",params:{service:"object",method:"execute_kw",args:[db,uid,p,model,method,args,kwargs]},id:2})}); return JSON.parse(r.getContentText()).result; }
function formatearFechaParaOdoo(v) { if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd"); let p = v.toString().trim().split("/"); if(p.length===3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`; return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }

// ==================================================================
//  ⏰ AUTOMATIZACIÓN
//  Instala un disparador de Apps Script que baja las ventas de Odoo solo,
//  sin que nadie abra la planilla. Como el dashboard lee el CSV publicado,
//  con esto se actualiza todo sin tocar nada.
// ==================================================================

// Cada cuántas horas se baja Odoo (1, 2, 4, 6, 8 o 12).
const HORAS_ACTUALIZACION = 2;

function activarActualizacionAutomatica() {
  borrarTriggersActualizacion_();
  ScriptApp.newTrigger("actualizarAutomatico").timeBased().everyHours(HORAS_ACTUALIZACION).create();
  SpreadsheetApp.getUi().alert("✅ Actualización automática activada.\n\nSe van a bajar las ventas de Odoo cada " +
    HORAS_ACTUALIZACION + " hora(s), aunque nadie abra la planilla.\n\nPara cambiar la frecuencia, editá " +
    "HORAS_ACTUALIZACION arriba del script y volvé a activarla.");
}

function desactivarActualizacionAutomatica() {
  var n = borrarTriggersActualizacion_();
  SpreadsheetApp.getUi().alert(n ? "⏹️ Actualización automática desactivada." : "No había ninguna actualización automática activa.");
}

function borrarTriggersActualizacion_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "actualizarAutomatico") { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function estadoActualizacionAutomatica() {
  var trs = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === "actualizarAutomatico"; });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), cfg = ss.getSheetByName(HOJA_CONFIG);
  var ult = cfg ? cfg.getRange("B9").getValue() : "";
  SpreadsheetApp.getUi().alert(
    (trs.length ? "✅ Activa: cada " + HORAS_ACTUALIZACION + " hora(s)." : "⏹️ Desactivada.") +
    "\n\nÚltima actualización: " + (ult || "todavía no se corrió."));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ Menú Vitálica')
    .addItem('🔎 0. Descubrir estructura de Vitálica (Odoo)', 'descubrirEstructuraVitalica')
    .addItem('📥 1. Sincronizar Categorías (CONFIG)', 'sincronizarMarcasConfig')
    .addItem('🔄 2. Descargar Ventas Odoo', 'actualizarDatosOdoo')
    .addItem('📊 3. Generar Dashboard Comercial', 'dibujarDashboard')
    .addItem('🛒 4. Desglose E-commerce', 'dibujarDashboardEcommerce')
    .addSeparator()
    .addItem('💾 5. Guardar Historial del Mes', 'guardarHistorial')
    .addSeparator()
    .addItem('⏰ Activar actualización automática', 'activarActualizacionAutomatica')
    .addItem('⏹️ Desactivar actualización automática', 'desactivarActualizacionAutomatica')
    .addItem('ℹ️ Estado de la actualización automática', 'estadoActualizacionAutomatica')
    .addSeparator()
    .addItem('🔐 Configurar credenciales de Odoo', 'configurarCredencialesOdoo')
    .addItem('⚠️ Restaurar Estructura CONFIG', 'restaurarConfig')
    .addToUi();
}

function dibujarDashboardEcommerce() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetData = ss.getSheetByName(HOJA_DESTINO);
  if (!sheetData || sheetData.getLastRow() <= 1) { SpreadsheetApp.getUi().alert("\u26a0\ufe0f No hay informaci\u00f3n en DATA."); return; }

  const HOJA_ECOMMERCE = "DASHBOARD E-COMMERCE";
  let dashEco = ss.getSheetByName(HOJA_ECOMMERCE);
  if (!dashEco) dashEco = ss.insertSheet(HOJA_ECOMMERCE); else dashEco.clear();
  dashEco.setHiddenGridlines(true);
  dashEco.getRange("A1:Z200").setBackground("#FFFFFF");

  let rowsOut = sheetData.getRange(2, 1, sheetData.getLastRow() - 1, 32).getValues();

  // Agrupa el canal E-commerce por cliente (o por el grupo de la columna 32 si esta cargado).
  let acum = {};   // nombre -> {bruto, nc}
  rowsOut.forEach(r => {
    let canalR = r[18] ? r[18].toString().trim() : "";
    if (canalR !== "E-commerce") return;
    let docR = r[5] ? r[5].toString().trim() : "";
    let cliente = r[13] ? r[13].toString().trim() : "Sin Cliente";
    let grupoEcom = r[31] ? r[31].toString().trim() : "";
    let totalR = Number(r[30]) || 0;

    // Si el cliente esta en la lista de clientes de e-commerce, se lo muestra aparte;
    // si no, cae en el grupo configurado (GRUPO_ECOMMERCE_RESTO) o con su propio nombre.
    let clave = cliente;
    if (grupoEcom && !contieneAlguna_(normTxt_(cliente), CLIENTES_ECOMMERCE)) clave = grupoEcom;

    if (!acum[clave]) acum[clave] = { bruto: 0, nc: 0 };
    if (docR === "Nota de Crédito") acum[clave].nc += totalR; else acum[clave].bruto += totalR;
  });

  let filas = Object.keys(acum).map(k => [k, acum[k].bruto, acum[k].nc, acum[k].bruto + acum[k].nc]);
  filas.sort((a, b) => b[3] - a[3]);

  let totalBruto = filas.reduce((s, f) => s + f[1], 0);
  let totalNC = filas.reduce((s, f) => s + f[2], 0);

  dashEco.setColumnWidth(1, 20); dashEco.setColumnWidth(2, 280);
  dashEco.setColumnWidth(3, 160); dashEco.setColumnWidth(4, 160); dashEco.setColumnWidth(5, 180);

  dashEco.getRange("B2:E2").merge().setValue("\ud83d\uded2 DESGLOSE DE E-COMMERCE \u2014 " + EMPRESA_NOMBRE)
    .setFontSize(14).setFontWeight("bold").setHorizontalAlignment("center").setBackground("#2C7A7B").setFontColor("#FFFFFF");
  dashEco.getRange("B4:E4").setValues([["Cliente / Grupo", "Ventas Brutas", "Notas de Crédito", "Total Venta Neta (GS)"]])
    .setFontWeight("bold").setBackground("#1C3D5A").setFontColor("#FFFFFF");

  if (filas.length > 0) dashEco.getRange(5, 2, filas.length, 4).setValues(filas);
  let filaTotal = 5 + filas.length;
  dashEco.getRange(filaTotal, 2, 1, 4).setValues([["TOTAL GENERAL E-COMMERCE", totalBruto, totalNC, totalBruto + totalNC]])
    .setFontWeight("bold").setBackground("#EDF2F7");

  dashEco.getRange(5, 3, filas.length + 1, 3).setNumberFormat("#,##0");
  dashEco.getRange(5, 4, filas.length + 1, 1).setFontColor("red");
  dashEco.getRange(5, 5, filas.length + 1, 1).setFontWeight("bold");
  dashEco.getRange(4, 2, filas.length + 2, 4).setBorder(true, true, true, true, true, true, "#CBD5E0", SpreadsheetApp.BorderStyle.SOLID);
}

// ==================================================================
//  🔎 DESCUBRIMIENTO — lee Odoo y escribe en la hoja DESCUBRIMIENTO
//  todo lo que hay REALMENTE en la empresa Vitálica (EMPRESA_ID):
//  equipos de venta, vendedores, marcas, categorías y clientes.
//  Es el primer paso: con esa salida se completan las listas de la
//  cabecera de este archivo (canales, marcas, exclusiones).
// ==================================================================
function descubrirEstructuraVitalica() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const configSheet = ss.getSheetByName(HOJA_CONFIG);

  let anio = new Date().getFullYear();
  if (configSheet) {
    let valFin = configSheet.getRange("B4").getValue();
    if (valFin instanceof Date) anio = valFin.getFullYear();
    else if (valFin) { let p = valFin.toString().split("/"); if (p.length === 3) anio = parseInt(p[2], 10) || anio; }
  }

  ss.toast("Conectando con Odoo...", "\u23f3 Descubriendo", 5);
  var pwd = getOdooPwd_();
  var uid = login(ODOO_URL, ODOO_DB, ODOO_USER, pwd);
  if (!uid) { ui.alert("\u274c No se pudo entrar a Odoo. Revis\u00e1 la API key."); return; }

  // Empresas disponibles (para confirmar que el ID 2 es Vitálica)
  var empresas = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "res.company", "search_read", [[]], { fields: ["id", "name"] }) || [];

  var lines = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move.line", "search_read", [[
    ["move_id.state", "=", "posted"],
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.company_id", "=", EMPRESA_ID],
    ["date", ">=", anio + "-01-01"],
    ["date", "<=", anio + "-12-31"]
  ]], { fields: ["date", "price_total", "price_subtotal", "product_id", "partner_id", "move_id"], limit: 80000 }) || [];

  if (!lines.length) { ui.alert("\u26a0\ufe0f No se encontraron facturas de " + EMPRESA_NOMBRE + " (empresa " + EMPRESA_ID + ") en " + anio + "."); return; }

  var moveIds = [], productIds = [];
  lines.forEach(l => { if (l.move_id) moveIds.push(l.move_id[0]); if (l.product_id) productIds.push(l.product_id[0]); });
  var moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "read", [[...new Set(moveIds)]], { fields: ["invoice_user_id", "team_id", "move_type"] }) || [];
  var moveMap = {}; moves.forEach(m => moveMap[m.id] = m);
  var products = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "product.product", "read", [[...new Set(productIds)]], { fields: ["categ_id", "product_brand_id"] }) || [];
  var productMap = {}; products.forEach(p => productMap[p.id] = p);

  var equipos = {}, vendedores = {}, marcas = {}, categorias = {}, clientes = {}, vendPorEquipo = {};
  lines.forEach(l => {
    var m = moveMap[l.move_id[0]]; if (!m) return;
    // Importes sin IVA, igual que el panel (MONTO_BASE).
    var total = Number((MONTO_BASE === "SIN_IVA" ? l.price_subtotal : l.price_total) || 0);
    var equipo = m.team_id ? m.team_id[1] : "(sin equipo)";
    var vend = m.invoice_user_id ? m.invoice_user_id[1] : "(sin vendedor)";
    var prod = l.product_id ? productMap[l.product_id[0]] : null;
    var marca = (prod && prod.product_brand_id) ? prod.product_brand_id[1] : "(sin marca)";
    var categ = (prod && prod.categ_id) ? prod.categ_id[1] : "(sin categoría)";
    var cli = l.partner_id ? l.partner_id[1] : "(sin cliente)";

    equipos[equipo] = (equipos[equipo] || 0) + total;
    vendedores[vend] = (vendedores[vend] || 0) + total;
    marcas[marca] = (marcas[marca] || 0) + total;
    categorias[categ] = (categorias[categ] || 0) + total;
    clientes[cli] = (clientes[cli] || 0) + total;
    var claveVE = equipo + "  \u25b8  " + vend;
    vendPorEquipo[claveVE] = (vendPorEquipo[claveVE] || 0) + total;
  });

  let hoja = ss.getSheetByName(HOJA_DESCUBRIMIENTO);
  if (!hoja) hoja = ss.insertSheet(HOJA_DESCUBRIMIENTO); else hoja.clear();
  hoja.setHiddenGridlines(true);

  var out = [];
  out.push(["\ud83d\udd0e ESTRUCTURA REAL DE " + EMPRESA_NOMBRE + " EN ODOO (a\u00f1o " + anio + ")", "", ""]);
  out.push(["Facturas leídas: " + lines.length + " líneas", "", ""]);
  out.push(["", "", ""]);
  out.push(["EMPRESAS EN LA INSTANCIA", "ID", "Facturación " + anio + (MONTO_BASE === "SIN_IVA" ? " (sin IVA)" : " (con IVA)")]);
  empresas.forEach(e => out.push([e.name, e.id, e.id === EMPRESA_ID ? "\u2705 esta es la que se trae" : ""]));

  function bloque(titulo, obj, nota) {
    out.push(["", "", ""]);
    out.push([titulo, "Facturación " + anio + " (GS)", nota || ""]);
    Object.keys(obj).sort((a, b) => obj[b] - obj[a]).forEach(k => out.push([k, Math.round(obj[k]), ""]));
  }
  bloque("EQUIPOS DE VENTA (team_id)", equipos, "\u2192 mapear a canales en MAPEO_CANALES");
  bloque("VENDEDORES (invoice_user_id)", vendedores, "\u2192 revisar cuáles excluir");
  bloque("EQUIPO \u25b8 VENDEDOR", vendPorEquipo, "");
  bloque("MARCAS (product_brand_id)", marcas, "\u2192 completar LISTA_MARCAS");
  bloque("CATEGORÍAS (categ_id)", categorias, "\u2192 completar CATEGORIA_A_MARCA");
  bloque("CLIENTES", clientes, "\u2192 revisar e-commerce / internos");

  hoja.getRange(1, 1, out.length, 3).setValues(out);
  hoja.getRange(1, 1, 1, 3).setFontWeight("bold").setFontSize(13).setFontColor("#2C7A7B");
  hoja.setColumnWidth(1, 420); hoja.setColumnWidth(2, 180); hoja.setColumnWidth(3, 320);
  hoja.getRange(1, 2, out.length, 1).setNumberFormat("#,##0");
  SpreadsheetApp.flush();
  ui.alert("\u2705 Listo. Mirá la hoja «" + HOJA_DESCUBRIMIENTO + "»: ahí están los equipos, vendedores, marcas y clientes reales de " + EMPRESA_NOMBRE + ".");
}
