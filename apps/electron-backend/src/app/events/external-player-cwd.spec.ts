import { externalPlayerWorkingDir, isWindowsStorePackage } from './external-player-cwd';

describe('externalPlayerWorkingDir', () => {
    const asProcess = (windowsStore?: boolean) =>
        ({ windowsStore }) as unknown as NodeJS.Process & { windowsStore?: boolean };

    it('keeps the inherited working directory outside the Microsoft Store package (EXE / NSIS)', () => {
        expect(isWindowsStorePackage(asProcess(undefined))).toBe(false);
        expect(externalPlayerWorkingDir(asProcess(undefined), () => 'C:\\Users\\u')).toBeUndefined();
        expect(externalPlayerWorkingDir(asProcess(false), () => 'C:\\Users\\u')).toBeUndefined();
    });

    it('starts MPV / VLC in the user folder inside the read-only AppX install dir', () => {
        expect(isWindowsStorePackage(asProcess(true))).toBe(true);
        expect(externalPlayerWorkingDir(asProcess(true), () => 'C:\\Users\\u')).toBe('C:\\Users\\u');
    });
});
