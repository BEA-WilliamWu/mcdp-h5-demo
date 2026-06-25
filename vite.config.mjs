import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { handleMcdpProxyRequest, resolveProxyConfig, setCors } from "./proxy/mcdpProxy.mjs";

function mcdpProxyPlugin(env) {
  const proxyConfig = resolveProxyConfig(env);

  return {
    name: "mcdp-local-proxy",
    configureServer(server) {
      server.middlewares.use(async function mcdpProxyMiddleware(req, res, next) {
        try {
          if (await handleMcdpProxyRequest(req, res, proxyConfig)) {
            return;
          }
          next();
        } catch (error) {
          setCors(res);
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: false, message: error.message }));
        }
      });
    }
  };
}

export default defineConfig(function ({ mode }) {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue(), mcdpProxyPlugin(env)],
    server: {
      host: "127.0.0.1",
      port: 5177,
      strictPort: false
    },
    preview: {
      host: "127.0.0.1",
      port: 5177
    }
  };
});
