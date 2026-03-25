"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Upload, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Layers } from "lucide-react";
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

            // 1. Prepare Main Image
            const { uploadUrl: mainUploadUrl, publicUrl: mainPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: file.name,
                contentType: file.type,
                design_id: editingDesign.design_id
            });

            // 2. Generate and Prepare Thumbnail (400px WebP)
            const thumbBlob = await resizeImage(file, 400);
            const thumbFile = new File([thumbBlob], `thumb_${file.name.split('.')[0]}.webp`, { type: "image/webp" });

            const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await adminApi.admin_carddesigns_uploadurl({
                filename: thumbFile.name,
                contentType: "image/webp",
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

    const AdjustmentGroup = ({ label, field, subfield, value }: { label: string, field: string, subfield: string | null, value: number }) => (
        <div className="flex flex-col gap-1 border p-2 rounded bg-mist-800/50">
            <Label className="text-[10px] text-mist-400 uppercase tracking-wider">{label}</Label>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => adjust(field, subfield, -1)}>-1</Button>
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => adjust(field, subfield, -0.1)}>-0.1</Button>
                <div className="flex-1 text-center font-mono text-sm">{value}</div>
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => adjust(field, subfield, 0.1)}>+0.1</Button>
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => adjust(field, subfield, 1)}>+1</Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
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
                                <div className="aspect-[84/52] bg-mist-950 relative">
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

            {editingDesign && (
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
                                        value={editingDesign.name}
                                        onChange={e => setEditingDesign({ ...editingDesign, name: e.target.value })}
                                        className="bg-mist-800 border-mist-700"
                                        placeholder="Design Name (e.g. Classic Gold)"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Input
                                        value={editingDesign.description}
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
                                            value={editingDesign.width}
                                            onChange={e => setEditingDesign({ ...editingDesign, width: Number(e.target.value) })}
                                            className="bg-mist-800 border-mist-700"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Height (mm)</Label>
                                        <Input
                                            type="number"
                                            value={editingDesign.height}
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
                                                <div className="aspect-[84/52] bg-mist-800 rounded border border-mist-600 overflow-hidden">
                                                    {editingDesign.bgimgf && <img src={editingDesign.bgimgf} className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                                </div>
                                                <Button variant="outline" size="sm" className="relative cursor-pointer" disabled={!!uploadingImage}>
                                                    {uploadingImage === 'bgimgf' ? "Uploading..." : "Upload Front"}
                                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgf')} />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Back Background</Label>
                                            <div className="flex flex-col gap-2">
                                                <div className="aspect-[84/52] bg-mist-800 rounded border border-mist-600 overflow-hidden">
                                                    {editingDesign.bgimgb && <img src={editingDesign.bgimgb} className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                                </div>
                                                <Button variant="outline" size="sm" className="relative cursor-pointer" disabled={!!uploadingImage}>
                                                    {uploadingImage === 'bgimgb' ? "Uploading..." : "Upload Back"}
                                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, 'bgimgb')} />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-mist-700 pt-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold">QR Position & Size</h4>
                                        <Switch
                                            checked={editingDesign.isfront_qr}
                                            onCheckedChange={v => setEditingDesign({ ...editingDesign, isfront_qr: v })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <AdjustmentGroup label="QR X (mm)" field="qrpos" subfield="x" value={editingDesign.qrpos.x} />
                                        <AdjustmentGroup label="QR Y (mm)" field="qrpos" subfield="y" value={editingDesign.qrpos.y} />
                                        <AdjustmentGroup label="QR Size (mm)" field="qrsize" subfield={null} value={editingDesign.qrsize} />
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-mist-700 pt-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold">PIN Position & Size</h4>
                                        <Switch
                                            checked={editingDesign.isfront_pin}
                                            onCheckedChange={v => setEditingDesign({ ...editingDesign, isfront_pin: v })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <AdjustmentGroup label="PIN X (mm)" field="pinpos" subfield="x" value={editingDesign.pinpos.x} />
                                        <AdjustmentGroup label="PIN Y (mm)" field="pinpos" subfield="y" value={editingDesign.pinpos.y} />
                                        <AdjustmentGroup label="PIN Size (pt)" field="pinsize" subfield={null} value={editingDesign.pinsize} />
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-mist-700 pt-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold">Code (UUID) Position & Size</h4>
                                        <Switch
                                            checked={editingDesign.isfront_code}
                                            onCheckedChange={v => setEditingDesign({ ...editingDesign, isfront_code: v })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <AdjustmentGroup label="Code X (mm)" field="codepos" subfield="x" value={editingDesign.codepos.x} />
                                        <AdjustmentGroup label="Code Y (mm)" field="codepos" subfield="y" value={editingDesign.codepos.y} />
                                        <AdjustmentGroup label="Code Size (pt)" field="codesize" subfield={null} value={editingDesign.codesize} />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? "Saving..." : "Save Design"}
                                </Button>
                                <Button variant="secondary" onClick={() => setEditingDesign(null)}>Cancel</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="sticky top-8 space-y-6">
                        <Card className="bg-mist-900 border-mist-700 overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-white text-sm">Real-time Preview (Front)</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center">
                                <div className="w-full [container-type:inline-size]">
                                    <div
                                        className="relative bg-white shadow-2xl overflow-hidden border border-mist-600"
                                        style={{
                                            width: `100cqw`,
                                            aspectRatio: `${editingDesign.width} / ${editingDesign.height}`,
                                        }}
                                    >
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
                                                className="absolute text-black font-bold text-center pointer-events-none"
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
                            </CardContent>
                        </Card>

                        <Card className="bg-mist-900 border-mist-700 overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-white text-sm">Real-time Preview (Back)</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center">
                                <div className="w-full [container-type:inline-size]">
                                    <div
                                        className="relative bg-white shadow-2xl overflow-hidden border border-mist-600"
                                        style={{
                                            width: `100cqw`,
                                            aspectRatio: `${editingDesign.width} / ${editingDesign.height}`,
                                        }}
                                    >
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
                                                className="absolute text-black text-center pointer-events-none"
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
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )
            }
        </div >
    );
}
