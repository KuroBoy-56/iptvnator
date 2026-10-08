import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { PortalStatusService } from '@iptvnator/services';
import { XtreamCodeImportComponent } from './xtream-code-import.component';

describe('XtreamCodeImportComponent', () => {
    let component: XtreamCodeImportComponent;
    let store: { dispatch: jest.Mock };
    let portalStatusService: { checkPortalStatus: jest.Mock };

    beforeEach(() => {
        store = {
            dispatch: jest.fn(),
        };
        portalStatusService = {
            checkPortalStatus: jest.fn().mockResolvedValue('active'),
        };

        TestBed.configureTestingModule({
            providers: [
                { provide: Store, useValue: store },
                { provide: PortalStatusService, useValue: portalStatusService },
            ],
        });

        component = TestBed.runInInjectionContext(
            () => new XtreamCodeImportComponent()
        );
    });

    it('rejects file URLs for Xtream portals', () => {
        component.form.patchValue({
            title: 'Portal',
            serverUrl: 'file://example.com/portal',
            username: 'user',
            password: 'pass',
        });

        expect(component.form.valid).toBe(false);
    });

    it('rejects URLs with inline credentials before add or test actions', async () => {
        component.form.patchValue({
            title: 'Portal',
            serverUrl: 'https://user:pass@example.com',
            username: 'user',
            password: 'pass',
        });

        expect(component.form.valid).toBe(false);

        await component.testConnection();
        await component.addPlaylist();

        expect(component.isTestingConnection).toBe(false);
        expect(portalStatusService.checkPortalStatus).not.toHaveBeenCalled();
        expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('extracts and trims username and password from a full Xtream URL', () => {
        component.extractParams(
            'https://example.com/get.php?username=%20user%20&password=%20pass%20&type=m3u_plus'
        );

        expect(component.form.get('username')?.value).toBe('user');
        expect(component.form.get('password')?.value).toBe('pass');
    });

    it('normalizes full Xtream playlist URLs when adding a portal', async () => {
        component.form.patchValue({
            title: 'Portal',
            serverUrl:
                ' https://example.com/base/get.php?username=user&password=pass&type=m3u_plus ',
            username: ' user ',
            password: ' pass ',
        });

        await component.addPlaylist();

        expect(store.dispatch).toHaveBeenCalledWith(
            PlaylistActions.addPlaylist({
                playlist: expect.objectContaining({
                    password: 'pass',
                    serverUrl: 'https://example.com/base',
                    title: 'Portal',
                    username: 'user',
                }),
            })
        );
    });

    describe('without a server URL', () => {
        const panelLoginRequest = jest.fn();

        beforeEach(() => {
            (window as unknown as { electron?: unknown }).electron = {
                panelLoginRequest,
            };
            panelLoginRequest.mockReset();
        });

        afterEach(() => {
            delete (window as unknown as { electron?: unknown }).electron;
        });

        it('looks the line up in the current panel DNS list (no legacy endpoint)', async () => {
            panelLoginRequest.mockResolvedValue({
                ok: true,
                status: 200,
                data: ['http://dns-a.test:8080', 'https://dns-b.test/', 'nonsense'],
            });
            portalStatusService.checkPortalStatus.mockImplementation(
                async (server: string) =>
                    server === 'https://dns-b.test' ? 'active' : 'inactive'
            );
            const fetchSpy = jest.fn();
            global.fetch = fetchSpy as unknown as typeof fetch;
            component.form.patchValue({
                title: 'Linea',
                username: 'user',
                password: 'pass',
            });

            await component.addPlaylist();

            expect(panelLoginRequest).toHaveBeenCalledWith('fetch_dns');
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(portalStatusService.checkPortalStatus).toHaveBeenCalledTimes(2);
            expect(store.dispatch).toHaveBeenCalledWith(
                PlaylistActions.addPlaylist({
                    playlist: expect.objectContaining({
                        serverUrl: 'https://dns-b.test',
                        username: 'user',
                        password: 'pass',
                    }),
                })
            );
        });

        it('reports the line as unavailable when no panel DNS accepts it', async () => {
            panelLoginRequest.mockResolvedValue({
                ok: true,
                status: 200,
                data: ['http://dns-a.test'],
            });
            portalStatusService.checkPortalStatus.mockResolvedValue('inactive');
            component.form.patchValue({
                title: 'Linea',
                username: 'user',
                password: 'pass',
            });

            await component.addPlaylist();

            expect(store.dispatch).not.toHaveBeenCalled();
            expect(component.connectionStatus).toBe('unavailable');
            expect(component.isTestingConnection).toBe(false);
        });
    });
});
