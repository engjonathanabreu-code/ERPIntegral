const fs = require('fs');
const vm = require('vm');
const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/supabase-config.js',
  'public/logo-integral.png'
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}
const app = fs.readFileSync('public/app.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
const config = fs.readFileSync('public/supabase-config.js', 'utf8');
if (!config.includes('https://ycdsyilyvaxslkwbkxyo.supabase.co')) {
  throw new Error('URL do Supabase não configurada.');
}
if (!config.includes('sb_publishable_')) {
  throw new Error('Publishable key do Supabase não configurada.');
}
console.log('ERP Integral 4.0 validado. Supabase configurado. Pasta de saída: public');
