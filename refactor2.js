const fs = require('fs');

try {
    const filePath = 'c:\\\\git\\\\meishigawarini\\\\frontend\\\\app\\\\[locale]\\\\shop\\\\[shopId]\\\\page.tsx';
    let content = fs.readFileSync(filePath, 'utf8');

    // Add Imports
    const importLucideStart = content.indexOf('import { RefreshCw');
    const importLucideEnd = content.indexOf("} from 'lucide-react';", importLucideStart);
    if (importLucideStart !== -1 && importLucideEnd !== -1) {
        const importStr = content.substring(importLucideStart, importLucideEnd);
        if (!importStr.includes('QrCode,')) {
            content = content.substring(0, importLucideEnd) + ", QrCode, Package, Truck " + content.substring(importLucideEnd);
        }
    }

    // Add State
    const stateAnchor = "const [userId, setUserId] = useState<string>('');";
    const stateAnchorIndex = content.indexOf(stateAnchor);
    if (stateAnchorIndex !== -1 && !content.includes('const [activeTab')) {
        content = content.substring(0, stateAnchorIndex + stateAnchor.length) +
            `\n    const [activeTab, setActiveTab] = useState("activation");\n` +
            content.substring(stateAnchorIndex + stateAnchor.length);
    }

    // Replace Main Wrapper
    const mainWrapperStr = '<div className="max-w-7xl mx-auto px-8 py-10 space-y-10">';
    const mainWrapperIndex = content.indexOf(mainWrapperStr);

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

    if (mainWrapperIndex !== -1) {
        content = content.substring(0, mainWrapperIndex) + tabsUI + content.substring(mainWrapperIndex + mainWrapperStr.length);
    }

    const linkQrIndex = content.indexOf('{/* Link QR */}');
    const incomingOrdersIndex = content.indexOf('{/* Incoming Orders */}');
    const existingProductsIndex = content.indexOf('{/* Existing Products */}');
    const orderHistoryIndex = content.indexOf('{/* Order History */}');
    const statusGuideIndex = content.indexOf('{/* Status Guide */}');
    const endOfFileIndex = content.lastIndexOf('            </div>\n        </div>\n    );\n}');

    if (
        linkQrIndex !== -1 &&
        incomingOrdersIndex !== -1 &&
        existingProductsIndex !== -1 &&
        orderHistoryIndex !== -1 &&
        statusGuideIndex !== -1
    ) {
        let prefix = content.substring(0, incomingOrdersIndex);

        prefix += `                    </div>\n                )}\n\n                {/* --- Wrapper for Shipping --- */}\n                {activeTab === 'shipping' && (\n                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">\n`;
        // Shipping content starts with Incoming Orders and goes up to Existing Products
        prefix += content.substring(incomingOrdersIndex, existingProductsIndex);
        
        // Find the actual end of Status Guide
        // We know it's a Card, and then another closing div for the space-y container...
        // Let's just find the last </Card> before the end of the file.
        const lastCardEndIndex = content.lastIndexOf('</Card>', endOfFileIndex);
        if (lastCardEndIndex === -1) throw new Error("Could not find </Card> for Status Guide");
        
        const historyToStatusGuide = content.substring(orderHistoryIndex, lastCardEndIndex + '</Card>'.length);

        prefix += historyToStatusGuide;

        prefix += `\n                    </div>\n                )}\n\n                {/* --- Wrapper for Products --- */}\n                {activeTab === 'products' && (\n                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">\n`;

        prefix += content.substring(existingProductsIndex, orderHistoryIndex);

        prefix += `                    </div>\n                )}\n            </div>\n        </div>\n    );\n}`;

        fs.writeFileSync(filePath, prefix, 'utf8');
        console.log("Refactored successfully");
    } else {
        console.error("Could not find sections indices.", { linkQrIndex, incomingOrdersIndex, existingProductsIndex, orderHistoryIndex, statusGuideIndex });
        process.exit(1);
    }
} catch (e) {
    console.error("Script failed:", e);
    process.exit(1);
}
