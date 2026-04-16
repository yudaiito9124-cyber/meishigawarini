'use client';

import React from 'react';
import { Table2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTranslations } from 'next-intl';
import { useCardListContext } from '../CardListSection';
import { useCardListUI } from '@/store/useShopStore';

export function ColumnSettingsDialog() {
    const t = useTranslations('ShopPage');
    const {
        orderColGroups,
        orderColOptions,
    } = useCardListContext();

    const { isColumnSettingsOpen: open, visibleOrderColumns, set: setList } = useCardListUI();

    const onOpenChange = (isOpen: boolean) => setList({ isColumnSettingsOpen: isOpen });

    const setVisibleOrderColumns = (val: string[] | ((prev: string[]) => string[])) => {
        setList((state) => ({
            visibleOrderColumns: typeof val === 'function' ? val(state.visibleOrderColumns) : val
        }));
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
                <DialogHeader className="p-6 pb-4 border-b bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Table2 className="w-5 h-5 text-primary" />
                        </div>
                        <DialogTitle className="text-xl">表示項目の設定</DialogTitle>
                    </div>
                    <DialogDescription>
                        テーブルに表示する項目を選択してください。
                    </DialogDescription>
                </DialogHeader>

                <div className="p-6 py-4 max-h-[60vh] overflow-y-auto space-y-6">
                    {orderColGroups.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1 h-3 bg-gray-300 rounded-full" />
                                {group.title}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {group.columns.map((col) => (
                                    <div
                                        key={col.key}
                                        onClick={() => {
                                            const isVisible = visibleOrderColumns.includes(col.key);
                                            if (isVisible && visibleOrderColumns.length > 1) {
                                                setVisibleOrderColumns((prev) => prev.filter((k) => k !== col.key));
                                            } else if (!isVisible) {
                                                setVisibleOrderColumns((prev) => [...prev, col.key]);
                                            }
                                        }}
                                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer group ${
                                            visibleOrderColumns.includes(col.key)
                                                ? 'border-primary/20 bg-primary/5'
                                                : 'border-transparent bg-gray-50 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    visibleOrderColumns.includes(col.key)
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'bg-white text-gray-400 group-hover:text-gray-600'
                                                }`}
                                            >
                                                {col.icon}
                                            </div>
                                            <div className="text-sm font-medium cursor-pointer">{col.label}</div>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Switch
                                                checked={visibleOrderColumns.includes(col.key)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) setVisibleOrderColumns((prev) => [...prev, col.key]);
                                                    else if (visibleOrderColumns.length > 1)
                                                        setVisibleOrderColumns((prev) => prev.filter((k) => k !== col.key));
                                                }}
                                                className="scale-90"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter className="p-4 border-t bg-gray-50/50 flex flex-row items-center justify-between gap-2 sm:gap-0">
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleOrderColumns(['ts_updated_at', 'product_id', 'status', 'memo_for_shop'])}
                            className="text-[11px] text-gray-500 hover:text-primary"
                        >
                            デフォルトに戻す
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleOrderColumns(orderColOptions.map((c) => c.key))}
                            className="text-[11px] text-gray-500 hover:text-primary"
                        >
                            すべて選択
                        </Button>
                    </div>
                    <Button onClick={() => onOpenChange(false)} className="px-6 rounded-full shadow-md">
                        閉じる
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
