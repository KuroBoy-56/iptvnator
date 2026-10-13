// Entry point of `nx run electron-backend:build-embedded-mpv`.
//
// The embedded MPV native addon is opt-in: only builds that set
// IPTVNATOR_BUILD_EMBEDDED_MPV=1 (the macOS workflow, after staging the
// vendored libmpv runtime) compile it with
// apps/electron-backend/build-embedded-mpv.js. Every other build (local
// Windows builds without a vendored runtime or C++ toolchain) only creates the
// empty output folder the backend build copies, exactly as before, and the
// app then ships without embedded MPV.
const fs = require('fs');
const path = require('path');

const enabled = ['1', 'true', 'yes', 'on'].includes(
    (process.env.IPTVNATOR_BUILD_EMBEDDED_MPV ?? '').trim().toLowerCase()
);

if (enabled) {
    require(
        path.join(process.cwd(), 'apps', 'electron-backend', 'build-embedded-mpv.js')
    );
} else {
    const outputDir = path.join(
        process.cwd(),
        'apps',
        'electron-backend',
        'native',
        'build',
        'Release'
    );
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
        path.join(outputDir, 'README.txt'),
        'Embedded MPV native addon not compiled in this build.\n'
    );
    console.log(
        'Skipping native C++ compilation for MPV (set IPTVNATOR_BUILD_EMBEDDED_MPV=1 to build it).'
    );
}
