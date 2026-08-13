/**
 * Lo único que corre en las páginas generadas (`/inflacion-2024/`, `/inflacion-por-anio/`).
 *
 * Esas páginas son HTML plano: no tienen formulario, no calculan nada y no cargan
 * el motor ni el gráfico. Pero tienen que medirse igual que el resto del sitio, y
 * sobre todo tienen que marcar los links al MCP con `?ref=calculadora` — son el
 * tráfico de Google, o sea justo el que interesa atribuir.
 *
 * Existe como entry aparte en vez de inline en cada página para no duplicar la
 * lista de hostnames ni el endpoint: si el gate de fork viviera copiado en 38
 * archivos HTML, apagarlo dejaría de ser una sola decisión.
 */

/*
 * La hoja se importa acá, y no sólo se enlaza desde el HTML generado, para que la
 * dependencia quede **declarada en el manifest de Vite**. El generador le pregunta al
 * manifest qué CSS necesitan estas páginas; sin este import el entry no declara ninguno
 * y había que juntar todos los `.css` del build y ordenarlos por su nombre hasheado, o
 * sea por su contenido. Con una hoja daba igual; con dos, el orden de carga cambiaría
 * solo al editar cualquiera de las dos.
 */
import "../styles.css";

import { engancharClics, pageview } from "./analytics.js";

pageview();
engancharClics();
