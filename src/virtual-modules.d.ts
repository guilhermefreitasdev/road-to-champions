/** scripts/places-inline-plugin.mjs: public path → data URL of the Mapa game's images (empty unless VITE_INLINE_PLACES=1). */
declare module 'virtual:rtc-places-inline' {
  const images: Record<string, string>;
  export default images;
}
