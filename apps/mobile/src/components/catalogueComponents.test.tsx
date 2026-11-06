import { fireEvent, render } from '@testing-library/react-native';

import { demoProducts } from '@smart-shopping/shared';

import { formatMoney } from '../lib/format';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { AppThemeProvider } from '../theme/ThemeProvider';

// RNTL 14 renders asynchronously, so every case awaits `render` before querying.
const wrap = (ui: React.ReactElement) => render(<AppThemeProvider>{ui}</AppThemeProvider>);

describe('mobile catalogue components', () => {
  const product = demoProducts[0];

  if (!product) throw new Error('demo catalogue is empty');
  const lowest = product.offers[0]!.price;

  it('renders a product tile with the cheapest offer as the headline price', async () => {
    const onPress = jest.fn();
    const view = await wrap(<ProductCard product={product} onPress={onPress} />);

    expect(view.getByText(product.title)).toBeTruthy();
    expect(view.getByText('Lowest price')).toBeTruthy();
    expect(view.getAllByText(formatMoney(lowest)).length).toBeGreaterThan(0);

    // The tile is self-describing for screen readers and carries the tap target.
    const tile = view.getByLabelText(
      new RegExp(`^${escapeRegex(product.title)}, lowest price`, 'i'),
    );
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledWith(product.id);
  });

  it('submits a typed query and clears it', async () => {
    const onSubmit = jest.fn();
    const onChangeText = jest.fn();
    const view = await wrap(
      <SearchBar value="earbuds" onChangeText={onChangeText} onSubmit={onSubmit} />,
    );

    await fireEvent(view.getByLabelText('Product search'), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledWith('earbuds');

    await fireEvent.press(view.getByLabelText('Clear search'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
