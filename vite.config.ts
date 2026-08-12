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
    rollupOptions: {
      input: {
        main: resolve(raiz, "index.html"),
        datos: resolve(raiz, "datos.html"),
      },
    },
  },
});
