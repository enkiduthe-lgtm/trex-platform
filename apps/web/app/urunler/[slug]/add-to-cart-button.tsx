'use client';
import { useState } from 'react';
import { addToCart } from '../../../lib/cart-store';
type Props = { product: { id?: string; slug: string; name: string; description: string; price: string; unitAmount?: number } };
export function AddToCartButton({ product }: Props) { const [added, setAdded] = useState(false); function add() { addToCart(product); setAdded(true); window.setTimeout(() => setAdded(false), 2200); } return <><button type="button" onClick={add}>{added ? 'Sepete eklendi' : 'Sepete ekle'}</button>{added && <p className="cart-feedback" role="status">{product.name} sepetine eklendi.</p>}</>; }
