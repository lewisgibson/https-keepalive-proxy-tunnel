import { IResponse, SocketCluster } from '../src';

describe('SocketCluster', () => {
    let Cluster: SocketCluster | undefined;

    beforeAll(() => {
        Cluster = new SocketCluster({
            ServerHost: 'https://postman-echo.com/',
            Sockets: 10,
            TunnelHost: process.env.Proxy!,
        });
    });

    afterAll(() => {
        Cluster!.Destroy();
        Cluster = undefined;
    });

    test('Should Fetch Request', async () => {
        interface IAPIResponse {
            args: {
                i: number;
            };
            headers: Record<string, string>;
            url: string;
        }

        let Responses: IResponse<IAPIResponse>[] = [];
        let Err: Error | undefined;

        try {
            Responses = await Promise.all(
                Array.from({ length: 100 }, (_, i) =>
                    Cluster!.Request<IAPIResponse>('https://postman-echo.com/get', {
                        Headers: {
                            test: 123,
                        },
                        Query: {
                            i,
                        },
                    }),
                ),
            );
        } catch (e) {
            Err = e;
        }

        expect(Err).toBeUndefined();

        for (let i = 0; i < Responses.length; i++) expect(Responses[i].Body.args.i).toBe(i);
    }, 5000);
});
