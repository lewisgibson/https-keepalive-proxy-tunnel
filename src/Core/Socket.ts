/* Dependencies */
import { AsyncQueue } from '@robinlemon/priority-concurrency-queue';
import * as http from 'http';
import { HTTPParser } from 'http-parser-js';
import * as net from 'net';
import * as querystring from 'querystring';
import * as stream from 'stream';
import * as tls from 'tls';
import * as url from 'url';
import * as zlib from 'zlib';

/* Types */
import { IRequestable } from '../Types/IRequestable';
import { IRequestOptions } from '../Types/IRequestOptions';
import { IResponse } from '../Types/IResponse';

export interface SocketCtorOpts {
    TunnelHost: string;
    ServerHost: string;
    Pipelining?: number;
}

export class Socket implements IRequestable {
    private Socket: tls.TLSSocket | undefined;
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

    private BrotliPipe!: zlib.BrotliDecompress;
    private UnzipPipe!: zlib.Unzip;

    private InPipe!: stream.PassThrough;
    private OutPipe!: stream.PassThrough;

    private RequestKiller?: (Reason?: Error) => void;

    private RequestQueue: AsyncQueue;

    public constructor({ ServerHost, TunnelHost, Pipelining }: SocketCtorOpts) {
        this.TunnelHost = url.parse(TunnelHost, false, true);
        this.ServerHost = url.parse(ServerHost, false, true);

        this.RequestQueue = new AsyncQueue({
            AutoStart: true,
            Concurrency: Pipelining ?? 1,
        });

        this.Connect();
    }

    /**
     * @returns The length of requests in the queue waiting to be processed.
     */
    public get QueueSize(): number {
        return this.RequestQueue.Tasks;
    }

    /**
     * @description Destroys the internal pipes, HTTP parser and (net|tls).Socket instance then stops the request queue.
     *              All property references are voided.
     */
    public Destroy = (Err?: Error): void => {
        /* Disconnect Socket */
        this.Destroyed = true;
        this.Disconnect(Err);

        /* Destroy HTTP Parser */
        this.Parser.close();

        /* Destroy Pipes */
        this.InPipe.removeAllListeners();
        this.InPipe.destroy();
        this.InPipe = (undefined as unknown) as stream.PassThrough;

        this.OutPipe.removeAllListeners();
        this.OutPipe.destroy();
        this.OutPipe = (undefined as unknown) as stream.PassThrough;

        this.UnzipPipe.removeAllListeners();
        this.UnzipPipe.destroy();
        this.UnzipPipe = (undefined as unknown) as zlib.Unzip;

        this.BrotliPipe.removeAllListeners();
        this.BrotliPipe.destroy();
        this.BrotliPipe = (undefined as unknown) as zlib.BrotliDecompress;

        /* Stop Queue Processing */
        if (this.RequestQueue.isRunning) {
            this.RequestQueue.Clear();
            this.RequestQueue.Stop();
        }
    };

    /**
     * @description Performs a HTTP/1.1 Request on a Socket in the pool
     *
     * @param Url The endpoint the request path will be extracted from
     * @param Options Additional options to pass to the request such as headers or form data.
     *
     * @returns A promise which resolves to an object containing the response body, headers and status code.
     */
    public Request = <T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>> =>
        new Promise<IResponse<T>>((Resolve, Reject) => {
            this.RequestQueue.Add({
                Priority: 1,
                Task: (): Promise<void> =>
                    this.RequestTask<T>(Url, Options)
                        .then(Resolve)
                        .catch(Reject),
            });
        });

    private RequestTask = <T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>> => {
        let TimeoutRejector: () => void;
        let TimeoutID: NodeJS.Timeout;

        return Promise.race([
            new Promise<never>((_Resolve, Reject) => {
                TimeoutRejector = Reject;
                TimeoutID = setTimeout(Reject, Options?.Timeout ?? 30000, new Error('Timed Out'));
            }),
            /* eslint-disable-next-line no-async-promise-executor */
            new Promise<IResponse<T>>(async (Resolve, Reject) => {
                const ReturnResult = (Result: IResponse<T>): void => {
                    Resolve(Result);
                    clearTimeout(TimeoutID);
                    TimeoutRejector();
                };

                const RejectError = (Err?: Error): void => {
                    Reject(Err);
                    TimeoutRejector();
                    clearTimeout(TimeoutID);
                };

                if (!this.Socket || !this.Socket.writable) {
                    if (!this.Connecting) this.Connect();
                    await this.ConnectionPromise;
                }

                this.RequestKiller = RejectError;

                /* Setup Response */
                this.Parser[HTTPParser.kOnHeaders] = (): void => undefined;
                this.Parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }): void => {
                    this.Headers = this.ParseHeaders(headers, Options?.EvaluateHeaders);
                    this.StatusCode = statusCode;
                    this.Body = '';

                    this.InPipe = new stream.PassThrough();
                    this.OutPipe = new stream.PassThrough();
                    this.BrotliPipe = zlib.createBrotliDecompress();
                    this.UnzipPipe = zlib.createUnzip();

                    this.OutPipe.on('data', (Chunk: Buffer) => (this.Body += Chunk.toString('utf8')));
                    this.OutPipe.on('end', () => {
                        if ((this.Headers['content-type'] as string | undefined)?.includes('application/json') || Options?.ParseJSON === true) {
                            try {
                                this.Body = JSON.parse(this.Body);
                            } catch (Err) {
                                RejectError(Err);
                            }
                        }

                        ReturnResult({
                            Body: (this.Body as unknown) as T,
                            Headers: this.Headers,
                            StatusCode: this.StatusCode,
                        });
                    });

                    switch (this.Headers?.['content-encoding']) {
                        case 'br':
                            this.InPipe.pipe(this.BrotliPipe).pipe(this.OutPipe);
                            break;

                        case 'gzip':
                        case 'deflate':
                            this.InPipe.pipe(this.UnzipPipe).pipe(this.OutPipe);
                            break;

                        default:
                            this.InPipe.pipe(this.OutPipe);
                            break;
                    }
                };

                this.Parser[HTTPParser.kOnBody] = (Chunk, Offset, Length): void => {
                    this.InPipe.push(Chunk.slice(Offset, Offset + Length));
                };

                this.Parser[HTTPParser.kOnMessageComplete] = (): void => {
                    this.InPipe.push(null);
                };

                /* Write Request */
                const { pathname, query: UrlQuery } = url.parse(Url, true, true);
                const QueryStr = querystring.stringify({ ...UrlQuery, ...Options?.Query });
                const FullPath = `${pathname ?? '/'}${QueryStr?.length ? '?' + QueryStr : ''}`;
                const RequestLines: string[] = [];

                /* Primary Request Headers */
                this.Socket!.cork();
                RequestLines.push(`${Options?.Method ?? 'GET'} ${FullPath} HTTP/1.1\r\n`);
                RequestLines.push(`Host: ${this.ServerHost.hostname}\r\n`);
                RequestLines.push(`Accept: */*\r\n`);
                RequestLines.push(`Accept-Encoding: br;q=1.0, gzip;q=0.8, deflate;q=0.6, *;q=0.1\r\n`);

                /* Custom Request Headers */
                if (typeof Options?.Headers === 'object') {
                    Options.Headers = Object.entries(Options.Headers).reduce<Record<string, string | number>>(
                        (Builder, [Key, Val]) => ({ ...Builder, [Key.toLowerCase()]: Val!.toString() }),
                        {} as Record<string, string | number>,
                    );

                    for (const [Key, Value] of Object.entries(Options?.Headers)) RequestLines.push(`${Key}: ${Value!.toString()}\r\n`);
                }

                /* Request Body */
                let RequestBody = '';

                if (typeof Options?.Form === 'object') {
                    if (!Options?.Headers?.hasOwnProperty('content-type')) RequestLines.push(`Content-Type: application/x-www-form-urlencoded\r\n`);

                    RequestBody = querystring.stringify(Options.Form as querystring.ParsedUrlQueryInput);
                } else if (typeof Options?.Body === 'object') {
                    if (!Options?.Headers?.hasOwnProperty('content-type')) RequestLines.push(`Content-Type: application/json\r\n`);

                    RequestBody = JSON.stringify(Options?.Body) ?? '';
                }

                if (Options?.Headers?.hasOwnProperty('content-length')) RequestLines.push('\r\n');
                else RequestLines.push(`Content-Length: ${Buffer.byteLength(RequestBody)}\r\n\r\n`);
                RequestLines.push(RequestBody);

                /* End Request */
                RequestLines.push('\r\n');
                this.Socket?.write(RequestLines.join(''));
                this.Socket!.uncork();
            }),
        ]);
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

        this.Socket?.destroy(Err);
        this.Socket?.removeAllListeners();
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
            let Value = Headers[Line + 1];

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
