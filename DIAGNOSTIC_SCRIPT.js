// ============================================================
// DIAGNOSTIC COMPLET - Copier/coller dans la Console sur nouveautes.html
// ============================================================

console.log('🔍 === DIAGNOSTIC JACES NOUVEAUTÉS ===\n');

// 1️⃣ TEST API
console.log('1️⃣ TEST API - Produits retournés par /api/products?page=nouveautes');
fetch('/api/products?page=nouveautes&debug=1')
  .then(r => r.json())
  .then(data => {
    console.log(`   ✅ API retourne: ${data.length} produits`);
    if (data[0]) {
      console.log('   Premier produit:');
      console.log('     - id:', data[0].id);
      console.log('     - name:', data[0].name);
      console.log('     - image_url:', data[0].image_url);
      console.log('     - all_images:', data[0].all_images?.length || 0, 'images');
      console.log('     - filter_menus:', data[0].filter_menus);
      console.log('     - filter_ids:', data[0].filter_ids);
    }
    window.__DIAGNOSTIC_PRODUCTS = data;
  })
  .catch(e => console.error('   ❌ Erreur API:', e.message));

// 2️⃣ TEST JS INIT & DOM
console.log('\n2️⃣ TEST JS INIT & DOM');
setTimeout(() => {
  console.log('   - JS init (window.__JACES_PRODUCTS_PAGE_INIT):', window.__JACES_PRODUCTS_PAGE_INIT ? '✅ true' : '❌ false');
  const grid = document.getElementById('product-grid');
  console.log('   - Grid existe:', grid ? '✅ oui' : '❌ non');
  const cards = document.querySelectorAll('.product-card');
  console.log('   - Cartes affichées:', `${cards.length} (attendu: au moins 1)`);
  if (cards.length === 0) {
    console.log('   - ⚠️ Pas de cartes! Possibilités:');
    console.log('     a) API retourne 0 produits → problème Supabase/filtrage');
    console.log('     b) API retourne N produits mais JS ne les affiche pas → bug render');
    console.log('     c) JS n\'init pas → products-page.js ne charge pas');
  } else {
    console.log('   - ✅ Cartes visibles, checker le rendu HTML');
    console.log('   Première carte HTML:');
    console.log(cards[0].outerHTML.substring(0, 300) + '...');
  }
}, 500);

// 3️⃣ TEST BACKOFFICE LOCAL (localStorage)
console.log('\n3️⃣ TEST BACKOFFICE LOCAL (localStorage)');
const adminKey = 'jaces_admin_products_v1';
const adminProducts = localStorage.getItem(adminKey);
if (adminProducts) {
  const parsed = JSON.parse(adminProducts);
  console.log(`   ⚠️ Backoffice local contient: ${parsed.length} produits`);
  console.log('   ⚠️ Ces produits sont INVISIBLES en production (Vercel)');
  console.log('   ℹ️ Solution: Publier vers Supabase au lieu de localStorage');
} else {
  console.log('   ✅ Pas de produits locaux (normal pour prod)');
}

// 4️⃣ TEST FILTRAGE
console.log('\n4️⃣ TEST FILTRAGE');
fetch('/api/filters')
  .then(r => r.json())
  .then(filters => {
    const nouvFilters = filters.filter(f => 
      f.menu && f.menu.toLowerCase().includes('nouv')
    );
    console.log(`   - Filtres "nouveautes": ${nouvFilters.length}`);
    if (nouvFilters.length) {
      console.log('   Exemples:', nouvFilters.slice(0, 3).map(f => ({ id: f.id, menu: f.menu, name: f.name })));
    }
  })
  .catch(e => console.error('   ❌ Erreur filtres:', e.message));

// 5️⃣ RÉSUMÉ
console.log('\n5️⃣ RÉSUMÉ ET PROCHAINES ÉTAPES');
setTimeout(() => {
  const products = window.__DIAGNOSTIC_PRODUCTS || [];
  const grid = document.getElementById('product-grid');
  const cards = document.querySelectorAll('.product-card');
  
  console.log('\n📊 État du système:');
  console.log(`   API produits: ${products.length}`);
  console.log(`   DOM grid: ${grid ? '✅' : '❌'}`);
  console.log(`   Cartes affichées: ${cards.length}`);
  
  if (products.length > 0 && cards.length === 0) {
    console.log('\n❌ PROBLÈME: API retourne des produits mais rien n\'affiche');
    console.log('   → Checker products-page.js renderProductCard()');
    console.log('   → Vérifier les images (main, all_images)');
    console.log('   → Vérifier le filtrage (filter_menus, filter_ids)');
  } else if (products.length === 0) {
    console.log('\n❌ PROBLÈME: API retourne 0 produits');
    console.log('   → Checker Supabase (table products)');
    console.log('   → Vérifier les filter_menus du produit');
  } else {
    console.log('\n✅ Semble bon! Les cartes s\'affichent.');
  }
}, 1000);

console.log('\n✅ Diagnostic lancé. Attends 1-2 sec et scroll pour voir les résultats.\n');
