import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'triLanguage',
        short_name: 'triLang',
        description: 'Ứng dụng học ngoại ngữ cá nhân',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: []
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/worker': path.resolve(__dirname, './worker'),
      '@/db': path.resolve(__dirname, './db')
    }
  }
});
