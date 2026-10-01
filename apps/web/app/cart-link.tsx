'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readCart, subscribeToCart } from '../lib/cart-store';

export function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => setCount(readCart().reduce((total, item) => total + item.quantity, 0));
    refresh();
    return subscribeToCart(refresh);
  }, []);
  return <Link className="nav-button" href="/sepet">Sepet{count ? ` (${count})` : ''}</Link>;
}
