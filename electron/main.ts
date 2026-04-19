import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ESP_AI_HOME = join(homedir(), '.esp-ai')

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'esp-ai',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('pickGlb', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select a .glb model',
    filters: [{ name: '3D Model', extensions: ['glb', 'gltf'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const data = await readFile(r.filePaths[0])
  return { path: r.filePaths[0], data: new Uint8Array(data) }
})

ipcMain.handle('pickComponent', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open component.json',
    filters: [{ name: 'Component JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const jsonPath = r.filePaths[0]
  const json = await readFile(jsonPath, 'utf8')
  let glbData: Uint8Array | null = null
  let glbName: string | null = null
  try {
    const parsed = JSON.parse(json)
    if (parsed.model) {
      const candidate = join(dirname(jsonPath), parsed.model)
      if (existsSync(candidate)) {
        glbData = new Uint8Array(await readFile(candidate))
        glbName = parsed.model
      }
    }
    if (!glbData) {
      // fallback: any .glb in same dir
      const sibs = await readdir(dirname(jsonPath))
      const glb = sibs.find((f) => f.toLowerCase().endsWith('.glb'))
      if (glb) {
        glbData = new Uint8Array(await readFile(join(dirname(jsonPath), glb)))
        glbName = glb
      }
    }
  } catch { /* ignore — return json only */ }
  return { jsonPath, json, glbData, glbName }
})

ipcMain.handle('writeBundle', async (_e, id: string, glbName: string, glbData: Uint8Array, jsonText: string) => {
  if (!id) throw new Error('id is required')
  const dir = join(ESP_AI_HOME, 'catalog', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, glbName), Buffer.from(glbData))
  await writeFile(join(dir, 'component.json'), jsonText, 'utf8')
  return dir
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
