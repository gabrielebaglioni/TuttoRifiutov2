import type { AssetStore } from '../worker/types.ts';
export default {
  async fetch(request: Request, env: { ASSETS: AssetStore }) {
    return env.ASSETS.fetch(request);
  },
};
