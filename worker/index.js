import { routeRequest } from "./router.js";

export default {
  fetch(request, env, ctx) {
    return routeRequest(request, env, ctx);
  },
};
