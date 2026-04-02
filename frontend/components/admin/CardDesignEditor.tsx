"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Upload, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, ChevronsLeft, ChevronsRight, RefreshCw, Layers, Paintbrush } from "lucide-react";
import { fetchAuthSession } from 'aws-amplify/auth';
import { cn } from "@/lib/utils";
import { useTranslations } from 'next-intl';
import { generateId } from "@/lib/id";
import { resizeImage } from "@/lib/image-utils";
import { adminApi } from "@/lib/api/admin";

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

export default function CardDesignEditor({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [designs, setDesigns] = useState<CardDesign[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingDesign, setEditingDesign] = useState<CardDesign | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState<string | null>(null);

    const fetchDesigns = async () => {
        setLoading(true);
        try {
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
            name: "New Design",
            description: "",
            bgimgf: "",
            bgimgb: "",
            width: 84,
            height: 52,
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
                await adminApi.admin_carddesigns_create({ design_id: designIdentifier, design: editingDesign });
            } else {
                await adminApi.admin_carddesigns_update({ design_id: designIdentifier, design: editingDesign });
            }

            alert("Saved successfully");
            setEditingDesign(null);
            fetchDesigns();
        } catch (e) {
            console.error(e);
            alert("Error saving");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            await adminApi.admin_carddesigns_delete({ design_id: id });
            fetchDesigns();
        } catch (e) {
            console.error(e);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bgimgf' | 'bgimgb') => {
        const file = e.target.files?.[0];
        if (!file || !editingDesign) return;

        setUploadingImage(type);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const thumbType = type === 'bgimgf' ? 'thumbf' : 'thumbb';

            // 1. Prepare Main Image (No preprocessing for resolution)
            const { uploadUrl: mainUploadUrl, publicUrl: mainPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: file.name,
                content_type: file.type,
                design_id: editingDesign.design_id
            });

            // 2. Generate and Prepare Thumbnail (400px WebP)
            const thumbBlob = await resizeImage(file, 400);
            const thumbFile = new File([thumbBlob], `thumb_${file.name.split('.')[0]}.webp`, { type: "image/webp" });

            const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: thumbFile.name,
                content_type: "image/webp",
                design_id: editingDesign.design_id
            });

            // 3. Upload both to S3
            await Promise.all([
                fetch(mainUploadUrl, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type }
                }),
                fetch(thumbUploadUrl, {
                    method: "PUT",
                    body: thumbFile,
                    headers: { "Content-Type": "image/webp" }
                })
            ]);

            setEditingDesign({
                ...editingDesign,
                [type]: mainPublicUrl,
                [thumbType]: thumbPublicUrl
            });
        } catch (e) {
            console.error(e);
            alert("Upload failed");
        } finally {
            setUploadingImage(null);
        }
    };

    const adjust = (field: string, subfield: string | null, delta: number) => {
        if (!editingDesign) return;
        const newDesign = { ...editingDesign } as any;
        if (subfield) {
            newDesign[field][subfield] = Number((newDesign[field][subfield] + delta).toFixed(2));
        } else {
            newDesign[field] = Number((newDesign[field] + delta).toFixed(2));
        }
        setEditingDesign(newDesign);
    };

    const ValueBadge = ({ label, value }: { label: string, value: number }) => (
        <div className="bg-mist-900/80 px-1.5 py-0.5 rounded border border-mist-700/50 font-mono text-[9px] flex gap-1 items-center">
            <span className="text-mist-500 font-medium">{label}</span>
            <span className="text-sky-400 min-w-[30px] text-right font-bold">{value.toFixed(1)}</span>
        </div>
    );

    const CompactAdjusterPanel = ({
        title, isFront, onFrontChange,
        posField, posValue,
        sizeField, sizeValue
    }: {
        title: string, isFront: boolean, onFrontChange: (v: boolean) => void,
        posField: string, posValue: { x: number; y: number },
        sizeField: string, sizeValue: number
    }) => (
        <div className="group">
            <div className="flex items-center justify-between bg-mist-950/40 p-1 px-3 rounded-t-lg border-x border-t border-mist-700 transition-colors group-hover:bg-mist-950/60">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-mist-400 uppercase tracking-wider">{title}</span>
                    <div className="flex gap-1.5">
                        <ValueBadge label="X" value={posValue.x} />
                        <ValueBadge label="Y" value={posValue.y} />
                        <ValueBadge label="S" value={sizeValue} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-mist-600 uppercase font-medium">Front</span>
                    <Switch checked={isFront} onCheckedChange={onFrontChange} className="scale-75 data-[state=checked]:bg-sky-500/70" />
                </div>
            </div>
            <div className="flex items-stretch gap-1 bg-mist-900/10 p-1.5 rounded-b-lg border border-mist-700">
                <div className="flex-[2] flex justify-center py-1">
                    <div className="grid grid-cols-5 items-center justify-items-center gap-0.5">
                        <div /> <div />
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(posField, 'y', -1)}><ChevronsUp className="w-3.5 h-3.5" /></Button>
                        <div /> <div />

                        <div /> <div />
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(posField, 'y', -0.1)}><ChevronUp className="w-3.5 h-3.5" /></Button>
                        <div /> <div />

                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(posField, 'x', -1)}><ChevronsLeft className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(posField, 'x', -0.1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                        <div className="w-3 h-3 flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-mist-700" /></div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(posField, 'x', 0.1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(posField, 'x', 1)}><ChevronsRight className="w-3.5 h-3.5" /></Button>

                        <div /> <div />
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(posField, 'y', 0.1)}><ChevronDown className="w-3.5 h-3.5" /></Button>
                        <div /> <div />

                        <div /> <div />
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(posField, 'y', 1)}><ChevronsDown className="w-3.5 h-3.5" /></Button>
                        <div /> <div />
                    </div>
                </div>
                <div className="w-px bg-mist-700/50 my-1" />
                <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(sizeField, null, 1)}><ChevronsUp className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(sizeField, null, 0.1)}><ChevronUp className="w-3.5 h-3.5" /></Button>
                    <div className="text-[7px] text-mist-600 uppercase font-black select-none tracking-tighter">Size</div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-300 hover:text-white" onClick={() => adjust(sizeField, null, -0.1)}><ChevronDown className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-mist-700 text-mist-500 hover:text-mist-200" onClick={() => adjust(sizeField, null, -1)}><ChevronsDown className="w-3.5 h-3.5" /></Button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">

            {editingDesign && (

                <Card className="bg-mist-600 border-mist-700 overflow-visible">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-white flex items-center gap-2">
                            <Paintbrush className="w-5 h-5" />
                            Design Editor
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-visible">

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-300">
                            <Card className="bg-mist-900 border-mist-700 text-white">
                                <CardHeader>
                                    <CardTitle>Editor: {editingDesign.design_id}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <Label>Name</Label>
                                            <Input
                                                value={editingDesign.name ?? ""}
                                                onChange={e => setEditingDesign({ ...editingDesign, name: e.target.value })}
                                                className="bg-mist-800 border-mist-700"
                                                placeholder="Design Name (e.g. Classic Gold)"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Description</Label>
                                            <Input
                                                value={editingDesign.description ?? ""}
                                                onChange={e => setEditingDesign({ ...editingDesign, description: e.target.value })}
                                                className="bg-mist-800 border-mist-700"
                                                placeholder="Short description..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Width (mm)</Label>
                                                <Input
                                                    type="number"
                                                    value={editingDesign.width ?? 0}
                                                    onChange={e => setEditingDesign({ ...editingDesign, width: Number(e.target.value) })}
                                                    className="bg-mist-800 border-mist-700"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Height (mm)</Label>
                                                <Input
                                                    type="number"
                                                    value={editingDesign.height ?? 0}
                                                    onChange={e => setEditingDesign({ ...editingDesign, height: Number(e.target.value) })}
                                                    className="bg-mist-800 border-mist-700"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-4 border-t border-mist-700 pt-4">
                                            <h4 className="text-sm font-bold flex items-center gap-2">
                                                <Upload className="w-4 h-4" />
                                                Background Images
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Front Background</Label>
                                                    <div className="flex flex-col gap-2">
                                                        <div className="bg-mist-800 rounded border border-mist-600 overflow-hidden" style={{ aspectRatio: `${editingDesign.width} / ${editingDesign.height}` }}>
                                                            {editingDesign.bgimgf && <img src={editingDesign.bgimgf} className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                                        </div>
                                                        <Button variant="outline" size="sm" className="relative cursor-pointer bg-mist-800" disabled={!!uploadingImage}>
                                                            {uploadingImage === 'bgimgf' ? "Uploading..." : "Upload Front Image"}
                                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgf')} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Back Background</Label>
                                                    <div className="flex flex-col gap-2">
                                                        <div className="bg-mist-800 rounded border border-mist-600 overflow-hidden" style={{ aspectRatio: `${editingDesign.width} / ${editingDesign.height}` }}>
                                                            {editingDesign.bgimgb && <img src={editingDesign.bgimgb} className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                                        </div>
                                                        <Button variant="outline" size="sm" className="relative cursor-pointer bg-mist-800" disabled={!!uploadingImage}>
                                                            {uploadingImage === 'bgimgb' ? "Uploading..." : "Upload Back Image"}
                                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgb')} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid gap-4 mt-2">
                                            <CompactAdjusterPanel
                                                title="QR Code"
                                                isFront={editingDesign.isfront_qr}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_qr: v })}
                                                posField="qrpos"
                                                posValue={editingDesign.qrpos}
                                                sizeField="qrsize"
                                                sizeValue={editingDesign.qrsize}
                                            />

                                            <CompactAdjusterPanel
                                                title="PIN"
                                                isFront={editingDesign.isfront_pin}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_pin: v })}
                                                posField="pinpos"
                                                posValue={editingDesign.pinpos}
                                                sizeField="pinsize"
                                                sizeValue={editingDesign.pinsize}
                                            />

                                            <CompactAdjusterPanel
                                                title="Code ID"
                                                isFront={editingDesign.isfront_code}
                                                onFrontChange={v => setEditingDesign({ ...editingDesign, isfront_code: v })}
                                                posField="codepos"
                                                posValue={editingDesign.codepos}
                                                sizeField="codesize"
                                                sizeValue={editingDesign.codesize}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-6 flex gap-3">
                                        <Button className="flex-1 bg-mist-800" variant="outline" onClick={handleSave} disabled={isSaving}>
                                            <Save className="w-4 h-4 mr-2" />
                                            {isSaving ? "Saving..." : "Save Design"}
                                        </Button>
                                        <Button variant="secondary" onClick={() => setEditingDesign(null)}>Cancel</Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="sticky bottom-8  flex flex-col justify-end space-y-6 pb-2">
                                <Card className="bg-mist-900 border-mist-700 overflow-visible">
                                    <CardHeader>
                                        <CardTitle className="text-white text-sm">Real-time Preview (Front)</CardTitle>
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
                                                    {editingDesign.bgimgf && <img src={editingDesign.bgimgf} className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />}

                                                    {editingDesign.isfront_qr && (
                                                        <div
                                                            className="absolute bg-mist-300 border border-mist-500 flex items-center justify-center text-black text-[1cqw]"
                                                            style={{
                                                                left: `${(editingDesign.qrpos.x / editingDesign.width) * 100}cqw`,
                                                                top: `${(editingDesign.qrpos.y / editingDesign.width) * 100}cqw`,
                                                                width: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                                height: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                            }}
                                                        >
                                                            QR
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
                                        <CardTitle className="text-white text-sm">Real-time Preview (Back)</CardTitle>
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
                                                    {editingDesign.bgimgb && <img src={editingDesign.bgimgb} className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />}

                                                    {!editingDesign.isfront_qr && (
                                                        <div
                                                            className="absolute bg-mist-300 border border-mist-500 flex items-center justify-center text-black text-[1cqw]"
                                                            style={{
                                                                left: `${(editingDesign.qrpos.x / editingDesign.width) * 100}cqw`,
                                                                top: `${(editingDesign.qrpos.y / editingDesign.width) * 100}cqw`,
                                                                width: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                                height: `${(editingDesign.qrsize / editingDesign.width) * 100}cqw`,
                                                            }}
                                                        >
                                                            QR
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
                        Card Designs
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchDesigns} disabled={loading}>
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-2" />
                            New Design
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {designs.map(d => (
                            <div key={d.design_id} className="group relative border border-mist-700 rounded-xl overflow-hidden bg-mist-800 hover:border-mist-500 transition-all">
                                <div className="bg-mist-950 relative overflow-hidden" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
                                    {d.thumbf || d.bgimgf ? (
                                        <img src={d.thumbf || d.bgimgf} className="w-full h-full object-cover" alt="Front" crossOrigin="anonymous" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-mist-500 text-xs text-center p-4">
                                            No Background
                                        </div>
                                    )}
                                </div>
                                <div className="p-3">
                                    <h3 className="font-bold text-sm text-white truncate">{d.name || "(No Name)"}</h3>
                                    <p className="text-[10px] text-mist-400 mt-1 truncate">{d.description}</p>
                                    <p className="text-[10px] text-mist-500 mt-0.5">ID: {d.design_id}</p>
                                    <div className="flex gap-2 mt-3">
                                        <Button variant="secondary" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditingDesign(d)}>Edit</Button>
                                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.SK || d.design_id)}><Trash2 className="w-4 h-4" /></Button>
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
