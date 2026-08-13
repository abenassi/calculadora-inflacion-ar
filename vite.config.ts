import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  /*
   * Base relativa a propósito: así el mismo build funciona servido desde la raíz de
   * un dominio propio (inflacion.mymcps.dev) y desde un subpath
   * (abenassi.github.io/calculadora-inflacion-ar/), sin recompilar ni recordar en
   * cuál de los dos está publicado. `import.meta.env.BASE_URL` queda en "./", que
   * es lo que usa el código para pedir `data/*.json`.
   */
  base: "./",
  build: {
    outDir: "dist",
    /*
     * `scripts/generar-paginas.ts` corre después del build y necesita saber cómo
     * quedaron los nombres con hash del CSS y del entry de las páginas generadas.
     * Leerlos del manifest es lo único que no se rompe cuando cambia la estrategia
     * de nombres de Rollup; la alternativa era buscar el `<link>` con una regex
     * sobre `dist/index.html`.
     */
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(raiz, "index.html"),
        datos: resolve(raiz, "datos.html"),
        // Entry propio de las páginas por año: sólo analytics, sin motor ni gráfico.
        paginas: resolve(raiz, "src/ui/paginas.ts"),
      },
    },
  },
});
