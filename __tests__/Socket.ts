import { IRequestOptions, IResponse } from '../src';
import { Socket } from '../src/Core/Socket';

describe('Socket', () => {
    let Tunnel: Socket | undefined;

    beforeAll(() => {
        Tunnel = new Socket({
            ServerHost: 'https://postman-echo.com/',
            TunnelHost: process.env.Proxy!,
        });
    });

    afterAll(() => {
        Tunnel!.Destroy();
        Tunnel = undefined;
    });

    test.each(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] as NonNullable<IRequestOptions['Method']>[])(
        'Should Send %s Request',
        async Method => {
            let Err: Error | undefined;

            try {
                await Tunnel!.Request(`https://postman-echo.com/${Method}`, {
                    Body: 'test',
                    Method,
                });
            } catch (e) {
                Err = e;
            }

            expect(Err).toBeUndefined();
        },
        5000,
    );

    test('Should Send Body', async () => {
        interface IPostResponse {
            json?: {
                test?: string;
            };
        }

        let Response: IResponse<IPostResponse> | undefined;
        let Err: Error | undefined;

        try {
            Response = await Tunnel!.Request<IPostResponse>('https://postman-echo.com/post', {
                Body: {
                    test: '123',
                },
                Method: 'POST',
            });
        } catch (e) {
            Err = e;
        }

        expect(Err).toBeUndefined();
        expect(Response?.Body.json?.test).toBe('123');
    }, 10000);

    test('Should Send Headers', async () => {
        interface IHeaderResponse {
            headers?: Record<string, string>;
        }

        let Response: IResponse<IHeaderResponse> | undefined;
        let Err: Error | undefined;

        try {
            Response = await Tunnel!.Request<IHeaderResponse>('https://postman-echo.com/get', {
                Headers: {
                    'my-custom-header': 'Some Value',
                },
                Method: 'GET',
            });
        } catch (e) {
            Err = e;
        }

        expect(Err).toBeUndefined();
        expect(Response?.Body.headers?.['my-custom-header']).toBe('Some Value');
    }, 5000);

    test('Should Send Forms', async () => {
        interface IFormResponse {
            form?: {
                'Some Key'?: number;
            };
        }

        let Response: IResponse<IFormResponse> | undefined;
        let Err: Error | undefined;

        try {
            Response = await Tunnel!.Request<IFormResponse>('https://postman-echo.com/post', {
                Form: {
                    'Some Key': 'Some Value',
                },
                Method: 'POST',
            });
        } catch (e) {
            Err = e;
        }

        expect(Err).toBeUndefined();
        expect(Response?.Body.form?.['Some Key']).toBe('Some Value');
    }, 5000);

    test('1 Unique Request', async () => {
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
    }, 5000);
});
