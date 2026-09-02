import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('pm', { ping: () => 'pong' });
