import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    base: '/metallic-vis/',
    plugins: [
        tailwindcss(),
    ],
})
