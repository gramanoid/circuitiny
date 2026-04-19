import { contextBridge, ipcRenderer } from 'electron'

const api = {
  pickGlb: (): Promise<{ path: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke('pickGlb'),
  writeJson: (filename: string, content: string): Promise<string> =>
    ipcRenderer.invoke('writeJson', filename, content)
}

contextBridge.exposeInMainWorld('espAI', api)

export type EspAIApi = typeof api
