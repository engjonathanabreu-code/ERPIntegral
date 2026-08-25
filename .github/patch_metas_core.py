from pathlib import Path
import re

base = Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public')
app_path = base / 'app.js'
bridge_path = base / 'erp-bridge.js'
index_path = base / 'index.html'
styles_path = base / 'styles.css'
metas_js_path = base / 'metas-v2.js'
metas_css_path = base / 'metas-v2.css'

app = app_path.read_text(encoding='utf-8')
bridge = bridge_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
styles = styles_path.read_text(encoding='utf-8')
metas_js = metas_js_path.read_text(encoding='utf-8')
metas_css = metas_css_path.read_text(encoding='utf-8')

# Sinaliza que Metas V2 passa a fazer parte do core, para o bridge não re-renderizar após o clique.
if 'window.ERP_METAS_IN_CORE=true;' not in app:
    app = app.replace("'use strict';\n", "'use strict';\nwindow.ERP_METAS_IN_CORE=true;\n", 1)

# A aba Metas do app deixa de montar a implementação antiga e chama diretamente a V2 incorporada.
pattern = r"function renderMetas\(\)\{.*?\n\}\n(?=function metasKpiHtml\()"
replacement = """function renderMetas(){
  title('Metas');
  if(window.ERPMetasV2?.render){window.ERPMetasV2.render();return;}
  $('#content').innerHTML='<div class=\"card\"><div class=\"notice\">Carregando Metas...</div></div>';
  setTimeout(()=>{if(currentView==='metas'&&window.ERPMetasV2?.render)window.ERPMetasV2.render();},0);
}
"""
app, n = re.subn(pattern, replacement, app, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'Não foi possível substituir renderMetas (matches={n})')

# Incorpora integralmente a implementação funcional V2 ao app.js.
marker = '/* METAS_V2_INTEGRADA_AO_CORE */'
if marker not in app:
    app = app.rstrip() + '\n\n' + marker + '\n' + metas_js.strip() + '\n'

# Incorpora também os estilos da V2 ao stylesheet principal.
css_marker = '/* METAS_V2_CSS_INTEGRADO_AO_CORE */'
if css_marker not in styles:
    styles = styles.rstrip() + '\n\n' + css_marker + '\n' + metas_css.strip() + '\n'

# Evita o segundo render 20ms depois no bridge.
old_hook = "function hookMetasButton(){document.querySelectorAll('.nav [data-view=\"metas\"]').forEach(b=>{if(b.dataset.v2hook)return;b.dataset.v2hook='1';b.addEventListener('click',()=>setTimeout(()=>window.ERPMetasV2?.render?.(),20))})}"
new_hook = "function hookMetasButton(){if(window.ERP_METAS_IN_CORE)return;document.querySelectorAll('.nav [data-view=\"metas\"]').forEach(b=>{if(b.dataset.v2hook)return;b.dataset.v2hook='1';b.addEventListener('click',()=>setTimeout(()=>window.ERPMetasV2?.render?.(),20))})}"
if old_hook in bridge:
    bridge = bridge.replace(old_hook, new_hook, 1)
elif 'function hookMetasButton(){if(window.ERP_METAS_IN_CORE)return;' not in bridge:
    raise SystemExit('Não foi possível localizar hookMetasButton no bridge')

# Remove carregamentos separados: agora JS e CSS de Metas fazem parte do core.
index = re.sub(r'\s*<link rel="stylesheet" href="metas-v2\.css\?v=\d+" />', '', index)
index = re.sub(r'\s*<script src="metas-v2\.js\?v=\d+"></script>', '', index)
index = re.sub(r'app\.js\?v=\d+', 'app.js?v=18', index)
index = re.sub(r'styles\.css\?v=\d+', 'styles.css?v=18', index)
index = re.sub(r'erp-bridge\.js\?v=\d+', 'erp-bridge.js?v=17', index)

app_path.write_text(app, encoding='utf-8')
bridge_path.write_text(bridge, encoding='utf-8')
index_path.write_text(index, encoding='utf-8')
styles_path.write_text(styles, encoding='utf-8')
