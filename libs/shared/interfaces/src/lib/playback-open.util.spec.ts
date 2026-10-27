import { isPlaybackOpen, markPlaybackOpen, whenPlaybackClosed } from './playback-open.util';

describe('playback-open', () => {
    it('waits for the last player to close', async () => {
        const order: string[] = [];
        await whenPlaybackClosed().then(() => order.push('idle'));
        const a = markPlaybackOpen();
        const b = markPlaybackOpen();
        const done = whenPlaybackClosed().then(() => order.push('closed'));
        a();
        a();
        expect(isPlaybackOpen()).toBe(true);
        await Promise.resolve();
        expect(order).toEqual(['idle']);
        b();
        await done;
        expect(order).toEqual(['idle', 'closed']);
        expect(isPlaybackOpen()).toBe(false);
    });
});
