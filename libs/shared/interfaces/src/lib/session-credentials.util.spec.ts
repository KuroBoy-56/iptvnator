import {
    clearSessionCredentials,
    getSessionAlertAccounts,
    getSessionPassword,
    setSessionAlertAccounts,
    setSessionPassword,
} from './session-credentials.util';

describe('session credentials', () => {
    afterEach(() => clearSessionCredentials());

    it('keeps the password in memory', () => {
        setSessionPassword('secret');
        expect(getSessionPassword()).toBe('secret');
    });

    it('returns copies of the alert accounts and clears everything', () => {
        setSessionAlertAccounts([{ user: 'u', pass: 'p', dns: 'http://x', title: 't' }]);
        getSessionAlertAccounts().pop();
        expect(getSessionAlertAccounts()).toHaveLength(1);
        clearSessionCredentials();
        expect(getSessionPassword()).toBe('');
        expect(getSessionAlertAccounts()).toEqual([]);
    });
});
