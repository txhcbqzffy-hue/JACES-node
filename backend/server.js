require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const productsHandler = require('../api/products');
const filtersHandler = require('../api/filters');
const healthHandler = require('../api/health');

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get('/test', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/images-test', async (req, res) => {
  const { data, error } = await supabase.from('product_images').select('*');
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.get('/api/products', async (req, res) => {
  return productsHandler(req, res);
});

app.get('/api/filters', async (req, res) => {
  return filtersHandler(req, res);
});

app.get('/api/health', async (req, res) => {
  return healthHandler(req, res);
});

const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(3000, () => {
  console.log('Server running on 3000');
});
