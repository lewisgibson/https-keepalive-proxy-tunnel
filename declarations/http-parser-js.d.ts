declare module 'http-parser-js' {
    export class HTTPParser {
        public static encoding: string;

        public static readonly REQUEST: unique symbol;
        public static readonly RESPONSE: unique symbol;

        public static readonly kOnBody: unique symbol;
        public static readonly kOnExecute: unique symbol;
        public static readonly kOnHeaders: unique symbol;
        public static readonly kOnHeadersComplete: unique symbol;
        public static readonly kOnMessageComplete: unique symbol;

        public static maxHeaderSize: number;
        public static methods: string[];

        constructor(type: typeof HTTPParser.REQUEST | typeof HTTPParser.RESPONSE);

        public [HTTPParser.kOnHeaders](): void;
        public [HTTPParser.kOnHeadersComplete](Headers: { statusCode: number; headers: string[] }): void;
        public [HTTPParser.kOnBody](Chunk: Buffer, Offset: number, Length: number): void;
        public [HTTPParser.kOnMessageComplete](): void;

        public BODY_CHUNK(): void;
        public BODY_CHUNKEMPTYLINE(): void;
        public BODY_CHUNKHEAD(): void;
        public BODY_CHUNKTRAILERS(): void;
        public BODY_RAW(): void;
        public BODY_SIZED(): void;
        public HEADER(): any;
        public REQUEST_LINE(): void;
        public RESPONSE_LINE(): void;
        public close(): void;
        public consume(): void;
        public consumeLine(): any;
        public execute(chunk: string | Buffer, start?: number, length?: number): void;
        public finish(): any;
        public free(): void;
        public getAsyncId(): any;
        public getCurrentBuffer(): void;
        public initialize(type: any, asyncResource: any): void;
        public nextRequest(): void;
        public parseHeader(line: any, headers: any): void;
        public pause(): void;
        public reinitialize(type: any): void;
        public resume(): void;
        public shouldKeepAlive(): any;
        public unconsume(): void;
        public userCall(): any;
    }
}
