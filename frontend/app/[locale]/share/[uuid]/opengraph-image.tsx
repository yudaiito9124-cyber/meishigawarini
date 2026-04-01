import { ImageResponse } from 'next/og';
import { headers } from 'next/headers';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export const alt = '名刺代わりに。 - ギフトのシェア';
export const size = {
  width: 1200,
  height: 630,
};

// ヘルパー: アセットを読込 (ローカルなら fs, 外部なら fetch)
async function getAssetBuffer(url: string | null, appBase: string) {
  if (!url) return null;

  try {
    const isExternal = url.startsWith('http') && !url.startsWith(appBase);

    if (isExternal) {
      const res = await fetch(new URL(url));
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } else {
      // ローカル (public/) は直接読み込み
      const urlObj = new URL(url.startsWith('http') ? url : `${appBase}${url}`);
      const filePath = path.join(process.cwd(), 'public', urlObj.pathname);

      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          console.log("[FS SUCCESS] Found asset:", filePath);
          return await fs.readFile(filePath);
        }
      } catch (e) {
        console.warn("[FS ERROR] Asset not found at:", filePath);
      }
      return null;
    }
  } catch (e) {
    console.error("Asset load failed:", url, e);
    return null;
  }
}

// ヘルパー: フォントを確実に取得
async function getFont(url: string, appBase: string) {
  const buffer = await getAssetBuffer(url, appBase);
  if (buffer && buffer.byteLength > 1000000) {
    return buffer;
  }
  return null;
}

// ヘルパー: 画像を Satori 互換の PNG (Data URL) とメタデータに変換
async function getImageData(url: string | null, appBase: string, shouldResize = true) {
  const buffer = await getAssetBuffer(url, appBase);
  if (!buffer) return null;

  try {
    let sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();

    if (shouldResize) {
      sharpInstance = sharpInstance.resize(1200, null, { withoutEnlargement: true });
    }
    const pngBuffer = await sharpInstance.png().toBuffer();
    return {
      dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      width: metadata.width || 1200,
      height: metadata.height || 1200,
      ratio: (metadata.width && metadata.height) ? metadata.width / metadata.height : 1,
    };
  } catch (e) {
    console.error("Image conversion failed:", url, e);
    return null;
  }
}

// ヘルパー: 単純にファイルを Data URL に変換 (変換なし)
async function getRawDataUrl(url: string | null, appBase: string, mimeType: string) {
  const buffer = await getAssetBuffer(url, appBase);
  if (!buffer) return null;
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export default async function Image({ params }: { params: Promise<{ uuid: string; locale: string }> }) {
  const { uuid } = await params;
  const headerList = await headers();
  const host = headerList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const appBase = `${protocol}://${host}`;

  // 1. フォントの読み込み
  const fontData = await getFont(`${appBase}/ArialUnicode.ttf`, appBase);
  const fonts: any[] = [];
  if (fontData) {
    fonts.push({
      name: 'ArialUnicode',
      data: fontData,
      style: 'normal',
      weight: 400,
    });
  }

  // 2. APIから情報を取得
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  let data: any = null;
  try {
    if (apiBase) {
      const res = await fetch(`${apiBase}/share/${uuid}`, { next: { revalidate: 3600 } });
      if (res.ok) data = await res.json();
    }
  } catch (e) {
    console.error("OGP Fetch failed:", e);
  }

  // 3. アセットURLの構築と変換
  const toAbsoluteUrl = (url: string | undefined | null) => {
    if (!url) return null;
    if (url.startsWith('//')) return `https:${url}`;
    return url.startsWith('http') ? url : `${appBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const backgroundImageDataUrl = await getRawDataUrl(`${appBase}/Imagebg.jpg`, appBase, 'image/jpeg');
  const logoIconDataUrl = await getRawDataUrl(`${appBase}/presenticon.png`, appBase, 'image/png');

  const cardUrlRaw = toAbsoluteUrl(
    data?.design?.thumbf ||
    data?.design?.bgimgf ||
    data?.card_design_thumbf ||
    data?.card_image_url ||
    null
  );

  // デバッグ用
  console.log("OGP Card URL:", cardUrlRaw);

  const cardResult = await getImageData(cardUrlRaw, appBase);
  console.log("OGP cardData exists:", !!cardResult);

  const productUrlRaw = toAbsoluteUrl(data?.product?.image_url);
  const productResult = await getImageData(productUrlRaw, appBase);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111111',
          backgroundImage: backgroundImageDataUrl ? `url(${backgroundImageDataUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontFamily: 'ArialUnicode, sans-serif',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', backdropFilter: 'blur(15px)' }}></div>

        {/* 630x630 Central Square Area */}
        <div
          style={{
            position: 'relative',
            height: '630px',
            width: '630px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Header Branding (Icon + Black Text with legibility box) */}
          <div style={{
            position: 'absolute',
            bottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            backgroundColor: 'rgba(255,255,255,0.85)',
            padding: '8px 24px',
            borderRadius: '100px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            zIndex: 30,
          }}>
            {logoIconDataUrl && <img src={logoIconDataUrl} width={36} height={36} style={{ objectFit: 'contain' }} />}
            <div style={{ fontSize: 26, fontWeight: 900, color: '#000000', display: 'flex', letterSpacing: '-0.02em' }}>
              名刺代わりに。
            </div>
          </div>

          {/* Visual Content (Contained within 630x630, floating) */}
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>

            {/* 1. Gift Card (Background Layer) */}
            <div
              style={{
                position: 'absolute',
                bottom: '80px',
                left: '25px',
                height: '280px',
                width: cardResult ? (280 * cardResult.ratio) : '480px',
                borderRadius: '24px',
                display: 'flex',
                boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                transform: 'rotate(-5deg)',
                overflow: 'hidden',
              }}
            >
              {cardResult?.dataUrl ? (
                <img
                  src={cardResult.dataUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: '24px'
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                  {logoIconDataUrl && <img src={logoIconDataUrl} width={80} height={80} style={{ opacity: 0.1 }} />}
                </div>
              )}
            </div>

            {/* 2. Product Image (Foreground Layer) */}
            <div
              style={{
                position: 'absolute',
                top: '40px',
                right: '40px',
                height: '320px',
                width: productResult ? (320 * productResult.ratio) : '320px',
                borderRadius: '30px',
                display: 'flex',
                boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
                transform: 'rotate(7deg)',
              }}
            >
              {productResult?.dataUrl ? (
                <img
                  src={productResult.dataUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '30px'
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
                  {logoIconDataUrl && <img src={logoIconDataUrl} width={60} height={60} style={{ opacity: 0.2 }} />}
                </div>
              )}
            </div>

            {/* Icon decoration */}
            {logoIconDataUrl && (
              <img
                src={logoIconDataUrl}
                width={100}
                height={100}
                style={{
                  position: 'absolute',
                  top: '100px',
                  left: '50px',
                  transform: 'rotate(-20deg)',
                  filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
                  opacity: 0.8
                }}
              />
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts,
    }
  );
}
