import { ApiError, apiRequest } from './apiClient';

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('mobile apiRequest', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('unwraps the shared success envelope', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ data: { ping: 'pong' } }));

    await expect(apiRequest<{ ping: string }>('/health')).resolves.toEqual({ ping: 'pong' });
  });

  it('throws a typed ApiError for the shared error envelope', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: { code: 'NOT_FOUND', message: 'Missing', requestId: 'req-1' } }, 404),
      );

    const error = await apiRequest('/missing').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error as ApiError).toMatchObject({ code: 'NOT_FOUND', status: 404, requestId: 'req-1' });
  });

  it('reports unreachable APIs as network errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network request failed'));

    const error = await apiRequest('/health').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
  });

  it('rejects responses that are not wrapped in an envelope', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ unexpected: true }));

    const error = await apiRequest('/health').catch((caught: unknown) => caught);

    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });
});
