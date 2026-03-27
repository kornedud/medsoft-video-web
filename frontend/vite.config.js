import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || "http://localhost:8000";

  return {
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: apiUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          register: path.resolve(__dirname, "register.html"),
          login: path.resolve(__dirname, "login.html"),
          app: path.resolve(__dirname, "app/index.html"),
          room: path.resolve(__dirname, "room.html"),
        },
      },
    },
  };
});
