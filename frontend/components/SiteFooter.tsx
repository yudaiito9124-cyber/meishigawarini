"use client";

import { usePathname } from "@/i18n/routing";
import { useRouter } from "next/navigation";

export function SiteFooter({ siteName }: { siteName: string }) {
    const pathname = usePathname();
    const router = useRouter();

    // Hide the header on the top page
    // if (pathname === "/") {
    //     return null;
    // }

    return (
        <footer className="py-10 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between px-8 text-sm text-gray-400" >
            {/* <a
                href="/#"
                className="font-black text-black text-base mb-4 md:mb-0"
            >
                {siteName}
            </a> */}
            <div className="flex items-center justify-center mb-2 md:mb-0">
                <img
                    src="/sitelogo-noicon.png"
                    alt="Logo"
                    className="h-8 object-cover cursor-pointer"
                    onClick={() => router.push('/#')}
                    />
            </div>
            <div className="flex gap-6">
                {/* <a href="/#howto" className="hover:text-black transition-colors">使い方</a>
                <a href="/#shops" className="hover:text-black transition-colors">ショップ一覧</a>
                <a href="/#for-shops" className="hover:text-black transition-colors">ショップ開設</a> */}
            </div>
            <span className="mt-4 md:mt-0">© 2025 {siteName}</span>
        </footer >
    );
}
