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
5. **Completar las listas** con lo que salga de ese paso:
   - en `apps-script/Odoo_Vitalica.gs`: `MAPEO_CANALES`, `LISTA_MARCAS`,
     `LISTA_ARMAS`, `VENDEDORES_EXCLUIDOS`, `EQUIPOS_EXCLUIDOS`, `CLIENTES_ECOMMERCE`;
   - en `index.html` (bloque *CONFIGURACIÓN DE VITÁLICA*): las mismas listas de
     marcas y de exclusiones.
6. **Bajar las ventas**: menú ▸ *🔄 Descargar Ventas Odoo* (llena `DATA`).
7. **Publicar la planilla**: Archivo ▸ Compartir ▸ Publicar en la web, y pegar
   la URL base y los `gid` de `CONFIG` y `DATA` en:
   - `index.html` → `SHEET_PUB_BASE`, `SHEET_GID_CONFIG`, `SHEET_GID_DATA`;
   - `apps-script/WebApp_Objetivos_Vitalica.gs` → `WA_PUB_BASE`, `WA_GID_CONFIG`, `WA_GID_DATA`.
8. **Publicar la web app de objetivos**: Implementar ▸ Nueva implementación ▸
   Aplicación web (ejecutar como: yo). Con esa URL se cargan los objetivos del mes.
9. **Publicar el dashboard**: GitHub Pages sobre este repo (o Netlify Drop).

## Qué falta definir de Vitálica

Estas cosas quedaron **configurables y vacías a propósito**, porque son propias de
cada empresa y las de Camping 44 no aplican:

- **Canales**: se mantienen los mismos nombres del panel (`Salon`, `Online`,
  `E-commerce`, `Mayoristas`, `Venta Externa`, `Directorio`, `Reparaciones`) y los
  equipos de venta de Odoo de Vitálica se mapean encima con `MAPEO_CANALES`. Si
  Vitálica usa otros canales, se renombran en los 3 archivos a la vez.
- **Marcas y segunda línea de negocio** (`LISTA_MARCAS` / `LISTA_ARMAS`).
- **Exclusiones** (administrativos, sin comisión, equipos que no pagan comisión).
- **E-commerce**: clientes con nombre propio y grupo para el resto.
- **Objetivos**: mensuales (web app), anuales por vendedor (`RANKING_ANUAL`) y
  anuales por marca (`OBJ_MARCAS_ANUAL` / `OBJ_AYM_ANUAL`) en `index.html`.
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
