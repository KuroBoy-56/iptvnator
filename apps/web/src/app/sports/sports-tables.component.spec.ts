import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PanelStandingLeague, PanelSyncService } from '@iptvnator/services';
import { SportsTablesComponent } from './sports-tables.component';

const row = (r: number, t: string, z = '') => ({ id: String(r), r, t, b: '', p: 10, w: 6, d: 2, l: 2, gf: 20, ga: 10, gd: 10, pts: 20 - r, f: 'WWDLW', z });
const league = (id: string, n: string, rg: string, d = 1, w = 0): PanelStandingLeague => ({
    id, n, c: '', b: '', sp: 'Soccer', sl: 'Fútbol', d, rg, w, s: '2026', g: [{ n: '', r: [row(1, `${n} A`, 'p'), row(2, `${n} B`, 'r')] }],
});

describe('SportsTablesComponent (Deportes › Tablas)', () => {
    async function render(leagues: PanelStandingLeague[]) {
        const fetchSportsTeam = jest.fn().mockResolvedValue({ n: 'LaLiga A', b: '', y: '1902', loc: 'Madrid', c: 'Spain', st: 'Bernabéu', cap: 81044, lg: 'LaLiga', hon: [{ t: 'LaLiga', n: 36 }], d: 'Club' });
        await TestBed.configureTestingModule({
            imports: [SportsTablesComponent, TranslateModule.forRoot()],
            providers: [{ provide: PanelSyncService, useValue: { fetchSportsTables: jest.fn().mockResolvedValue({ on: true, partial: false, leagues }), fetchSportsTeam } }],
        }).compileComponents();
        const fixture = TestBed.createComponent(SportsTablesComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement, fetchSportsTeam };
    }

    // first: once standings arrive they stay for the session (the next visit opens at once)
    it('says when there are no standings', async () => {
        const { el } = await render([]);
        expect(el.querySelector('.sp-empty')?.textContent).toContain('MPX.SPORTS.NO_TABLES');
    });

    it('shows region, division and league chips and the table of the first league', async () => {
        const { el, fixture } = await render([league('1', 'LaLiga', 'eu'), league('2', 'Liga MX', 'latam'), league('3', 'LaLiga 2', 'eu', 2), league('4', 'Liga F', 'eu', 1, 1)]);
        const chips = Array.from(el.querySelectorAll('.sp-chip')).map((b) => b.textContent?.trim());
        expect(chips).toEqual(expect.arrayContaining(['MPX.SPORTS.ALL_F', 'MPX.SPORTS.REGION_EU', 'MPX.SPORTS.REGION_AM', 'MPX.SPORTS.WOMEN_LEAGUE', 'LaLiga', 'Liga MX']));
        expect(el.querySelector('.st-title h2')?.textContent).toContain('LaLiga · 2026');
        expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(el.querySelectorAll('.st-legend span')).toHaveLength(2);
        // America: only Liga MX
        (Array.from(el.querySelectorAll('.sp-chip')).find((b) => b.textContent?.includes('REGION_AM')) as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el.querySelector('.st-title h2')?.textContent).toContain('Liga MX');
    });

    it('opens the team card with Más detalles and closes it with Entendido', async () => {
        const { el, fixture, fetchSportsTeam } = await render([league('1', 'LaLiga', 'eu')]);
        (el.querySelector('tbody tr') as HTMLElement).click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fetchSportsTeam).toHaveBeenCalledWith('1');
        expect(el.querySelector('.st-card h2')?.textContent).toBe('LaLiga A');
        (el.querySelector('.st-card .ghost') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el.querySelector('.st-card .ghost')).toBeNull();
        (el.querySelector('.st-card .primary') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el.querySelector('.st-card')).toBeNull();
    });
});
