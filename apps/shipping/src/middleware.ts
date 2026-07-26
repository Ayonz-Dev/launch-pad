// Session refresh comes from the shared shell.
import { createSessionMiddleware } from "@launchpad/shell/middleware";

export const middleware = createSessionMiddleware();
export { defaultMiddlewareConfig as config } from "@launchpad/shell/middleware";
