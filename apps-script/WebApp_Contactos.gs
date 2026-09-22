// ============================================================================
//  REGISTRO DE CONTACTOS — VITÁLICA
//  Pequeña aplicación web que le permite al dashboard (que es una página
//  estática en GitHub Pages y por sí sola no puede escribir nada) dejar
//  registrado que a un cliente ya se lo contactó, y con qué resultado.
//
//  Guarda todo en la pestaña CONTACTOS de esta misma planilla.
//
//  ⚠️ VA EN UN PROYECTO NUEVO Y APARTE, no en el de la planilla.
//  El proyecto de la planilla ya tiene la plataforma de objetivos, que también
//  usa doGet: dos doGet en el mismo proyecto se pisan y rompen esa plataforma.
//  Por eso este script es INDEPENDIENTE y abre la planilla por su ID.
//
//  PUBLICAR (una sola vez):
//    1. Entrar a script.google.com ▸ Nuevo proyecto (nombre: "Contactos Vitálica").
//    2. Pegar este archivo, guardar.
//    3. Implementar ▸ Nueva implementación ▸ Aplicación web
//         · Ejecutar como: Yo
//         · Quién tiene acceso: Cualquier persona
//    4. Autorizar cuando lo pida, y copiar la URL que termina en /exec:
//       esa va en index.html, en CONTACTOS_WEBAPP_URL.
//
//  Si se edita este archivo: Implementar ▸ Gestionar implementaciones ▸
//  editar la existente ▸ Nueva versión (así la URL no cambia).
//
//  Nota: "Cualquier persona" significa que quien tenga la URL puede escribir.
//  Para que no sea cualquiera, poné una clave en CLAVE_CONTACTOS y la misma
//  en el index.html; si queda vacía, no se pide clave.
// ============================================================================

// Planilla de ventas donde se guardan los contactos ("INFORME DE VENTAS VITALICA").
const ID_PLANILLA = "1dyAO04QMXbQe5OtjLwSkJfyWe4UmLgiA5-cBmpvjdwk";
const HOJA_CONTACTOS = "CONTACTOS";
const CLAVE_CONTACTOS = "";   // ej: "vitalica2026"

function hojaContactos_() {
  const ss = SpreadsheetApp.openById(ID_PLANILLA);
  let h = ss.getSheetByName(HOJA_CONTACTOS);
  if (!h) {
    h = ss.insertSheet(HOJA_CONTACTOS);
    h.getRange(1, 1, 1, 7).setValues([[
      "Fecha", "Cliente", "Cédula", "Vendedor", "Resultado", "Nota", "Registrado"
    ]]).setFontWeight("bold").setBackground("#F07D20").setFontColor("#FFFFFF");
    h.setColumnWidth(1, 150); h.setColumnWidth(2, 280); h.setColumnWidth(3, 110);
    h.setColumnWidth(4, 200); h.setColumnWidth(5, 130); h.setColumnWidth(6, 320);
    h.setFrozenRows(1);
  }
  return h;
}

/** El dashboard pide acá la lista de contactos ya registrados. */
function doGet(e) {
  try {
    const h = hojaContactos_();
    const out = [];
    if (h.getLastRow() > 1) {
      const filas = h.getRange(2, 1, h.getLastRow() - 1, 6).getValues();
      filas.forEach(function (f) {
        if (!f[1]) return;
        out.push({
          fecha: f[0] instanceof Date ? Utilities.formatDate(f[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(f[0]),
          cliente: String(f[1]), cedula: String(f[2] || ""),
          vendedor: String(f[3] || ""), resultado: String(f[4] || ""), nota: String(f[5] || "")
        });
      });
    }
    return json_({ ok: true, contactos: out });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** El dashboard manda acá un contacto nuevo. */
function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (CLAVE_CONTACTOS && d.clave !== CLAVE_CONTACTOS) return json_({ ok: false, error: "clave incorrecta" });
    if (!d.cliente) return json_({ ok: false, error: "falta el cliente" });

    const h = hojaContactos_();
    const fecha = d.fecha ? new Date(d.fecha + "T12:00:00") : new Date();
    h.appendRow([
      fecha, String(d.cliente), String(d.cedula || ""), String(d.vendedor || ""),
      String(d.resultado || "Contactado"), String(d.nota || ""), new Date()
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
