import { saveBlob } from './download';

describe('saveBlob', () => {
  it('descarga el blob con el nombre indicado y libera la URL', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('x.xlsx');
      expect(this.href).toBe('blob:x');
    });
    const blob = new Blob(['a']);
    saveBlob(blob, 'x.xlsx');
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
