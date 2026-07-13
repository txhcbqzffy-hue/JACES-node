import { API_URL } from "./apiConfig.js";

export async function getProducts(pageType) {
  const query = pageType ? `?page=${encodeURIComponent(pageType)}` : '';
  const res = await fetch(`${API_URL}/api/products${query}`);

  if (!res.ok) {
    throw new Error("Erreur chargement produits");
  }

  return await res.json();
}

export async function getProductById(id) {
  const productId = String(id || '').trim();
  if (!productId) return null;

  const res = await fetch(`${API_URL}/api/products?id=${encodeURIComponent(productId)}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error('Erreur chargement produit');
  }

  const data = await res.json();
  return Array.isArray(data) ? (data[0] || null) : data;
}
