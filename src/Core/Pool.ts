/* Types */
import { IRequestable } from '../Types/IRequestable';
import { IRequestOptions } from '../Types/IRequestOptions';
import { IResponse } from '../Types/IResponse';
/* Socket */
import { Socket, SocketCtorOpts } from './Socket';

export class Pool implements IRequestable {
    /* Stores a list of socket class instances to rotate */
    private Sockets: Socket[];

    public constructor(Options: SocketCtorOpts & { Sockets: number }) {
        if (isNaN(Options.Sockets)) throw new Error('Cluster pool size must be a number');
        if (Options.Sockets < 1) throw new Error('Cluster pool size must be >= 1');
        if (Options.Sockets < 1) throw new Error('Cluster pool size must be >= 1');

        this.Sockets = Array.from({ length: Options.Sockets }, () => new Socket(Options));
    }

    /**
     * @description Performs a HTTP/1.1 Request on a Socket in the pool
     *
     * @param Url The endpoint the request path will be extracted from
     * @param Options Additional options to pass to the request such as headers or form data.
     *
     * @returns A promise which resolves to an object containing the response body, headers and status code.
     */
    public Request = <T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>> => {
        if (this.Sockets.length === 1) return this.Sockets[0].Request<T>(Url, Options);
        else return this.Sockets.sort((a, b) => a.QueueSize - b.QueueSize)[0].Request<T>(Url, Options);
    };

    /**
     * @description Destroys all of the sockets in the class and voids all references.
     */
    public Destroy = (): void => {
        /* Destroy Socket Classes */
        for (const Socket of this.Sockets) Socket.Destroy();

        /* Remove References */
        this.Sockets = (undefined as unknown) as never[];
    };
}
