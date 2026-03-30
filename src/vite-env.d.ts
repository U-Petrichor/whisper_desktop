/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "crypto-js" {
  const CryptoJS: any;
  export default CryptoJS;
}

interface ElectronFileSystemApi {
  exists(path: string): boolean
  mkdir(path: string, options?: { recursive?: boolean }): void
  readFile(path: string, encoding?: string): string
  writeFile(path: string, content: string, encoding?: string): void
}

interface ElectronPathApi {
  join(...paths: string[]): string
}

interface ElectronApi {
  fs: ElectronFileSystemApi
  path: ElectronPathApi
  getPath(name: string): string
}

interface Window {
  electronAPI?: ElectronApi
  hybridChatTimers?: Array<number | ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>
  localMessageService?: unknown
  initLocalMessageService?: () => unknown
  getLocalStorageStatus?: () => unknown
  clearLocalMessages?: () => unknown
  checkChat8LocalStorage?: () => unknown
  clearChat8Messages?: () => unknown
  getChat8UserKeys?: (userId?: number | string | null) => unknown
  clearChat8UserKeys?: (userId?: number | string | null) => unknown
  validateChat8UserKeys?: () => unknown
  getChat8Contacts?: () => unknown
  enableFileDebugMode?: () => void
  disableFileDebugMode?: () => void
  webkitAudioContext?: typeof AudioContext
}
