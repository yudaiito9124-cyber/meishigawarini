const fs = require('fs');

const filePath = 'c:\\\\git\\\\meishigawarini\\\\frontend\\\\app\\\\[locale]\\\\shop\\\\[shopId]\\\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('QrCode,')) {
    content = content.replace(
        /(import \{ RefreshCw[^}]*)( \} from 'lucide-react';)/,
        `$1, QrCode, Package, Truck$2`
    );
}

const stateToAdd = `\n    const [activeTab, setActiveTab] = useState("activation");\n`;
if (!content.includes('const [activeTab')) {
    content = content.replace(
        /(const \[userId, setUserId\] = useState<string>\('');)/,
        `$1${stateToAdd}`
    );
}

const tabsUI = `            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-8 space-y-6">
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-4 mb-2">
                    <button
                        onClick={() => setActiveTab("activation")}
                        className={\`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md \${
                            activeTab === "activation"
                                ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }\`}
                    >
                        <QrCode className={\`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 \${activeTab === "activation" ? "text-gray-900" : "text-gray-400"}\`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.activation') || "アクティベーション"}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("shipping")}
                        className={\`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md \${
                            activeTab === "shipping"
                                ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }\`}
                    >
                        <Truck className={\`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 \${activeTab === "shipping" ? "text-gray-900" : "text-gray-400"}\`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.shipping') || "発送管理"}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("products")}
                        className={\`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md \${
                            activeTab === "products"
                                ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }\`}
                    >
                        <Package className={\`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 \${activeTab === "products" ? "text-gray-900" : "text-gray-400"}\`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.products') || "商品管理・card発行"}</span>
                    </button>
                </div>

                {/* --- Wrapper for Activation --- */}
                {activeTab === 'activation' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
`;

// Replace the main wrapper div with the tabs UI
content = content.replace(
    /            <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">/,
    tabsUI
);

const linkQrIndex = content.indexOf('{/* Link QR */}');
const incomingOrdersIndex = content.indexOf('{/* Incoming Orders */}');
const existingProductsIndex = content.indexOf('{/* Existing Products */}');
const orderHistoryIndex = content.indexOf('{/* Order History */}');
const statusGuideIndex = content.indexOf('{/* Status Guide */}');
const endOfFileIndex = content.lastIndexOf('            </div>\\n        </div>\\n    );\\n}');

console.log("Indices:", { linkQrIndex, incomingOrdersIndex, existingProductsIndex, orderHistoryIndex, statusGuideIndex, endOfFileIndex });

if (
    linkQrIndex !== -1 &&
    incomingOrdersIndex !== -1 &&
    existingProductsIndex !== -1 &&
    orderHistoryIndex !== -1 &&
    statusGuideIndex !== -1
) {
    let prefix = content.substring(0, incomingOrdersIndex);

    prefix += `                    </div>\n                )}\n\n                {/* --- Wrapper for Shipping --- */}\n                {activeTab === 'shipping' && (\n                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">\n`;
    prefix += content.substring(incomingOrdersIndex, existingProductsIndex);
    
    // Status guide to end of file is actually orderHistory -> end
    // Let's find exactly the end of the Status Guide card.
    const endMatch = content.match(/<\/CardContent>\s*<\/Card>\s*<\/div>\s*<\/div>\s*\);\s*\}/);
    if (!endMatch) {
        console.log("Could not find exact end match");
        process.exit(1);
    }
    const actualEndIndex = endMatch.index + endMatch[0].indexOf('</Card>') + '</Card>'.length;
    
    const historyToStatusGuide = content.substring(orderHistoryIndex, actualEndIndex);

    prefix += historyToStatusGuide;

    prefix += `\n                    </div>\n                )}\n\n                {/* --- Wrapper for Products --- */}\n                {activeTab === 'products' && (\n                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">\n`;

    prefix += content.substring(existingProductsIndex, orderHistoryIndex);

    prefix += `                    </div>\n                )}\n            </div>\n        </div>\n    );\n}`;

    fs.writeFileSync(filePath, prefix, 'utf8');
    console.log("Refactored successfully");
} else {
    console.error("Could not find sections");
    process.exit(1);
}
