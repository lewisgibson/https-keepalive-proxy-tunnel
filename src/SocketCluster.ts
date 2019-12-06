import { IRequestOptions, IResponse, PersistentTunnelCtorOpts, PersistentTunnelSocket } from './PersistentTunnelSocket';

export class SocketCluster {
    /* Could use a WeakMap here? */
    /* Stores a list of Socket class instances to rotate */
    private Sockets: PersistentTunnelSocket[];

    /**
     * @description
     */
    public constructor(Options: PersistentTunnelCtorOpts & { Sockets: number }) {
        if (isNaN(Options.Sockets)) throw new Error('Cluster pool size must be a number');
        if (Options.Sockets < 1) throw new Error('Cluster pool size must be >= 1');
        if (Options.Sockets < 1) throw new Error('Cluster pool size must be >= 1');

        this.Sockets = Array.from({ length: Options.Sockets }, () => new PersistentTunnelSocket(Options));
    }

    public Request = <T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>> => {
        if (this.Sockets.length === 1) return this.Sockets[0].Request<T>(Url, Options);
        else return this.Sockets.sort((a, b) => a.QueueSize - b.QueueSize)[0].Request<T>(Url, Options);
    };

    public Destroy = (): void => {
        /* Destroy Socket Classes */
        for (const Socket of this.Sockets) Socket.Destroy();

        /* Remove References */
        this.Sockets = (undefined as unknown) as never[];
    };
}
