import { IResponse, PersistentTunnelSocket } from '../src/PersistentTunnelSocket';

describe('PersistentTunnelSocket', () => {
    test('Should Work in Series', async () => {
        const Tunnel = new PersistentTunnelSocket('http://roblox:roblox@207.148.12.234:80', 'https://catalog.roblox.com');
        const Responses: (IResponse | null)[] = [];

        for (let i = 0; i < 1; i++)
            try {
                Responses.push(
                    await Tunnel.Request('https://catalog.roblox.com/v1/search/items', {
                        Query: {
                            category: 'Collectibles',
                            limit: 100,
                        },
                    }),
                );
            } catch (Err) {
                Responses.push(null);
            }

        Tunnel.Destroy();

        console.log(Responses[0]);

        expect(Responses.includes(null)).toBeFalsy();
    });
});
