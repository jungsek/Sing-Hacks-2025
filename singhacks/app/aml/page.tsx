import RegulatoryConsole from "@/components/aml/RegulatoryConsole";
import TransactionConsole from "@/components/aml/TransactionConsole";

export default function AMLPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 space-y-3">
          <p className="text-sm uppercase tracking-wide text-primary/80">Sentinel Team · AML</p>
          <h1 className="text-3xl font-semibold">Sentinel Console</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Run real-time transaction analysis and launch the regulatory subflow to discover MAS
            circulars, extract guidance via Tavily, and draft monitoring rules for policy review.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Transaction Monitoring</h2>
            <TransactionConsole />
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Regulatory Intelligence</h2>
            <RegulatoryConsole />
          </section>
        </div>
      </div>
    </main>
  );
}
