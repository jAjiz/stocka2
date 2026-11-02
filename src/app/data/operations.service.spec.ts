import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../core/supabase';
import { OperationsService } from './operations.service';

function setup(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: { rpc } }] });
  return { rpc, service: TestBed.inject(OperationsService) };
}

describe('OperationsService', () => {
  it('llama a perform_operation con los parámetros mapeados', async () => {
    const { rpc, service } = setup({ data: 'op1', error: null });
    const id = await service.perform({
      kind: 'move',
      locationId: 'l1',
      originId: 'o1',
      notes: 'n',
      lines: [{ itemId: 'a', quantity: 2 }],
      operationId: 'id-1',
    });
    expect(id).toBe('op1');
    expect(rpc).toHaveBeenCalledWith('perform_operation', {
      p_kind: 'move',
      p_location_id: 'l1',
      p_lines: [{ item_id: 'a', quantity: 2 }],
      p_origin_id: 'o1',
      p_reference: null,
      p_notes: 'n',
      p_operation_id: 'id-1',
    });
  });

  it('envía null cuando faltan origen, referencia, notas e id de operación', async () => {
    const { rpc, service } = setup({ data: 'op2', error: null });
    await service.perform({ kind: 'add', locationId: 'l1', lines: [{ itemId: 'a', quantity: 1 }] });
    expect(rpc).toHaveBeenCalledWith(
      'perform_operation',
      expect.objectContaining({
        p_origin_id: null,
        p_reference: null,
        p_notes: null,
        p_operation_id: null,
      }),
    );
  });

  it('lanza el error devuelto', async () => {
    const err = { message: 'forbidden' };
    const { service } = setup({ data: null, error: err });
    await expect(
      service.perform({ kind: 'add', locationId: 'l1', lines: [{ itemId: 'a', quantity: 1 }] }),
    ).rejects.toBe(err);
  });
});
