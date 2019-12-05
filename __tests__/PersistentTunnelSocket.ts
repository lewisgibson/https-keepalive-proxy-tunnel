import { PersistentTunnelSocket } from '../src/PersistentTunnelSocket';

describe('PersistentTunnelSocket', () => {
    let Tunnel: PersistentTunnelSocket | undefined;

    beforeAll(() => {
        Tunnel = new PersistentTunnelSocket(process.env.Proxy!, 'https://postman-echo.com/');
    });

    afterAll(() => {
        Tunnel!.Destroy();
        Tunnel = undefined;
    });

    test('Should Fetch Request', async () => {
        let Err: Error | undefined;

        try {
            await Tunnel!.Request('https://postman-echo.com/get', {
                Headers: {
                    test: 123,
                },
                Query: {
                    foo1: 'bar1',
                    foo2: 'bar2',
                },
            });
        } catch (e) {
            Err = e;
        }

        expect(Err).toBeUndefined();
    });
});
