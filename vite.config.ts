/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Only these prefixes are exposed to the browser. NEXT_PUBLIC_ is included so
  // the variables created by the Vercel ↔ Supabase integration work as-is; those
  // are public by design. Server-only secrets (SUPABASE_SECRET_KEY,
  // SUPABASE_SERVICE_ROLE_KEY, POSTGRES_*) have no such prefix and stay out.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
  },
})
