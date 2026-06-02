import { API_URL } from "./apiConfig.js";

export async function getProducts() {
  const res = await fetch(`${API_URL}/api/products`);

  if (!res.ok) {
    throw new Error("Erreur chargement produits");
  }

  return await res.json();
}

export async function getProductById(id) {
  const productId = String(id || '').trim();
  if (!productId) return null;

  const res = await fetch(`${API_URL}/api/products/${encodeURIComponent(productId)}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error('Erreur chargement produit');
  }

  return await res.json();
}
