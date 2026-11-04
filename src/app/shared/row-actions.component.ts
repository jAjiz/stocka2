import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

export interface RowAction {
  label: string;
  run: () => void;
}

/** Acciones de una fila: botones si hay sitio y un menú ⋮ en el móvil. */
@Component({
  selector: 'app-row-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  styles: `
    :host {
      display: block;
      flex: none;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 4px;
    }
    .more {
      display: none;
    }
    @media (min-width: 1000px) {
      .buttons {
        flex-wrap: nowrap;
      }
      button {
        white-space: nowrap;
      }
    }
    @media (max-width: 599px) {
      .buttons {
        display: none;
      }
      .more {
        display: inline-block;
      }
    }
  `,
  template: `
    <div class="buttons">
      @for (a of actions(); track a.label) {
        <button mat-button type="button" (click)="a.run()">{{ a.label }}</button>
      }
    </div>
    <button
      class="more"
      mat-icon-button
      type="button"
      [attr.aria-label]="'Acciones de ' + name()"
      [matMenuTriggerFor]="menu"
    >
      <mat-icon>more_vert</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @for (a of actions(); track a.label) {
        <button mat-menu-item type="button" (click)="a.run()">{{ a.label }}</button>
      }
    </mat-menu>
  `,
})
export class RowActionsComponent {
  readonly actions = input.required<RowAction[]>();
  /** A quién pertenecen las acciones: lo necesita quien no ve la fila. */
  readonly name = input.required<string>();
}
