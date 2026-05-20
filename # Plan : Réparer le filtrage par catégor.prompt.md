# Plan : Réparer le filtrage par catégorie sur `collection.html`

Rendre le clic sur les cercles catégories fonctionnel : filtrer les produits et scroller à la bonne position.

## Bugs identifiés

1. **Scroll derrière le header** — `scrollIntoView({ block:'start' })` fait remonter la grille derrière le header fixe (`position: fixed; top: 26px`). Les produits sont masqués.
2. **data-category incohérent** — La carte ligne 304 a `id="cat-tops"` mais `data-category="essentielles all"`. Le scroll anchor T-shirts pointe vers un produit essentielles.

## Corrections à apporter

### 1. Corriger le scroll (collection.html ~ligne 960)

Remplacer :
```js
const grid = document.getElementById('product-grid');
if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

Par :
```js
const grid = document.getElementById('product-grid');
if (grid) {
  const offset = grid.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top: offset, behavior: 'smooth' });
}
```

### 2. Corriger le data-category (collection.html ligne 304)

Remplacer :
```html
<article class="product-card collection-card" id="cat-tops" data-category="essentielles all">
```

Par :
```html
<article class="product-card collection-card" id="cat-tops" data-category="tshirts all">
```

### 3. Ajouter une transition CSS fluide (style.css)

Remplacer :
```css
.product-card.hidden {
  display: none;
}
```

Par :
```css
.product-card {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.product-card.hidden {
  display: none;
}
```

## Fichiers concernés

- `collection.html` — JS scroll (ligne ~960) + data-category carte ligne 304
- `style.css` — transition sur `.product-card`

## Vérification

1. Ouvrir `collection.html` dans le navigateur
2. Cliquer **Blazers** → seules les 3 cartes blazers restent, scroll atterrit sous le header
3. Cliquer **T-shirts** → cartes T-shirts visibles, "Tailleur ivoire" (essentielles) disparaît
4. Cliquer **Tous les articles** → tout réapparaît avec fade-in
