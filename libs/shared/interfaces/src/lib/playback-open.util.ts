/**
 * Players open right now (inline web player, embedded MPV, external MPV/VLC). The panel's «borrar caché» order
 * waits until all are closed (same as Roku, Vega and Android): clearing restarts the app and would cut the video.
 */
let open = 0;
let waiters: Array<() => void> = [];

/** A player opened; call the returned function when it closes (calling it twice does nothing). */
export function markPlaybackOpen(): () => void {
    open++;
    let done = false;
    return () => {
        if (done) return;
        done = true;
        open = Math.max(0, open - 1);
        if (open) return;
        const list = waiters;
        waiters = [];
        list.forEach((w) => w());
    };
}

export function isPlaybackOpen(): boolean {
    return open > 0;
}

/** Resolves at once with no player open, otherwise when the last one closes. */
export function whenPlaybackClosed(): Promise<void> {
    return open ? new Promise<void>((resolve) => waiters.push(resolve)) : Promise.resolve();
}
