import React from 'react';
import { ShippingLabelConfig } from "@shared/api-types";
import { FileText } from "lucide-react";

interface PaperPreviewProps {
    config: ShippingLabelConfig;
    t: (key: string) => string;
}

export const PaperPreview: React.FC<PaperPreviewProps> = ({ config, t }) => {
    const { paper, labelWidth, labelHeight } = config;
    
    // Scale to fit in a reasonable container
    const containerMaxHeight = 200;
    const scale = Math.min(containerMaxHeight / paper.pageHeight, 0.8);
    
    const containerWidth = paper.pageWidth * scale;
    const containerHeight = paper.pageHeight * scale;

    const labels = [];
    if (paper.rows > 0 && paper.cols > 0) {
        for (let r = 0; r < Math.min(paper.rows, 20); r++) { // Safety cap
            for (let c = 0; c < Math.min(paper.cols, 10); c++) {
                const x = paper.offset_x + c * (labelWidth + (paper.cols_gap || 0));
                const y = paper.offset_y + r * (labelHeight + (paper.rows_gap || 0));
                labels.push({ x, y, r, c });
            }
        }
    }

    return (
        <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm mt-4">
            <div className="flex items-center justify-between w-full mb-1 px-1">
                <div className="flex items-center gap-2 text-gray-500">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('shopSettings.shippingLabel.paperPreviewTitle')}</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                    {paper.pageWidth} x {paper.pageHeight} mm
                </div>
            </div>

            <div 
                className="relative bg-gray-50 border border-gray-200 shadow-inner overflow-hidden rounded-sm"
                style={{
                    width: `${containerWidth}px`,
                    height: `${containerHeight}px`
                }}
            >
                {/* Paper Surface */}
                <div className="absolute inset-0 bg-white" />

                {/* Printable Area / Margins indicator */}
                <div 
                    className="absolute border border-dashed border-red-200/50 pointer-events-none"
                    style={{
                        left: `${paper.offset_x * scale}px`,
                        top: `${paper.offset_y * scale}px`,
                        width: `${(paper.pageWidth - paper.offset_x) * scale}px`,
                        height: `${(paper.pageHeight - paper.offset_y) * scale}px`
                    }}
                />

                {labels.map((l, i) => (
                    <div 
                        key={i}
                        className="absolute border border-blue-400/30 bg-blue-50/30 flex items-center justify-center text-[7px] text-blue-500/50 font-bold select-none overflow-hidden"
                        style={{
                            left: `${l.x * scale}px`,
                            top: `${l.y * scale}px`,
                            width: `${labelWidth * scale}px`,
                            height: `${labelHeight * scale}px`
                        }}
                    >
                        {l.r + 1}-{l.c + 1}
                    </div>
                ))}
            </div>
            
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-blue-50 border border-blue-400/30 rounded-[1px]" />
                    <span>{t('shopSettings.shippingLabel.labelsLabel')}: {paper.cols}x{paper.rows}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 border border-dashed border-red-200/50 rounded-[1px]" />
                    <span>{t('shopSettings.shippingLabel.marginsLabel')}: {paper.offset_x}/{paper.offset_y}mm</span>
                </div>
            </div>
        </div>
    );
};
