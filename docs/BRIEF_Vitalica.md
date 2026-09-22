# BRIEF — Replicar el Dashboard Comercial BI para VITÁLICA

> Pegá este documento en el chat nuevo y **adjuntá los 3 archivos base** de Camping 44
> (ver "Archivos a llevar"). Con eso el nuevo chat entiende todo y solo hay que adaptar
> los datos de Vitálica.

---

## 1. QUÉ ES ESTO (contexto)

Sistema de **Business Intelligence comercial (YTD)** hecho para **Camping 44** (retail de
camping/armas en Paraguay). Ahora se quiere lo **mismo para Vitálica** (otra empresa del grupo).

El sistema muestra, en vivo, **ventas reales vs objetivos** por canal, vendedor y marca, con
KPIs, bonos, rankings y gráficos. Los datos de venta salen de **Odoo**; los objetivos se cargan
con una **plataforma web propia**.

---

## 2. ARQUITECTURA / FLUJO DE DATOS

```
ODOO (ERP, facturas)
   │  (XML-RPC: account.move.line / account.move / product.product)
   ▼
APPS SCRIPT "pull de Odoo"  ──►  escribe pestaña DATA (ventas) en Google Sheets
   │
PLATAFORMA WEB (Apps Script) ──►  escribe pestaña CONFIG (objetivos/metas) en Google Sheets
   │
GOOGLE SHEETS (CONFIG + DATA) ──►  se publican como CSV (pub?gid=...&output=csv)
   ▼
index.html (DASHBOARD)  ──►  hace fetch de los 2 CSV y arma toda la vista
   ▼
Se publica en GitHub Pages (usuario.github.io/REPO/) o Netlify
```

---

## 3. LOS 3 ARCHIVOS (componentes)

1. **`index.html`** — el dashboard (frontend, HTML+JS, ~3.300 líneas, Chart.js desde CDN).
   Lee los CSV publicados de Google Sheets. Se sube a GitHub Pages / Netlify.

2. **`AppScript_Camping44_Contimarket.gs`** — corre en **Google Apps Script**. Trae las
   facturas de Odoo (XML-RPC), aplica filtros/clasificación de canales y vendedores, y
   **escribe la pestaña DATA** de la planilla. Aquí están las **reglas de negocio**.

3. **`WebApp_Objetivos.gs`** — corre en **Google Apps Script** como **Web App**. Es la
   plataforma linda para **cargar los objetivos mensuales** por vendedor/canal/marca
   (auto-suma vendedor→canal→global), editar meses pasados, preparar mes nuevo, archivar,
   etc. Guarda en la pestaña CONFIG (histórico en base64 troceado).

---

## 4. QUÉ HAY QUE CAMBIAR PARA VITÁLICA (lo importante)

- **Conexión a Odoo** (en el `.gs`): URL, base de datos, usuario, API key.
  - Si Vitálica está en la **misma instancia de Odoo**, alcanza con **filtrar por la empresa**
    (`company_id` = "Vitálica" en vez de "Camping 44 SA").
- **Canales / equipos de venta** de Vitálica (los de Camping: *Salón, Online, Venta Externa,
  Directorio, E-commerce, Mayoristas, Reparaciones*). Vitálica tendrá los suyos.
- **Vendedores** de Vitálica.
- **Marcas y Armas** (`LISTA_MARCAS`, `LISTA_ARMAS` en el `.gs` y en el `index.html`).
- **Objetivos mensuales** (se cargan con la plataforma web).
- **URLs de las hojas publicadas** (nuevo spreadsheet, nuevos `gid` de CONFIG y DATA).
  - En `index.html` están las 2 URLs `docs.google.com/.../pub?gid=...&output=csv`.
- **Reglas de negocio propias de Vitálica** (exclusiones de administrativos, e-commerce, etc.).
- **Repo/URL de publicación** (nuevo repo de GitHub Pages o proyecto de Netlify).

---

## 5. FUNCIONALIDADES YA CONSTRUIDAS (a replicar tal cual)

**Filtros:** mes/período, vendedor (multi), canal (multi), marca (multi), día exacto, rango desde/hasta.

**Cabecera:** meta del canal/global, avance %, diferencia al objetivo, días hábiles / transcurridos
(corte editable), y **"A FACTURAR POR DÍA"** (lo que falta ÷ días hábiles restantes).

**Tabla por canal (Consumidor Final / Mayoristas):** por vendedor → Ventas Netas, Devoluciones (NC),
Esperado Período, % Logrado, Objetivo Período, % Logrado Mes.
- **Flechita roja/verde por vendedor** + **ventana emergente** con su situación: facturado vs
  esperado a hoy, atraso, y **cuánto facturar por día / mañana para ponerse al día**.

**Desglose por marca (por equipo):**
- Vista **tarjetas** (una por vendedor, con marcas/armas, KPIs, drill-down de productos).
- Vista **matriz** (botón para alternar): marca en filas × comercial en columnas, con
  **Obj / Venta / Alcanzada / %** del canal + Obj/Vta por comercial. **Tablas separadas**
  (Marcas Generales / Armas y Municiones / Otras), ventas **resaltadas en amarillo**, fila TOTAL,
  proyección lineal, y **leyenda** explicativa.

**Marcas Principales / Armas y Municiones / Resto** con drill-down de productos (clic en la fila).

**E-commerce por cliente:** Tupi + Porter + Contimarket. Regla: todo lo que **no es Tupi/Porter**
(facturas a contactos) se agrupa como **Contimarket**.

**KPIs de Bonos:** meta del mes, venta real, % logrado, ¿alcanzó meta?, marcas/armas activadas.
(Condición: para bonos de marca hay que **alcanzar la meta general del mes 100%+**.)

**Ranking 37/10** (anual YTD), **Objetivo Anual** (marcas/armas), **Notas de Crédito**.

**Tortas (donut) con %:** contribución por canal (general, descendente), por vendedor (Mayoristas y
Consumidor Final) y por canal (Consumidor Final). El **%** se ve en la **leyenda**, en el **tooltip**
y **dibujado sobre cada porción** (plugin inline de Chart.js, sin librerías externas).

---

## 6. REGLAS DE NEGOCIO CLAVE (adaptar a Vitálica)

Estas son de Camping — Vitálica tendrá las suyas, pero sirven de modelo del "tipo" de reglas:

- **Clasificación de canal** por el *equipo de ventas* de Odoo + nombre del vendedor.
- **Contimarket** se identifica por una **etiqueta de la factura** (campo Studio `x_studio_...`),
  no por el equipo/vendedor. Todo Contimarket se atribuye a la vendedora "Maria Julia Olmedo".
- **E-commerce** = Tupi + Porter + Contimarket; lo que no es Tupi/Porter → Contimarket.
- **Exclusiones totales** (administrativos, sin cargo/sin comisión): Bianca, Irene, **Cesar Fabian
  Aguilera Inostroza**, Derlis, **Guillermo Augusto Morel Candia**. (Ojo: **Cesar Alejandro Rahi
  SÍ va** en Salón, sin objetivo — filtrar por "CESAR FABIAN" exacto, no por "CESAR".)
- **Equipo "No Pagar Comisión"** sin vendedor real → **no suma**.
- **Bucket fantasma "SALON"** (facturas Sin Vendedor / internas de la propia empresa, ej. "Camping
  44 SA") → **no suma**.
- **Reposición de gastos administrativos** y **moratorios** → reglas especiales de inclusión/exclusión.
- La exclusión de administrativos se **re-aplica al final** para que no la pise la excepción de
  "stand de tiro / polígono".

---

## 7. APRENDIZAJES / DETALLES TÉCNICOS (gotchas)

- El **CSV publicado de Google tarda unos minutos** en refrescar (lag). Los filtros/exclusiones que
  se puedan, conviene hacerlos **también en el `index.html`** para efecto inmediato (no depender del
  re-sync ni del lag).
- El **histórico de objetivos** se guarda en **base64 troceado** (≤45.000 caracteres por celda) para
  no corromper la celda (límite 50.000).
- **Chart.js 3.9.1** desde CDN. El % sobre las tortas es un **plugin inline** propio.
- **Publicación (GitHub Pages):** hubo un incidente de Pages y se aprendió: **nunca cancelar un deploy
  a mitad** (deja "deployments fantasma" que traban la cola), **subir una sola vez y esperar**, y usar
  **un solo motor de publicación**. Si Pages falla, **Netlify Drop** (arrastrar la carpeta) es el
  respaldo inmediato (el dashboard trae datos de Google Sheets, así que anda desde cualquier hosting).
- El dashboard **lee data en vivo** de las hojas publicadas; **no** guarda datos propios.

---

## 8. CÓMO ARRANCAR EL CHAT DE VITÁLICA

1. **Pegá este brief.**
2. **Adjuntá los 3 archivos base** de Camping (ver abajo) como punto de partida.
3. **Aportá los datos de Vitálica:**
   - Canales/equipos de venta, lista de vendedores, lista de marcas y armas.
   - Objetivos mensuales (o decir que se cargan con la plataforma).
   - Conexión a Odoo (o "misma instancia, filtrar por empresa Vitálica").
   - El nuevo spreadsheet de Google (con pestañas CONFIG y DATA) y sus URLs publicadas.
   - Dónde se va a publicar (repo de GitHub Pages nuevo o Netlify).
4. Pedir: *"replicá el mismo dashboard/sistema pero para Vitálica con estos datos"*.

### Archivos a llevar al chat nuevo
- `index.html` (dashboard)
- `AppScript_Camping44_Contimarket.gs` → *(el pull de Odoo)* — renombrar a Vitálica
- `WebApp_Objetivos.gs` (plataforma de carga de objetivos)

*(Todos te los pasó este chat; son los últimos que tenés.)*
