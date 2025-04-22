import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    middleware: [
      {
        name: 'configure-content-type',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.endsWith('.json')) {
              res.setHeader('Content-Type', 'application/json');
            }
            next();
          });
        },
      },
    ],
  },
});