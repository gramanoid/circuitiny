import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile, mkdir } from 'fs/promises'
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

ipcMain.handle('writeJson', async (_e, filename: string, content: string) => {
  const dir = join(ESP_AI_HOME, 'catalog-drafts')
  await mkdir(dir, { recursive: true })
  const out = join(dir, filename)
  await writeFile(out, content, 'utf8')
  return out
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
