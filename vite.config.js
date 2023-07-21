import {resolve} from 'path'
import {defineConfig} from 'vite'
import dtsPlugin from "vite-plugin-dts";

export default defineConfig({
    plugins: [
        dtsPlugin()
    ],
    build: {
        minify: true,
        sourcemap: true,
        lib: {
            // Could also be a dictionary or array of multiple entry points
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es', 'cjs', 'umd'],
            name: 'OmakasePlayer',
            // the proper extensions will be added
            fileName: (format, entryName) => `omakase-player.${format}.js`,
        },
        rollupOptions: {
            // make sure to externalize deps that shouldn't be bundled into your library
            external: ['hls.js'],
            output: {
                // Provide global variables to use in the UMD build for externalized deps
                globals: {
                    'OmakasePlayer': 'omakase',
                    'hls.js': 'Hls',
                },
            },
        },
    },
    server: {
        open: 'playground/index.html'
    }
})
