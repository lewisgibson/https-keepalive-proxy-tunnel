import { IRequestOptions } from './IRequestOptions';
import { IResponse } from './IResponse';

export interface IRequestable {
    Request<T = string>(Url: string, Options?: IRequestOptions): Promise<IResponse<T>>;
}
