/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK: string
  readonly VITE_LIGHTWALLETD_URL: string
  readonly VITE_ZINC_TREASURY_ADDRESS: string
  readonly VITE_ZINC_MIN_TIP: string
  readonly VITE_ZINC_INDEXER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
