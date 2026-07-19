// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import netlify from '@netlify/vite-plugin-tanstack-start'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  return {
    server: {
      port: 3000,
      host: true,
      watch: {
        // Prevent routeTree regeneration from triggering full reloads
        ignored: ['**/routeTree.gen.ts'],
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: ['@tanstack/router-core', '@tanstack/router-core/ssr/client'],
    },
    plugins: [
      tailwindcss(),
      // TanStack Start plugin must come before React
      tanstackStart({
        router: {
          autoCodeSplitting: true,
        },
        // For static deployment: configure prerendering
        ssr: {
          prerender: {
            enabled: true,
            crawlLinks: true,
            autoSubfolderIndex: true,
            concurrency: 14,
            failOnError: false,
          },
        },
      }),
      react(),
      tsconfigPaths(),
      // Netlify adapter only in production builds
      ...(isDev ? [] : [netlify()]),
    ],
  }
})
