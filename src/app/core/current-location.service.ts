import { Injectable, signal } from '@angular/core';
import { Location } from '../data/models';

export type CurrentLocation = Pick<Location, 'name' | 'kind'>;

/** Localización que se está gestionando. La publica su página y la muestra la barra superior. */
@Injectable({ providedIn: 'root' })
export class CurrentLocationService {
  readonly location = signal<CurrentLocation | null>(null);
}
