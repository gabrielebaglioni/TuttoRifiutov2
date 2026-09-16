import { routeRequest } from "./router.ts";
import type { WorkerContext, WorkerEnv } from './types.ts';

export default {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) {
    return routeRequest(request, env, ctx);
  },
};
