import { render } from '@testing-library/react-native';

import type { CatalogueProductResponse } from '@smart-shopping/shared';

import { ProductIdentitySection } from '../components/ProductIdentitySection';
import { useProductIdentity } from '../hooks/useProductIdentity';
import { AppThemeProvider } from '../theme/ThemeProvider';

jest.mock('../hooks/useProductIdentity', () => ({
  useProductIdentity: jest.fn(),
}));

const mockedUseProductIdentity = useProductIdentity as jest.MockedFunction<
  typeof useProductIdentity
>;

const identity: CatalogueProductResponse = {
  product: {
    id: 'sony-wh1000xm5',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    category: 'audio',
    gtin: '4905524986666',
    identifiers: { gtin: '4905524986666' },
    isSample: true,
    status: 'active',
    provenance: 'demo-catalogue',
    attributes: {},
    identifiersLocked: false,
    createdAt: '2026-11-06T09:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
  },
  listingSummary: {
    total: 3,
    resolved: 2,
    unresolved: 1,
    requiresReview: 1,
    byStatus: { exact: 2, possible: 1 },
  },
  notices: ['1 listing is unresolved and excluded from comparisons.'],
} as unknown as CatalogueProductResponse;

const wrap = (ui: React.ReactElement) => render(<AppThemeProvider>{ui}</AppThemeProvider>);

describe('mobile ProductIdentitySection', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('reports the canonical identity and counts resolved and unresolved listings', async () => {
    mockedUseProductIdentity.mockReturnValue({
      state: { status: 'ready', identity },
      retry: jest.fn(),
    });

    const view = await wrap(<ProductIdentitySection productId="sony-wh1000xm5" />);

    expect(view.getByText(/Sony · audio/)).toBeTruthy();
    expect(view.getByText(/GTIN 4905524986666/)).toBeTruthy();
    expect(view.getByText(/2 resolved listing\(s\) · 1 unresolved/)).toBeTruthy();
    // An unresolved listing is described as excluded, never as compared.
    expect(view.getByText(/not compared until a human reviews the match/)).toBeTruthy();
    expect(mockedUseProductIdentity).toHaveBeenCalledWith('sony-wh1000xm5');
  });

  it('says identity is unavailable without hiding the comparison above it', async () => {
    mockedUseProductIdentity.mockReturnValue({
      state: { status: 'error', message: 'Network down', isNetworkError: true },
      retry: jest.fn(),
    });

    const view = await wrap(<ProductIdentitySection productId="sony-wh1000xm5" />);

    expect(
      view.getByText(/Identity is unavailable right now \(the API is unreachable\)/),
    ).toBeTruthy();
    expect(view.getByText(/comparison above is unaffected/)).toBeTruthy();
  });
});
