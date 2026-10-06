export type CartItem = { productId?: string; slug: string; name: string; description: string; price: string; unitAmount?: number; quantity: number };

const storageKey = 'trex-tea-cart-v1';
const changeEvent = 'trex-cart-changed';

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try { const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '[]'); return Array.isArray(parsed) ? parsed.filter(isCartItem) : []; } catch { return []; }
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.slug === 'string' && typeof item.name === 'string' && typeof item.description === 'string' && typeof item.price === 'string' && typeof item.quantity === 'number' && (item.productId === undefined || typeof item.productId === 'string') && (item.unitAmount === undefined || typeof item.unitAmount === 'number');
}

function saveCart(items: CartItem[]) { window.localStorage.setItem(storageKey, JSON.stringify(items)); window.dispatchEvent(new Event(changeEvent)); }

export function addToCart(item: Omit<CartItem, 'quantity'>) {
  const cart = readCart();
  const existing = cart.find((entry) => entry.slug === item.slug);
  if (existing) {
    // Replace a legacy fallback/catalogue item with the API-backed product.
    // Both can share the same slug, but only the API item has a product ID for checkout.
    if (!existing.productId && item.productId) Object.assign(existing, item);
    existing.quantity += 1;
  } else cart.push({ ...item, quantity: 1 });
  saveCart(cart);
}

export function setCartQuantity(slug: string, quantity: number) { const cart = readCart(); const items = quantity < 1 ? cart.filter((item) => item.slug !== slug) : cart.map((item) => item.slug === slug ? { ...item, quantity } : item); saveCart(items); }

export function subscribeToCart(listener: () => void) { window.addEventListener(changeEvent, listener); return () => window.removeEventListener(changeEvent, listener); }
