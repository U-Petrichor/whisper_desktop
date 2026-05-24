import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi'

const LOGIN_SIZE = new LogicalSize(420, 600)
const REGISTER_SIZE = new LogicalSize(420, 720)
const CHAT_SIZE = new LogicalSize(830, 600)

const RESIZE_STEP_MS = 8

export async function animateWindowResize(target: LogicalSize, duration = 400): Promise<void> {
  const win = getCurrentWindow()
  const current = await win.innerSize()
  const currentPos = await win.outerPosition()
  const scale = await win.scaleFactor()

  const startW = current.width / scale
  const startH = current.height / scale
  const startX = currentPos.x / scale
  const startY = currentPos.y / scale
  const endW = target.width
  const endH = target.height
  const deltaW = endW - startW
  const deltaH = endH - startH

  if (Math.abs(deltaH) < 1 && Math.abs(deltaW) < 1) return

  // Shift position by half the size delta so window expands symmetrically from center
  const endX = startX - deltaW / 2
  const endY = startY - deltaH / 2

  const startTime = performance.now()

  return new Promise(resolve => {
    function frame(now: number) {
      const elapsed = now - startTime
      let t = Math.min(elapsed / duration, 1)
      // ease-in-out cubic: slow → fast → slow
      t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const w = startW + deltaW * t
      const h = startH + deltaH * t
      const x = startX + (endX - startX) * t
      const y = startY + (endY - startY) * t
      win.setSize(new LogicalSize(w, h))
      win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)))

      if (elapsed < duration) {
        setTimeout(() => requestAnimationFrame(frame), RESIZE_STEP_MS)
      } else {
        win.setSize(target)
        resolve()
      }
    }
    requestAnimationFrame(frame)
  })
}

export async function transitionToRegisterWindow(): Promise<void> {
  await animateWindowResize(REGISTER_SIZE)
}

export async function transitionToLoginWindowFromRegister(): Promise<void> {
  await animateWindowResize(LOGIN_SIZE)
}

export async function transitionToChatWindow(): Promise<void> {
  await animateWindowResize(CHAT_SIZE, 600)
  await getCurrentWindow().setResizable(true)
}

export async function transitionToLoginWindow(): Promise<void> {
  await getCurrentWindow().setResizable(false)
  await animateWindowResize(LOGIN_SIZE, 600)
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