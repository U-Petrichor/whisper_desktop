import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'

const LOGIN_SIZE = new LogicalSize(420, 600)
const CHAT_SIZE = new LogicalSize(830, 640)

export async function transitionToChatWindow(): Promise<void> {
  const win = getCurrentWindow()
  await win.setSize(CHAT_SIZE)
  await win.center()
  await win.setResizable(true)
}

export async function transitionToLoginWindow(): Promise<void> {
  const win = getCurrentWindow()
  await win.setResizable(false)
  await win.setSize(LOGIN_SIZE)
  await win.center()
}

export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize()
}

export async function toggleMaximize(): Promise<void> {
  const win = getCurrentWindow()
  if (await win.isMaximized()) {
    await win.unmaximize()
  } else {
    await win.maximize()
  }
}

export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close()
}

export async function startDrag(): Promise<void> {
  await getCurrentWindow().startDragging()
}