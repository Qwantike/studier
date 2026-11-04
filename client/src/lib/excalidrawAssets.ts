declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string
  }
}
export {}
// Exécuté avant le chargement paresseux de la bibliothèque : aucune police sur un CDN.
window.EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`
