/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base URL, e.g. http://localhost:3000/api */
  readonly VITE_API_URL?: string;
  /** Socket.IO base URL, e.g. http://localhost:3000 */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
