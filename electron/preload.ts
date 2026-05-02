import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface IdfLogEvent { runId: string; stream: 'stdout' | 'stderr'; text: string }
export interface IdfExitEvent { runId: string; code: number | null; signal: string | null }

const api = {
  pickGlb: (): Promise<{ path: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke('pickGlb'),
  pickComponent: (): Promise<{ jsonPath: string; json: string; glbData: Uint8Array | null; glbName: string | null } | null> =>
    ipcRenderer.invoke('pickComponent'),
  writeBundle: (id: string, glbName: string, glbData: Uint8Array, jsonText: string): Promise<string> =>
    ipcRenderer.invoke('writeBundle', id, glbName, glbData, jsonText),
  listCatalog: (): Promise<Array<{ id: string; json: any; glbData: Uint8Array | null }>> =>
    ipcRenderer.invoke('listCatalog'),

  saveProject: (project: unknown, suggestedName: string, existingPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('saveProject', project, suggestedName, existingPath),
  openProject: (): Promise<{ project: unknown; path: string } | null> =>
    ipcRenderer.invoke('openProject'),
  projectWrite: (name: string, target: string, files: Record<string, string>): Promise<{ dir: string; target: string }> =>
    ipcRenderer.invoke('projectWrite', name, target, files),
  listSerialPorts: (): Promise<string[]> =>
    ipcRenderer.invoke('listSerialPorts'),
  idfStart: (opts: { name: string; target: string; op: 'build' | 'flash' | 'monitor' | 'clean'; port?: string }):
    Promise<{ runId: string; cwd: string; cmd: string }> =>
    ipcRenderer.invoke('idfStart', opts),
  idfStop: (runId: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('idfStop', runId),
  onIdfLog: (cb: (e: IdfLogEvent) => void) => {
    const fn = (_: IpcRendererEvent, e: IdfLogEvent) => cb(e)
    ipcRenderer.on('idf:log', fn)
    return () => ipcRenderer.removeListener('idf:log', fn)
  },
  onIdfExit: (cb: (e: IdfExitEvent) => void) => {
    const fn = (_: IpcRendererEvent, e: IdfExitEvent) => cb(e)
    ipcRenderer.on('idf:exit', fn)
    return () => ipcRenderer.removeListener('idf:exit', fn)
  },

  claudeCodeChat: (opts: {
    prompt: string
    systemAppend: string
    model: string
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('claudeCodeChat', opts),
}

contextBridge.exposeInMainWorld('espAI', api)

export type EspAIApi = typeof api
