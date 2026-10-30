import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';

// SSR: el directorio y las reseñas aprobadas siempre se leen frescas de Supabase.
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  vite: { plugins: [tailwindcss()] },
});
