import { use, type ComponentType } from 'react';

/**
 * A component whose code loads on demand (its own chunk), like React.lazy, plus `preload()` to fetch it ahead of
 * time. Once loaded it renders synchronously, so a prefetched screen never flashes the Suspense fallback, and the
 * element type stays the same before and after loading (no remount, no lost state). A failed load is retried on
 * the next render instead of being cached.
 */
export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = (): Promise<ComponentType<P>> =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    ));
  function Screen(props: P) {
    const Component = loaded ?? use(preload());
    return <Component {...props} />;
  }
  Screen.preload = preload;
  return Screen;
}
