export {};
const button = document.querySelector<HTMLButtonElement>('#published-check');
const status = document.querySelector('#published-version');
if (button && status) button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Verifica in corso…';
  try {
    const response = await fetch('/api/published-snapshot', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('unavailable');
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    const revision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    status.textContent = `Versione online: ${revision}. Confrontala con revision in content/published/manifest.json sul Mac.`;
  } catch { status.textContent = 'Versione online non verificabile in questo momento. Riprova.'; }
  finally { button.disabled = false; }
});
