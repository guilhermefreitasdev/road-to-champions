/** scripts/places-inline-plugin.mjs: public path → data URL of the Mapa game's images (empty unless VITE_INLINE_PLACES=1). */
declare module 'virtual:rtc-places-inline' {
  const images: Record<string, string>;
  export default images;
}

/** scripts/places-inline-plugin.mjs: public path → data URL of the Valdle's local game media of one kind (src/data/gameMedia.ts; empty unless VITE_INLINE_PLACES=1). */
declare module 'virtual:rtc-game-media-inline/minimaps' {
  const images: Record<string, string>;
  export default images;
}
declare module 'virtual:rtc-game-media-inline/abilities' {
  const images: Record<string, string>;
  export default images;
}
declare module 'virtual:rtc-game-media-inline/weapons' {
  const images: Record<string, string>;
  export default images;
}
