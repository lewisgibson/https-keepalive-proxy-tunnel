<p align='center'>
  <h3 align='center'>https-keepalive-proxy-tunnel</h3>
  <p align='center'>A library to keep-alive and write requests directly onto a Net/TLS socket for HTTP and HTTPS requests.</p>

  <p align='center'>
    <a href='https://www.npmjs.com/package/@robinlemon/https-keepalive-proxy-tunnel'><img src='https://img.shields.io/npm/v/@robinlemon/https-keepalive-proxy-tunnel.svg' alt='NPM Package' /></a>
    <a href='https://travis-ci.com/Robinlemon/https-keepalive-proxy-tunnel'><img src='https://travis-ci.com/Robinlemon/https-keepalive-proxy-tunnel.svg?branch=master' alt='Build Status' /></a>
    <a href='https://codecov.io/gh/Robinlemon/https-keepalive-proxy-tunnel'><img src='https://codecov.io/gh/Robinlemon/https-keepalive-proxy-tunnel/branch/master/graph/badge.svg' alt='Coverage Status' /></a>
    <a href='https://github.com/codechecks/typecov'><img src='https://img.shields.io/badge/dynamic/json.svg?label=type-coverage&prefix=%E2%89%A5&suffix=%&query=$.typeCoverage.atLeast&uri=https://raw.githubusercontent.com/Robinlemon/https-keepalive-proxy-tunnel/master/package.json' alt='TypeCov' /></a>
    <a href='https://codechecks.io'><img src='https://raw.githubusercontent.com/codechecks/docs/master/images/badges/badge-green.svg?sanitize=true' alt='Codechecks' /></a>
  </p>
</p>

## Installation

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/).

Before installing, [download and install Node.js](https://nodejs.org/en/download/).
Node.js 6.0 or higher is required.

Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```bash
# NPM Users
$ npm install --save @robinlemon/https-keepalive-proxy-tunnel

# Yarn Users
$ yarn add @robinlemon/https-keepalive-proxy-tunnel
```

## Usage

### Quickstart

```ts
import { Agent } from '@robinlemon/https-keepalive-proxy-tunnel';

/**
 * Simple
 */
const { Body, Response, StatusCode } = await Agent.Request('https://www.google.com/', 'http://username?:password?@domain-or-ip:port?/');

/**
 * Custom Types
 */
interface IApiResponse {
    response: {
        id: number;
        name: string;
    }[];
}
const { Body, Response, StatusCode } = await Agent.Request<IApiResponse>(
    'https://www.google.com/some/random/api/path/post',
    'http://username?:password?@domain-or-ip:port?/',
    {
        Method: 'POST',
        Headers: {
            'X-CSRF-TOKEN': 'MySecurityToken',
        },
    },
);
```

See [`__tests__`](__tests__) for more examples.

## Tests

To run the test suite, first install the dependencies, then run `npm test`:

```bash
# NPM Users
$ npm install
$ npm test

# Yarn Users
$ yarn
$ yarn test
```

## License

[MIT](LICENSE)
