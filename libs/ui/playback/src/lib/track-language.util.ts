/**
 * Audio/subtitle track names show only the language ("Español latino",
 * "Inglés"), like the TV and mobile apps: no codecs, channel layouts or the
 * provider's technical title ("Unique Latino 2.0 AAC", "ISO 144.96-3").
 */
const CODES: Record<string, string> = {
    spa: 'es',
    eng: 'en',
    por: 'pt',
    fre: 'fr',
    fra: 'fr',
    ger: 'de',
    deu: 'de',
    ita: 'it',
    jpn: 'ja',
    kor: 'ko',
    chi: 'zh',
    zho: 'zh',
    rus: 'ru',
};

const LATIN_SPANISH: Record<string, string> = {
    es: 'Español latino',
    en: 'Latin Spanish',
    pt: 'Espanhol latino',
    fr: 'Espagnol latino',
};

/** tracks without a language code but with a name ("Latino", "English") */
function guessLanguage(title: string): string {
    if (/\b(latino|español|espanol|castellano|spanish)/.test(title))
        return 'es';
    if (/\b(english|inglés|ingles)/.test(title)) return 'en';
    if (/\b(portugu[eê]s|portuguese)/.test(title)) return 'pt';
    if (/\b(français|francés|french)/.test(title)) return 'fr';
    return '';
}

/** '' when nothing useful is known (the caller shows "Audio 2") */
export function trackLanguageName(
    language: string | undefined,
    title: string | undefined,
    appLang = 'es'
): string {
    const raw = (language ?? '').toLowerCase().trim().split(/[-_]/)[0];
    const name = (title ?? '').trim();
    const lower = name.toLowerCase();
    // "lat" is the non-standard code many providers use for Latin Spanish
    const latino = raw === 'lat' || /\b(lat|latino|latam|mx)\b/.test(lower);
    const code =
        raw === 'lat'
            ? 'es'
            : (CODES[raw] ??
              (/^[a-z]{2,3}$/.test(raw) && raw !== 'und'
                  ? raw
                  : guessLanguage(lower)));
    if (!code) {
        return name.length <= 16 && !/[0-9.,:;()[\]/\\#_+=|-]/.test(name)
            ? name
            : '';
    }
    const ui = LATIN_SPANISH[appLang] ? appLang : 'es';
    if (code === 'es' && latino) return LATIN_SPANISH[ui];
    let display = '';
    try {
        display =
            new Intl.DisplayNames([ui], { type: 'language' }).of(code) ?? '';
    } catch {
        display = '';
    }
    if (!display || display.toLowerCase() === code) return code.toUpperCase();
    return display.charAt(0).toLocaleUpperCase(ui) + display.slice(1);
}

/** label of tracks[index], numbered when an earlier track has the same one ("Inglés 2") */
export function numberedTrackName<T>(
    tracks: readonly T[],
    index: number,
    nameOf: (track: T, index: number) => string
): string {
    const name = nameOf(tracks[index], index);
    let same = 1;
    for (let i = 0; i < index; i++) {
        if (nameOf(tracks[i], i) === name) same++;
    }
    return same > 1 ? `${name} ${same}` : name;
}
