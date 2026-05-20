import { API_URL } from "./apiConfig.js";

export async function getProducts() {
  const res = await fetch(`${API_URL}/api/products`);

  if (!res.ok) {
    throw new Error("Erreur chargement produits");
  }

  return await res.json();
}
