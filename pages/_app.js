import { Inter } from 'next/font/google';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });

export default function App({ Component, pageProps }) {
  return (
    <main className={inter.variable}>
      <Component {...pageProps} />
    </main>
  );
}
