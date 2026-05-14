import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const gatewayUrl = process.env.VITE_DEV_GATEWAY_URL ?? 'http://localhost:8080';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // shadcn components were generated against the legacy "@base-ui/react"
        // export path. The current npm package is "@base-ui-components/react".
        '@base-ui/react': '@base-ui-components/react',
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Frontend talks to the gateway via /api/* in both dev and prod.
        // In dev, this proxies to a locally-running gateway started with
        //   `npm run gateway:dev`
        // In prod, your hosting layer (Firebase Hosting / Cloud Run) maps
        // /api/* to the deployed gateway.
        '/api': {
          target: gatewayUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  };
});
