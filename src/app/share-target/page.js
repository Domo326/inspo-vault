'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function ShareHandler() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const url   = params.get('url')   || '';
    const title = params.get('title') || '';
    const text  = params.get('text')  || '';

    // Find the best URL from the share payload
    const sharedUrl = url || (text?.startsWith('http') ? text : '') || '';

    if (sharedUrl) {
      // Redirect to home with the URL pre-filled in the add modal
      router.replace(`/?add=true&url=${encodeURIComponent(sharedUrl)}&title=${encodeURIComponent(title)}`);
    } else {
      router.replace('/');
    }
  }, [params, router]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#070910', color:'#94A3B8', gap:16 }}>
      <div style={{ fontSize:48 }}>🗂️</div>
      <p style={{ fontFamily:"'Space Grotesk', sans-serif", fontSize:18, color:'#F1F5F9' }}>Opening in InspoVault...</p>
      <p style={{ fontSize:14 }}>Taking you to the add screen ✨</p>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#070910' }}>
        <div style={{ fontSize:48 }}>🗂️</div>
      </div>
    }>
      <ShareHandler />
    </Suspense>
  );
}
