'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Radar Local: página pública de captación de Locallyfy.
 * Formulario → 3 preguntas genéricas a 4 asistentes → veredicto en pantalla e informe por correo.
 */

type Motor = 'chatgpt' | 'gemini' | 'perplexity' | 'google_ia';
type EstadoCelda = 'sale' | 'no_sale' | 'sin_respuesta';
interface Celda {
  motor: Motor;
  estado: EstadoCelda;
  posicion: number | null;
}
interface Veredicto {
  nota: number;
  titular: string;
  subtitular: string;
  apariciones: number;
  total: number;
  email_enviado: boolean;
}
type Paso = 'formulario' | 'analizando' | 'resultado';

const MOTORES: Array<[Motor, string]> = [
  ['chatgpt', 'ChatGPT'],
  ['gemini', 'Gemini'],
  ['perplexity', 'Perplexity'],
  ['google_ia', 'Google Modo IA'],
];

const MAGENTA = '#f61a7f';
const CORAL = '#f94963';
const MAGENTA_TEXTO = '#c2105f';
const NEGRO = '#0a0a0a';
const DEGRADADO = `linear-gradient(90deg, ${MAGENTA}, ${CORAL})`;
const TITULOS = 'var(--radar-titulos), sans-serif';

const campo: CSSProperties = {
  minHeight: 50,
  padding: '0 14px',
  border: `2px solid ${NEGRO}`,
  borderRadius: 12,
  font: 'inherit',
  fontSize: 16,
  color: NEGRO,
  background: '#ffffff',
  boxSizing: 'border-box',
  width: '100%',
};
const etiqueta: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#2b2b2b' };
const botonPrincipal: CSSProperties = {
  minHeight: 58,
  border: 0,
  borderRadius: 14,
  background: DEGRADADO,
  color: NEGRO,
  font: 'inherit',
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  padding: '0 24px',
};
const ancho: CSSProperties = { maxWidth: 1160, margin: '0 auto', boxSizing: 'border-box' };

async function post<T>(url: string, cuerpo: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos?.error || 'Ha habido un problema. Inténtalo de nuevo.');
  return datos as T;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function CeldaVista({ c, cargando }: { c: Celda | undefined; cargando: boolean }) {
  const base: CSSProperties = { height: 54, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', textAlign: 'center' };
  if (!c) {
    return (
      <div style={{ ...base, background: '#f1f1f1', color: '#454545', fontSize: 13 }}>{cargando ? 'Preguntando…' : 'Sin dato'}</div>
    );
  }
  if (c.estado === 'sale') {
    return <div style={{ ...base, background: c.posicion === 1 ? '#bbf7d0' : '#dcfce7', color: '#14532d', fontSize: 19, fontWeight: 700 }}>{c.posicion ? `${c.posicion}.º` : 'Sí'}</div>;
  }
  if (c.estado === 'no_sale') {
    return <div style={{ ...base, background: '#fee2e2', color: '#991b1b', fontSize: 13, fontWeight: 700 }}>No apareces</div>;
  }
  return <div style={{ ...base, background: '#f1f1f1', color: '#454545', fontSize: 13 }}>Sin dato</div>;
}

export function RadarLocal() {
  const [paso, setPaso] = useState<Paso>('formulario');
  const [negocio, setNegocio] = useState('');
  const [sector, setSector] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [email, setEmail] = useState('');
  const [trampa, setTrampa] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sesion, setSesion] = useState<{ id: string; token: string } | null>(null);
  const [preguntas, setPreguntas] = useState<string[]>([]);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [celdas, setCeldas] = useState<Record<number, Celda[]>>({});
  const [hechas, setHechas] = useState(0);
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);

  const [telefono, setTelefono] = useState('');
  const [llamada, setLlamada] = useState<'no' | 'enviando' | 'ok'>('no');
  const [errorLlamada, setErrorLlamada] = useState<string | null>(null);

  async function analizar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acepta) {
      setError('Marca la casilla de la política de privacidad para continuar.');
      return;
    }
    setEnviando(true);
    try {
      const inicio = await post<{ id: string; token: string; preguntas: string[]; etiquetas: string[] }>('/api/radar/iniciar', {
        negocio,
        sector,
        ciudad,
        email,
        consentimiento: true,
        empresa: trampa,
      });
      const s = { id: inicio.id, token: inicio.token };
      setSesion(s);
      setPreguntas(inicio.preguntas);
      setEtiquetas(inicio.etiquetas);
      setCeldas({});
      setHechas(0);
      setVeredicto(null);
      setPaso('analizando');
      window.scrollTo({ top: 0 });

      await Promise.all(
        inicio.preguntas.map(async (_, i) => {
          await esperar(i * 1500);
          try {
            const r = await post<{ i: number; celdas: Celda[] }>('/api/radar/pregunta', { ...s, i });
            setCeldas((prev) => ({ ...prev, [i]: r.celdas }));
          } catch {
            /* la celda se queda sin dato */
          } finally {
            setHechas((n) => n + 1);
          }
        }),
      );

      const v = await post<Veredicto>('/api/radar/finalizar', s);
      setVeredicto(v);
      setPaso('resultado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ha habido un problema. Inténtalo de nuevo.');
      setPaso('formulario');
    } finally {
      setEnviando(false);
    }
  }

  async function pedirLlamada(e: FormEvent) {
    e.preventDefault();
    if (!sesion) return;
    setErrorLlamada(null);
    setLlamada('enviando');
    try {
      await post('/api/radar/llamada', { ...sesion, telefono });
      setLlamada('ok');
    } catch (err) {
      setErrorLlamada(err instanceof Error ? err.message : 'No se pudo guardar.');
      setLlamada('no');
    }
  }

  const cabecera = (
    <header style={{ ...ancho, padding: '22px 24px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <a href="https://locallyfy.com/" aria-label="Locallyfy, ir a la web" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/radar/locallyfy-logo-blanco.svg" alt="Locallyfy" width={120} height={40} style={{ height: 40, width: 'auto', display: 'block' }} />
      </a>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: MAGENTA }}>RADAR LOCAL</span>
    </header>
  );

  const matriz = (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 720, borderCollapse: 'separate', borderSpacing: '0 8px', fontSize: 15 }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#454545', padding: '0 12px 4px 0' }}>Pregunta</th>
            {MOTORES.map(([m, nombre]) => (
              <th key={m} scope="col" style={{ width: 116, fontSize: 13, fontWeight: 700, color: '#454545', padding: '0 4px 4px' }}>{nombre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preguntas.map((p, i) => (
            <tr key={i}>
              <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '0 12px 0 0', color: NEGRO }}>
                {etiquetas[i] && <span style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: MAGENTA_TEXTO }}>{etiquetas[i].toUpperCase()}</span>}
                {p}
              </th>
              {MOTORES.map(([m]) => (
                <td key={m} style={{ padding: '0 4px' }}>
                  <CeldaVista c={celdas[i]?.find((c) => c.motor === m)} cargando={paso === 'analizando'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Análisis en curso y resultado ───────────────────────────────────────────
  if (paso !== 'formulario') {
    const circ = 2 * Math.PI * 50;
    return (
      <div style={{ fontFamily: 'var(--radar-texto), system-ui, sans-serif', color: NEGRO, background: '#ffffff', minHeight: '100vh' }}>
        <div style={{ background: NEGRO, paddingBottom: 22 }}>{cabecera}</div>
        <main style={{ ...ancho, padding: '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: TITULOS, fontSize: 36, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{negocio}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 15, color: '#454545' }}>{sector} · {ciudad}</p>
          </div>

          <section aria-label="Veredicto" aria-live="polite" style={{ background: NEGRO, color: '#ffffff', borderRadius: 24, padding: 32, display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
            {veredicto ? (
              <>
                <div style={{ position: 'relative', width: 176, height: 176, flex: '0 0 176px' }}>
                  <svg viewBox="0 0 120 120" role="img" aria-label={`Nota: ${veredicto.nota} de 100`} style={{ width: 176, height: 176, transform: 'rotate(-90deg)' }}>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#3d3d3d" strokeWidth="11" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke={MAGENTA} strokeWidth="11" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - veredicto.nota / 100)} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: TITULOS, fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{veredicto.nota}</span>
                    <span style={{ fontSize: 13, color: '#d9d9d9' }}>de 100</span>
                  </div>
                </div>
                <div style={{ flex: '999 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: MAGENTA }}>VEREDICTO</p>
                  <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 'clamp(26px, 3.4vw, 36px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em' }}>{veredicto.titular}</h2>
                  <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: '#d9d9d9' }}>{veredicto.subtitular}</p>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: MAGENTA }}>ANALIZANDO</p>
                <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                  {hechas < preguntas.length ? `Preguntando a los asistentes… ${hechas} de ${preguntas.length}` : 'Calculando tu nota…'}
                </h2>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#d9d9d9' }}>Suele tardar menos de un minuto. No cierres esta página.</p>
              </div>
            )}
          </section>

          <section aria-label="Pregunta por pregunta" style={{ border: `2px solid ${NEGRO}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 24, fontWeight: 800 }}>Lo que respondió cada asistente</h2>
            {matriz}
          </section>

          {veredicto && (
            <section aria-label="Informe completo" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
              <div style={{ flex: '999 1 480px', minWidth: 0, border: `2px solid ${NEGRO}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 24, fontWeight: 800 }}>
                  {veredicto.email_enviado ? 'El informe completo ya está en tu correo' : 'Tu informe completo va de camino'}
                </h2>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#2b2b2b' }}>
                  {veredicto.email_enviado
                    ? `Lo hemos enviado a ${email}. Si no lo ves en unos minutos, mira en la carpeta de correo no deseado.`
                    : `Te lo enviaremos a ${email} en cuanto lo tengamos listo.`}
                </p>
                <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 16, lineHeight: 1.7, color: NEGRO }}>
                  <li>Qué negocios se llevan tus recomendaciones</li>
                  <li>De qué webs saca la IA lo que dice</li>
                  <li>Las tres cosas que arreglar primero</li>
                </ul>
              </div>

              <form onSubmit={pedirLlamada} style={{ flex: '1 1 360px', minWidth: 0, background: NEGRO, color: '#ffffff', borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
                <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>¿Lo vemos juntos en 15 minutos?</h2>
                {llamada === 'ok' ? (
                  <p role="status" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#d9d9d9' }}>Recibido. Te llamamos en horario de oficina.</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label htmlFor="rl-tel" style={{ fontSize: 13, fontWeight: 700, color: '#d9d9d9' }}>Tu teléfono</label>
                      <input id="rl-tel" type="tel" required autoComplete="tel" placeholder="600 000 000" value={telefono} onChange={(e) => setTelefono(e.target.value)} style={{ ...campo, border: '1px solid #8a8a8a' }} />
                    </div>
                    {errorLlamada && <p role="alert" style={{ margin: 0, fontSize: 14, color: '#fecaca' }}>{errorLlamada}</p>}
                    <button type="submit" disabled={llamada === 'enviando'} style={{ ...botonPrincipal, opacity: llamada === 'enviando' ? 0.7 : 1 }}>
                      {llamada === 'enviando' ? 'ENVIANDO…' : 'QUIERO QUE ME LLAMÉIS'}
                    </button>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: '#d9d9d9' }}>Sin compromiso. Te llama una persona de Locallyfy.</p>
                  </>
                )}
              </form>
            </section>
          )}

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#454545' }}>Es una foto del momento: las respuestas de los asistentes cambian de una vez a otra.</p>
        </main>
      </div>
    );
  }

  // ── Página de captación ─────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--radar-texto), system-ui, sans-serif', color: '#ffffff', background: NEGRO }}>
      {cabecera}

      <section style={{ ...ancho, padding: '52px 24px 76px', display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 540px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p style={{ margin: 0, alignSelf: 'flex-start', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', padding: '8px 14px', borderRadius: 999, background: DEGRADADO, color: NEGRO }}>RADAR LOCAL · GRATIS</p>
          <h1 style={{ margin: 0, fontFamily: TITULOS, fontSize: 'clamp(42px, 6.2vw, 76px)', fontWeight: 800, lineHeight: 0.98, letterSpacing: '-0.03em' }}>
            Preguntan a la IA por un negocio como el tuyo. <span style={{ color: MAGENTA }}>¿Sales tú?</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 19, lineHeight: 1.5, color: '#d9d9d9' }}>
            Tus vecinos ya no solo buscan en Google Maps: preguntan a ChatGPT, a Gemini y al propio Google. En un minuto ves a quién recomiendan en tu ciudad.
          </p>

          <form onSubmit={analizar} style={{ background: '#ffffff', color: NEGRO, borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 580, boxSizing: 'border-box', boxShadow: `10px 10px 0 ${MAGENTA}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="rl-negocio" style={etiqueta}>Nombre de tu negocio</label>
              <input id="rl-negocio" required maxLength={100} autoComplete="organization" placeholder="Peluquería Ejemplo" value={negocio} onChange={(e) => setNegocio(e.target.value)} style={campo} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="rl-sector" style={etiqueta}>A qué te dedicas</label>
                <input id="rl-sector" required maxLength={60} placeholder="Peluquería" value={sector} onChange={(e) => setSector(e.target.value)} style={campo} />
              </div>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="rl-ciudad" style={etiqueta}>Ciudad</label>
                <input id="rl-ciudad" required maxLength={60} autoComplete="address-level2" placeholder="Ourense" value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={campo} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#454545' }}>Por ejemplo:</span>
              {['Restaurante', 'Clínica dental', 'Taller mecánico'].map((s) => (
                <button key={s} type="button" onClick={() => setSector(s)} style={{ minHeight: 44, padding: '0 14px', border: '1px solid #8a8a8a', borderRadius: 999, background: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 500, color: NEGRO, cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="rl-email" style={etiqueta}>Tu email</label>
              <input id="rl-email" type="email" required maxLength={160} autoComplete="email" placeholder="tu@negocio.es" value={email} onChange={(e) => setEmail(e.target.value)} style={campo} />
            </div>
            {/* Campo trampa para robots: oculto a personas y a lectores de pantalla */}
            <div aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="rl-empresa">No rellenar</label>
              <input id="rl-empresa" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: '#454545' }}>
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ width: 20, height: 20, margin: 0, flex: '0 0 20px' }} />
              <span>
                Acepto que Locallyfy me envíe el informe y me contacte sobre él.{' '}
                <a href="https://locallyfy.com/politica-de-privacidad/" target="_blank" rel="noopener noreferrer" style={{ color: MAGENTA_TEXTO }}>Política de privacidad</a>.
              </span>
            </label>
            {error && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 14, lineHeight: 1.45 }}>{error}</p>}
            <button type="submit" disabled={enviando} style={{ ...botonPrincipal, opacity: enviando ? 0.7 : 1 }}>{enviando ? 'PREPARANDO…' : 'VER SI ME RECOMIENDAN'}</button>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#454545' }}>Ves el resultado al momento y te enviamos el informe completo a tu correo. Aunque no tengas web.</p>
          </form>
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }} aria-hidden="true">
          <div style={{ background: '#ffffff', color: NEGRO, borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 8px 0 16px', border: `2px solid ${NEGRO}`, borderRadius: 999 }}>
              <svg viewBox="0 0 24 24" style={{ flex: '0 0 20px', width: 20, height: 20 }} fill="none" stroke={NEGRO} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>peluquería en Ourense</span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '7px 12px', borderRadius: 999, background: NEGRO, color: '#ffffff' }}>Modo IA</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: MAGENTA_TEXTO }}>Respuesta generada con IA</span>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>Las mejor valoradas cerca de ti son <strong>Tu competidor</strong> y <strong>Otro competidor</strong>.</p>
            {[
              ['Tu competidor', '4,8', '212'],
              ['Otro competidor', '4,6', '148'],
            ].map(([nombre, nota, n]) => (
              <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #c9c9c9', borderRadius: 14, padding: '12px 14px' }}>
                <span style={{ flex: '0 0 44px', width: 44, height: 44, borderRadius: 10, background: '#e6e6e6' }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{nombre}</span>
                  <span style={{ fontSize: 13, color: '#2b2b2b' }}><span style={{ color: '#9a5b00', fontWeight: 700 }}>{nota} ★</span> ({n} reseñas) · Abierto ahora</span>
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: `2px dashed ${MAGENTA}`, borderRadius: 14, padding: '14px 16px' }}>
              <span style={{ fontFamily: TITULOS, fontSize: 20, fontWeight: 800, color: MAGENTA_TEXTO }}>¿Y tu ficha?</span>
              <span style={{ fontSize: 14, lineHeight: 1.45, color: '#2b2b2b' }}>La IA decide con tu ficha de Google: reseñas, horario, fotos y respuestas.</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#bdbdbd' }}>Simulación de una respuesta del Modo IA de Google. También preguntamos a ChatGPT, Gemini y Perplexity.</p>
        </div>
      </section>

      <section style={{ background: '#ffffff', color: NEGRO }}>
        <div style={{ ...ancho, padding: '72px 24px', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: MAGENTA_TEXTO }}>CÓMO FUNCIONA</p>
            <h2 style={{ margin: 0, fontFamily: TITULOS, fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>Preguntamos como preguntaría tu vecino.</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {[
              ['Nos dices tu negocio y tu ciudad', 'Con eso hacemos las preguntas de alguien que busca lo que ofreces y aún no te conoce.'],
              ['Se las hacemos a cuatro asistentes', 'En directo y con búsqueda en internet, igual que desde un móvil.'],
              ['Ves quién sale y en qué puesto', 'Tú y los negocios de tu zona que se llevan la recomendación.'],
            ].map(([t, d], i) => (
              <article key={t} style={{ flex: '1 1 300px', border: `2px solid ${NEGRO}`, borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontFamily: TITULOS, fontSize: 52, fontWeight: 800, lineHeight: 1, color: MAGENTA }}>{i + 1}</span>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{t}</h3>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#2b2b2b' }}>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ ...ancho, padding: '32px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', fontSize: 13, color: '#bdbdbd' }}>
        <span>© Locallyfy</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <a href="https://locallyfy.com/aviso-legal/" style={{ color: '#ffffff' }}>Aviso legal</a>
          <a href="https://locallyfy.com/politica-de-privacidad/" style={{ color: '#ffffff' }}>Privacidad</a>
          <a href="https://locallyfy.com/politica-de-cookies/" style={{ color: '#ffffff' }}>Cookies</a>
        </span>
      </footer>
    </div>
  );
}
