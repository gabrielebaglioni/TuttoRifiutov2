export default {
  async fetch(request: Request, env: { ASSETS: Pick<Fetcher, 'fetch'> }) {
    return env.ASSETS.fetch(request);
  },
};
