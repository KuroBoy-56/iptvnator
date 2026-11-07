// Recursos gráficos del AppX a partir del logotipo de MPX Player (apps/web/src/assets/icons/icon-1024.png), con Sharp.
// No se toca el original: se generan copias en apps/electron-backend/store/appx/ (carpeta «appx» de los recursos de
// compilación de la Store, directories.buildResources de electron-builder.store.json), con el logotipo entero, sus
// proporciones y su transparencia, centrado sobre fondo transparente.
import fs from 'node:fs';
import path from 'node:path';

export const APPX_SOURCE_ICON = path.join('apps', 'web', 'src', 'assets', 'icons', 'icon-1024.png');
export const APPX_ASSETS_DIR = path.join('apps', 'electron-backend', 'store', 'appx');

// width × height del lienzo y alto del logotipo dentro (los mosaicos dejan margen, como pide Windows)
export const APPX_ASSETS = [
    { name: 'StoreLogo.png', width: 50, height: 50, logo: 50 },
    { name: 'Square44x44Logo.png', width: 44, height: 44, logo: 44 },
    { name: 'Square150x150Logo.png', width: 150, height: 150, logo: 100 },
    { name: 'Wide310x150Logo.png', width: 310, height: 150, logo: 100 },
];

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

export async function generateAppxAssets({ sharp, workspaceRoot = process.cwd(), source = APPX_SOURCE_ICON, outDir = APPX_ASSETS_DIR }) {
    const src = path.join(workspaceRoot, source);
    const dest = path.join(workspaceRoot, outDir);
    if (path.resolve(src).startsWith(path.resolve(dest))) throw new Error('el logotipo original no puede estar en la carpeta de salida');
    fs.mkdirSync(dest, { recursive: true });
    const written = [];
    for (const asset of APPX_ASSETS) {
        const logo = await sharp(src)
            .resize(asset.logo, asset.logo, { fit: 'contain', background: TRANSPARENT, kernel: 'lanczos3' })
            .png()
            .toBuffer();
        const file = path.join(dest, asset.name);
        await sharp({ create: { width: asset.width, height: asset.height, channels: 4, background: TRANSPARENT } })
            .composite([{ input: logo, gravity: 'centre' }])
            .png({ compressionLevel: 9 })
            .toFile(file);
        written.push(file);
    }
    return written;
}

/** Comprueba tamaños y canal alfa de los recursos generados. [] = todo bien */
export async function checkAppxAssets({ sharp, workspaceRoot = process.cwd(), outDir = APPX_ASSETS_DIR }) {
    const errors = [];
    for (const asset of APPX_ASSETS) {
        const file = path.join(workspaceRoot, outDir, asset.name);
        if (!fs.existsSync(file)) {
            errors.push(`falta ${asset.name}`);
            continue;
        }
        const meta = await sharp(file).metadata();
        if (meta.width !== asset.width || meta.height !== asset.height) {
            errors.push(`${asset.name} mide ${meta.width}×${meta.height} (debe ser ${asset.width}×${asset.height})`);
        }
        if (!meta.hasAlpha) errors.push(`${asset.name} no tiene transparencia`);
    }
    return errors;
}
