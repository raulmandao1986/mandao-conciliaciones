import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {SUPABASE_CONFIGURADO} from './lib/supabase';

// Sin la conexión a Supabase (variables SUPABASE_URL / SUPABASE_ANON_KEY no
// definidas al compilar) la app no puede funcionar: se explica en pantalla.
function ConfiguracionFaltante() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-6 space-y-2">
        <h1 className="text-base font-bold text-[var(--color-text)]">Falta la conexión con la base de datos</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          El sistema se compiló sin las variables <code className="font-mono">SUPABASE_URL</code> y{' '}
          <code className="font-mono">SUPABASE_ANON_KEY</code>. Defínalas en Netlify (Site configuration → Environment variables)
          y vuelva a desplegar.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {SUPABASE_CONFIGURADO ? <App /> : <ConfiguracionFaltante />}
  </StrictMode>,
);
