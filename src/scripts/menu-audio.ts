// Allocate and preload once, not at the moment of a tap. Playback itself stays
// synchronous with the user gesture so mobile autoplay rules can allow it.
export type MenuSound = 'open' | 'close' | 'select';
const sounds = new Map<MenuSound, HTMLAudioElement>();
if (typeof Audio !== "undefined") {
  for (const kind of ["open", "close", "select"] as const) {
    const audio = new Audio(`/sfx/menu-${kind}.mp3`);
    audio.preload = "auto";
    audio.load();
    sounds.set(kind, audio);
  }
}

export function playMenuSound(kind: MenuSound): void {
  const audio = sounds.get(kind);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play()?.catch(() => {});
  } catch {
    // Audio restrictions or device mute must never interrupt navigation.
  }
}
