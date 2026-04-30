import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "TrackFraud Terms of Service and conditions of use.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div>
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          ← Back to TrackFraud
        </Link>
        <h1 className="text-3xl font-bold text-white mt-4">Terms of Service</h1>
        <p className="text-gray-400 mt-2">Last updated: January 2026</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">1. About TrackFraud</h2>
        <p className="text-gray-300">
          TrackFraud is a public accountability platform that aggregates and analyzes
          data from government sources to help track financial fraud patterns across
          charities, corporations, government contracts, healthcare, and political entities.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">2. Data Sources</h2>
        <p className="text-gray-300">
          All data displayed on TrackFraud is obtained from publicly available government
          sources including but not limited to IRS, SEC, FEC, CFPB, CMS, OFAC, EPA, FDA,
          HHS, SAM.gov, Congress.gov, and USASpending.gov. We do not create or verify the
          underlying data — we aggregate and present it for transparency purposes.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. Not Legal Advice</h2>
        <p className="text-gray-300">
          TrackFraud is not law enforcement and does not provide legal advice. The
          information presented is for educational and public accountability purposes
          only. Do not rely on TrackFraud data for legal, financial, or investment decisions.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">4. Fraud Scoring</h2>
        <p className="text-gray-300">
          Fraud risk scores are algorithmic assessments based on publicly available data.
          A high fraud score does not constitute a finding of wrongdoing. The scoring
          methodology is designed to highlight entities warranting further scrutiny,
          not to make determinations of guilt or innocence.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">5. User Submissions</h2>
        <p className="text-gray-300">
          Tips submitted through TrackFraud are for public accountability purposes.
          By submitting a tip, you confirm the information is accurate to the best
          of your knowledge. Defamatory or malicious submissions may be reported
          to appropriate authorities.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">6. Limitation of Liability</h2>
        <p className="text-gray-300">
          TrackFraud is provided "as is" without warranty of any kind. We do not
          guarantee the accuracy, completeness, or timeliness of the data presented.
          Use of this platform is at your own risk.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">7. Contact</h2>
        <p className="text-gray-300">
          For questions about these terms, please contact us through our GitHub
          repository or submit a tip through the platform.
        </p>
      </section>
    </div>
  );
}
