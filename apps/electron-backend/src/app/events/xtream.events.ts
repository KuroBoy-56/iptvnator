/**
 * This module handles all Xtream Codes API related IPC communications
 * between the frontend and the electron backend.
 */

import axios, { AxiosRequestConfig } from 'axios';
import { ipcMain } from 'electron';
import * as https from 'https';
import {
    PortalDebugEvent,
    XTREAM_CANCEL_SESSION,
    normalizeXtreamServerUrl,
} from '@iptvnator/shared/interfaces';
import { emitPortalDebugEvent } from './portal-debug.events';
import { UnsafeUrlError } from './url-safety';
import { requestWithValidatedRedirects } from '../util/validated-axios';
import {
    isConnectFailure,
    preferKnownScheme,
    rememberPlainHttp,
    toPlainHttp,
} from './xtream-scheme-fallback';

export default class XtreamEvents {
    static bootstrapXtreamEvents(): Electron.IpcMain {
        return ipcMain;
    }
}

function formatXtreamError(
    error: unknown,
    requestUrl: string,
    action?: string
) {
    let parsedUrl: URL | null = null;
    try {
        parsedUrl = new URL(requestUrl);
    } catch {
        parsedUrl = null;
    }
    const base = {
        action,
        host: parsedUrl?.host ?? 'unknown',
        pathname: parsedUrl?.pathname ?? requestUrl,
    };

    if (axios.isAxiosError(error)) {
        return {
            ...base,
            type: 'AxiosError',
            code: error.code,
            status: error.response?.status,
            message: error.message,
            syscall: (error as NodeJS.ErrnoException).syscall,
            hostname: (error as any).hostname,
        };
    }

    if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        return {
            ...base,
            type: 'ErrorObject',
            status: errObj.status,
            message: errObj.message,
        };
    }

    return {
        ...base,
        type: 'UnknownError',
        message: String(error),
    };
}

function buildXtreamApiUrl(url: string, params: Record<string, string>): URL {
    let apiUrl: URL;
    
    // 🚀 EL TRUCO PARA TU PHP: Si la URL es tu archivo PHP, no le metemos el player_api.php basura.
    if (url.includes('.php')) {
        apiUrl = new URL(url);
    } else {
        const baseUrl = normalizeXtreamServerUrl(url);
        apiUrl = new URL(`${baseUrl}/player_api.php`);
    }

    Object.entries(params).forEach(([key, value]) => {
        apiUrl.searchParams.append(
            key,
            key === 'username' || key === 'password' ? value.trim() : value
        );
    });

    return apiUrl;
}

/**
 * Handle Xtream Codes API requests
 */
ipcMain.handle(
    'XTREAM_REQUEST',
    async (
        event,
        payload: {
            url: string;
            params: Record<string, string>;
            requestId?: string;
            sessionId?: string;
            suppressErrorLog?: boolean;
        }
    ) => {
        const startedAt = Date.now();
        let activeRequestKey: string | null = null;
        let requestUrlForLog = payload.url;
        try {
            const { url, params, requestId, sessionId } = payload;

            const apiUrl = preferKnownScheme(buildXtreamApiUrl(url, params));
            requestUrlForLog = apiUrl.toString();

            const controller = new AbortController();
            if (requestId || sessionId) {
                activeRequestKey = requestId ?? crypto.randomUUID();
                activeXtreamRequests.set(activeRequestKey, {
                    controller,
                    sessionId,
                });
            }

            const config: AxiosRequestConfig = {
                method: 'GET',
                url: apiUrl.toString(),
                headers: {
                    'User-Agent': 'IPTVSmartersPro',
                    Accept: 'application/json',
                    Connection: 'keep-alive'
                },
                timeout: 60000, 
                validateStatus: (status) => status < 500,
                signal: controller.signal,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
            };

            let response;
            try {
                response = await requestWithValidatedRedirects<unknown>(
                    apiUrl.toString(),
                    config,
                    { allowPrivateNetworks: true }
                );
            } catch (error) {
                // Many providers only answer on http even when the DNS is handed out as https.
                const plain = toPlainHttp(apiUrl);
                if (!plain || !isConnectFailure(error) || controller.signal.aborted) throw error;
                response = await requestWithValidatedRedirects<unknown>(
                    plain.toString(),
                    { ...config, url: plain.toString() },
                    { allowPrivateNetworks: true }
                );
                rememberPlainHttp(apiUrl);
                requestUrlForLog = plain.toString();
            }

            if (response.status >= 400) {
                throw {
                    message: `HTTP Error: ${response.statusText}`,
                    status: response.status,
                };
            }

            if (requestId) {
                const debugEvent: PortalDebugEvent = {
                    requestId,
                    provider: 'xtream',
                    operation: params.action ?? 'unknown',
                    transport: 'electron-main',
                    startedAt: new Date(startedAt).toISOString(),
                    durationMs: Date.now() - startedAt,
                    status: 'success',
                    request: {
                        method: config.method ?? 'GET',
                        url: apiUrl.toString(),
                        headers: config.headers,
                        timeout: config.timeout,
                        params,
                    },
                    response: response.data,
                };
                emitPortalDebugEvent(debugEvent);
            }

            return {
                payload: response.data,
                action: params.action,
            };
        } catch (error) {
            
            // No blocking native dialog here: background requests (account info,
            // EPG…) failing must not interrupt the app. The renderer shows its own
            // error state and the details go to the log below.

            const requestId = payload.requestId;
            if (requestId) {
                const apiUrl = (() => {
                    try {
                        return buildXtreamApiUrl(
                            payload.url,
                            payload.params ?? {}
                        ).toString();
                    } catch {
                        return requestUrlForLog;
                    }
                })();

                const debugEvent: PortalDebugEvent = {
                    requestId,
                    provider: 'xtream',
                    operation: payload.params?.action ?? 'unknown',
                    transport: 'electron-main',
                    startedAt: new Date(startedAt).toISOString(),
                    durationMs: Date.now() - startedAt,
                    status: 'error',
                    request: {
                        method: 'GET',
                        url: apiUrl,
                        headers: {
                            'User-Agent': 'IPTVSmartersPro',
                            Accept: 'application/json',
                        },
                        timeout: 60000,
                        params: payload.params,
                    },
                    error,
                };
                emitPortalDebugEvent(debugEvent);
            }

            if (!payload.suppressErrorLog) {
                console.error(
                    '[XTREAM_REQUEST] Failed',
                    formatXtreamError(
                        error,
                        requestUrlForLog,
                        payload.params?.action
                    )
                );
            }

            if (axios.isAxiosError(error)) {
                if (error.code === 'ERR_CANCELED') {
                    throw {
                        type: 'ERROR',
                        name: 'AbortError',
                        message: 'Xtream request cancelled',
                        status: 499,
                    };
                }
                const errorResponse = {
                    type: 'ERROR',
                    message:
                        error.response?.data?.message ||
                        error.message ||
                        'Failed to fetch data from Xtream server',
                    status: error.response?.status || 500,
                };
                throw errorResponse;
            } else if (
                error &&
                typeof error === 'object' &&
                'message' in error
            ) {
                throw error;
            } else {
                throw {
                    type: 'ERROR',
                    message: 'An unknown error occurred',
                    status: 500,
                };
            }
        } finally {
            if (activeRequestKey) {
                activeXtreamRequests.delete(activeRequestKey);
            }
        }
    }
);

ipcMain.handle(
    XTREAM_CANCEL_SESSION,
    async (
        _event,
        sessionId: string
    ): Promise<{ success: boolean; cancelled: number }> => {
        if (!sessionId) {
            return { success: false, cancelled: 0 };
        }

        let cancelled = 0;
        for (const activeRequest of activeXtreamRequests.values()) {
            if (activeRequest.sessionId !== sessionId) {
                continue;
            }

            activeRequest.controller.abort();
            cancelled += 1;
        }

        return {
            success: cancelled > 0,
            cancelled,
        };
    }
);
type ActiveXtreamRequest = {
    controller: AbortController;
    sessionId?: string;
};

const activeXtreamRequests = new Map<string, ActiveXtreamRequest>();

ipcMain.handle(
    'XTREAM_PROBE_URL',
    async (
        _event,
        payload: {
            url: string;
            method?: 'GET' | 'HEAD';
        }
    ) => {
        const method = payload.method ?? 'HEAD';
        const config: AxiosRequestConfig = {
            method,
            url: payload.url,
            headers: {
                'User-Agent': 'IPTVSmartersPro',
                ...(method === 'GET' ? { Range: 'bytes=0-4095' } : {}),
            },
            timeout: 15000,
            responseType: method === 'GET' ? 'stream' : undefined,
            validateStatus: () => true,
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        };

        try {
            const response = await requestWithValidatedRedirects(
                payload.url,
                config,
                {
                    allowPrivateNetworkRedirects: false,
                    allowPrivateNetworks: true,
                    pinAllowedPrivateNetworkHosts: true,
                }
            );
            const responseBody = response.data as
                | { destroy?: () => void }
                | undefined;
            responseBody?.destroy?.();
            return {
                status: response.status,
                url: response.config?.url ?? payload.url,
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return {
                    status: error.response.status,
                    url: payload.url,
                };
            }

            if (error instanceof UnsafeUrlError) {
                return {
                    status: 0,
                    url: payload.url,
                    error: error.message,
                };
            }

            return {
                status: 0,
                url: payload.url,
            };
        }
    }
);