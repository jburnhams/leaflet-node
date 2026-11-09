import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createCanvas } from '@napi-rs/canvas';
import {
  DEFAULT_USER_AGENT,
  loadImageSource,
  resolveProxyDispatcher,
} from '../src/image.js';

const PROXY_ENV_KEYS = [
  'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy',
  'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
];

function makePng(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: http.Server): Promise<void> {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('loadImageSource', () => {
  const png = makePng(4, 3);
  const requests: http.IncomingHttpHeaders[] = [];
  let tileServer: http.Server;
  let tilePort: number;
  let proxyServer: http.Server;
  let proxyPort: number;
  let proxyHits = 0;
  let savedEnv: Record<string, string | undefined>;
  let tmpDir: string;

  beforeAll(async () => {
    tileServer = http.createServer((req, res) => {
      requests.push(req.headers);
      if (req.url?.startsWith('/missing')) {
        res.writeHead(404, 'Not Found');
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
    });
    tilePort = await listen(tileServer);

    // Minimal forward proxy supporting both absolute-form requests and CONNECT tunnels
    proxyServer = http.createServer((req, res) => {
      proxyHits += 1;
      const target = new URL(req.url ?? '/');
      const upstream = http.request(
        { host: target.hostname, port: target.port, path: target.pathname, headers: req.headers },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        }
      );
      req.pipe(upstream);
    });
    proxyServer.on('connect', (req, clientSocket, head) => {
      proxyHits += 1;
      const [host, port] = (req.url ?? '').split(':');
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => clientSocket.destroy());
    });
    proxyPort = await listen(proxyServer);

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaflet node images '));
  });

  afterAll(async () => {
    await close(tileServer);
    await close(proxyServer);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeAll(() => {
    // Isolate every test from proxy variables set in the surrounding shell/CI
    savedEnv = {};
    for (const key of PROXY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
    proxyHits = 0;
    requests.length = 0;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  it('loads images over HTTP and sends an identifying User-Agent', async () => {
    const image = await loadImageSource(`http://127.0.0.1:${tilePort}/tile.png`);

    expect(image.width).toBe(4);
    expect(image.height).toBe(3);
    expect(requests).toHaveLength(1);
    expect(requests[0]['user-agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('rejects with the HTTP status when the server returns an error', async () => {
    await expect(loadImageSource(`http://127.0.0.1:${tilePort}/missing.png`)).rejects.toThrow(
      /404 Not Found/
    );
  });

  it('routes requests through HTTP_PROXY', async () => {
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;

    const image = await loadImageSource(`http://127.0.0.1:${tilePort}/via-proxy.png`);

    expect(image.width).toBe(4);
    expect(proxyHits).toBeGreaterThan(0);
  });

  it('bypasses the proxy for hosts listed in NO_PROXY', async () => {
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
    process.env.NO_PROXY = '127.0.0.1';

    const image = await loadImageSource(`http://127.0.0.1:${tilePort}/direct.png`);

    expect(image.width).toBe(4);
    expect(proxyHits).toBe(0);
  });

  it('falls back to ALL_PROXY when no scheme-specific proxy is set', () => {
    expect(resolveProxyDispatcher()).toBeNull();

    process.env.ALL_PROXY = `http://127.0.0.1:${proxyPort}`;
    expect(resolveProxyDispatcher()).not.toBeNull();
  });

  it('picks up proxy variable changes made after the first request', () => {
    expect(resolveProxyDispatcher()).toBeNull();

    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
    const first = resolveProxyDispatcher();
    expect(first).not.toBeNull();
    expect(resolveProxyDispatcher()).toBe(first);

    delete process.env.HTTPS_PROXY;
    expect(resolveProxyDispatcher()).toBeNull();
  });

  it('decodes file:// URLs, including escaped characters and query strings', async () => {
    const filePath = path.join(tmpDir, 'marker icon.png');
    await fs.writeFile(filePath, png);
    const url = `${pathToFileURL(filePath).href}?v=1`;

    expect(url).toContain('%20');
    const image = await loadImageSource(url);
    expect(image.width).toBe(4);
  });

  it('loads plain filesystem paths', async () => {
    const filePath = path.join(tmpDir, 'plain.png');
    await fs.writeFile(filePath, png);

    const image = await loadImageSource(filePath);
    expect(image.height).toBe(3);
  });

  it('reports a clear error for missing files', async () => {
    await expect(loadImageSource(path.join(tmpDir, 'nope.png'))).rejects.toThrow(
      /Could not find image/
    );
  });

  it('loads base64 data URIs', async () => {
    const image = await loadImageSource(`data:image/png;base64,${png.toString('base64')}`);
    expect(image.width).toBe(4);
  });

  it('rejects malformed data URIs', async () => {
    await expect(loadImageSource('data:image/png;base64')).rejects.toThrow(/Invalid data URI/);
  });

  it('rejects data that is not an image', async () => {
    await expect(
      loadImageSource(`data:image/png;base64,${Buffer.from('not an image').toString('base64')}`)
    ).rejects.toBeInstanceOf(Error);
  });
});
