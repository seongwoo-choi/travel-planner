const INSTALLED = Symbol("expressAsyncBoundaryInstalled");
const ROUTE_METHODS = ["use", "all", "get", "post", "put", "patch", "delete", "options", "head"];

export function wrapAsyncHandler(handler) {
  if (typeof handler !== "function" || handler.length === 4 || (handler.handle && handler.set)) {
    return handler;
  }
  return function asyncBoundaryHandler(req, res, next) {
    try {
      return Promise.resolve(handler.call(this, req, res, next)).catch(next);
    } catch (error) {
      next(error);
      return undefined;
    }
  };
}

function wrapRegistrationValue(value) {
  if (Array.isArray(value)) return value.map(wrapRegistrationValue);
  return wrapAsyncHandler(value);
}

export function installExpressAsyncBoundary(app) {
  if (app[INSTALLED]) return app;
  for (const method of ROUTE_METHODS) {
    const register = app[method].bind(app);
    app[method] = (...args) => register(...args.map(wrapRegistrationValue));
  }
  Object.defineProperty(app, INSTALLED, { value: true });
  return app;
}

export function createJsonErrorHandler({ logger = console.error } = {}) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    logger({
      event: "unhandled_request_error",
      errorName: error?.name || "Error",
      method: req.method,
      path: req.path || "",
    });
    res.status(500).json({ error: "internal server error" });
  };
}
