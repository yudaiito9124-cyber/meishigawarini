'use client';

import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, ChevronsLeft, ChevronsRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShippingLabelConfig, TextPos, PaperFormat } from "@shared/api-types";
import { PaperPreview } from "./PaperPreview";



interface ShippingLabelSettingsProps {
    settings: {
        yubin?: ShippingLabelConfig;
        takkyubin?: ShippingLabelConfig;
    };
    onUpdate: (updater: (prev: any) => any) => void;
    t: (key: string) => string;
}

// A-one 31370 のサイズに無理やり詰め込み
export const DEFAULT_POST_CONFIG: ShippingLabelConfig = {
    labelWidth: 86.4,
    labelHeight: 50.8,
    paper: { pageWidth: 210, pageHeight: 297, cols: 2, rows: 5, cols_gap: 0, rows_gap: 0, offset_x: 18.6, offset_y: 21.2 },
    layout: {
        recipientZipPos: { x: 2, y: 2.5, fontSize: 12, enabled: true },
        recipientAddressPos: { x: 2, y: 7.5, fontSize: 10, enabled: true, maxWidth: 80 },
        recipientNamePos: { x: 2, y: 22, fontSize: 16, fontWeight: 'bold', enabled: true, maxWidth: 80 },
        recipientPhonePos: { x: 0, y: 0, fontSize: 10, enabled: false, maxWidth: 85 },
        senderZipPos: { x: 2, y: 31, fontSize: 9, enabled: true },
        senderAddressPos: { x: 2, y: 34.5, fontSize: 8, enabled: true, maxWidth: 80 },
        senderNamePos: { x: 5, y: 37.5, fontSize: 10, enabled: true, maxWidth: 80 },
        senderPhonePos: { x: 60, y: 31, fontSize: 8, enabled: true, maxWidth: 80 },
        orderIdPos: { x: 2, y: 45, fontSize: 7, enabled: true },
        productNamePos: { x: 2, y: 41.5, fontSize: 9, enabled: true, maxWidth: 80 },
        preferredDatePos: { x: 0, y: 0, fontSize: 9, enabled: false, maxWidth: 85 },
        preferredTimePos: { x: 0, y: 0, fontSize: 9, enabled: false, maxWidth: 85 },
    }
};

// A-one 31370 のサイズに無理やり詰め込み
export const DEFAULT_EXPRESS_CONFIG: ShippingLabelConfig = {
    labelWidth: 86.4,
    labelHeight: 50.8,
    paper: { pageWidth: 210, pageHeight: 297, cols: 2, rows: 5, cols_gap: 0, rows_gap: 0, offset_x: 18.6, offset_y: 21.2 },
    layout: {
        recipientZipPos: { x: 2, y: 2, fontSize: 10, enabled: true },
        recipientAddressPos: { x: 2, y: 7, fontSize: 9, enabled: true, maxWidth: 80 },
        recipientNamePos: { x: 1.5, y: 20, fontSize: 12, fontWeight: 'bold', enabled: true, maxWidth: 80 },
        recipientPhonePos: { x: 50, y: 2, fontSize: 10, enabled: true, maxWidth: 80 },
        senderZipPos: { x: 2, y: 31.5, fontSize: 8, enabled: true },
        senderAddressPos: { x: 2, y: 35, fontSize: 7, enabled: true, maxWidth: 80 },
        senderNamePos: { x: 5, y: 38.5, fontSize: 9, enabled: true },
        senderPhonePos: { x: 58, y: 31.5, fontSize: 8, enabled: true },
        orderIdPos: { x: 2, y: 45.5, fontSize: 6, enabled: true },
        productNamePos: { x: 2, y: 42.5, fontSize: 8, enabled: true },
        preferredDatePos: { x: 5, y: 25.5, fontSize: 9, enabled: true, maxWidth: 85 },
        preferredTimePos: { x: 28, y: 25.5, fontSize: 9, enabled: true, maxWidth: 85 },
    }
};

function RepeatButton({ onAction, ...props }: { onAction: () => void } & React.ComponentProps<typeof Button>) {
    const actionRef = React.useRef(onAction);
    actionRef.current = onAction;

    const timeoutRef = React.useRef<any>(null);
    const intervalRef = React.useRef<any>(null);

    const stop = React.useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timeoutRef.current = null;
        intervalRef.current = null;
    }, []);

    const start = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if ('button' in e && e.button !== 0) return;

        stop();
        actionRef.current();

        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                actionRef.current();
            }, 80);
        }, 400);
    }, [stop]);

    React.useEffect(() => {
        return stop;
    }, [stop]);

    return (
        <Button
            {...props}
            type="button"
            onMouseDown={start}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchEnd={stop}
            onContextMenu={(e) => e.preventDefault()}
            className={cn("select-none touch-none", props.className)}
        />
    );
}

interface LabelPreviewProps {
    config: ShippingLabelConfig;
    updateConfig: (patch: Partial<ShippingLabelConfig>) => void;
    t: any;
}

const LabelPreview = React.memo(({ config, updateConfig, t }: LabelPreviewProps) => {
    const scale = 3; // 1mm = 3px approx for preview
    return (
        <div className="flex flex-col items-center gap-4">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4" /> {t('shopSettings.shippingLabel.preview')}
            </h4>
            <div
                className="relative bg-white border border-gray-300 shadow-xl overflow-hidden"
                style={{
                    width: `${config.labelWidth * scale}px`,
                    height: `${config.labelHeight * scale}px`
                }}
            >
                {Object.entries(config.layout).map(([key, pos]: [string, any]) => {
                    if (!pos || !pos.enabled) return null;
                    return (
                        <div
                            key={key}
                            className="absolute pointer-events-none"
                            style={{
                                left: `${pos.x * scale}px`,
                                top: `${pos.y * scale}px`,
                                width: pos.maxWidth ? `${pos.maxWidth * scale}px` : 'auto',
                                fontSize: `${pos.fontSize * scale * 0.4}px`,
                                fontWeight: pos.fontWeight || 'normal',
                                fontFamily: "'Noto Sans JP', sans-serif",
                                lineHeight: 1.2,
                                whiteSpace: 'normal',
                                wordBreak: 'break-all'
                            }}
                        >
                            {key === 'recipientZipPos' && "〒123-4567"}
                            {key === 'recipientAddressPos' && "秋田県秋田市名刺がわりに町1-1 ハイツ名刺代わり101号室 長い住所のテスト用テキスト"}
                            {key === 'recipientNamePos' && "名刺 代わりに 様"}
                            {key === 'recipientPhonePos' && "090-0000-0000"}
                            {key === 'senderZipPos' && "〒150-0000"}
                            {key === 'senderAddressPos' && "秋田県秋田市名刺がわりに町1-1"}
                            {key === 'senderNamePos' && "発送元ショップ名"}
                            {key === 'senderPhonePos' && "03-0000-0000"}
                            {key === 'orderIdPos' && "2026XXXXXXXXXX-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"}
                            {key === 'productNamePos' && "オリジナルギフトカード"}
                            {key === 'preferredDatePos' && "2024/04/24"}
                            {key === 'preferredTimePos' && "14-16時"}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

interface AdjusterPanelProps {
    title: string;
    field: keyof ShippingLabelConfig['layout'];
    config: ShippingLabelConfig;
    updateLayout: (field: string, patch: Partial<TextPos>) => void;
    adjust: (field: keyof ShippingLabelConfig['layout'], subfield: 'x' | 'y' | 'fontSize' | 'maxWidth', delta: number) => void;
}

const AdjusterPanel = React.memo(({ title, field, config, updateLayout, adjust }: AdjusterPanelProps) => {
    const pos = config.layout[field] || { x: 0, y: 0, fontSize: 10, enabled: true };

    return (
        <div className={cn("border rounded-lg p-3 bg-white", !pos.enabled && "opacity-50 grayscale")}>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <Switch
                        checked={pos.enabled !== false}
                        onCheckedChange={checked => updateLayout(field as string, { enabled: checked })}
                    />
                    <span className="text-sm font-bold">{title}</span>
                </div>
            </div>
            <div className="flex gap-3 text-[10px] font-mono text-gray-400 mb-3 px-1 border-b border-gray-50 pb-1">
                <span>X: {pos.x.toFixed(1)}</span>
                <span>Y: {pos.y.toFixed(1)}</span>
                <span>Size: {pos.fontSize.toFixed(1)}</span>
                {pos.maxWidth !== undefined && <span>Width: {pos.maxWidth.toFixed(1)}</span>}
            </div>
            <div className="flex items-center justify-between">
                <div className="grid grid-cols-3 gap-1">
                    <div />
                    <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'y', -0.5)} disabled={!pos.enabled}><ChevronUp className="w-4 h-4" /></RepeatButton>
                    <div />
                    <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'x', -0.5)} disabled={!pos.enabled}><ChevronLeft className="w-4 h-4" /></RepeatButton>
                    <div className="flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-gray-300" /></div>
                    <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'x', 0.5)} disabled={!pos.enabled}><ChevronRight className="w-4 h-4" /></RepeatButton>
                    <div />
                    <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'y', 0.5)} disabled={!pos.enabled}><ChevronDown className="w-4 h-4" /></RepeatButton>
                    <div />
                </div>
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 items-center">
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Size</span>
                        <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'fontSize', 1)} disabled={!pos.enabled}><ChevronsUp className="w-4 h-4" /></RepeatButton>
                        <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'fontSize', -1)} disabled={!pos.enabled}><ChevronsDown className="w-4 h-4" /></RepeatButton>
                    </div>
                    <div className="flex flex-col gap-1 items-center">
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Width</span>
                        <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'maxWidth', 5)} disabled={!pos.enabled}><ChevronsRight className="w-4 h-4" /></RepeatButton>
                        <RepeatButton variant="ghost" size="icon" className="h-7 w-7" onAction={() => adjust(field, 'maxWidth', -5)} disabled={!pos.enabled}><ChevronsLeft className="w-4 h-4" /></RepeatButton>
                    </div>
                </div>
            </div>
        </div>
    );
});

export function ShippingLabelSettings({ settings, onUpdate, t }: ShippingLabelSettingsProps) {
    const [activeTab, setActiveTab] = React.useState<'yubin' | 'takkyubin'>('yubin');

    const defaultConfig = activeTab === 'yubin' ? DEFAULT_POST_CONFIG : DEFAULT_EXPRESS_CONFIG;
    const savedConfig = settings[activeTab];

    const config = React.useMemo(() => {
        if (!savedConfig) return defaultConfig;

        // サポートされているすべてのレイアウトキー
        const layoutKeys = [
            'recipientZipPos', 'recipientAddressPos', 'recipientNamePos', 'recipientPhonePos',
            'senderZipPos', 'senderAddressPos', 'senderNamePos', 'senderPhonePos',
            'orderIdPos', 'productNamePos', 'preferredDatePos', 'preferredTimePos'
        ] as const;

        return {
            ...defaultConfig,
            ...savedConfig,
            layout: layoutKeys.reduce((acc, key) => {
                const k = key as keyof typeof defaultConfig.layout;
                const def = defaultConfig.layout[k];
                const sav = savedConfig.layout?.[k];

                if (def || sav) {
                    acc[k] = {
                        ...(def || { x: 0, y: 0, fontSize: 10, enabled: false }),
                        ...(sav || {})
                    } as any;
                }
                return acc;
            }, {} as any)
        };
    }, [savedConfig, defaultConfig]);

    const updateConfig = (patch: Partial<ShippingLabelConfig>) => {
        onUpdate((prev: any) => {
            const currentSaved = prev[activeTab] || {};
            const nextSaved = { ...currentSaved, ...patch };
            // Ensure nested objects are merged correctly if they exist in patch
            if (patch.layout) nextSaved.layout = { ...currentSaved.layout, ...patch.layout };
            if (patch.paper) nextSaved.paper = { ...currentSaved.paper, ...patch.paper };
            return {
                ...prev,
                [activeTab]: nextSaved
            };
        });
    };

    const updatePaper = (patch: Partial<PaperFormat>) => {
        onUpdate((prev: any) => {
            const currentSaved = prev[activeTab] || {};
            const nextSaved = {
                ...currentSaved,
                paper: { ...(currentSaved.paper || defaultConfig.paper), ...patch }
            };
            return { ...prev, [activeTab]: nextSaved };
        });
    };

    const updateLayout = (field: string, patch: Partial<TextPos>) => {
        onUpdate((prev: any) => {
            const currentSaved = prev[activeTab] || {};
            const currentLayout = currentSaved.layout || {};
            const currentPos = currentLayout[field] || (defaultConfig.layout as any)[field] || { x: 0, y: 0, fontSize: 10, enabled: false };

            const nextSaved = {
                ...currentSaved,
                layout: {
                    ...currentLayout,
                    [field]: { ...currentPos, ...patch }
                }
            };
            return { ...prev, [activeTab]: nextSaved };
        });
    };

    const adjust = React.useCallback((field: keyof ShippingLabelConfig['layout'], subfield: 'x' | 'y' | 'fontSize' | 'maxWidth', delta: number) => {
        onUpdate((prev: any) => {
            const currentSaved = prev[activeTab] || {};
            const currentLayout = currentSaved.layout || {};
            const currentPos = (currentLayout as any)[field] || (defaultConfig.layout as any)[field] || { x: 0, y: 0, fontSize: 10, enabled: false };

            const nextVal = Number(((currentPos[subfield] || 0) + delta).toFixed(1));

            const nextSaved = {
                ...currentSaved,
                layout: {
                    ...currentLayout,
                    [field]: { ...currentPos, [subfield]: nextVal }
                }
            };
            return { ...prev, [activeTab]: nextSaved };
        });
    }, [activeTab, defaultConfig.layout, onUpdate]);

    return (
        <div className="space-y-6">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                <Button
                    type="button"
                    variant={activeTab === 'yubin' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-lg font-bold"
                    onClick={() => setActiveTab('yubin')}
                >
                    {t('shopSettings.shippingLabel.post')}
                </Button>
                <Button
                    type="button"
                    variant={activeTab === 'takkyubin' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-lg font-bold"
                    onClick={() => setActiveTab('takkyubin')}
                >
                    {t('shopSettings.shippingLabel.express')}
                </Button>
            </div>

            <div className="flex flex-col xl:flex-row gap-8">
                <div className="flex-1 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Paper Config */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider px-1">{t('shopSettings.shippingLabel.pageFormat')}</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.pageWidth')}</Label>
                                    <Input type="number" value={config.paper.pageWidth} onChange={e => updatePaper({ pageWidth: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.pageHeight')}</Label>
                                    <Input type="number" value={config.paper.pageHeight} onChange={e => updatePaper({ pageHeight: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.cols')}</Label>
                                    <Input type="number" value={config.paper.cols} onChange={e => updatePaper({ cols: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.rows')}</Label>
                                    <Input type="number" value={config.paper.rows} onChange={e => updatePaper({ rows: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.colGap')}</Label>
                                    <Input type="number" value={config.paper.cols_gap} onChange={e => updatePaper({ cols_gap: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.rowGap')}</Label>
                                    <Input type="number" value={config.paper.rows_gap} onChange={e => updatePaper({ rows_gap: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.offsetX')}</Label>
                                    <Input type="number" value={config.paper.offset_x} onChange={e => updatePaper({ offset_x: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.offsetY')}</Label>
                                    <Input type="number" value={config.paper.offset_y} onChange={e => updatePaper({ offset_y: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.width')}</Label>
                                    <Input type="number" value={config.labelWidth} onChange={e => updateConfig({ labelWidth: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px]">{t('shopSettings.shippingLabel.height')}</Label>
                                    <Input type="number" value={config.labelHeight} onChange={e => updateConfig({ labelHeight: Number(e.target.value) })} className="h-9 rounded-lg" />
                                </div>
                            </div>
                            <PaperPreview config={config} t={t} />
                        </div>


                        {/* Layout Config */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider px-1">{t('shopSettings.shippingLabel.layout')}</h4>
                            <div className="grid grid-cols-1 gap-2 max-h-[700px] overflow-y-auto pr-2">
                                <AdjusterPanel title={t('shopSettings.shippingLabel.recipientZip')} field="recipientZipPos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.recipientAddress')} field="recipientAddressPos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.recipientName')} field="recipientNamePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.recipientPhone')} field="recipientPhonePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.senderZip')} field="senderZipPos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.senderAddress')} field="senderAddressPos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.senderName')} field="senderNamePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.senderPhone')} field="senderPhonePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.orderId')} field="orderIdPos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.productName')} field="productNamePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.preferredDate')} field="preferredDatePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                                <AdjusterPanel title={t('shopSettings.shippingLabel.preferredTime')} field="preferredTimePos" config={config} updateLayout={updateLayout} adjust={adjust} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1">
                    <LabelPreview config={config} updateConfig={updateConfig} t={t} />
                </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[11px] text-blue-700 leading-relaxed">
                    {t('shopSettings.shippingLabel.unitNotice')}<br />
                    {t('shopSettings.shippingLabel.originNotice')}<br />
                    {t('shopSettings.shippingLabel.defaultSettingsNotice')}
                </p>
            </div>
        </div>
    );
}
