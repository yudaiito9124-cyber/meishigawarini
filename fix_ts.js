const fs = require('fs');
const path = 'c:\\git\\meishigawarini\\frontend\\app\\[locale]\\receive\\[uuid]\\page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/catch \(e\) {/g, 'catch (e: any) {');

if (!content.includes('Save,') && !content.includes(' Save ')) {
    content = content.replace(/({[^}]*?)SendHorizontal(.*?}\s*from\s+['"]lucide-react['"])/, '$1Save, SendHorizontal$2');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed typescript errors.');
