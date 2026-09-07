// @ts-nocheck
import { app, ipcMain } from 'electron';
import * as os from 'os';
import { environment } from '../../environments/environment';
import {
    DEBUG_TRACE_EVENT_CHANNEL,
    isRendererApiTraceEnabled,
    trace,
} from '../services/debug-trace';

export default class ElectronEvents {
  static bootstrapElectronEvents(): Electron.IpcMain {
    return ipcMain;
  }
}

// ==== EL TÚNEL SOPLÓN HACIA LA TERMINAL ====
ipcMain.on('TERMINAL_LOG', (event, msg, data) => {
  console.log('\x1b[36m%s\x1b[0m', `👉 ${msg}`); // Texto en Cyan
  if (data) {
      console.log('\x1b[33m%s\x1b[0m', JSON.stringify(data, null, 2)); // Datos en Amarillo
  }
});

ipcMain.handle('get-app-version', (event) => {
  return environment.version;
});

ipcMain.handle('APP_UPDATE:GET_STATUS', (event) => {
  return { status: 'idle', updateAvailable: false };
});

ipcMain.on('quit', (event, code) => {
  app.exit(code);
});

ipcMain.on(DEBUG_TRACE_EVENT_CHANNEL, (event, payload) => {
  if (!isRendererApiTraceEnabled()) {
    return;
  }

  trace('renderer-api', 'event', {
    payload,
    senderId: event.sender.id,
    url: event.sender.getURL(),
  });
});

ipcMain.handle('get-local-ip-addresses', () => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
});