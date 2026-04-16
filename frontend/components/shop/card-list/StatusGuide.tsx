'use client';

import React from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from '@/lib/utils';
import { cardStatusCss, shortToStatus, cardStatusList } from '@/components/share/statusCss';

import { useTranslations } from 'next-intl';

export function StatusGuide() {
    const t = useTranslations('ShopPage');
    const st = useTranslations('Status');
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    {t('statusGuide.title')}
                </CardTitle>
                <CardDescription>{t('statusGuide.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
                {/* Flow */}
                <div className="space-y-4">
                    <h3 className="font-bold text-gray-700">{t('statusGuide.flow')}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.una"))}>
                            {st(shortToStatus["short.una"])}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.lin"))}>
                            {st(shortToStatus["short.lin"])}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.act"))}>
                            {st(shortToStatus["short.act"])}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.use"))}>
                            {st(shortToStatus["short.use"])}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.shi"))}>
                            {st(shortToStatus["short.shi"])}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={cn("px-3 py-1 rounded border", cardStatusCss("short.com"))}>
                            {st(shortToStatus["short.com"])}
                        </span>
                    </div>
                </div>
                {/* List */}
                <div className="space-y-4">
                    <h3 className="font-bold text-gray-700">{t('statusGuide.list')}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                        {cardStatusList.map((key, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className={cn("px-2 py-1 rounded border text-xs font-bold", cardStatusCss(key))}>
                                        {st(key)}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {t(`statusGuide.statuses.${key}`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
