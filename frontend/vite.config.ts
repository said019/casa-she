import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/**
 * Sella una VERSION única en dist/sw.js en cada build de producción.
 *
 * El aviso "nueva versión disponible" depende de que el navegador detecte un
 * service worker NUEVO, y eso solo pasa si el byte de /sw.js cambia entre
 * deploys. Sin esto, sw.js sería idéntico de un deploy a otro (la VERSION queda
 * fija) y el aviso NUNCA aparecería. Usamos el SHA del commit de Railway
 * (RAILWAY_GIT_COMMIT_SHA) para que cada deploy tenga una VERSION distinta;
 * en local cae a un timestamp.
 */
function stampServiceWorkerVersion(): Plugin {
  return {
    name: "stamp-sw-version",
    apply: "build",
    closeBundle() {
      const swPath = path.resolve(__dirname, "dist/sw.js");
      if (!fs.existsSync(swPath)) return;
      const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 8);
      const buildId = sha || String(Date.now());
      const src = fs
        .readFileSync(swPath, "utf8")
        .replace(/const VERSION = '[^']*';/, `const VERSION = 'bmb-${buildId}';`);
      fs.writeFileSync(swPath, src);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    stampServiceWorkerVersion(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
