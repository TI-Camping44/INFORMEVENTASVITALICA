// ============================================================================
//  RELEVAMIENTO PARA LOS TICKETS TI-0104 (objetivos de Vitálica) y TI-0106
//  (canales Unicentro y Tienda Naranja).  SOLO LECTURA.
//
//  Qué hace: le pregunta a Odoo cómo está armado hoy lo que los dos tickets
//  tocan —equipos de venta, diarios, vendedores, familias de producto y los
//  clientes de marketplace— en LAS DOS EMPRESAS, y lo escribe en una hoja
//  nueva llamada RELEVAMIENTO. No crea, no modifica y no borra nada en Odoo:
//  todas las llamadas son search_read / read.
//
//  Cómo usarlo:
//   1. Pegá este archivo como archivo NUEVO en el MISMO proyecto de Apps
//      Script de la planilla de Vitálica (ahí están ODOO_URL, execute_kw y la
//      contraseña guardada: este archivo no las repite).
//   2. Menú «🔄 Odoo Vitálica» ▸ «Relevamiento TI-0104 / TI-0106».
//      Si el menú no aparece, ejecutá la función relevamientoTickets() desde
//      el editor.
//   3. Pasame la hoja RELEVAMIENTO (o una captura) y con eso armo la
//      propuesta final.
//
//  Tarda un par de minutos: son varias consultas sobre todo 2026.
// ============================================================================

// Las dos empresas del grupo. Si alguna ID no fuera ésta, el relevamiento lo
// dice igual: la primera sección lista las empresas con su ID real.
const REL_EMPRESAS = [1, 2];
const REL_DESDE = "2026-01-01";
const REL_HOJA = "RELEVAMIENTO";

// Nombres que nos interesan para los marketplaces (TI-0106). Se busca por
// coincidencia parcial, sin distinguir mayúsculas.
const REL_MARKETPLACES = ["UNICENTRO", "NARANJA", "TUPI", "PORTER", "CONTIMARKET", "MERCADO LIBRE", "MERCADOLIBRE"];

function relevamientoTickets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pwd = getOdooPwd_();
  const uid = login(ODOO_URL, ODOO_DB, ODOO_USER, pwd);
  if (!uid) { SpreadsheetApp.getUi().alert("No se pudo entrar a Odoo."); return; }

  const filas = [];
  const titulo = (t) => { filas.push([]); filas.push(["════ " + t + " ════"]); };
  const cab = (arr) => filas.push(arr);
  const fila = (arr) => filas.push(arr);
  const nota = (t) => filas.push(["· " + t]);

  filas.push(["RELEVAMIENTO TI-0104 / TI-0106 · solo lectura · " +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")]);

  // ---------------------------------------------------------------- empresas
  const empresas = {};
  titulo("1. EMPRESAS");
  cab(["ID", "Empresa", "Moneda"]);
  try {
    const cs = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "res.company", "search_read",
      [[]], { fields: ["name", "currency_id"] }) || [];
    cs.forEach(c => {
      empresas[c.id] = c.name;
      fila([c.id, c.name, c.currency_id ? c.currency_id[1] : ""]);
    });
  } catch (e) { nota("No se pudieron leer las empresas: " + e.message); }
  const nomEmpresa = (id) => empresas[id] || ("empresa " + id);

  // ------------------------------------------------- equipos de venta (canal)
  // Así se identifica hoy el canal de una venta: por el equipo de ventas de la
  // factura. Lo que importa para TI-0106 es si el equipo tiene empresa propia.
  titulo("2. EQUIPOS DE VENTA (crm.team) · de acá sale el canal de cada venta");
  cab(["ID", "Equipo", "Empresa del equipo", "Activo", "Responsable", "Facturas 2026", "Sin IVA 2026"]);
  const equipos = {};
  try {
    const ts = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "crm.team", "search_read",
      [[["active", "in", [true, false]]]],
      { fields: ["name", "company_id", "active", "user_id"], limit: 500 }) || [];
    ts.forEach(t => { equipos[t.id] = t; });
    // Cuánto facturó cada equipo en 2026, para saber cuáles están vivos.
    const porEquipo = relVentasPorCampo_(uid, pwd, "team_id");
    ts.sort((a, b) => (porEquipo[b.id] ? porEquipo[b.id].monto : 0) - (porEquipo[a.id] ? porEquipo[a.id].monto : 0));
    ts.forEach(t => {
      const v = porEquipo[t.id] || { n: 0, monto: 0 };
      fila([t.id, t.name, t.company_id ? t.company_id[1] : "(todas las empresas)",
            t.active ? "sí" : "NO", t.user_id ? t.user_id[1] : "", v.n, Math.round(v.monto)]);
    });
    nota("Un equipo SIN empresa (vacío) se ve desde las dos: para que un canal quede sólo en su " +
         "empresa, el equipo tiene que tener la empresa puesta.");
  } catch (e) { nota("No se pudieron leer los equipos: " + e.message); }

  // --------------------------------------------------------- diarios de venta
  titulo("3. DIARIOS DE VENTA (account.journal)");
  cab(["ID", "Diario", "Código", "Empresa", "Facturas 2026", "Sin IVA 2026"]);
  try {
    const js = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.journal", "search_read",
      [[["type", "=", "sale"]]], { fields: ["name", "code", "company_id"], limit: 200 }) || [];
    const porDiario = relVentasPorCampo_(uid, pwd, "journal_id");
    js.forEach(j => {
      const v = porDiario[j.id] || { n: 0, monto: 0 };
      fila([j.id, j.name, j.code, j.company_id ? j.company_id[1] : "", v.n, Math.round(v.monto)]);
    });
  } catch (e) { nota("No se pudieron leer los diarios: " + e.message); }

  // ---------------------------------------------------------------- vendedores
  titulo("4. VENDEDORES CON FACTURACIÓN 2026 (invoice_user_id), por empresa");
  cab(["Empresa", "Vendedor", "Equipo que más usa", "Facturas", "Sin IVA 2026"]);
  try {
    REL_EMPRESAS.forEach(cid => {
      const vend = relVendedores_(uid, pwd, cid);
      vend.forEach(v => fila([nomEmpresa(cid), v.nombre, v.equipo, v.n, Math.round(v.monto)]));
      if (!vend.length) nota("Sin facturación 2026 en " + nomEmpresa(cid));
    });
  } catch (e) { nota("No se pudieron leer los vendedores: " + e.message); }

  // -------------------------------------------- familias (categorías) Vitálica
  titulo("5. FAMILIAS DE PRODUCTO CON VENTA 2026 (product.category), por empresa");
  cab(["Empresa", "Familia / categoría", "Líneas", "Unidades", "Sin IVA 2026"]);
  try {
    REL_EMPRESAS.forEach(cid => {
      const fams = relFamilias_(uid, pwd, cid);
      fams.forEach(f => fila([nomEmpresa(cid), f.nombre, f.lineas, f.unidades, Math.round(f.monto)]));
      if (!fams.length) nota("Sin venta 2026 en " + nomEmpresa(cid));
    });
    nota("Ésta es la lista con la que se pueden cargar objetivos por familia (TI-0104).");
  } catch (e) { nota("No se pudieron leer las familias: " + e.message); }

  // ------------------------------------------------- clientes de marketplace
  titulo("6. CLIENTES DE MARKETPLACE (Unicentro, Tienda Naranja y los que ya existen)");
  cab(["Empresa", "Cliente", "RUC", "Facturas 2026", "Sin IVA 2026", "Equipo que más usa"]);
  let encontrados = 0;
  try {
    REL_MARKETPLACES.forEach(nombre => {
      const r = relClientesPorNombre_(uid, pwd, nombre);
      r.forEach(x => { encontrados++; fila([nomEmpresa(x.company), x.cliente, x.ruc, x.n, Math.round(x.monto), x.equipo]); });
    });
    if (!encontrados) nota("No hay ningún cliente cargado con esos nombres: Unicentro y Tienda Naranja " +
                           "todavía no se identifican por cliente.");
  } catch (e) { nota("No se pudieron buscar los clientes: " + e.message); }

  // ------------------------------------------------------- etiquetas (Studio)
  titulo("7. ETIQUETAS DE FACTURA (campo Studio), si existe");
  try {
    const flds = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "fields_get", [], { attributes: ["string", "type"] }) || {};
    let campo = "";
    Object.keys(flds).forEach(fn => {
      const lbl = (flds[fn] && flds[fn].string ? flds[fn].string : "").toUpperCase();
      if (!campo && (lbl === "ETIQUETAS" || (fn.indexOf("x_studio") === 0 && lbl.indexOf("ETIQUETA") >= 0))) campo = fn;
    });
    if (!campo) { nota("La factura no tiene campo de etiquetas: no se puede usar para marcar el canal."); }
    else {
      cab(["Empresa", "Etiqueta", "Facturas 2026"]);
      const moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "search_read",
        [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
          ["invoice_date", ">=", REL_DESDE], ["company_id", "in", REL_EMPRESAS]]],
        { fields: ["company_id", campo], limit: 20000 }) || [];
      const acc = {};
      moves.forEach(m => {
        const v = Array.isArray(m[campo]) ? (m[campo][1] || "") : String(m[campo] || "");
        if (!v) return;
        const k = (m.company_id ? m.company_id[0] : 0) + "|" + v;
        acc[k] = (acc[k] || 0) + 1;
      });
      Object.keys(acc).sort().forEach(k => {
        const p = k.split("|");
        fila([nomEmpresa(+p[0]), p[1], acc[k]]);
      });
      if (!Object.keys(acc).length) nota("El campo existe (" + campo + ") pero no está cargado en ninguna factura de 2026.");
    }
  } catch (e) { nota("No se pudieron leer las etiquetas: " + e.message); }

  // ------------------------------------------------------------------ escribir
  let sh = ss.getSheetByName(REL_HOJA);
  if (!sh) sh = ss.insertSheet(REL_HOJA); else sh.clear();
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 1);
  const normal = filas.map(f => { const c = f.slice(); while (c.length < ancho) c.push(""); return c; });
  sh.getRange(1, 1, normal.length, ancho).setValues(normal);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.min(ancho, 8));
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert("✅ Relevamiento listo en la hoja " + REL_HOJA + ".\n\n" +
    "No se modificó nada en Odoo: fueron todas consultas de lectura.");
}

// Cuánto facturó 2026 agrupado por un campo de la FACTURA (team_id, journal_id…).
function relVentasPorCampo_(uid, pwd, campo) {
  const moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "search_read",
    [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
      ["invoice_date", ">=", REL_DESDE], ["company_id", "in", REL_EMPRESAS]]],
    { fields: [campo, "amount_untaxed_signed"], limit: 40000 }) || [];
  const acc = {};
  moves.forEach(m => {
    const v = m[campo]; if (!v) return;
    const id = Array.isArray(v) ? v[0] : v;
    if (!acc[id]) acc[id] = { n: 0, monto: 0 };
    acc[id].n++; acc[id].monto += Number(m.amount_untaxed_signed || 0);
  });
  return acc;
}

// Vendedores con facturación 2026 en una empresa, con el equipo que más usan.
function relVendedores_(uid, pwd, companyId) {
  const moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "search_read",
    [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
      ["invoice_date", ">=", REL_DESDE], ["company_id", "=", companyId]]],
    { fields: ["invoice_user_id", "team_id", "amount_untaxed_signed"], limit: 40000 }) || [];
  const acc = {};
  moves.forEach(m => {
    const nombre = m.invoice_user_id ? m.invoice_user_id[1] : "(sin vendedor)";
    if (!acc[nombre]) acc[nombre] = { nombre: nombre, n: 0, monto: 0, equipos: {} };
    acc[nombre].n++;
    acc[nombre].monto += Number(m.amount_untaxed_signed || 0);
    const eq = m.team_id ? m.team_id[1] : "(sin equipo)";
    acc[nombre].equipos[eq] = (acc[nombre].equipos[eq] || 0) + 1;
  });
  return Object.keys(acc).map(k => {
    const v = acc[k];
    v.equipo = Object.keys(v.equipos).sort((a, b) => v.equipos[b] - v.equipos[a])[0] || "";
    return v;
  }).sort((a, b) => b.monto - a.monto);
}

// Familias (categoría del producto) con venta 2026 en una empresa.
function relFamilias_(uid, pwd, companyId) {
  const lineas = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move.line", "search_read",
    [[["move_id.move_type", "in", ["out_invoice", "out_refund"]], ["move_id.state", "=", "posted"],
      ["move_id.company_id", "=", companyId], ["date", ">=", REL_DESDE], ["product_id", "!=", false]]],
    { fields: ["product_id", "quantity", "price_subtotal"], limit: 60000 }) || [];
  if (!lineas.length) return [];
  const ids = [...new Set(lineas.map(l => l.product_id[0]))];
  const prods = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "product.product", "read",
    [ids], { fields: ["categ_id"] }) || [];
  const catDe = {};
  prods.forEach(p => { catDe[p.id] = p.categ_id ? p.categ_id[1] : "(sin categoría)"; });
  const acc = {};
  lineas.forEach(l => {
    const c = catDe[l.product_id[0]] || "(sin categoría)";
    if (!acc[c]) acc[c] = { nombre: c, lineas: 0, unidades: 0, monto: 0 };
    acc[c].lineas++;
    acc[c].unidades += Number(l.quantity || 0);
    acc[c].monto += Number(l.price_subtotal || 0);
  });
  return Object.keys(acc).map(k => acc[k]).sort((a, b) => b.monto - a.monto);
}

// Clientes cuyo nombre contiene un texto, con su facturación 2026 por empresa.
function relClientesPorNombre_(uid, pwd, texto) {
  const partners = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "res.partner", "search_read",
    [[["name", "ilike", texto]]], { fields: ["name", "vat"], limit: 100 }) || [];
  if (!partners.length) return [];
  const ids = partners.map(p => p.id);
  const nombreDe = {}, rucDe = {};
  partners.forEach(p => { nombreDe[p.id] = p.name; rucDe[p.id] = p.vat || ""; });
  const moves = execute_kw(ODOO_URL, ODOO_DB, uid, pwd, "account.move", "search_read",
    [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
      ["invoice_date", ">=", REL_DESDE], ["company_id", "in", REL_EMPRESAS],
      ["partner_id", "in", ids]]],
    { fields: ["partner_id", "company_id", "team_id", "amount_untaxed_signed"], limit: 20000 }) || [];
  const acc = {};
  // Un cliente sin ventas también interesa: dice que existe pero no factura.
  partners.forEach(p => {
    acc[p.id + "|0"] = { cliente: p.name, ruc: rucDe[p.id], company: 0, n: 0, monto: 0, equipos: {} };
  });
  moves.forEach(m => {
    const pid = m.partner_id[0], cid = m.company_id ? m.company_id[0] : 0;
    const k = pid + "|" + cid;
    if (!acc[k]) acc[k] = { cliente: nombreDe[pid] || m.partner_id[1], ruc: rucDe[pid] || "", company: cid, n: 0, monto: 0, equipos: {} };
    acc[k].n++; acc[k].monto += Number(m.amount_untaxed_signed || 0);
    const eq = m.team_id ? m.team_id[1] : "(sin equipo)";
    acc[k].equipos[eq] = (acc[k].equipos[eq] || 0) + 1;
  });
  return Object.keys(acc).map(k => {
    const v = acc[k];
    v.equipo = Object.keys(v.equipos).sort((a, b) => v.equipos[b] - v.equipos[a])[0] || "";
    return v;
  }).filter(v => v.n > 0 || v.company === 0);
}
