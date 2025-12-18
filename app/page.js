'use client';

import dynamic from 'next/dynamic';

// ⚠️ THIS 'ssr: false' IS MANDATORY FOR DECK.GL
const CloudMap = dynamic(() => import('../components/CloudMap'), { 
  ssr: false,
  loading: () => <p>Loading Map...</p>
});

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <CloudMap />
    </main>
  );
}