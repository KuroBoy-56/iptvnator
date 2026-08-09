import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Store } from '@ngrx/store';
import {
    FilterActions,
    selectActiveTypeFilters,
    selectAllPlaylistsMeta,
} from '@iptvnator/m3u-state';
import { TranslatePipe } from '@ngx-translate/core';

// 1. ELIMINAMOS STALKER Y M3U DE LOS TIPOS PERMITIDOS
type PlaylistFilterId = 'all' | 'xtream';

interface PlaylistFilterOption {
    id: PlaylistFilterId;
    icon: string;
    label?: string;
    translationKey?: string;
}

// 2. EL FILTRO GLOBAL AHORA SOLO RECONOCE XTREAM
const ALL_FILTERS = ['xtream'];

@Component({
    selector: 'app-workspace-sources-filters-panel',
    imports: [MatIcon, MatListModule, TranslatePipe],
    templateUrl: './workspace-sources-filters-panel.component.html',
    styleUrl: './workspace-sources-filters-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSourcesFiltersPanelComponent {
    private readonly store = inject(Store);

    private readonly activeTypeFilters = this.store.selectSignal(
        selectActiveTypeFilters
    );
    private readonly playlists = this.store.selectSignal(selectAllPlaylistsMeta);

    // 3. LA BARRA AHORA SOLO DIBUJARÁ "TODAS" Y "XTREAM"
    readonly typeOptions: PlaylistFilterOption[] = [
        {
            id: 'all',
            icon: 'layers',
            translationKey: 'WORKSPACE.SOURCES.ALL',
        },
        {
            id: 'xtream',
            icon: 'cloud',
            translationKey: 'HOME.PLAYLIST_TYPES.XTREAM',
        }
    ];

    // 4. LIMPIAMOS EL CONTADOR PARA QUE NO BUSQUE BASURA
    readonly typeCounts = computed(() => {
        const items = this.playlists();
        return {
            all: items.length,
            xtream: items.filter((item) => !!item.serverUrl).length
        };
    });

    isTypeActive(filterId: PlaylistFilterId): boolean {
        const selected = this.activeTypeFilters();
        if (filterId === 'all') {
            return (
                selected.length === ALL_FILTERS.length &&
                ALL_FILTERS.every((id) => selected.includes(id))
            );
        }

        return selected.length === 1 && selected[0] === filterId;
    }

    selectType(filterId: PlaylistFilterId): void {
        const selectedFilters =
            filterId === 'all' ? ALL_FILTERS : [filterId];
        this.store.dispatch(
            FilterActions.setSelectedFilters({
                selectedFilters,
            })
        );
    }

    getTypeCount(filterId: PlaylistFilterId): number {
        const counts = this.typeCounts();
        if (filterId === 'all') {
            return counts.all;
        }
        return counts.xtream;
    }
}