import { Agent, IResponse } from '../src';

describe('Pool', () => {
    beforeAll(() => {
        Agent.PoolSize = 10;
        Agent.Pipelining = 1;
    });

    afterAll(() => {
        Agent.Destroy();
    });

    test('100 Unique Requests', async () => {
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
                    Agent.Request<IAPIResponse>('https://postman-echo.com/get', process.env.Proxy!, {
                        Headers: {
                            test: '123',
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

        for (let i = 0; i < Responses.length; i++) expect(Responses[i].Body.args.i).toBe(i.toString());
    }, 5000);
});
