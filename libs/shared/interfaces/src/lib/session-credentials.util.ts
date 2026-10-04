/**
 * Line password and alert accounts of the active panel session, kept in
 * memory only. The panel login sets them again on every app start, so the
 * password is never written to localStorage.
 */
export interface SessionAlertAccount {
    user: string;
    pass: string;
    dns: string;
    title: string;
}

let sessionPassword = '';
let alertAccounts: SessionAlertAccount[] = [];

export function setSessionPassword(password: string): void {
    sessionPassword = password ?? '';
}

export function getSessionPassword(): string {
    return sessionPassword;
}

export function setSessionAlertAccounts(accounts: SessionAlertAccount[]): void {
    alertAccounts = [...accounts];
}

export function getSessionAlertAccounts(): SessionAlertAccount[] {
    return [...alertAccounts];
}

export function clearSessionCredentials(): void {
    sessionPassword = '';
    alertAccounts = [];
}
