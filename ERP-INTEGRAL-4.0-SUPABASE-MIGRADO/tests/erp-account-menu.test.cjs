const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../public');
const source=fs.readFileSync(path.join(root,'erp-account-menu.js'),'utf8');
test('account menu has valid syntax and no backend or authentication side effects',()=>{
  new vm.Script(source);
  assert.doesNotMatch(source,/\b(fetch|supabase|localStorage|sessionStorage|signOut|rpc)\b/);
  assert.doesNotMatch(source,/\.onclick\s*=|\.innerHTML\s*=/);
  assert.match(source,/menu\.appendChild\(button\)/);
  for(const id of ['erpSettingsBtn','changeMyPassword','logout'])assert.ok(source.includes("'"+id+"'"));
});
test('menu has expansion state, outside-click dismissal and keyboard dismissal',()=>{
  assert.match(source,/aria-expanded/);assert.match(source,/aria-controls/);
  assert.match(source,/event\.key==='Escape'/);
  assert.match(source,/!menu\.contains\(event\.target\)/);
  assert.match(source,/toggle\?\.focus\(\)/);
});
test('mobile footer is limited to one touch control; original account buttons remain in the menu',()=>{
  const css=fs.readFileSync(path.join(root,'erp-account-menu.css'),'utf8');
  assert.match(css,/max-width:44px/);
  assert.match(css,/\.erp-account-menu\[hidden\]\{display:none!important\}/);
  assert.match(css,/#erpAccountMenu button/);
});
