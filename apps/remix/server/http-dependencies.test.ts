import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { validator } from 'hono/validator';
import { describe, expect, it } from 'vitest';

describe('HTTP dependency security regressions', () => {
  it('rejects cross-origin hyperlink-auditing POST requests', async () => {
    const app = new Hono();

    app.use('*', csrf());
    app.post('/admin/action', (context) => context.text('Action executed'));

    const response = await app.request('https://app.example/admin/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/ping',
        Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: 'PING',
    });

    expect(response.status).toBe(403);
  });

  it('applies wildcard authorization to equivalent tenant route patterns', async () => {
    const app = new Hono();

    app.use('/api/:tenant{[^/]+}/admin/*', async (context) => context.text('Unauthorized', 401));
    app.get('/api/:tenant/admin/:id', (context) => context.text('Protected content'));

    const response = await app.request('/api/firm/admin/1');

    expect(response.status).toBe(401);
  });

  it('validates multipart fields when the content type includes legal parameters', async () => {
    const app = new Hono();

    app.post(
      '/form',
      validator('form', (value, context) => {
        if (value.role === 'admin') {
          return context.text('Forbidden role', 403);
        }

        return value;
      }),
      (context) => context.text('Accepted'),
    );

    const response = await app.request('/form', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; charset=utf-8; boundary=regression-boundary',
      },
      body: '--regression-boundary\r\nContent-Disposition: form-data; name="role"\r\n\r\nadmin\r\n--regression-boundary--\r\n',
    });

    expect(response.status).toBe(403);
  });
});
