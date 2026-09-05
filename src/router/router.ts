import { ROUTES } from '@config/app';

export type RouteHandler = (params: Record<string, string>) => Promise<void> | void;

export interface RouteDefinition {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  title?: string;
}

export class Router {
  private routes: RouteDefinition[] = [];
  private currentRoute: RouteDefinition | null = null;
  private rootElement: HTMLElement | null = null;
  private fallback: RouteHandler | null = null;

  init(root: HTMLElement, fallback: RouteHandler) {
    this.rootElement = root;
    this.fallback = fallback;
    window.addEventListener('popstate', () => this.render());
    document.addEventListener('click', (e) => this.handleLinkClick(e));
    this.render();
  }

  addRoute(path: string, handler: RouteHandler, title?: string) {
    const { pattern, paramNames } = this.compile(path);
    this.routes.push({ pattern, paramNames, handler, title });
  }

  navigate(path: string) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    this.render();
  }

  private compile(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const patternStr = path
      .replace(/\//g, '\\/')
      .replace(/:([a-zA-Z_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^\\/]+)';
      });
    return {
      pattern: new RegExp(`^${patternStr}$`),
      paramNames
    };
  }

  private handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a[data-link]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;
    e.preventDefault();
    this.navigate(href);
  }

  private async render() {
    if (!this.rootElement) return;
    const path = window.location.pathname || ROUTES.dashboard;
    const route = this.routes.find((r) => r.pattern.test(path));
    this.currentRoute = route ?? null;
    if (route?.title) {
      document.title = `${route.title} · SmartFace Attendance`;
    } else {
      document.title = 'SmartFace Attendance';
    }
    if (route) {
      const match = path.match(route.pattern);
      const params: Record<string, string> = {};
      if (match) {
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
      }
      this.rootElement.innerHTML = '';
      await route.handler(params);
    } else if (this.fallback) {
      this.rootElement.innerHTML = '';
      await this.fallback({});
    }
  }

  getCurrentRoute(): RouteDefinition | null {
    return this.currentRoute;
  }
}

export const router = new Router();