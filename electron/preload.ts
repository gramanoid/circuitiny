import { contextBridge, ipcRenderer } from 'electron'

const api = {
  pickGlb: (): Promise<{ path: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke('pickGlb'),
  pickComponent: (): Promise<{ jsonPath: string; json: string; glbData: Uint8Array | null; glbName: string | null } | null> =>
    ipcRenderer.invoke('pickComponent'),
  writeBundle: (id: string, glbName: string, glbData: Uint8Array, jsonText: string): Promise<string> =>
    ipcRenderer.invoke('writeBundle', id, glbName, glbData, jsonText)
}

contextBridge.exposeInMainWorld('espAI', api)

export type EspAIApi = typeof api
