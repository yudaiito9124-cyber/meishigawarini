import { ImageResponse } from 'next/og';
import { Gift } from 'lucide-react';

export const runtime = 'edge';

export const alt = '名刺代わりに。 - ギフトのシェア';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image({ params }: { params: { uuid: string; locale: string } }) {
  const { uuid } = params;

  // APIから情報を取得
  const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
  let data: any = null;
  try {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/share/${uuid}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      data = await res.json();
    }
  } catch (e) {
    console.error("OGP Image data fetch failed", e);
  }

  if (!data) {
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
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ fontSize: 60, fontWeight: 900, color: '#059669', marginBottom: 20 }}>名刺代わりに。</div>
          <div style={{ fontSize: 30, color: '#64748B' }}>素敵なギフトが届きました</div>
        </div>
      ),
      { ...size }
    );
  }

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
          backgroundColor: '#F8FAFC',
          backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(5, 150, 105, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(5, 150, 105, 0.05) 0%, transparent 40%)',
          padding: '60px',
        }}
      >
        {/* Logo */}
        <div style={{ position: 'absolute', top: 40, left: 60, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, backgroundColor: '#059669', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, marginLeft: 12, color: '#1E293B', letterSpacing: '-0.05em' }}>名刺代わりに。</div>
        </div>

        {/* Content Box */}
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Card Left */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '51%', gap: 20 }}>
             <div style={{ fontSize: 14, fontWeight: 900, color: '#059669', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Digital Gift Card</div>
             <div style={{ 
                width: '100%', 
                aspectRatio: '84/52', 
                backgroundColor: '#E2E8F0', 
                borderRadius: 40, 
                overflow: 'hidden', 
                boxShadow: '0 40px 80px -20px rgba(0,0,0,0.2)',
                display: 'flex'
             }}>
                {data.design?.thumbf ? (
                    <img src={data.design.thumbf} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect></svg>
                    </div>
                )}
             </div>
          </div>

          {/* Spacer */}
          <div style={{ width: '4%' }}></div>

          {/* Product Right */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '40%', gap: 24 }}>
             <div style={{ 
                width: 280, 
                height: 280, 
                backgroundColor: 'white', 
                borderRadius: 60, 
                overflow: 'hidden', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)',
                display: 'flex',
                padding: 10
             }}>
                {data.product?.image_url ? (
                    <img src={data.product.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 50 }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    </div>
                )}
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#0F172A', lineHeight: 1.1, textOverflow: 'ellipsis' }}>{data.product?.name || "Premium Gift"}</div>
                <div style={{ fontSize: 18, color: '#64748B', fontWeight: 600 }}>{data.shop?.name || "Meishigawarini Shop"}</div>
             </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div style={{ position: 'absolute', bottom: 60, width: '100%', textAlign: 'center', fontSize: 24, fontWeight: 900, color: '#334155', letterSpacing: '0.05em' }}>
           素敵なギフトが届きました。
        </div>

      </div>
    ),
    { ...size }
  );
}
