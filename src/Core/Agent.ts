/* Types */
import { IRequestOptions } from '../Types/IRequestOptions';
import { IResponse } from '../Types/IResponse';
/* Pool */
import { Pool } from './Pool';

export class Agent {
    public static Pipelining = 1;
    public static PoolSize = 10;

    private static SocketStore = new Map<string, Pool>();

    /**
     * @description Creates or uses an existing socket pool to send a HTTP/1.1 request.
     *
     * @param Url The endpoint the request path will be extracted from.
     * @param Tunnel The proxy to use to establish a tunnel connection.
     * @param Options Additional options to pass to the request such as headers or form data.
     *
     * @returns A promise which resolves to an object containing the response body, headers and status code.
     */
    public static Request<T = string>(Url: string, Tunnel: string, Options?: IRequestOptions): Promise<IResponse<T>> {
        const Key = this.CreateStoreKey(Url, Tunnel);
        let SocketPool = this.SocketStore.get(Key);

        if (typeof SocketPool === 'undefined') {
            SocketPool = new Pool({
                Pipelining: this.Pipelining,
                ServerHost: Url,
                Sockets: this.PoolSize,
                TunnelHost: Tunnel,
            });

            this.SocketStore.set(Key, SocketPool);
        }

        return SocketPool.Request<T>(Url, Options);
    }

    /**
     * @description
     */
    public static Destroy(): void {
        for (const Identifier of this.SocketStore.keys()) {
            this.SocketStore.get(Identifier)!.Destroy();
            this.SocketStore.delete(Identifier);
        }

        this.SocketStore = (undefined as unknown) as Map<string, Pool>;
    }

    private static CreateStoreKey = (ServerHost: string, TunnelHost: string): string => `${TunnelHost}_${ServerHost}`;
}
