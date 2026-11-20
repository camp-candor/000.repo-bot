import type { SessionRouteAuditRow } from '../../00.library.unit/fce/pivot-discovery.bit';

export function buildSessionRouteAuditTable(
  menuRoutes: Map<string, any>
): { rows: SessionRouteAuditRow[]; asciiLines: string[] } {
  const g = globalThis as Record<string, any>;
  const rows: SessionRouteAuditRow[] = [
    {
      menuTitle: 'LIBRARY MENU',
      globalKey: 'LIBRARY',
      routeRegistered: true,
      globalBound: typeof g.LIBRARY?.hunt === 'function',
      status: typeof g.LIBRARY?.hunt === 'function' ? 'READY' : 'DEGRADED',
    },
  ];

  if (menuRoutes && typeof (menuRoutes as any).entries === 'function') {
    for (const [menuTitle] of (menuRoutes as Map<string, any>).entries()) {
      if (menuTitle === 'LIBRARY MENU') continue;
      const inferredKey = menuTitle
        .replace(/\s+MENU$/i, '')
        .replace(/[^A-Z0-9]+/gi, '_')
        .toUpperCase();
      const matchedKey =
        Object.keys(g).find(
          (k) =>
            (k === inferredKey || inferredKey.endsWith(k)) &&
            g[k] &&
            typeof g[k].hunt === 'function'
        ) || inferredKey;

      const globalBound = Boolean(g[matchedKey] && typeof g[matchedKey].hunt === 'function');
      rows.push({
        menuTitle,
        globalKey: matchedKey,
        routeRegistered: true,
        globalBound,
        status: globalBound ? 'READY' : 'UNBOUND',
      });
    }
  }

  const asciiLines: string[] = [
    '>> +--------------------------+--------------+---------+---------+',
    '>> | ROUTE TITLE              | GLOBAL KEY   | ROUTE   | STATUS  |',
    '>> +--------------------------+--------------+---------+---------+',
  ];

  for (const row of rows) {
    const colTitle = row.menuTitle.padEnd(24, ' ').slice(0, 24);
    const colKey = row.globalKey.padEnd(12, ' ').slice(0, 12);
    const colRoute = (row.routeRegistered ? 'MOUNTED' : 'MISSING').padEnd(7, ' ');
    const colStatus = row.status.padEnd(7, ' ');
    asciiLines.push(`>> | ${colTitle} | ${colKey} | ${colRoute} | ${colStatus} |`);
  }

  asciiLines.push('>> +--------------------------+--------------+---------+---------+');
  return { rows, asciiLines };
}
