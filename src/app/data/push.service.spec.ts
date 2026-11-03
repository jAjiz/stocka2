import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { SUPABASE } from '../core/supabase';
import { PushService } from './push.service';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

function fakeSubscription(endpoint = 'https://push.example/abc') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }),
  } as unknown as PushSubscription;
}

function setup(opts: { isEnabled?: boolean; subscription?: PushSubscription | null } = {}) {
  const subscription$ = new BehaviorSubject<PushSubscription | null>(opts.subscription ?? null);
  const swPush = {
    isEnabled: opts.isEnabled ?? true,
    subscription: subscription$.asObservable(),
    requestSubscription: vi.fn().mockImplementation(async () => {
      const sub = fakeSubscription();
      subscription$.next(sub);
      return sub;
    }),
    unsubscribe: vi.fn().mockImplementation(async () => subscription$.next(null)),
  };
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  TestBed.configureTestingModule({
    providers: [
      { provide: SwPush, useValue: swPush },
      { provide: SUPABASE, useValue: { rpc } },
    ],
  });
  return { push: TestBed.inject(PushService), swPush, rpc, subscription$ };
}

describe('PushService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('en iPhone fuera de modo standalone pide instalar la aplicación', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    const { push } = setup({ isEnabled: false });
    expect(push.status()).toBe('ios-install');
  });

  it('sin service worker y fuera de iOS no se admite', () => {
    const { push } = setup({ isEnabled: false });
    expect(push.status()).toBe('unsupported');
  });

  it('refleja si el dispositivo está suscrito', () => {
    const off = setup();
    expect(off.push.status()).toBe('off');
    TestBed.resetTestingModule();
    const on = setup({ subscription: fakeSubscription() });
    expect(on.push.status()).toBe('on');
  });

  it('enable suscribe con la clave del entorno y guarda endpoint y claves', async () => {
    const { push, swPush, rpc } = setup();
    await push.enable();
    expect(swPush.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: environment.vapidPublicKey,
    });
    expect(rpc).toHaveBeenCalledWith('save_push_subscription', {
      p_endpoint: 'https://push.example/abc',
      p_p256dh: 'P256',
      p_auth: 'AUTH',
      p_user_agent: navigator.userAgent,
    });
    expect(push.status()).toBe('on');
  });

  it('enable: si falla la RPC cancela la suscripción y rechaza', async () => {
    const { push, swPush, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(push.enable()).rejects.toBeTruthy();
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(push.status()).toBe('off');
  });

  it('enable: si el usuario bloquea el permiso queda en denied sin error', async () => {
    const { push, swPush, rpc } = setup();
    swPush.requestSubscription.mockRejectedValue(new Error('denied'));
    vi.stubGlobal('Notification', { permission: 'denied' });
    await expect(push.enable()).resolves.toBeUndefined();
    expect(push.status()).toBe('denied');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('disable borra la suscripción en el servidor y en el navegador', async () => {
    const { push, swPush, rpc } = setup({ subscription: fakeSubscription() });
    await push.disable();
    expect(rpc).toHaveBeenCalledWith('delete_push_subscription', {
      p_endpoint: 'https://push.example/abc',
    });
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(push.status()).toBe('off');
  });

  it('forgetDevice nunca rechaza, aunque falle la RPC', async () => {
    const { push, rpc } = setup({ subscription: fakeSubscription() });
    rpc.mockRejectedValue(new Error('sin red'));
    await expect(push.forgetDevice()).resolves.toBeUndefined();
  });

  it('forgetDevice suelta la suscripción del navegador aunque falle la RPC', async () => {
    const { push, swPush, rpc } = setup({ subscription: fakeSubscription() });
    rpc.mockRejectedValue(new Error('sin red'));
    await expect(push.forgetDevice()).resolves.toBeUndefined();
    expect(swPush.unsubscribe).toHaveBeenCalled();
  });

  it('forgetDevice borra la suscripción aunque la señal aún no se haya poblado', async () => {
    const { push, rpc, swPush } = setup();
    // El observable de SwPush todavía no ha emitido cuando se cierra sesión.
    const late = new Subject<PushSubscription | null>();
    (swPush as { subscription: unknown }).subscription = late.asObservable();
    const pending = push.forgetDevice();
    late.next(fakeSubscription('https://push.example/tardia'));
    await pending;
    expect(rpc).toHaveBeenCalledWith('delete_push_subscription', {
      p_endpoint: 'https://push.example/tardia',
    });
  });
});
