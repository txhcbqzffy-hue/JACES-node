const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    const { data: products, error: productsError } = await supabase.from('produits').select('');
    if (productsError) {
      return res.status(500).json({ source: 'produits', error: productsError.message });
    }
    if (!products || !Array.isArray(products)) {
      return res.status(500).json({ source: 'produits', error: 'Pas de données reçues pour produits' });
    }

    const { data: images, error: imagesError } = await supabase.from('images_produit').select('');
    if (imagesError) {
      return res.status(500).json({ source: 'images_produit', error: imagesError.message });
    }
    if (!images || !Array.isArray(images)) {
      return res.status(500).json({ source: 'images_produit', error: 'Pas de données reçues pour images_produit' });
    }

    const mapped = products.map((product) => {
      const productImages = images
        .filter((img) => img.produit_id === product.identifiant)
        .sort((a, b) => a.position - b.position);

      return {
        ...product,
        image_url: productImages[0]?.url || '',
        hover_image_url: productImages[1]?.url || productImages[0]?.url || ''
      };
    });

    res.status(200).json(mapped);
  } catch (e) {
    res.status(500).json({ source: 'API crashed', error: e.message });
  }
};
