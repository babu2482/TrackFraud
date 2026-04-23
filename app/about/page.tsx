import Link from "next/link";

export const metadata = {
  title: "About — TrackFraud",
  description: "Our mission, methodology, data sources, and how we ensure accuracy in fraud tracking.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          About TrackFraud
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          TrackFraud is a public accountability platform that makes financial
          fraud visible. We aggregate data from government databases, regulatory
          filings, and community tips to give Americans a single place to
          follow the money.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Mission
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Fraud thrives in opacity. When organizations — charities, corporations,
          political committees, government contractors — can spend money without
          scrutiny, abuse follows. TrackFraud exists to make that scrutiny
          effortless. We believe that public records should be publicly accessible,
          understandable, and searchable. Our goal is to lower the barrier to
          financial accountability from "hire an investigative journalist" to
          "type a name and press search."
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Methodology
        </h2>
        <div className="space-y-4 text-gray-600 dark:text-gray-400">
          <p>
            TrackFraud does not make accusations. We present data from authoritative
            public sources and apply transparent, documented scoring methodologies
            so users can draw their own conclusions.
          </p>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
              Charity Tracking (Live)
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Primary data:</strong> IRS Form 990 filings via ProPublica
                Nonprofit Explorer API. This is the same data the IRS collects
                from every tax-exempt organization.
              </li>
              <li>
                <strong>Metrics:</strong> Program expense ratio (how much goes to
                the cause), overhead ratio, cost to raise $1, officer compensation
                as a share of spending.
              </li>
              <li>
                <strong>Risk signals:</strong> Computed from configurable thresholds
                against filing data. A "high risk" flag means a metric exceeds the
                threshold — not that fraud has occurred.
              </li>
              <li>
                <strong>Fraud meter:</strong> Converts category-specific indicators
                and external evidence into a 0-100 fraud score so users can see
                how strongly the available record matches a fraud pattern in that
                category.
              </li>
              <li>
                <strong>External corroboration:</strong> Cross-referenced against IRS
                revocation lists, OFAC sanctions, and optional state enforcement data.
              </li>
              <li>
                <strong>Peer comparison:</strong> Median program expense ratio sampled
                from organizations in the same NTEE (National Taxonomy of Exempt
                Entities) category.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
              Future Categories
            </h3>
            <p>
              Political, corporate, government, healthcare, and consumer fraud
              categories will follow the same principles: public data sources,
              transparent scoring, and clearly documented methodology. Each
              category page lists its planned data sources.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Community Tips
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Community tips supplement automated data. Tips are anonymous by default
          and go through a review process before any public action is taken. We
          never publish unverified allegations. Tips help us prioritize which
          organizations to investigate more deeply using public records.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          What TrackFraud is Not
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            <strong>Not law enforcement.</strong> We do not investigate or prosecute.
            If you suspect active fraud, report it to the appropriate authorities
            (links provided on each category page).
          </li>
          <li>
            <strong>Not an accusation engine.</strong> A high risk score means
            data falls outside normal ranges — it is not proof of fraud. Always
            check the underlying data and consider context.
          </li>
          <li>
            <strong>Not behind a paywall.</strong> Public data should be publicly
            accessible. Core features are free.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Data Sources
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "ProPublica Nonprofit Explorer", url: "https://projects.propublica.org/nonprofits/", desc: "IRS Form 990 data for all US nonprofits" },
            { name: "IRS Auto-Revocation List", url: "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search", desc: "Organizations that lost tax-exempt status" },
            { name: "OFAC SDN List", url: "https://sanctionssearch.ofac.treas.gov/", desc: "Specially Designated Nationals and sanctioned entities" },
            { name: "FEC API", url: "https://api.open.fec.gov/", desc: "Federal campaign finance data (planned)" },
            { name: "SEC EDGAR", url: "https://www.sec.gov/edgar/", desc: "Corporate financial filings (planned)" },
            { name: "USASpending.gov", url: "https://api.usaspending.gov/", desc: "Federal spending data (planned)" },
          ].map((source) => (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-colors"
            >
              <p className="font-medium text-gray-900 dark:text-white text-sm">
                {source.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {source.desc}
              </p>
            </a>
          ))}
        </div>
      </section>

      <section className="text-center py-6 border-t border-gray-200 dark:border-gray-800">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Have information about fraud? Help us build public accountability.
        </p>
        <Link
          href="/submit"
          className="inline-block px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
        >
          Submit a Tip
        </Link>
      </section>
    </div>
  );
}
