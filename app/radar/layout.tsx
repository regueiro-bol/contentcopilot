import type { Metadata } from 'next';
import { Outfit, Roboto } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'], weight: ['700', '800'], variable: '--radar-titulos' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--radar-texto' });

export const metadata: Metadata = {
  title: 'Radar Local de Locallyfy: ¿te recomienda la IA en tu ciudad?',
  description:
    'Descubre gratis y en un minuto si ChatGPT, Gemini, Perplexity y Google recomiendan tu negocio cuando alguien pregunta en tu ciudad.',
  robots: { index: false, follow: false }, // se abrirá a buscadores cuando esté en su dominio definitivo
};

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} ${roboto.variable}`}>{children}</div>;
}
