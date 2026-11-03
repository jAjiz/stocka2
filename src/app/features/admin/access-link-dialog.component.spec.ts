import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AccessLinkDialogComponent } from './access-link-dialog.component';

const url = 'https://app.test/acceso?t=h';

async function setup(share?: (d: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: { name: 'Pedro', link: { url, expiresAt: new Date('2026-11-04T10:00:00Z') } },
      },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AccessLinkDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as
      HTMLButtonElement | undefined;
  return { el, button, writeText };
}

describe('AccessLinkDialogComponent', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('sin Web Share no hay botón Compartir; Copiar copia la URL', async () => {
    const { el, button, writeText } = await setup();
    expect(button('Compartir')).toBeUndefined();
    button('Copiar')!.click();
    expect(writeText).toHaveBeenCalledWith(url);
    expect(el.textContent).toContain('Envía este enlace a Pedro');
    expect(el.textContent).toContain('Caduca el');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe(url);
  });

  it('con Web Share, Compartir comparte la URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const { button } = await setup(share);
    button('Compartir')!.click();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url }));
  });
});
