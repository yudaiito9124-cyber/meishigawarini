/**
 * ファイル概要: カードデザイン管理エディタ (Card Design Editor)
 * 
 * 役割:
 * システム管理者向けに、カードの背景画像設定、サイズ、および各種印刷要素（QRコード、PIN、コードID）の
 * 配置位置やサイズを動的に編集・調整・プレビュー・保存するためのコンポーネントです。
 * 
 * 主要機能:
 * 1. カードデザインのCRUD処理（一覧取得、新規作成、保存、削除）。
 * 2. カードの表面・裏面の背景画像アップロードおよびサムネイル生成連携。
 * 3. 印刷配置要素（QR, PIN, Code ID）の位置（X, Y座標）およびサイズ（S）の数値直接入力および微調整。
 * 4. 表裏それぞれのレイアウトと配置要素のリアルタイムプレビュー表示。
 * 
 * コンテキスト:
 * 管理者ダッシュボード（Admin Dashboard）内の「デザイン管理」タブから呼び出されます。
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Upload, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, ChevronsLeft, ChevronsRight, RefreshCw, Layers, Paintbrush, QrCode, Hash, Barcode, Move, Minus, FilePenLine, PictureInPicture, Images } from "lucide-react";
import { fetchAuthSession } from 'aws-amplify/auth';
import { cn } from "@/lib/utils";
import { useTranslations } from 'next-intl';
import { generateId } from "@/lib/id";
import { resizeImage } from "@/lib/image-utils";
import { adminApi } from "@/lib/api/admin";
import { UnifiedChatNotifications } from "../chat/UnifiedChatNotifications";

interface CardDesign {
    design_id: string;
    SK?: string; // DynamoDB Sort Key
    name: string;
    description: string;
    bgimgf: string;
    bgimgb: string;
    thumbf?: string;
    thumbb?: string;
    width: number;
    height: number;
    qrsize: number;
    qrpos: { x: number; y: number };
    pinsize: number;
    pinpos: { x: number; y: number };
    codesize: number;
    codepos: { x: number; y: number };
    isfront_qr: boolean;
    isfront_pin: boolean;
    isfront_code: boolean;
}

/**
 * 位置（X, Y）またはサイズ（S）の数値を直接入力・表示するための入力バッジコンポーネント。
 * 微調整用ボタンとの連動、および入力中の一時的な文字入力（空文字やマイナス符号）の許容を実現しています。
 * 
 * @param label バッジのラベル（X / Y / S）
 * @param value 現在保持されている数値
 * @param onChange 値が正常に更新された際に呼び出されるコールバック
 */
const ValueBadgeInput = ({
    label,
    value,
    onChange
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) => {
    // 入力中の一時状態を保持するためのローカルステート
    const [tempValue, setTempValue] = useState(value.toString());

    // 外部（微調整ボタン等）で値が書き換わった場合に、ローカル入力欄と同期する
    useEffect(() => {
        // タイピング中の一時入力状態（空文字やマイナス符号のみ）の時は同期をスキップする
        if (tempValue === "" || tempValue === "-") {
            return;
        }
        const parsed = parseFloat(tempValue);
        // 外部の値とローカルの数値が異なる場合のみ同期を行う
        if (isNaN(parsed) || parsed !== value) {
            setTempValue(value.toString());
        }
    }, [value]);

    return (
        <div className="bg-mist-900/80 px-1.5 py-0.5 rounded border border-mist-700/50 font-mono text-[9px] flex gap-1 items-center hover:border-sky-500/50 transition-colors">
            <span className="text-mist-500 font-medium select-none">{label}</span>
            <input
                type="number"
                step="any"
                value={tempValue}
                // 値 of 変更時に即座に親ステートの更新を実行する
                onChange={(e) => {
                    setTempValue(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                        onChange(val);
                    }
                }}
                // 入力欄からフォーカスが外れた際に、一時的な状態をリセットしフォーマットを確定させる
                onBlur={() => {
                    const parsed = parseFloat(tempValue);
                    if (tempValue === "" || isNaN(parsed)) {
                        setTempValue(value.toString());
                    } else {
                        setTempValue(parsed.toString());
                    }
                }}
                className="bg-transparent text-sky-400 w-11 text-right font-bold focus:outline-none focus:bg-mist-800 rounded px-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
        </div>
    );
};

/**
 * ボタン長押し（長クリック）時にアクションを連続実行するためのカスタムフック。
 * 初回押下時にアクションを即実行し、一定時間（delay）押し続けられた場合に
 * 一定間隔（interval）でアクションをリピート実行します。
 * キーボード操作（フォーカス時のSpace/Enter押下）によるアクセシビリティも維持します。
 */
const useContinuousPress = (action: () => void, delay = 400, interval = 80) => {
    const timerRef = useRef<any>(null);
    const intervalRef = useRef<any>(null);
    const actionRef = useRef(action);
    const hasPressedRef = useRef(false);

    // アクションの最新クロージャを保持してクロージャ問題を防止
    useEffect(() => {
        actionRef.current = action;
    }, [action]);

    const start = () => {
        actionRef.current();
        stop();
        timerRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                actionRef.current();
            }, interval);
        }, delay);
    };

    const stop = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timerRef.current = null;
        intervalRef.current = null;
    };

    // アンマウント時にタイマーをクリア
    useEffect(() => {
        return stop;
    }, []);

    return {
        onMouseDown: (e: React.MouseEvent) => {
            if (e.button !== 0) return; // 左クリックのみ
            hasPressedRef.current = true;
            start();
        },
        onMouseUp: stop,
        onMouseLeave: stop,
        onTouchStart: (e: React.TouchEvent) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            hasPressedRef.current = true;
            start();
        },
        onTouchEnd: stop,
        onTouchCancel: stop,
        onClick: (e: React.MouseEvent) => {
            if (hasPressedRef.current) {
                hasPressedRef.current = false;
                return;
            }
            actionRef.current();
        }
    };
};

const CompactAdjusterPanel = ({
    selectedElement, onSelectedElementChange,
    isFront, onFrontChange,
    posField, posValue,
    sizeField, sizeValue,
    frontToggleLabelL,
    frontToggleLabelR,
    onValueChange,
    onAdjust
}: {
    selectedElement: 'qr' | 'pin' | 'code';
    onSelectedElementChange: (v: 'qr' | 'pin' | 'code') => void;
    isFront: boolean;
    onFrontChange: (v: boolean) => void;
    posField: 'qrpos' | 'pinpos' | 'codepos';
    posValue: { x: number; y: number };
    sizeField: 'qrsize' | 'pinsize' | 'codesize';
    sizeValue: number;
    frontToggleLabelL: string;
    frontToggleLabelR: string;
    onValueChange: (field: 'qrpos' | 'pinpos' | 'codepos' | 'qrsize' | 'pinsize' | 'codesize', subfield: 'x' | 'y' | null, val: number) => void;
    onAdjust: (field: string, subfield: string | null, delta: number) => void;
}) => {
    const t = useTranslations('AdminPage');

    // ローカルでの入力状態を保持し、ユーザーが快適に入力・タイピングできるようにします
    const [tempSize, setTempSize] = useState(sizeValue.toString());
    const [tempX, setTempX] = useState(posValue.x.toString());
    const [tempY, setTempY] = useState(posValue.y.toString());

    // 外部のサイズ変更（サイズ調整ボタンなど）をローカル状態と同期します
    useEffect(() => {
        if (tempSize === "" || tempSize === "-") return;
        const parsed = parseFloat(tempSize);
        if (isNaN(parsed) || parsed !== sizeValue) {
            setTempSize(sizeValue.toString());
        }
    }, [sizeValue]);

    // 外部のX座標の変更（D-Pad等）をローカル状態と同期します
    useEffect(() => {
        if (tempX === "" || tempX === "-") return;
        const parsed = parseFloat(tempX);
        if (isNaN(parsed) || parsed !== posValue.x) {
            setTempX(posValue.x.toString());
        }
    }, [posValue.x]);

    // 外部のY座標の変更（D-Pad等）をローカル状態と同期します
    useEffect(() => {
        if (tempY === "" || tempY === "-") return;
        const parsed = parseFloat(tempY);
        if (isNaN(parsed) || parsed !== posValue.y) {
            setTempY(posValue.y.toString());
        }
    }, [posValue.y]);

    // ボタン長押し操作用フックの初期化
    const pressDec10 = useContinuousPress(() => onAdjust(sizeField, null, -1));
    const pressDec01 = useContinuousPress(() => onAdjust(sizeField, null, -0.1));
    const pressInc10 = useContinuousPress(() => onAdjust(sizeField, null, 1));
    const pressInc01 = useContinuousPress(() => onAdjust(sizeField, null, 0.1));

    const pressUp10 = useContinuousPress(() => onAdjust(posField, 'y', -1));
    const pressUp01 = useContinuousPress(() => onAdjust(posField, 'y', -0.1));
    const pressDown10 = useContinuousPress(() => onAdjust(posField, 'y', 1));
    const pressDown01 = useContinuousPress(() => onAdjust(posField, 'y', 0.1));
    const pressLeft10 = useContinuousPress(() => onAdjust(posField, 'x', -1));
    const pressLeft01 = useContinuousPress(() => onAdjust(posField, 'x', -0.1));
    const pressRight10 = useContinuousPress(() => onAdjust(posField, 'x', 1));
    const pressRight01 = useContinuousPress(() => onAdjust(posField, 'x', 0.1));

    // 選択された要素に応じたヘッダー右横のアイコン・サンプル文字をレンダリングします
    const renderHeaderImage = () => {
    // 共通クラス
    const badgeClass = "px-3 font-mono flex items-center justify-center font-bold bg-mist-900/50 border border-mist-800 text-sky-400 select-none shrink-0";
    
    // 全体を中央寄せするための親divで囲む
    return (
        <div className="flex justify-center w-full">
            {selectedElement === 'qr' ? (
                <div className={`${badgeClass} w-15 !px-0 rounded-xl h-15`}>
                    <QrCode className="w-11 h-11" />
                </div>
            ) : selectedElement === 'pin' ? (
                <div className={`${badgeClass} text-[25px] rounded-full px-10 h-12`}>12345678</div>
            ) : (
                <div className={`${badgeClass} text-[15px] rounded-full px-10 h-10`}>abcdefgh-ijkl-mn...</div>
            )}
        </div>
    );
    };

    return (
        <div className="group flex flex-col rounded-xl p-2 space-y-2">
            {/* ヘッダー部分：選択プルダウンと表示バッジ、表面記載トグル */}
            <div className="flex items-center select-none justify-center rounded-full bg-mist-800 border border-mist-700 px-2 py-1.5 gap-4 hover:bg-mist-700">
                <div className="flex items-center gap-2 justify-center">
                    <select
                        value={selectedElement}
                        onChange={(e) => onSelectedElementChange(e.target.value as 'qr' | 'pin' | 'code')}
                        className="bg-transparent text-lg font-bold text-white focus:outline-none cursor-pointer pr-4 select-none hover:text-sky-400 transition-colors"
                    >
                        <option value="qr" className="bg-mist-900 text-white">{t('cardDesignEditor.qrCode')}</option>
                        <option value="pin" className="bg-mist-900 text-white">{t('cardDesignEditor.pin')}</option>
                        <option value="code" className="bg-mist-900 text-white">{t('cardDesignEditor.codeId')}</option>
                    </select>
                </div>
            </div>

            {/* 操作パネル：左右2カラムレイアウト */}
            <div className="flex gap-2 items-stretch flex-col border border-mist-700 rounded-xl p-2 bg-mist-800">
                <div className="flex h-15 justify-center items-center">   
                {renderHeaderImage()}
                </div>
                
                <div className="flex gap-4 items-stretch flex-row">
                    {/* 左カラム：サイズ設定 */}
                    <div className="flex flex-1 flex-col p-0 space-y-4">
                        {/* 「サイズ」見出し */}
                        <div className="px-2 py-1 text-center font-bold text-lg text-mist-200 select-none">
                            {t('cardDesignEditor.size')}
                        </div>
                        {/* - と + の調整エリア */}
                        <div className="grid grid-cols-2 gap-1.5 flex-1">
                            {/* 縮小ブロック (-) */}
                            <div className="border border-mist-700 bg-mist-900 rounded-xl p-2 flex flex-col items-center justify-between gap-3">
                                <span className="text-4xl font-extrabold text-white select-none leading-none my-auto">ー</span>
                                <div className="flex flex-col gap-1.5 w-full mt-auto">
                                    <button
                                        type="button"
                                        {...pressDec10}
                                        title={t('cardDesignEditor.decreaseSize', { amount: '1.0', unit: selectedElement === 'qr' ? 'mm' : 'pt' })}
                                        className="w-full h-10 py-1.5 rounded bg-mist-800 hover:bg-mist-700 text-xs font-semibold text-white transition-colors border border-mist-700 cursor-pointer text-center"
                                    >
                                        -1.0 {selectedElement === 'qr' ? 'mm' : 'pt'}
                                    </button>
                                    <button
                                        type="button"
                                        {...pressDec01}
                                        title={t('cardDesignEditor.decreaseSize', { amount: '0.1', unit: selectedElement === 'qr' ? 'mm' : 'pt' })}
                                        className="w-full h-10 py-1 rounded bg-mist-800 hover:bg-mist-700 text-[11px] font-semibold text-white/90 transition-colors border border-mist-700 cursor-pointer text-center"
                                    >
                                        -0.1 {selectedElement === 'qr' ? 'mm' : 'pt'}
                                    </button>
                                </div>
                            </div>

                            {/* 拡大ブロック (+) */}
                            <div className="border border-mist-700 bg-mist-900 rounded-xl p-2 flex flex-col items-center justify-between gap-3">
                                <span className="text-4xl font-extrabold text-white select-none leading-none my-auto">＋</span>
                                <div className="flex flex-col gap-1.5 w-full mt-auto">
                                    <button
                                        type="button"
                                        {...pressInc10}
                                        title={t('cardDesignEditor.increaseSize', { amount: '1.0', unit: selectedElement === 'qr' ? 'mm' : 'pt' })}
                                        className="w-full h-10 py-1.5 rounded bg-mist-800 hover:bg-mist-700 text-xs font-semibold text-white transition-colors border border-mist-700 cursor-pointer text-center"
                                    >
                                        +1.0 {selectedElement === 'qr' ? 'mm' : 'pt'}
                                    </button>
                                    <button
                                        type="button"
                                        {...pressInc01}
                                        title={t('cardDesignEditor.increaseSize', { amount: '0.1', unit: selectedElement === 'qr' ? 'mm' : 'pt' })}
                                        className="w-full h-10 py-1 rounded bg-mist-800 hover:bg-mist-700 text-[11px] font-semibold text-white/90 transition-colors border border-mist-700 cursor-pointer text-center"
                                    >
                                        +0.1 {selectedElement === 'qr' ? 'mm' : 'pt'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* サイズ値の手動編集欄 (高さ X.X mm) */}
                        <div className="p-2">
                        <div className="flex flex-col text-white">
                            <span className="text-[11px] font-bold text-mist-400 select-none">{ selectedElement == "qr" ? t('cardDesignEditor.sizeHeight') : t('cardDesignEditor.sizeHeightPt') }</span>
                                <input
                                    type="number"
                                    step="any"
                                    value={tempSize}
                                    onChange={(e) => {
                                        setTempSize(e.target.value);
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) {
                                            onValueChange(sizeField, null, val);
                                        }
                                    }}
                                    onBlur={() => {
                                        const parsed = parseFloat(tempSize);
                                        if (tempSize === "" || isNaN(parsed)) {
                                            setTempSize(sizeValue.toString());
                                        } else {
                                            setTempSize(parsed.toString());
                                        }
                                    }}
                                    className="w-full bg-white text-black border border-mist-300 rounded px-2 py-0.5 text-right font-bold text-lg focus:outline-none w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                        </div>
                        </div>
                    </div>

                    {/* 中央の縦線エリア */}
                    <div className="mt-10 w-[2px] bg-mist-700 self-stretch"></div>
                    
                    {/* 右カラム：配置位置設定 */}
                    <div className="flex flex-1 flex-col p-0 space-y-4">
                        {/* 「配置位置」見出し */}
                        <div className=" px-2 py-1 text-center font-bold text-lg text-mist-200 select-none">
                            {t('cardDesignEditor.position')}
                        </div>
                        
                        <div className="flex items-center gap-3 justify-center rounded-full border border-mist-700 bg-mist-900 px-2 py-1.5">
                            <span className="text-sm font-bold text-white">{frontToggleLabelL}</span>
                            <Switch checked={isFront} onCheckedChange={onFrontChange} className="data-[state=checked]:bg-sky-500/70" />
                            <span className="text-sm font-bold text-white">{frontToggleLabelR}</span>
                        </div>

                        {/* D-Pad 十字方向キー (絶対配置によるコンパクトな配置) */}
                        <div className="flex flex-col items-center justify-center flex-1 my-auto min-h-[160px] select-none">
                            <div className="relative w-40 h-40 select-none">
                                {/* Double Up (上の外側) */}
                                <button
                                    type="button"
                                    className="absolute left-[62px] top-[4px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressUp10}
                                    title={t('cardDesignEditor.moveUp', { amount: '1.0' })}
                                >
                                    <ChevronsUp className="w-7 h-7" />
                                </button>

                                {/* Single Up (上の内側) */}
                                <button
                                    type="button"
                                    className="absolute left-[62px] top-[40px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressUp01}
                                    title={t('cardDesignEditor.moveUp', { amount: '0.1' })}
                                >
                                    <ChevronUp className="w-7 h-7" />
                                </button>

                                {/* Double Left (左の外側) */}
                                <button
                                    type="button"
                                    className="absolute left-[4px] top-[62px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressLeft10}
                                    title={t('cardDesignEditor.moveLeft', { amount: '1.0' })}
                                >
                                    <ChevronsLeft className="w-7 h-7" />
                                </button>

                                {/* Single Left (左の内側) */}
                                <button
                                    type="button"
                                    className="absolute left-[40px] top-[62px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressLeft01}
                                    title={t('cardDesignEditor.moveLeft', { amount: '0.1' })}
                                >
                                    <ChevronLeft className="w-7 h-7" />
                                </button>

                                {/* Single Right (右の内側) */}
                                <button
                                    type="button"
                                    className="absolute left-[84px] top-[62px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressRight01}
                                    title={t('cardDesignEditor.moveRight', { amount: '0.1' })}
                                >
                                    <ChevronRight className="w-7 h-7" />
                                </button>

                                {/* Double Right (右の外側) */}
                                <button
                                    type="button"
                                    className="absolute left-[120px] top-[62px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressRight10}
                                    title={t('cardDesignEditor.moveRight', { amount: '1.0' })}
                                >
                                    <ChevronsRight className="w-7 h-7" />
                                </button>

                                {/* Single Down (下の内側) */}
                                <button
                                    type="button"
                                    className="absolute left-[62px] top-[84px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressDown01}
                                    title={t('cardDesignEditor.moveDown', { amount: '0.1' })}
                                >
                                    <ChevronDown className="w-7 h-7" />
                                </button>

                                {/* Double Down (下の外側) */}
                                <button
                                    type="button"
                                    className="absolute left-[62px] top-[120px] h-9 w-9 hover:bg-mist-800 text-white hover:text-sky-400 rounded transition-all flex items-center justify-center cursor-pointer hover:scale-105"
                                    {...pressDown10}
                                    title={t('cardDesignEditor.moveDown', { amount: '1.0' })}
                                >
                                    <ChevronsDown className="w-7 h-7" />
                                </button>
                            </div>
                        </div>

                        {/* 座標数値の手動編集欄 (X座標, Y座標) */}
                        <div className="grid grid-cols-2 gap-2 p-2">
                            {/* X座標 */}
                            <div className="flex flex-col text-white">
                                <span className="text-[11px] font-bold text-mist-400 select-none">{t('cardDesignEditor.posX')}</span>
                                <input
                                    type="number"
                                    step="any"
                                    value={tempX}
                                    onChange={(e) => {
                                        setTempX(e.target.value);
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) {
                                            onValueChange(posField, 'x', val);
                                        }
                                    }}
                                    onBlur={() => {
                                        const parsed = parseFloat(tempX);
                                        if (tempX === "" || isNaN(parsed)) {
                                            setTempX(posValue.x.toString());
                                        } else {
                                            setTempX(parsed.toString());
                                        }
                                    }}
                                    className="bg-white text-black border border-mist-300 rounded px-2 py-0.5 text-right font-bold text-lg focus:outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none mt-1"
                                />
                            </div>
                            {/* Y座標 */}
                            <div className="flex flex-col text-white">
                                <span className="text-[11px] font-bold text-mist-400 select-none">{t('cardDesignEditor.posY')}</span>
                                <input
                                    type="number"
                                    step="any"
                                    value={tempY}
                                    onChange={(e) => {
                                        setTempY(e.target.value);
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) {
                                            onValueChange(posField, 'y', val);
                                        }
                                    }}
                                    onBlur={() => {
                                        const parsed = parseFloat(tempY);
                                        if (tempY === "" || isNaN(parsed)) {
                                            setTempY(posValue.y.toString());
                                        } else {
                                            setTempY(parsed.toString());
                                        }
                                    }}
                                    className="bg-white text-black border border-mist-300 rounded px-2 py-0.5 text-right font-bold text-lg focus:outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none mt-1"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CardDesignEditor({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [designs, setDesigns] = useState<CardDesign[]>([]);
    
    // プレビュー用に動的生成したQRコードのBase64形式のURLを保持します。
    const [qrPreviewUrl, setQrPreviewUrl] = useState<string>("");

    // コンポーネントのマウント時に、印刷機能と同様のデザイン（ロゴ、ドット、余白）で
    // https://www.meishigawarini.com/receive/you-will-love-it へのリンクを表すプレビュー用QRコードを動的に生成します。
    useEffect(() => {
        const generatePreviewQR = async () => {
            try {
                // クライアントサイドでの動作（ブラウザ上のDOM）を保証するため、動的インポートを使用します。
                const QRCodeStyling = (await import('qr-code-styling')).default;

                // 印刷機能 (generatePDF.ts) の genQR の設定を参考に、
                // 全体の 5% の余白 (margin / width = 15 / 300 = 5%) を持つように設定します。
                const qr = new QRCodeStyling({
                    width: 300,
                    height: 300,
                    margin: 15,
                    data: "https://www.meishigawarini.com/receive/you-will-love-it",
                    image: "/qricon.png",
                    qrOptions: {
                        typeNumber: 0,
                        mode: "Byte",
                        errorCorrectionLevel: "Q"
                        // 誤り訂正レベルを Q (25%) に設定します (中央のロゴ配置による破損を防ぐため)
                    },
                    imageOptions: {
                        saveAsBlob: true,
                        hideBackgroundDots: true,
                        imageSize: 0.4,
                        margin: 0
                    },
                    dotsOptions: {
                        type: "dots",
                        // ドット形式の QRコードを生成します
                        roundSize: false,
                    },
                    backgroundOptions: {
                        round: 0,
                        color: "#ffffff"
                    },
                    cornersSquareOptions: {
                        type: "extra-rounded",
                        color: "#000000"
                    },
                    cornersDotOptions: {
                        type: "dot",
                        color: "#000000"
                    },
                });

                // 描画結果を Blob として取得します
                const rawData = await qr.getRawData('png');
                if (!rawData) return;

                const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);

                // Blob を Data URL (Base64) に変換して状態に設定します
                const base64data = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });

                setQrPreviewUrl(base64data);
            } catch (e) {
                console.error("Failed to generate preview QR code", e);
            }
        };
        generatePreviewQR();
    }, []);

    const [loading, setLoading] = useState(false);
    const [editingDesign, setEditingDesign] = useState<CardDesign | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<'qr' | 'pin' | 'code'>('qr');

    const fetchDesigns = async () => {
        setLoading(true);
        try {
            // データベース操作概要: カードデザイン情報の一覧取得 (Query)
            // 対象キー: PK = CARD_DESIGN#METADATA
            // クエリ意図: システム管理者が登録済みのすべてのカードデザイン設定を一覧表示・管理するため
            const data = await adminApi.admin_carddesigns_list({});
            setDesigns(data.items || []);
        } catch (e) {
            console.error("Failed to fetch designs", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDesigns();
    }, []);

    const handleCreate = () => {
        const id = generateId();
        const newDesign: CardDesign = {
            design_id: id,
            name: t('cardDesignEditor.newDesignName'),
            description: "",
            bgimgf: "",
            bgimgb: "",
            width: 91,
            height: 55,
            qrsize: 30,
            qrpos: { x: 50, y: 15 },
            pinsize: 20,
            pinpos: { x: 7.3, y: 18.1 },
            codesize: 5,
            codepos: { x: 24, y: 45 },
            isfront_qr: true,
            isfront_pin: false,
            isfront_code: true,
        };
        setEditingDesign(newDesign);
    };

    const handleSave = async () => {
        if (!editingDesign) return;
        setIsSaving(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // Check if it's new by seeing if it's already in the designs list
            const isNew = !designs.find(d => (d.SK || d.design_id) === (editingDesign.SK || editingDesign.design_id));

            const designIdentifier = editingDesign.SK || editingDesign.design_id;

            if (isNew) {
                // データベース操作概要: 新規カードデザイン情報の作成 (PutItem)
                // 対象キー: PK = CARD_DESIGN#METADATA, SK = {design_id}
                // クエリ意図: 新しいカードデザイン(画像、サイズ、要素配置など)の設定レコードをDBに新規保存するため
                await adminApi.admin_carddesigns_create({ design_id: designIdentifier, design: editingDesign });
            } else {
                // データベース操作概要: カードデザイン情報の更新 (UpdateItem)
                // 対象キー: PK = CARD_DESIGN#METADATA, SK = {design_id}
                // クエリ意図: 編集されたカードデザインの設定内容をDBに反映させて上書き保存するため
                await adminApi.admin_carddesigns_update({ design_id: designIdentifier, design: editingDesign });
            }

            alert(t('cardDesignEditor.savedSuccessfully'));
            setEditingDesign(null);
            fetchDesigns();
        } catch (e) {
            console.error(e);
            alert(t('cardDesignEditor.saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('cardDesignEditor.confirmDelete'))) return;
        try {
            // データベース操作概要: カードデザイン情報の削除 (DeleteItem)
            // 対象キー: PK = CARD_DESIGN#METADATA, SK = {design_id}
            // クエリ意図: 不要になった特定のカードデザイン設定レコードをデータベースから完全に物理削除するため
            await adminApi.admin_carddesigns_delete({ design_id: id });
            fetchDesigns();
        } catch (e) {
            console.error(e);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bgimgf' | 'bgimgb') => {
        const file = e.target.files?.[0];
        if (!file || !editingDesign) return;

        const startDesignId = editingDesign.design_id;
        setUploadingImage(type);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const thumbType = type === 'bgimgf' ? 'thumbf' : 'thumbb';

            // 1. Prepare Main Image (No preprocessing for resolution)
            const { uploadUrl: mainUploadUrl, publicUrl: mainPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: file.name,
                content_type: file.type,
                design_id: startDesignId
            });

            // 2. Generate and Prepare Thumbnail (1280px WebP)
            const thumbBlob = await resizeImage(file);
            const thumbFile = new File([thumbBlob], `thumb_${file.name.split('.')[0]}.webp`, { type: "image/webp" });

            const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: thumbFile.name,
                content_type: "image/webp",
                design_id: startDesignId
            });

            // 3. Upload both to S3
            await Promise.all([
                fetch(mainUploadUrl, {
                    method: "PUT",
                    body: file,
                    headers: { "content-type": file.type }
                }),
                fetch(thumbUploadUrl, {
                    method: "PUT",
                    body: thumbFile,
                    headers: { "content-type": "image/webp" }
                })
            ]);

            setEditingDesign(prev => {
                if (!prev || prev.design_id !== startDesignId) return prev;
                return {
                    ...prev,
                    [type]: mainPublicUrl,
                    [thumbType]: thumbPublicUrl
                };
            });
        } catch (e) {
            console.error(e);
            alert(t('cardDesignEditor.uploadFailed'));
        } finally {
            setUploadingImage(null);
        }
    };

    const adjust = (field: string, subfield: string | null, delta: number) => {
        if (!editingDesign) return;
        const newDesign = { ...editingDesign } as any;
        if (subfield) {
            // ネストされた位置オブジェクト（qrpos, pinpos, codeposなど）をイミュータブルに更新します
            newDesign[field] = {
                ...newDesign[field],
                [subfield]: Number((newDesign[field][subfield] + delta).toFixed(2))
            };
        } else {
            newDesign[field] = Number((newDesign[field] + delta).toFixed(2));
        }
        setEditingDesign(newDesign);
    };

    /**
     * 指定された位置(座標)またはサイズ属性の値を直接更新するハンドラー関数。
     * 各種座標(qrpos, pinpos, codepos)やサイズ(qrsize, pinsize, codesize)のステータス更新を安全に行います。
     * 
     * @param field 更新対象の属性キー ('qrpos' | 'pinpos' | 'codepos' | 'qrsize' | 'pinsize' | 'codesize')
     * @param subfield 座標系の更新時におけるサブキー ('x' | 'y')。サイズ系の場合は null を指定
     * @param val 新しい数値
     */
    const setValue = (
        field: 'qrpos' | 'pinpos' | 'codepos' | 'qrsize' | 'pinsize' | 'codesize',
        subfield: 'x' | 'y' | null,
        val: number
    ) => {
        if (!editingDesign) return;
        const newDesign = { ...editingDesign };
        const roundedVal = Number(val.toFixed(2));
        if (field === 'qrpos') {
            if (subfield === 'x') newDesign.qrpos = { ...newDesign.qrpos, x: roundedVal };
            if (subfield === 'y') newDesign.qrpos = { ...newDesign.qrpos, y: roundedVal };
        } else if (field === 'pinpos') {
            if (subfield === 'x') newDesign.pinpos = { ...newDesign.pinpos, x: roundedVal };
            if (subfield === 'y') newDesign.pinpos = { ...newDesign.pinpos, y: roundedVal };
        } else if (field === 'codepos') {
            if (subfield === 'x') newDesign.codepos = { ...newDesign.codepos, x: roundedVal };
            if (subfield === 'y') newDesign.codepos = { ...newDesign.codepos, y: roundedVal };
        } else if (field === 'qrsize') {
            newDesign.qrsize = roundedVal;
        } else if (field === 'pinsize') {
            newDesign.pinsize = roundedVal;
        } else if (field === 'codesize') {
            newDesign.codesize = roundedVal;
        }
        setEditingDesign(newDesign);
    };



    return (
        <div className="space-y-6">

            {editingDesign && (

                <Card className="bg-mist-600 border-mist-700 overflow-visible">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-white flex items-center gap-2">
                            <Paintbrush className="w-5 h-5" />
                            {t('cardDesignEditor.title')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-visible">

                        <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-6 animate-in slide-in-from-bottom-4 duration-300">
                            <Card className="bg-mist-900 border-mist-700 text-white gap-0">
                                <CardHeader>
                                    <CardTitle className="text-white/50" >{t('cardDesignEditor.editorTitle', { id: editingDesign.design_id })}</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-12 p-4">

                                    <div className="space-y-4 border-t border-mist-700">
                                        <h4 className="mt-2 text-lg font-bold flex items-center gap-2 mb-8">
                                            <FilePenLine className="w-7 h-7" />
                                            {t('cardDesignEditor.metadataSettings')}
                                        </h4>

                                        <div className="space-y-2">
                                            <Label>{t('cardDesignEditor.name')}</Label>
                                            <Input
                                                value={editingDesign.name ?? ""}
                                                onChange={e => setEditingDesign({ ...editingDesign, name: e.target.value })}
                                                className="bg-mist-800 border-mist-700"
                                                placeholder={t('cardDesignEditor.namePlaceholder')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t('cardDesignEditor.description')}</Label>
                                            <Input
                                                value={editingDesign.description ?? ""}
                                                onChange={e => setEditingDesign({ ...editingDesign, description: e.target.value })}
                                                className="bg-mist-800 border-mist-700"
                                                placeholder={t('cardDesignEditor.descPlaceholder')}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>{t('cardDesignEditor.width')}</Label>
                                                <Input
                                                    type="number"
                                                    value={editingDesign.width ?? 0}
                                                    onChange={e => setEditingDesign({ ...editingDesign, width: Number(e.target.value) })}
                                                    className="bg-mist-800 border-mist-700"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t('cardDesignEditor.height')}</Label>
                                                <Input
                                                    type="number"
                                                    value={editingDesign.height ?? 0}
                                                    onChange={e => setEditingDesign({ ...editingDesign, height: Number(e.target.value) })}
                                                    className="bg-mist-800 border-mist-700"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 border-t border-mist-700">
                                        <h4 className="mt-2 text-lg font-bold flex items-center gap-2 mb-8">
                                            <Images className="w-7 h-7" />
                                            {t('cardDesignEditor.backgroundImages')}
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">{t('cardDesignEditor.frontBackground')}</Label>
                                                <div className="flex flex-col gap-2">
                                                    <div className="bg-mist-800 rounded border border-mist-600 overflow-hidden bg-white" style={{ aspectRatio: `${editingDesign.width} / ${editingDesign.height}` }}>
                                                        {editingDesign.bgimgf && <img key={`${editingDesign.design_id}-front-form`} src={editingDesign.bgimgf} className="w-full h-full object-fill" crossOrigin="anonymous" />}
                                                    </div>
                                                    <Button variant="outline" size="sm" className="relative cursor-pointer bg-mist-800 hover:bg-mist-700 border-mist-700 text-white hover:text-white transition-colors" disabled={!!uploadingImage}>
                                                        {uploadingImage === 'bgimgf' ? t('cardDesignEditor.uploading') : t('cardDesignEditor.uploadFront')}
                                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgf')} />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">{t('cardDesignEditor.backBackground')}</Label>
                                                <div className="flex flex-col gap-2">
                                                    <div className="bg-mist-800 rounded border border-mist-600 overflow-hidden bg-white" style={{ aspectRatio: `${editingDesign.width} / ${editingDesign.height}` }}>
                                                        {editingDesign.bgimgb && <img key={`${editingDesign.design_id}-back-form`} src={editingDesign.bgimgb} className="w-full h-full object-fill" crossOrigin="anonymous" />}
                                                    </div>
                                                    <Button variant="outline" size="sm" className="relative cursor-pointer bg-mist-800 hover:bg-mist-700 border-mist-700 text-white hover:text-white transition-colors" disabled={!!uploadingImage}>
                                                        {uploadingImage === 'bgimgb' ? t('cardDesignEditor.uploading') : t('cardDesignEditor.uploadBack')}
                                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgb')} />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 border-t border-mist-700">
                                        <h4 className="mt-2 text-lg font-bold flex items-center gap-2 mb-8">
                                            <PictureInPicture className="w-7 h-7" />
                                            {t('cardDesignEditor.elementSettings')}
                                        </h4>
                                        {selectedElement === 'qr' && (
                                            <CompactAdjusterPanel
                                                selectedElement={selectedElement}
                                                onSelectedElementChange={setSelectedElement}
                                                isFront={editingDesign.isfront_qr}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_qr: v })}
                                                posField="qrpos"
                                                posValue={editingDesign.qrpos}
                                                sizeField="qrsize"
                                                sizeValue={editingDesign.qrsize}
                                                frontToggleLabelL={t('cardDesignEditor.frontToggleL')}
                                                frontToggleLabelR={t('cardDesignEditor.frontToggleR')}
                                                onValueChange={setValue}
                                                onAdjust={adjust}
                                            />
                                        )}

                                        {selectedElement === 'pin' && (
                                            <CompactAdjusterPanel
                                                selectedElement={selectedElement}
                                                onSelectedElementChange={setSelectedElement}
                                                isFront={editingDesign.isfront_pin}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_pin: v })}
                                                posField="pinpos"
                                                posValue={editingDesign.pinpos}
                                                sizeField="pinsize"
                                                sizeValue={editingDesign.pinsize}
                                                frontToggleLabelL={t('cardDesignEditor.frontToggleL')}
                                                frontToggleLabelR={t('cardDesignEditor.frontToggleR')}
                                                onValueChange={setValue}
                                                onAdjust={adjust}
                                            />
                                        )}

                                        {selectedElement === 'code' && (
                                            <CompactAdjusterPanel
                                                selectedElement={selectedElement}
                                                onSelectedElementChange={setSelectedElement}
                                                isFront={editingDesign.isfront_code}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_code: v })}
                                                posField="codepos"
                                                posValue={editingDesign.codepos}
                                                sizeField="codesize"
                                                sizeValue={editingDesign.codesize}
                                                frontToggleLabelL={t('cardDesignEditor.frontToggleL')}
                                                frontToggleLabelR={t('cardDesignEditor.frontToggleR')}
                                                onValueChange={setValue}
                                                onAdjust={adjust}
                                            />
                                        )}
                                    </div>

                                    <div className="pt-10 flex gap-3 space-y-4 border-t border-mist-700 h-30">
                                        <Button 
                                        className="flex-1 flex items-center justify-center bg-mist-800 hover:bg-mist-700 border-mist-700 text-lg text-white font-bold hover:text-white transition-colors h-full" 
                                        variant="outline" 
                                        onClick={handleSave} 
                                        disabled={isSaving}
                                        >
                                            {/* サイズを大きく指定（w-16 h-16等） */}<Save className="!w-7 !h-7 mr-2" />
                                            {isSaving ? t('cardDesignEditor.saving') : t('cardDesignEditor.save')}
                                        </Button>
                                        <Button className="h-full" variant="secondary" onClick={() => setEditingDesign(null)}>{t('cardDesignEditor.cancel')}</Button>
                                    </div>
                                </CardContent>
                            </Card>


                            {/* プレビュー画面 */}
                            <div className="sticky bottom-8  flex flex-col justify-end space-y-6 pb-2">
                                <Card className="bg-mist-900 border-mist-700 overflow-visible">
                                    <CardHeader>
                                        <CardTitle className="text-white text-sm">{t('cardDesignEditor.previewFront')}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center p-12 overflow-visible">
                                        <div className="w-full [container-type:inline-size] relative">
                                            <div
                                                className="relative w-full mx-auto"
                                                style={{
                                                    paddingBottom: `${(editingDesign.height / editingDesign.width) * 100}%`
                                                }}
                                            >
                                                <div className="absolute inset-0 bg-mist-950/20 shadow-[0_0_50px_rgba(0,0,0,0.4)] border border-mist-600 overflow-hidden">
                                                    <div className="absolute inset-0 bg-white" />
                                                    {editingDesign.bgimgf && <img key={`${editingDesign.design_id}-front-preview`} src={editingDesign.bgimgf} className="absolute inset-0 w-full h-full object-fill" crossOrigin="anonymous" />}

                                                    {editingDesign.isfront_qr && (
                                                        <div
                                                            className="absolute bg-white border border-red-500 flex items-center justify-center overflow-hidden"
                                                            style={{
                                                                left: `${(editingDesign.qrpos.x / editingDesign.width) * 100}cqw`,
                                                                top: `${(editingDesign.qrpos.y / editingDesign.width) * 100}cqw`,
                                                                width: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                                height: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                            }}
                                                        >
                                                            {qrPreviewUrl ? (
                                                                 <img
                                                                     src={qrPreviewUrl}
                                                                     className="w-full h-full object-contain"
                                                                     alt="QR Preview"
                                                                 />
                                                             ) : (
                                                                 <span className="text-black text-[1cqw]">QR</span>
                                                             )}
                                                        </div>
                                                    )}

                                                    {editingDesign.isfront_pin && (
                                                        <div
                                                            className="absolute text-black font-bold text-center pointer-events-none border-red-500 border-1"
                                                            style={{
                                                                lineHeight: '0',
                                                                left: `0px`,
                                                                top: `${((editingDesign.pinpos.y) / editingDesign.width) * 100}cqw`,
                                                                marginTop: `-0.5cqw`,
                                                                width: `100%`,
                                                                fontSize: `${editingDesign.pinsize * 0.35 * (100 / editingDesign.width)}cqw`,
                                                                transform: `translateX(${(editingDesign.pinpos.x / editingDesign.width) * 100}cqw)`,
                                                                fontFamily: "helvetica"
                                                            }}
                                                        >
                                                            12345678
                                                        </div>
                                                    )}

                                                    {editingDesign.isfront_code && (
                                                        <div
                                                            className="absolute text-black text-center pointer-events-none border-red-500 border-1"
                                                            style={{
                                                                lineHeight: '0',
                                                                left: `0px`,
                                                                top: `${((editingDesign.codepos.y) / editingDesign.width) * 100}cqw`,
                                                                marginTop: `-0.5cqw`,
                                                                width: `100%`,
                                                                fontSize: `${editingDesign.codesize * 0.35 * (100 / editingDesign.width)}cqw`,
                                                                transform: `translateX(${(editingDesign.codepos.x / editingDesign.width) * 100}cqw)`,
                                                                fontFamily: "helvetica"
                                                            }}
                                                        >
                                                            abcdefgh-ijkl-mn...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-mist-900 border-mist-700 overflow-visible">
                                    <CardHeader>
                                        <CardTitle className="text-white text-sm">{t('cardDesignEditor.previewBack')}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center p-12 overflow-visible">
                                        <div className="w-full [container-type:inline-size] relative">
                                            <div
                                                className="relative w-full mx-auto"
                                                style={{
                                                    paddingBottom: `${(editingDesign.height / editingDesign.width) * 100}%`
                                                }}
                                            >
                                                <div className="absolute inset-0 bg-mist-950/20 shadow-[0_0_50px_rgba(0,0,0,0.4)] border border-mist-600 overflow-hidden">
                                                    <div className="absolute inset-0 bg-white" />
                                                    {editingDesign.bgimgb && <img key={`${editingDesign.design_id}-back-preview`} src={editingDesign.bgimgb} className="absolute inset-0 w-full h-full object-fill" crossOrigin="anonymous" />}

                                                    {!editingDesign.isfront_qr && (
                                                        <div
                                                            className="absolute bg-white border border-red-500 flex items-center justify-center overflow-hidden"
                                                            style={{
                                                                left: `${(editingDesign.qrpos.x / editingDesign.width) * 100}cqw`,
                                                                top: `${(editingDesign.qrpos.y / editingDesign.width) * 100}cqw`,
                                                                width: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                                height: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                            }}
                                                        >
                                                            {qrPreviewUrl ? (
                                                                 <img
                                                                     src={qrPreviewUrl}
                                                                     className="w-full h-full object-contain"
                                                                     alt="QR Preview"
                                                                 />
                                                             ) : (
                                                                 <span className="text-black text-[1cqw]">QR</span>
                                                             )}
                                                        </div>
                                                    )}

                                                    {!editingDesign.isfront_pin && (
                                                        <div
                                                            className="absolute text-black font-bold text-center pointer-events-none border-red-500 border-1"
                                                            style={{
                                                                lineHeight: '0',
                                                                left: `0px`,
                                                                top: `${((editingDesign.pinpos.y) / editingDesign.width) * 100}cqw`,
                                                                marginTop: `-0.5cqw`,
                                                                width: `100%`,
                                                                fontSize: `${editingDesign.pinsize * 0.35 * (100 / editingDesign.width)}cqw`,
                                                                transform: `translateX(${(editingDesign.pinpos.x / editingDesign.width) * 100}cqw)`,
                                                                fontFamily: "helvetica"
                                                            }}
                                                        >
                                                            12345678
                                                        </div>
                                                    )}

                                                    {!editingDesign.isfront_code && (
                                                        <div
                                                            className="absolute text-black text-center pointer-events-none border-red-500 border-1"
                                                            style={{
                                                                lineHeight: '0',
                                                                left: `0px`,
                                                                top: `${((editingDesign.codepos.y) / editingDesign.width) * 100}cqw`,
                                                                marginTop: `-0.5cqw`,
                                                                width: `100%`,
                                                                fontSize: `${editingDesign.codesize * 0.35 * (100 / editingDesign.width)}cqw`,
                                                                transform: `translateX(${(editingDesign.codepos.x / editingDesign.width) * 100}cqw)`,
                                                                fontFamily: "helvetica"
                                                            }}
                                                        >
                                                            abcdefgh-ijkl-mn...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </CardContent>
                </Card>

            )
            }

            <Card className="bg-mist-900 border-mist-700">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                        <Layers className="w-5 h-5" />
                        {t('cardDesignEditor.cardDesigns')}
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchDesigns} disabled={loading}>
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            {t('cardDesignEditor.refresh')}
                        </Button>
                        <Button size="sm" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t('cardDesignEditor.newDesign')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-start gap-4">
                        {designs.map(d => (
                            <div key={d.design_id} className="group relative border border-mist-700 rounded-xl overflow-hidden bg-mist-800 hover:border-mist-500 transition-all w-[150px] flex flex-col items-center">
                                <div className="bg-mist-950 relative overflow-hidden h-24" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
                                    {d.thumbf || d.bgimgf ? (
                                        <img src={d.thumbf || d.bgimgf} className="w-full h-full object-fill select-none pointer-events-none" alt="Front" crossOrigin="anonymous" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-mist-500 text-xs text-center p-4">
                                            {t('cardDesignEditor.noBackground')}
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 pt-1 text-center w-full max-w-[150px]">
                                    <h3 className="text-[11px] font-bold text-mist-100 truncate mb-0.5" title={d.name || t('cardDesignEditor.noName')}>
                                        {d.name || <span className="opacity-30 italic">{t('cardDesignEditor.noName')}</span>}
                                    </h3>
                                    <p className="text-[9px] text-mist-400 line-clamp-1 h-3 leading-tight" title={d.description || t('cardDesignEditor.noDescription')}>
                                        {d.description || <span className="opacity-30 italic">{t('cardDesignEditor.noDescription')}</span>}
                                    </p>
                                    <p className="text-[8px] text-mist-500 mt-0.5 font-mono truncate">
                                        {d.design_id}
                                    </p>
                                    <div className="flex gap-2 mt-3">
                                        {/* 編集状態での変更が一覧表示側の元のオブジェクトに影響（ミューテーション）を与えないよう、ディープコピーを作成して設定します */}
                                        <Button variant="secondary" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditingDesign(structuredClone(d))} disabled={!!uploadingImage}><Paintbrush className="!w-6 !h-6" /></Button>
                                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.SK || d.design_id)} disabled={!!uploadingImage}><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
