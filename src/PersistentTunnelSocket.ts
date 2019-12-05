import * as http from 'http';
import { HTTPParser } from 'http-parser-js';
import * as net from 'net';
import * as querystring from 'querystring';
import * as stream from 'stream';
import * as tls from 'tls';
import * as url from 'url';
import * as zlib from 'zlib';

/**
 *
 */
export type IRequestOptions = {
    Method?: string;
    Headers?: Record<string, string | number>;
    Query?: object;
    Form?: object;
    Body?: string | object;
    Timeout?: number;
    ParseJSON?: boolean;
    EvaluateHeaders?: boolean;
};

/**
 *  @description A response object.
 */
export interface IResponse<T = string> {
    Body: T;
    Headers: Record<string, string | number>;
    StatusCode: number;
}

/**
 * @description
 */
export class PersistentTunnelSocket {
    private Socket!: tls.TLSSocket;
    private Parser = new HTTPParser(HTTPParser.RESPONSE);

    private Destroyed = false;
    private Connecting = false;
    private ConnectionPromise?: Promise<void>;
    private ConnectionResolver?: () => void;

    private Headers!: IResponse['Headers'];
    private StatusCode!: IResponse['StatusCode'];
    private Body!: IResponse['Body'];

    private TunnelHost: url.UrlWithStringQuery;
    private ServerHost: url.UrlWithStringQuery;

    private DecompressionPipe!: stream.PassThrough | zlib.BrotliDecompress | zlib.Unzip;

    private RequestKiller?: (Reason?: Error | string) => void;

    public constructor(TunnelHost: string, ServerHost: string) {
        this.TunnelHost = url.parse(TunnelHost, false, true);
        this.ServerHost = url.parse(ServerHost, false, true);

        this.Connect();
    }

    public Request = <T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>> => {
        return Promise.race([
            new Promise<never>((_Resolve, Reject) => {
                setTimeout(Reject, Options?.Timeout ?? 30000);
            }),
            /* eslint-disable-next-line no-async-promise-executor */
            new Promise<IResponse<T>>(async (Resolve, Reject) => {
                if (!this.Socket || !this.Socket.writable) {
                    if (!this.Connecting) this.Connect();
                    await this.ConnectionPromise;
                }

                this.RequestKiller = Reject;
                //this.RequestFinaliser = Resolve;

                /**
                 * Setup Response
                 */
                this.Parser[HTTPParser.kOnHeaders] = (): void => undefined;
                this.Parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }): void => {
                    this.Headers = this.ParseHeaders(headers, Options?.EvaluateHeaders);
                    this.StatusCode = statusCode;

                    switch (this.Headers?.['content-encoding']) {
                        case 'br':
                            this.DecompressionPipe = zlib.createBrotliDecompress();
                            break;

                        case 'gzip':
                        case 'deflate':
                            this.DecompressionPipe = zlib.createUnzip();
                            break;

                        default:
                            this.DecompressionPipe = new stream.PassThrough();
                            break;
                    }

                    this.DecompressionPipe.on('data', (Chunk: Buffer) => (this.Body += Chunk.toString('utf8')));
                    this.DecompressionPipe.on('end', () => {
                        if (this.Headers['content-type'] === 'application/json' || Options?.ParseJSON === true) {
                            try {
                                this.Body = JSON.parse(this.Body);
                            } catch (Err) {
                                Reject(Err);
                            }
                        }

                        Resolve({
                            Body: (this.Body as unknown) as T,
                            Headers: this.Headers,
                            StatusCode: this.StatusCode,
                        });
                    });
                };

                this.Parser[HTTPParser.kOnBody] = (Chunk, Offset, Length): void => {
                    this.DecompressionPipe.write(Chunk.slice(Offset, Offset + Length));
                };

                this.Parser[HTTPParser.kOnMessageComplete] = (): void => {
                    this.DecompressionPipe.push(null);
                };

                /**
                 * Write Request
                 */
                const { pathname, query: UrlQuery } = url.parse(Url, true, true);
                const QueryStr = querystring.stringify({ ...UrlQuery, ...Options?.Query });
                const FullPath = `${pathname ?? '/'}${QueryStr?.length ? '?' + QueryStr : ''}`;

                /* Primary Request Headers */
                this.Socket.cork();
                this.Socket.write(`${Options?.Method ?? 'GET'} ${FullPath} HTTP/1.1\r\n`);
                this.Socket.write(`Host: ${this.ServerHost.hostname}\r\n`);
                this.Socket.write(`Accept: */*\r\n`);
                //this.Socket.write(`Accept-Encoding: br;q=1.0, gzip;q=0.8, deflate;q=0.6, *;q=0.1\r\n`);

                /* Custom Request Headers */
                if (typeof Options?.Headers === 'object') {
                    Options.Headers = Object.entries(Options.Headers).reduce<Record<string, string | number>>(
                        (Builder, [Key, Val]) => ({ ...Builder, [Key.toLowerCase()]: Val.toString() }),
                        {} as Record<string, string | number>,
                    );

                    for (const [Key, Value] of Object.entries(Options?.Headers)) this.Socket.write(`${Key}: ${Value.toString()}\r\n`);
                }

                /* Request Body */
                const RequestBody = JSON.stringify(Options?.Body) ?? '';
                if (Options?.Headers?.hasOwnProperty('content-length')) this.Socket.write('\r\n');
                else this.Socket.write(`content-length: ${Buffer.byteLength(RequestBody)}\r\n\r\n`);
                this.Socket.write(RequestBody);

                /* End Request */
                this.Socket.write('\r\n');
                this.Socket.uncork();
            }),
        ]);
    };

    public Destroy = (Err?: Error): void => {
        this.Destroyed = true;
        this.Socket.destroy(Err);
        this.Parser.close();
    };

    private Connect = (): void => {
        this.Connecting = true;
        this.ConnectionPromise = new Promise<void>(Resolver => (this.ConnectionResolver = Resolver));

        const Tunnel = http.request({
            ...(this.TunnelHost.auth && {
                headers: {
                    'Proxy-Authorization': `Basic ${Buffer.from(this.TunnelHost.auth).toString('base64')}`,
                },
            }),
            host: this.TunnelHost.hostname,
            method: 'CONNECT',
            path: `${this.ServerHost.hostname}:443`,
            port: this.TunnelHost.port,
        });

        Tunnel.once('connect', (_, TunnelSocket: net.Socket) => {
            this.Socket = tls.connect({ rejectUnauthorized: false, socket: TunnelSocket });

            this.Socket.setNoDelay(true);
            this.Socket.setKeepAlive(true);
            this.Socket.setMaxListeners(100);

            this.Socket.on('error', (Err: Error) => this.Reconnect(Err));
            this.Socket.on('end', () => this.Reconnect());
            this.Socket.on('finish', () => this.Reconnect());
            this.Socket.on('data', (Chunk: Buffer) => this.Parser.execute(Chunk));

            this.Connecting = false;
            this.ConnectionResolver?.();
        });

        Tunnel.once('error', (Err: Error) => {
            if (!Tunnel.destroyed) Tunnel.destroy(Err);
            this.Reconnect(Err);
        });

        Tunnel.end();
    };

    private Disconnect = (Err?: Error): void => {
        this.RequestKiller?.(Err);

        this.Socket.destroy(Err);
        this.Socket.removeAllListeners();
    };

    private Reconnect = (Err?: Error): void => {
        if (this.Destroyed) return;

        this.Disconnect(Err);
        this.Connect();
    };

    private ParseHeaders = (Headers: string[], EvaluateHeaders = true): Record<string, string | number> => {
        const Builder: Record<string, string | number> = {};

        for (let Line = 0; Line < Headers.length; Line += 2) {
            const HeaderName = Headers[Line].toLowerCase();
            let Value = Headers[Line + 1].toLowerCase();

            if (EvaluateHeaders) {
                try {
                    Value = eval(Value);
                } catch (Err) {
                    // Not passable
                }
            }

            Builder[HeaderName] = Value;
        }

        return Builder;
    };
}
