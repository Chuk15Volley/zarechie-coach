import { Manrope, Prata } from 'next/font/google';
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
    <main className={`${manrope.variable} ${prata.variable} font-sans`}>
      <Component {...pageProps} />
    </main>
  );
}
