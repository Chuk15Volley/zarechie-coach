import { Manrope, Prata } from 'next/font/google';
import Head from 'next/head';
import '../styles/globals.css';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: 'variable',
  variable: '--font-manrope',
  display: 'swap',
});

const prata = Prata({
  subsets: ['latin', 'cyrillic'],
  weight: '400',
  variable: '--font-prata',
  display: 'swap',
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta key="application-name" name="application-name" content="NK TEAM SYSTEM" />
        <meta key="mobile-capable" name="mobile-web-app-capable" content="yes" />
        <meta key="apple-capable" name="apple-mobile-web-app-capable" content="yes" />
        <meta key="apple-status-bar" name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta key="apple-title" name="apple-mobile-web-app-title" content="NK TEAM SYSTEM" />
        <link key="manifest" rel="manifest" href="/manifest.webmanifest" />
        <link key="app-icon" rel="icon" href="/icons/nk-team-192.png" type="image/png" sizes="192x192" />
        <link key="apple-icon" rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />
      </Head>
      <main className={`${manrope.variable} ${prata.variable} font-sans`}>
        <Component {...pageProps} />
      </main>
    </>
  );
}
