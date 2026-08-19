# INFORME DE VENTAS — VITÁLICA

Dashboard comercial BI (YTD) de **Vitálica**, replicado del sistema que ya funciona
en Camping 44. Muestra en vivo **ventas reales vs objetivos** por canal, vendedor y
marca, con KPIs, bonos, rankings y gráficos.

Vitálica es la **empresa ID 2** dentro de la misma instancia de Odoo del grupo
(Camping 44 es la 1), así que todo el pull de datos se filtra por `company_id = 2`.

## Cómo fluye la información

```
ODOO (facturas de la empresa 2 = Vitálica)
   │  XML-RPC/JSON-RPC: account.move.line · account.move · product.product
   ▼
apps-script/Odoo_Vitalica.gs  ──►  escribe la pestaña DATA de la planilla
   │
apps-script/WebApp_Objetivos_Vitalica.gs  ──►  escribe la pestaña CONFIG (objetivos)
   │
GOOGLE SHEETS (CONFIG + DATA) ──►  publicadas como CSV (pub?gid=...&output=csv)
   ▼
index.html (dashboard)  ──►  hace fetch de los 2 CSV y arma toda la vista
   ▼
GitHub Pages / Netlify
```

## Archivos

| Archivo | Dónde corre | Para qué |
|---|---|---|
| `index.html` | GitHub Pages / Netlify | El dashboard. Lee los 2 CSV publicados. |
| `apps-script/Odoo_Vitalica.gs` | Apps Script de la planilla | Trae las facturas de Odoo y escribe DATA. Acá viven las reglas de negocio. |
| `apps-script/WebApp_Objetivos_Vitalica.gs` | Apps Script (Web App) | Plataforma para cargar los objetivos mensuales. |
| `docs/BRIEF_Vitalica.md` | — | Brief original del proyecto. |

## Qué muestra el dashboard

Réplica de lo que hoy tiene el informe de Looker Studio, más el módulo de objetivos:

- **KPIs**: Monto facturado sin IVA, cantidad de facturas, promedio de tickets
  (promedio del monto por línea, igual que el AVG del Looker), clientes activos
  (los que compraron en los últimos 3 meses) y notas de crédito.
- **Tablas**: mejores productos, mejores clientes, mejores vendedores, ventas por
  mes, mejores categorías y canales de venta, todas con % de participación.
- **Páginas**: Resumen + una por canal (Mayorista, Distribuidor, Consumidor Final,
  Gimnasios y Muestrarios, Sin Comisiones) + Notas de Crédito + Objetivos.
- **Filtros**: año, mes, vendedor, canal, categoría, cliente y rango de fechas.
- **Gráficos de torta** con el % dibujado sobre cada porción.
- **Exportación a Excel** de lo que se está viendo.
- **Objetivos**: cuando se carguen desde la plataforma web, aparece el avance vs
  objetivo por canal, por vendedor y por vendedor y categoría, con esperado a hoy,
  % logrado, cuánto falta facturar por día y proyección de cierre. Mientras no haya
  objetivos cargados, esa página lo avisa y el resto del panel funciona igual.

**Importante**: los importes son **sin IVA** y se excluyen Merchandising y Muestrario,
igual que el informe actual.

## Diferencias con Camping 44

Vitálica vende suplementos, así que no hay marcas, armas ni municiones:

| | Camping 44 | Vitálica |
|---|---|---|
| Eje del análisis | Marca del producto | **Categoría** (Proteínas, Creatinas, Pre Entrenos, Vitaminas y Minerales, Ácidos Grasos, Bebidas Isotónicas, Salud Articular) |
| Importes | Con IVA | **Sin IVA** |
| Canales | Salón, Online, E-commerce, Mayoristas, Venta Externa, Directorio, Reparaciones | **Mayorista, Distribuidor, Consumidor Final, Gimnasios y Muestrarios, Sin Comisiones** |
| Empresa en Odoo | 1 | **2** |
| Reglas propias | Contimarket, TUPI/PORTER, exclusiones de personas | Excluye Merchandising y Muestrario |
| Facturas sin vendedor | No suman | **Sí suman** (aparecen como "Sin Vendedor": es venta real, ej. Gimnasios y Muestrarios) |

## Puesta en marcha

1. **Crear la planilla de Vitálica** en Google Sheets con dos pestañas: `CONFIG` y `DATA`.
2. **Pegar los dos `.gs`** en el editor de Apps Script de esa planilla
   (Extensiones ▸ Apps Script), uno por archivo. Recargar la planilla: aparece el
   menú **⚙️ Menú Vitálica**.
3. **Cargar la API key de Odoo**: menú ▸ *🔐 Configurar credenciales de Odoo*.
   La clave queda en las Propiedades del Script (privada de la planilla) y **no**
   se guarda en este repositorio.
4. **Descubrir la estructura real de Vitálica**: menú ▸ *🔎 Descubrir estructura de
   Vitálica (Odoo)*. Genera la hoja `DESCUBRIMIENTO` con los **equipos de venta,
   vendedores, marcas, categorías y clientes** que Vitálica tiene realmente
   facturados este año, ordenados por facturación.
5. **Confirmar las listas** con lo que salga de ese paso. Ya vienen cargadas con lo
   que muestra el Looker actual, pero conviene chequear los nombres exactos que tiene
   Odoo en `apps-script/Odoo_Vitalica.gs`: `MAPEO_CANALES` (equipos de venta),
   `LISTA_MARCAS` (las categorías), `CATEGORIAS_EXCLUIDAS` y `VENDEDORES_EXCLUIDOS`.
   Si cambian los canales, hay que tocar también `CANALES` en `index.html` y
   `WA_CANALES` en la web app.
6. **Bajar las ventas**: menú ▸ *🔄 Descargar Ventas Odoo* (llena `DATA`).
7. **Publicar la planilla**: Archivo ▸ Compartir ▸ Publicar en la web, y pegar
   la URL base y los `gid` de `CONFIG` y `DATA` en:
   - `index.html` → `SHEET_PUB_BASE`, `SHEET_GID_CONFIG`, `SHEET_GID_DATA`;
   - `apps-script/WebApp_Objetivos_Vitalica.gs` → `WA_PUB_BASE`, `WA_GID_CONFIG`, `WA_GID_DATA`.
8. **Publicar la web app de objetivos**: Implementar ▸ Nueva implementación ▸
   Aplicación web (ejecutar como: yo). Con esa URL se cargan los objetivos del mes.
9. **Publicar el dashboard**: GitHub Pages sobre este repo (o Netlify Drop).

## Qué falta

- **URLs de la planilla publicada** (`SHEET_PUB_BASE`, `SHEET_GID_CONFIG`,
  `SHEET_GID_DATA` en `index.html`, y `WA_*` en la web app). Sin eso el dashboard
  avisa que falta configurar y no carga nada.
- **Confirmar contra Odoo** los nombres exactos de equipos de venta, vendedores y
  categorías (paso 4 de la puesta en marcha).
- **Objetivos**: todavía no hay. La plataforma queda lista para cargarlos cuando se
  definan (meta global, por canal, por vendedor y por vendedor y categoría).
- **Logo**: `index.html` busca `LOGO_VITALICA.png` en la raíz del repo (si no está,
  simplemente no se muestra).

## Detalles a tener en cuenta

- El **CSV publicado de Google tarda unos minutos** en refrescar. Por eso las
  exclusiones se aplican **también** en `index.html`: así el efecto es inmediato.
- El histórico de objetivos se guarda en **base64 troceado** (≤45.000 caracteres
  por celda) para no romper el límite de 50.000 de una celda.
- Chart.js 3.9.1 desde CDN; el % sobre las tortas es un plugin inline propio.
- Publicación en GitHub Pages: **nunca cancelar un deploy a mitad** (deja deploys
  fantasma que traban la cola), subir una vez y esperar. Respaldo inmediato:
  Netlify Drop.
- El dashboard **no guarda datos propios**: lee siempre de las hojas publicadas.
