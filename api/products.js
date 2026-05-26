const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://uxhzrobxhumreuntxrzw.supabase.co',
  'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp'
);

module.exports = async function handler(req, res) {
  try {
    const { data: products, error: productsError } = await supabase
      .from('produits')
      .select('*');

    if (productsError) {
      return res.status(500).json({
        source: 'produits',
        error: productsError.message
      });
    }

    const { data: images, error: imagesError } = await supabase
      .from('images_produit')
      .select('*');

    if (imagesError) {
      return res.status(500).json({
        source: 'images_produit',
        error: imagesError.message
      });
    }

    const mapped = products.map((product) => {
      const productImages = images
        .filter((img) => img.produit_id === product.identifiant)
        .sort((a, b) => a.position - b.position);

      return {
        ...product,
        images: productImages,
        image_url: productImages[0]?.url || '',
        hover_image_url: productImages[1]?.url || productImages[0]?.url || ''
      };
    });

    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({
      source: 'API crashed',
      error: error.message
    });
  }
};