import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // El sitio se sirve desde la raíz de inflacion.mymcps.dev, no desde un subpath.
  base: "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        datos: resolve(__dirname, "datos.html"),
      },
    },
  },
});
