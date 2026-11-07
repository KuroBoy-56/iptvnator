// Identidad de MPX Player en Microsoft Partner Center para el paquete AppX de la Store.
// Los valores vienen SOLO de variables de entorno: nunca se inventan ni se reutiliza la identidad heredada
// (com.fourgray.iptvnator). Si falta algo, `pnpm run make:store` se detiene y dice qué falta y dónde ponerlo.

export const STORE_IDENTITY_VARS = [
    {
        env: 'APPX_IDENTITY_NAME',
        field: 'identityName',
        where: 'Partner Center › MPX Player › Administración de productos › Identidad del producto › «Package/Identity/Name»',
        example: '12345Empresa.MPXPlayer',
    },
    {
        env: 'APPX_PUBLISHER',
        field: 'publisher',
        where: 'Identidad del producto › «Package/Identity/Publisher» (empieza con CN=)',
        example: 'CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
    },
    {
        env: 'APPX_PUBLISHER_DISPLAY_NAME',
        field: 'publisherDisplayName',
        where: 'Identidad del producto › «Package/Properties/PublisherDisplayName»',
        example: 'Nombre del editor tal como aparece en Partner Center',
    },
    {
        env: 'APPX_APPLICATION_ID',
        field: 'applicationId',
        where: 'Id de la aplicación dentro del paquete (lo eliges tú: letras y números, por ejemplo MPXPlayer). NO es el Product ID de la Store (9N…)',
        example: 'MPXPlayer',
    },
];

const LEGACY_IDENTITIES = ['com.fourgray.iptvnator', 'iptvnator', 'fourgray'];
const PLACEHOLDER_RE = /x{4,}|\btodo\b|\bexample\b|\bejemplo\b|placeholder|changeme|[<>]/i;
const RESERVED_IDS = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
    ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);
// Product ID de la Store: 12 caracteres que empiezan con 9 (9NBLGGH4R315). No es la identidad del paquete.
const STORE_PRODUCT_ID_RE = /^9[A-Z0-9]{11}$/;

function problem(env, message) {
    return { env, message };
}

function checkValue(field, value) {
    const lower = value.toLowerCase();
    if (PLACEHOLDER_RE.test(value)) return 'parece un valor de ejemplo; copia el valor real de Partner Center';
    if (LEGACY_IDENTITIES.some((legacy) => lower.includes(legacy))) {
        return 'es la identidad heredada de IPTVnator; usa la de MPX Player reservada en Partner Center';
    }
    if (STORE_PRODUCT_ID_RE.test(value)) {
        return 'eso es el Product ID de la Store (9N…), no la identidad del paquete';
    }
    switch (field) {
        case 'identityName':
            if (!/^[A-Za-z0-9.-]{3,50}$/.test(value)) {
                return 'debe tener de 3 a 50 caracteres: letras, números, punto y guion';
            }
            if (RESERVED_IDS.has(value.toUpperCase())) return 'es un nombre reservado de Windows';
            return null;
        case 'publisher':
            if (!/^CN=\S/.test(value)) return 'debe empezar con CN= (por ejemplo CN=XXXXXXXX-XXXX-…)';
            if (/^CN=ms$/i.test(value)) return 'CN=ms es el valor de prueba de electron-builder, no el de Partner Center';
            return null;
        case 'publisherDisplayName':
            return value.length > 256 ? 'es demasiado largo (máximo 256 caracteres)' : null;
        case 'applicationId':
            if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(value) || value.length > 64) {
                return 'debe empezar con letra y tener solo letras, números y puntos (máximo 64)';
            }
            if (RESERVED_IDS.has(value.toUpperCase())) return 'es un nombre reservado de Windows';
            return null;
        default:
            return null;
    }
}

/** Lee la identidad de las variables de entorno: {identity, missing: [...], invalid: [{env, message}]} */
export function readStoreIdentity(env = process.env) {
    const identity = {};
    const missing = [];
    const invalid = [];
    for (const spec of STORE_IDENTITY_VARS) {
        const value = String(env[spec.env] ?? '').trim();
        if (!value) {
            missing.push(spec.env);
            continue;
        }
        const message = checkValue(spec.field, value);
        if (message) invalid.push(problem(spec.env, message));
        identity[spec.field] = value;
    }
    return { identity, missing, invalid, ok: missing.length === 0 && invalid.length === 0 };
}

/** Texto para la consola cuando la identidad no está lista (qué falta, dónde está y cómo ponerla en PowerShell). */
export function describeIdentityProblems({ missing, invalid }) {
    const lines = ['', 'MPX Player › Microsoft Store: falta la identidad del producto de Partner Center.', ''];
    for (const name of missing) {
        const spec = STORE_IDENTITY_VARS.find((s) => s.env === name);
        lines.push(`  ✗ ${name} no está definida.`, `      Dónde: ${spec.where}`);
    }
    for (const { env, message } of invalid) {
        lines.push(`  ✗ ${env}: ${message}.`);
    }
    lines.push('', 'Defínelas en la terminal de PowerShell (solo para esa sesión) y vuelve a ejecutar pnpm run make:store:', '');
    for (const spec of STORE_IDENTITY_VARS) {
        lines.push(`  $env:${spec.env}="${spec.example}"`);
    }
    lines.push('', 'Más detalles: docs/MICROSOFT-STORE.md', '');
    return lines.join('\n');
}
