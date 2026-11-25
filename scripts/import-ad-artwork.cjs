// Import the supplied campaign artwork; keep original resolution and transparency.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('.tmp/new-ads-review/ammagi bands');
const files = fs.readdirSync(root, { recursive: true }).filter(x => x.endsWith('.png'));
const groups = [
  ['fmcg', 'FMCG', [['aashirvaad', 'Aashirvaad Shudh Chakki Atta', [12,13,14,15,16]], ['dove', 'Dove Body Wash', [17,18,19,20]]]],
  ['consumer-electronics', 'Consumer Electronics', [['samsung', 'Samsung Galaxy Smartphone', [6,7,8]], ['sony', 'Sony Wireless Headphones', [9,10,11]]]],
  ['banking-finance', 'Banking & Finance', [['axis', 'Axis Bank Credit Card', [0,1,2]], ['hdfc', 'HDFC Bank Credit Card', [3,4,5]]]],
];
const layouts = ['l-band','side','side','l-band','side','side','l-band','side','side','l-band','side','side','bottom','l-band','side','side-frame','side-frame','bottom','l-band','side','side'];
const catalog = groups.map(([id,name,brands]) => ({id,name,brands: brands.map(([bid,bname,indices]) => ({id:bid,name:bname,ads:indices.map((index,i) => {
  const layout = layouts[index];
  const relative = `ads/industries/${id}/${bid}/${layout}-${i+1}.png`;
  const target = path.join('public',relative);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.copyFileSync(path.join(root,files[index]),target);
  return {id:`${bid}-${i+1}-${layout}`,image:`/${relative}`,alt:`${bname} ${layout} advertisement`,layout,source:files[index]};
})}))}));
fs.writeFileSync('lib/ad-catalog-data.json',JSON.stringify(catalog,null,2)+'\n');
console.log(`Imported ${files.length} creatives for ${catalog.length} industries.`);
