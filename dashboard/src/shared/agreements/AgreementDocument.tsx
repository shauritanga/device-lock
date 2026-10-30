import { shortDate } from '../lib/format';
import type { Agreement } from './types';

/**
 * The agreement as a printable document. Rendered from the frozen server-side
 * snapshot so what is shown (and printed to PDF) is exactly what was signed.
 * Everything inside `#agreement-print` is what the print stylesheet keeps.
 */
export function AgreementDocument({ agreement: a }: { agreement: Agreement }) {
  const c = a.content;
  return (
    <article
      id="agreement-print"
      className="mx-auto max-w-[800px] bg-white p-6 font-serif text-[13.5px] leading-relaxed text-slate-900 sm:p-12"
    >
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-wide">{c.title}</h1>
        <p className="mt-1 text-sm font-semibold tracking-wide">{c.subtitle}</p>
      </header>

      <p className="mt-8">{c.intro}</p>

      <section className="mt-6 space-y-4">
        {c.parties.map((p, i) => (
          <div key={p.role}>
            <p className="font-bold">{i === 0 ? 'BETWEEN' : 'AND'}</p>
            <p className="mt-1 text-justify">{p.text}</p>
          </div>
        ))}
        <p className="text-justify">
          The Service Provider and the Client are collectively referred to as the “Parties” and
          individually as a “Party”.
        </p>
      </section>

      {c.clauses.map((cl) => (
        <section key={cl.number} className="mt-6 break-inside-avoid-page">
          <h2 className="font-bold">
            {cl.number}. {cl.title}
          </h2>
          <div className="mt-1.5 space-y-2">
            {cl.blocks.map((b, i) => (
              <p key={i} className="text-justify">
                {b.label ? <span className="font-semibold">{b.label}. </span> : null}
                {b.text}
              </p>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-8 break-inside-avoid">
        <div className="grid gap-8 sm:grid-cols-2">
          <SignatureBlock
            heading={`FOR ${a.providerName.toUpperCase()}`}
            name={a.providerSignatoryName}
            title={a.providerSignatoryTitle}
            signature={a.providerSignature}
            date={a.providerSignedAt}
          />
          <SignatureBlock
            heading={`FOR ${a.clientName.toUpperCase()}`}
            name={a.clientSignatoryName}
            title={a.clientSignatoryTitle}
            signature={a.clientSignature}
            date={a.clientSignedAt}
          />
        </div>

        <h3 className="mt-8 font-bold">WITNESSES</h3>
        <div className="mt-3 grid gap-8 sm:grid-cols-2">
          <WitnessBlock
            heading={`WITNESS FOR ${a.providerName.toUpperCase()}`}
            name={a.providerWitnessName}
            signature={a.providerWitnessSignature}
            date={a.providerSignedAt}
          />
          <WitnessBlock
            heading={`WITNESS FOR ${a.clientName.toUpperCase()}`}
            name={a.clientWitnessName}
            signature={a.clientWitnessSignature}
            date={a.clientSignedAt}
          />
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-300 pt-3 text-center text-[11px] text-slate-500">
        <p>END OF AGREEMENT</p>
        <p className="mt-1">
          {a.providerName} | {a.clientName} · {a.termsVersion} · Document hash{' '}
          {a.contentHash.slice(0, 16)}
        </p>
      </footer>
    </article>
  );
}

function Line({ label, value }: { label: string; value?: string | null }) {
  return (
    <p className="flex gap-2 border-b border-slate-300 pb-0.5">
      <span className="shrink-0 text-slate-600">{label}:</span>
      <span className="min-w-0 break-words font-medium">{value ?? ''}</span>
    </p>
  );
}

function SigImage({ src }: { src?: string | null }) {
  return (
    <div className="flex h-14 items-end border-b border-slate-300 pb-0.5">
      <span className="mr-2 text-slate-600">Signature:</span>
      {src ? <img src={src} alt="Signature" className="max-h-12 object-contain" /> : null}
    </div>
  );
}

function SignatureBlock(p: {
  heading: string;
  name?: string | null;
  title?: string | null;
  signature?: string | null;
  date?: string | null;
}) {
  return (
    <div className="space-y-3">
      <p className="font-bold">{p.heading}</p>
      <Line label="Name" value={p.name} />
      <Line label="Title" value={p.title} />
      <SigImage src={p.signature} />
      <p className="border-b border-slate-300 pb-0.5 text-slate-600">Company Stamp:</p>
      <Line label="Date" value={p.date ? shortDate(p.date) : ''} />
    </div>
  );
}

function WitnessBlock(p: {
  heading: string;
  name?: string | null;
  signature?: string | null;
  date?: string | null;
}) {
  return (
    <div className="space-y-3">
      <p className="font-bold">{p.heading}</p>
      <Line label="Name" value={p.name} />
      <SigImage src={p.signature} />
      <Line label="Date" value={p.name && p.date ? shortDate(p.date) : ''} />
    </div>
  );
}
