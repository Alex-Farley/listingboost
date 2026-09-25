export type RouteParams = Record<string, string>;
export type Handler<C> = (request: Request, params: RouteParams, context: C) => Promise<Response>;

type Route<C> = { method: string; pattern: RegExp; keys: string[]; handler: Handler<C> };

export class Router<C> {
  private readonly routes: Route<C>[] = [];

  on(method: string, path: string, handler: Handler<C>): this {
    const keys: string[] = [];
    const source = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return "([A-Za-z0-9_-]{1,100})";
    });
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler<C>; params: RouteParams } | "method_not_allowed" | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = pathname.match(route.pattern);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: RouteParams = {};
      route.keys.forEach((key, i) => (params[key] = m[i + 1]!));
      return { handler: route.handler, params };
    }
    return pathMatched ? "method_not_allowed" : null;
  }
}
