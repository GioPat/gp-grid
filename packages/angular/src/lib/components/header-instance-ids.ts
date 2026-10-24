import { APP_ID, Injectable, inject } from '@angular/core';

/**
 * Per-application counter of the header id prefixes (D9). It lives in the
 * root injector, so a server render and its hydration number grids alike, and
 * `APP_ID` keeps two applications on one page apart.
 */
@Injectable({ providedIn: 'root' })
export class GridHeaderInstanceIds {
  private readonly appId = inject(APP_ID);
  private count = 0;

  next(): string {
    const instance = `${this.appId}-${this.count}`;
    this.count += 1;
    return instance;
  }
}
