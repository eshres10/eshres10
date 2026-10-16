import { useState } from 'react';
import { useCreateVisualization, useGetRecommendations, useListFabrics, useListPatterns } from '@workspace/api-client-react';
import { Clapperboard, Compass, ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { ErrorState, Heading, Loading } from '@/components/common';
import { AnyRecord } from '@/lib/types';

export function AIStudio() {
  const fabrics = useListFabrics();
  const patterns = useListPatterns();
  const create = useCreateVisualization();
  const rec = useGetRecommendations();
  const [pattern, setPattern] = useState('');
  const [fabric, setFabric] = useState('');
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [error, setError] = useState('');
  const [recommend, setRecommend] = useState(false);
  const selectedPattern = (patterns.data || []).find((item: AnyRecord) => String(item.id) === pattern);
  const selectedFabric = (fabrics.data || []).find((item: AnyRecord) => String(item.id) === fabric);

  const visualize = () => {
    if (!pattern || !fabric) return;
    setError('');
    setResult(null);
    create.mutate(
      { data: { patternId: Number(pattern), fabricId: Number(fabric) } },
      {
        onSuccess: value => setResult(value),
        onError: err => setError(err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'The outfit preview could not be generated. Please try again.'),
      },
    );
  };

  return <>
    <Heading eyebrow="The workbench / AI" title="AI studio" copy="Turn a pattern and fabric from your studio into an AI-generated outfit concept before you cut." />
    <div className="mb-7 flex flex-col sm:flex-row gap-1 rounded-lg bg-canvas p-1 sm:w-fit">
      <button onClick={() => setRecommend(false)} data-testid="button-ai-visualize-tab" className={`btn min-h-[44px] flex-1 sm:flex-none ${!recommend ? 'bg-white' : ''}`}><Clapperboard size={15} /> Visualize a make</button>
      <button onClick={() => setRecommend(true)} data-testid="button-ai-recommend-tab" className={`btn min-h-[44px] flex-1 sm:flex-none ${recommend ? 'bg-white' : ''}`}><Compass size={15} /> Find a pairing</button>
    </div>
    {recommend ? <section className="studio-card rounded-xl p-6">
      <p className="eyebrow">From the shelves</p>
      <h2 className="mt-2 font-display text-3xl">Pairings worth a second look.</h2>
      {rec.isLoading ? <Loading /> : rec.isError ? <ErrorState retry={() => rec.refetch()} /> : <div className="mt-7 grid gap-4 md:grid-cols-2">{(rec.data || []).map((r: AnyRecord, i: number) => <div key={i} data-testid={`card-recommendation-${i}`} className="rounded-lg border border-line p-4"><p className="font-display text-xl">{r.pattern?.name}</p><p className="text-xs text-muted-foreground">with {r.fabric?.name}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">{r.reason}</p></div>)}</div>}
    </section> : <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <section className="studio-card rounded-xl p-6">
        <p className="eyebrow">01 / choose your ingredients</p>
        <h2 className="mt-2 font-display text-3xl">Build the outfit concept.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">The AI uses your saved garment, construction, color, fabric type, weight, and drape details.</p>
        <label className="mt-5 block text-xs font-semibold">Pattern
          <select value={pattern} onChange={event => { setPattern(event.target.value); setResult(null); setError(''); }} data-testid="select-ai-pattern" className="field mt-1.5">
            <option value="">Choose a pattern…</option>
            {(patterns.data || []).map((item: AnyRecord) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        {selectedPattern && <div className="mt-3 rounded-lg border border-line bg-white p-3 text-xs leading-5" data-testid="summary-ai-pattern"><strong>{selectedPattern.garmentType}</strong> · {selectedPattern.difficulty}<br /><span className="text-muted-foreground">{selectedPattern.instructions || selectedPattern.notes || 'No construction notes added yet.'}</span></div>}
        <label className="mt-4 block text-xs font-semibold">Fabric
          <select value={fabric} onChange={event => { setFabric(event.target.value); setResult(null); setError(''); }} data-testid="select-ai-fabric" className="field mt-1.5">
            <option value="">Choose from your stash…</option>
            {(fabrics.data || []).map((item: AnyRecord) => <option value={item.id} key={item.id}>{item.name} · {item.color}</option>)}
          </select>
        </label>
        {selectedFabric && <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-white p-3 text-xs" data-testid="summary-ai-fabric"><span className="h-8 w-8 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: selectedFabric.color }} /><div><strong>{selectedFabric.type}</strong> · {selectedFabric.color}<br /><span className="text-muted-foreground">{selectedFabric.composition || selectedFabric.weight || 'No fabric details added yet.'}</span></div></div>}
        <button onClick={visualize} disabled={!pattern || !fabric || create.isPending} data-testid="button-create-visualization" className="btn btn-primary mt-6 min-h-[44px] w-full">
          {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {create.isPending ? 'Imagining your outfit…' : 'Generate outfit concept'}
        </button>
        <p className="mt-3 text-center text-[.68rem] leading-5 text-muted-foreground">Generation can take up to a minute and uses Replit AI credits.</p>
        {error && <div role="alert" data-testid="error-ai-visualization" className="mt-4 rounded-lg border border-ink bg-peach-soft p-3 text-xs leading-5 text-red-ink">{error}</div>}
      </section>
      <section className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-xl bg-peach p-5 text-center">
        {create.isPending ? <div data-testid="state-ai-generating"><Loader2 size={34} className="mx-auto animate-spin text-subtle" /><h2 className="mt-5 font-display text-3xl text-ink">Draping the idea.</h2><p className="mt-3 text-sm text-subtle">AI is translating your pattern and fabric into a finished look.</p></div> :
          result ? <div className="w-full"><img src={result.imageUrl} alt={`${selectedPattern?.name || 'Pattern'} made in ${selectedFabric?.name || 'selected fabric'}`} className="mx-auto max-h-[560px] w-full rounded-lg object-contain shadow-xl" data-testid="image-ai-visualization" /><div className="mt-4 flex flex-wrap items-center justify-center gap-2"><span className="rounded-full bg-ink px-3 py-1 font-mono-custom text-[.6rem] uppercase text-white">AI concept</span><span className="text-xs font-semibold text-ink">{selectedPattern?.name} × {selectedFabric?.name}</span></div><p className="mx-auto mt-3 max-w-lg text-xs leading-5 text-subtle">{result.disclaimer}</p></div> :
            <div><ImagePlus size={32} className="mx-auto text-subtle" /><h2 className="mt-5 font-display text-3xl text-ink">Your imagined garment<br />will appear here.</h2><p className="mt-3 text-sm text-subtle">Select a pattern and fabric to begin.</p></div>}
      </section>
    </div>}
  </>;
}
