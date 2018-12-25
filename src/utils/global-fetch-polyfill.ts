import * as nodeFetch from 'node-fetch';

const globalAny = global as any;

if (!globalAny.fetch) {
  globalAny.fetch = nodeFetch;
  globalAny.Response = nodeFetch.Response;
  globalAny.Headers = nodeFetch.Headers;
  globalAny.Request = nodeFetch.Request;
}
