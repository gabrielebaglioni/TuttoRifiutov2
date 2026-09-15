// The browser shares this chunk with the home skyline when already loaded.
// Closed menus on other pages no longer request WebGL code at startup.
let pending;
export function loadMenuLibrary() {
  return pending ??= import('./menu-three.js');
}
