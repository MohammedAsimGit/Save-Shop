import type { Money } from '../types/money.js';

/**
 * Demo catalogue.
 *
 * IMPORTANT: none of this is marketplace data. Every offer below is invented to
 * exercise layout, sorting and filtering while authorised price feeds do not
 * exist. The UI must always label it as sample data (see `DEMO_DATA_NOTICE`) so
 * it can never be mistaken for a live price.
 *
 * Money is integer minor units (paise) with an explicit currency, as the shared
 * contract requires.
 */

export const DEMO_DATA_NOTICE =
  'Sample catalogue for interface review - these prices are invented, not live marketplace prices.';

export type CategoryId =
  'audio' | 'phones' | 'wearables' | 'laptops' | 'cameras' | 'footwear' | 'fashion';

export interface Category {
  readonly id: CategoryId;
  readonly label: string;
  readonly icon:
    'headphones' | 'smartphone' | 'watch' | 'laptop' | 'camera' | 'footprint' | 'shirt';
}

export const categories: readonly Category[] = [
  { id: 'audio', label: 'Audio', icon: 'headphones' },
  { id: 'phones', label: 'Phones', icon: 'smartphone' },
  { id: 'wearables', label: 'Wearables', icon: 'watch' },
  { id: 'laptops', label: 'Laptops', icon: 'laptop' },
  { id: 'cameras', label: 'Cameras', icon: 'camera' },
  { id: 'footwear', label: 'Footwear', icon: 'footprint' },
  { id: 'fashion', label: 'Fashion', icon: 'shirt' },
];

export interface DemoMarketplace {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  /** Accent used for the neutral initials tile. Not a brand logo. */
  readonly accent: string;
}

export const marketplaces: readonly DemoMarketplace[] = [
  { id: 'amazon', name: 'Amazon India', short: 'A', accent: '#232f3e' },
  { id: 'flipkart', name: 'Flipkart', short: 'F', accent: '#2874f0' },
  { id: 'croma', name: 'Croma', short: 'C', accent: '#e23744' },
  { id: 'reliance', name: 'Reliance Digital', short: 'R', accent: '#0f766e' },
  { id: 'myntra', name: 'Myntra', short: 'M', accent: '#7c3aed' },
];

export interface Offer {
  readonly marketplaceId: string;
  readonly price: Money;
  readonly inStock: boolean;
  /** ISO timestamp of when this demo price was "observed". */
  readonly observedAt: string;
  /** Percentage reduction from list price, for the discount badge. */
  readonly discountPercent?: number;
}

export interface DemoProduct {
  readonly id: string;
  readonly title: string;
  readonly brand: string;
  readonly category: CategoryId;
  readonly icon: Category['icon'];
  /** Tailwind gradient classes for the placeholder artwork. */
  readonly gradient: string;
  readonly rating: number;
  readonly reviewCount: number;
  readonly highlights: readonly string[];
  readonly offers: readonly Offer[];
  readonly listPrice: Money;
}

const observed = (minutesAgo: number): string =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

const inr = (rupees: number): Money => ({ amountMinor: rupees * 100, currency: 'INR' });

export const demoProducts: readonly DemoProduct[] = [
  {
    id: 'sony-wh1000xm5',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    category: 'audio',
    icon: 'headphones',
    gradient: 'from-emerald-100 to-teal-50 dark:from-emerald-950 dark:to-teal-950',
    rating: 4.7,
    reviewCount: 18432,
    highlights: [
      'Industry-leading noise cancellation',
      '30-hour battery with quick charge',
      'Multipoint connection for two devices',
    ],
    listPrice: inr(34990),
    offers: [
      {
        marketplaceId: 'amazon',
        price: inr(26990),
        inStock: true,
        observedAt: observed(12),
        discountPercent: 23,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(27499),
        inStock: true,
        observedAt: observed(28),
        discountPercent: 21,
      },
      {
        marketplaceId: 'croma',
        price: inr(28990),
        inStock: false,
        observedAt: observed(140),
        discountPercent: 17,
      },
    ],
  },
  {
    id: 'iphone-15-128',
    title: 'Apple iPhone 15 (128 GB, Blue)',
    brand: 'Apple',
    category: 'phones',
    icon: 'smartphone',
    gradient: 'from-sky-100 to-indigo-50 dark:from-sky-950 dark:to-indigo-950',
    rating: 4.8,
    reviewCount: 52210,
    highlights: ['6.1-inch Super Retina XDR', 'A16 Bionic chip', 'USB-C charging'],
    listPrice: inr(79900),
    offers: [
      {
        marketplaceId: 'flipkart',
        price: inr(68999),
        inStock: true,
        observedAt: observed(6),
        discountPercent: 14,
      },
      {
        marketplaceId: 'amazon',
        price: inr(69900),
        inStock: true,
        observedAt: observed(19),
        discountPercent: 13,
      },
      {
        marketplaceId: 'reliance',
        price: inr(71900),
        inStock: true,
        observedAt: observed(75),
        discountPercent: 10,
      },
      {
        marketplaceId: 'croma',
        price: inr(72499),
        inStock: false,
        observedAt: observed(210),
        discountPercent: 9,
      },
    ],
  },
  {
    id: 'galaxy-watch6',
    title: 'Samsung Galaxy Watch 6 (44 mm, Bluetooth)',
    brand: 'Samsung',
    category: 'wearables',
    icon: 'watch',
    gradient: 'from-violet-100 to-fuchsia-50 dark:from-violet-950 dark:to-fuchsia-950',
    rating: 4.5,
    reviewCount: 9104,
    highlights: ['Sleep coaching', 'Body composition analysis', 'Sapphire crystal glass'],
    listPrice: inr(33999),
    offers: [
      {
        marketplaceId: 'amazon',
        price: inr(22999),
        inStock: true,
        observedAt: observed(9),
        discountPercent: 32,
      },
      {
        marketplaceId: 'croma',
        price: inr(23990),
        inStock: true,
        observedAt: observed(52),
        discountPercent: 29,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(24499),
        inStock: true,
        observedAt: observed(64),
        discountPercent: 28,
      },
    ],
  },
  {
    id: 'dell-xps-13',
    title: 'Dell XPS 13 (Intel Core i7, 16 GB, 512 GB)',
    brand: 'Dell',
    category: 'laptops',
    icon: 'laptop',
    gradient: 'from-slate-100 to-zinc-50 dark:from-slate-800 dark:to-zinc-900',
    rating: 4.4,
    reviewCount: 3288,
    highlights: ['13.4-inch InfinityEdge', '16 GB LPDDR5', 'Thunderbolt 4 charging'],
    listPrice: inr(129990),
    offers: [
      {
        marketplaceId: 'reliance',
        price: inr(109990),
        inStock: true,
        observedAt: observed(31),
        discountPercent: 15,
      },
      {
        marketplaceId: 'amazon',
        price: inr(112500),
        inStock: true,
        observedAt: observed(44),
        discountPercent: 13,
      },
      {
        marketplaceId: 'croma',
        price: inr(118000),
        inStock: true,
        observedAt: observed(180),
        discountPercent: 9,
      },
    ],
  },
  {
    id: 'canon-eos-r50',
    title: 'Canon EOS R50 Mirrorless Camera (18-45 mm Kit)',
    brand: 'Canon',
    category: 'cameras',
    icon: 'camera',
    gradient: 'from-amber-100 to-orange-50 dark:from-amber-950 dark:to-orange-950',
    rating: 4.6,
    reviewCount: 2210,
    highlights: ['24.2 MP APS-C sensor', '4K 30p video', 'Dual Pixel autofocus'],
    listPrice: inr(74990),
    offers: [
      {
        marketplaceId: 'croma',
        price: inr(63990),
        inStock: true,
        observedAt: observed(22),
        discountPercent: 15,
      },
      {
        marketplaceId: 'amazon',
        price: inr(64900),
        inStock: true,
        observedAt: observed(38),
        discountPercent: 13,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(65499),
        inStock: true,
        observedAt: observed(96),
        discountPercent: 13,
      },
    ],
  },
  {
    id: 'nike-pegasus-40',
    title: 'Nike Air Zoom Pegasus 40 Running Shoes',
    brand: 'Nike',
    category: 'footwear',
    icon: 'footprint',
    gradient: 'from-rose-100 to-pink-50 dark:from-rose-950 dark:to-pink-950',
    rating: 4.3,
    reviewCount: 15608,
    highlights: ['Responsive Zoom Air unit', 'Engineered mesh upper', 'Road running trainer'],
    listPrice: inr(13995),
    offers: [
      {
        marketplaceId: 'myntra',
        price: inr(9296),
        inStock: true,
        observedAt: observed(15),
        discountPercent: 34,
      },
      {
        marketplaceId: 'amazon',
        price: inr(9795),
        inStock: true,
        observedAt: observed(41),
        discountPercent: 30,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(10199),
        inStock: false,
        observedAt: observed(260),
        discountPercent: 27,
      },
    ],
  },
  {
    id: 'boat-airdopes-141',
    title: 'boAt Airdopes 141 True Wireless Earbuds',
    brand: 'boAt',
    category: 'audio',
    icon: 'headphones',
    gradient: 'from-cyan-100 to-sky-50 dark:from-cyan-950 dark:to-sky-950',
    rating: 4.1,
    reviewCount: 88430,
    highlights: ['42-hour playback', 'ENx noise cancellation', 'Low-latency game mode'],
    listPrice: inr(4499),
    offers: [
      {
        marketplaceId: 'amazon',
        price: inr(1299),
        inStock: true,
        observedAt: observed(4),
        discountPercent: 71,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(1349),
        inStock: true,
        observedAt: observed(11),
        discountPercent: 70,
      },
      {
        marketplaceId: 'myntra',
        price: inr(1499),
        inStock: true,
        observedAt: observed(120),
        discountPercent: 67,
      },
    ],
  },
  {
    id: 'levis-511',
    title: "Levi's 511 Slim Fit Jeans",
    brand: "Levi's",
    category: 'fashion',
    icon: 'shirt',
    gradient: 'from-blue-100 to-indigo-50 dark:from-blue-950 dark:to-indigo-950',
    rating: 4.2,
    reviewCount: 6310,
    highlights: ['Slim through the leg', 'Stretch denim', 'Classic 5-pocket styling'],
    listPrice: inr(3999),
    offers: [
      {
        marketplaceId: 'myntra',
        price: inr(2399),
        inStock: true,
        observedAt: observed(26),
        discountPercent: 40,
      },
      {
        marketplaceId: 'amazon',
        price: inr(2599),
        inStock: true,
        observedAt: observed(58),
        discountPercent: 35,
      },
      {
        marketplaceId: 'flipkart',
        price: inr(2749),
        inStock: true,
        observedAt: observed(150),
        discountPercent: 31,
      },
    ],
  },
];

export const marketplaceById = (id: string): DemoMarketplace | undefined =>
  marketplaces.find((marketplace) => marketplace.id === id);

export const categoryById = (id: CategoryId): Category | undefined =>
  categories.find((category) => category.id === id);

/** In-stock offers, cheapest first. Out-of-stock prices are never "the lowest". */
export function rankedOffers(product: DemoProduct): readonly Offer[] {
  return [...product.offers].sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.price.amountMinor - b.price.amountMinor;
  });
}

export function lowestOffer(product: DemoProduct): Offer | undefined {
  return rankedOffers(product).find((offer) => offer.inStock);
}

/** The number of marketplaces that currently have the product in stock. */
export function availableMarketplaceCount(product: DemoProduct): number {
  return product.offers.filter((offer) => offer.inStock).length;
}

export function savingsAgainstList(product: DemoProduct): number {
  const lowest = lowestOffer(product);
  if (!lowest) return 0;
  return Math.max(0, product.listPrice.amountMinor - lowest.price.amountMinor);
}

export function searchProducts(query: string): readonly DemoProduct[] {
  const term = query.trim().toLowerCase();
  if (!term) return demoProducts;

  return demoProducts.filter((product) => {
    const haystack = [
      product.title,
      product.brand,
      categoryById(product.category)?.label ?? '',
      ...product.highlights,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'discount';

export const sortOptions: readonly { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'price-asc', label: 'Lowest price' },
  { value: 'price-desc', label: 'Highest price' },
  { value: 'discount', label: 'Biggest saving' },
];

export interface FilterState {
  readonly query: string;
  readonly category: CategoryId | 'all';
  readonly sort: SortKey;
  readonly inStockOnly: boolean;
  readonly marketplace: string | 'all';
}

export function filterProducts(products: readonly DemoProduct[], filters: FilterState) {
  const filtered = products.filter((product) => {
    if (filters.category !== 'all' && product.category !== filters.category) return false;
    if (filters.inStockOnly && availableMarketplaceCount(product) === 0) return false;
    if (
      filters.marketplace !== 'all' &&
      !product.offers.some((offer) => offer.marketplaceId === filters.marketplace && offer.inStock)
    ) {
      return false;
    }
    return true;
  });

  const priceOf = (product: DemoProduct) => lowestOffer(product)?.price.amountMinor ?? Infinity;

  switch (filters.sort) {
    case 'price-asc':
      return [...filtered].sort((a, b) => priceOf(a) - priceOf(b));
    case 'price-desc':
      return [...filtered].sort((a, b) => priceOf(b) - priceOf(a));
    case 'discount':
      return [...filtered].sort((a, b) => savingsAgainstList(b) - savingsAgainstList(a));
    default:
      return filtered;
  }
}
