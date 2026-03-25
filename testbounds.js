const fs = require('fs');

const filePath = 'c:\\\\git\\\\meishigawarini\\\\frontend\\\\app\\\\[locale]\\\\shop\\\\[shopId]\\\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const mainWrapperStr = '<div className="max-w-7xl mx-auto px-8 py-10 space-y-10">';
const mainWrapperIndex = content.indexOf(mainWrapperStr);

const linkQrIndex = content.indexOf('{/* Link QR */}');
const incomingOrdersIndex = content.indexOf('{/* Incoming Orders */}');
const existingProductsIndex = content.indexOf('{/* Existing Products */}');
const orderHistoryIndex = content.indexOf('{/* Order History */}');
const statusGuideIndex = content.indexOf('{/* Status Guide */}');
const endOfFileIndex = content.lastIndexOf('            </div>\\n        </div>\\n    );\\n}');
const lastCardEndIndex = content.lastIndexOf('</Card>', endOfFileIndex !== -1 ? endOfFileIndex : content.length);

console.log(JSON.stringify({ 
    mainWrapperIndex,
    linkQrIndex, 
    incomingOrdersIndex, 
    existingProductsIndex, 
    orderHistoryIndex, 
    statusGuideIndex, 
    endOfFileIndex,
    lastCardEndIndex
}));
