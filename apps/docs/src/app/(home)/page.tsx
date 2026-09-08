import { BookOpenIcon, CodeIcon, FileTextIcon, GithubIcon, ServerIcon, ShieldCheckIcon, UserIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documenso Docs',
  description:
    'The official documentation for Documenso, the open-source document signing platform. Send documents for signatures, integrate with the API, or self-host with full control.',
};

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <div className="mb-16 pt-6 text-center">
        <h1 className="mb-4 font-bold text-4xl tracking-tight">Documenso Documentation</h1>
        <p className="mx-auto mb-8 max-w-2xl text-fd-muted-foreground text-lg">
          The open-source document signing platform. Send documents for signatures, integrate with your apps, or
          self-host with full control.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/docs/users"
            className="inline-flex items-center gap-2 rounded-lg bg-documenso px-5 py-2.5 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-documenso-dark/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/documenso/documenso"
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-background px-5 py-2.5 font-medium text-sm transition-colors hover:bg-fd-accent"
          >
            <GithubIcon className="size-4" />
            View on GitHub
          </a>
        </div>
      </div>

      {/* Main Guide Cards */}
      <div className="mb-16 grid gap-4 md:grid-cols-3">
        <Link
          href="/docs/users"
          className="group relative flex flex-col rounded-xl border bg-fd-card p-6 transition-all hover:border-fd-primary/50 hover:shadow-md"
        >
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <UserIcon className="size-6" />
          </div>
          <h2 className="mb-2 font-semibold text-lg">User Guide</h2>
          <p className="mb-4 flex-1 text-fd-muted-foreground text-sm">
            Send documents, create templates, and manage your team using the web application.
          </p>
          <span className="font-medium text-fd-primary text-sm">Get started →</span>
        </Link>

        <Link
          href="/docs/developers"
          className="group relative flex flex-col rounded-xl border bg-fd-card p-6 transition-all hover:border-fd-primary/50 hover:shadow-md"
        >
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <CodeIcon className="size-6" />
          </div>
          <h2 className="mb-2 font-semibold text-lg">Developer Guide</h2>
          <p className="mb-4 flex-1 text-fd-muted-foreground text-sm">
            Integrate document signing into your applications with the REST API, webhooks, and embedding.
          </p>
          <span className="font-medium text-fd-primary text-sm">View API docs →</span>
        </Link>

        <Link
          href="/docs/self-hosting"
          className="group relative flex flex-col rounded-xl border bg-fd-card p-6 transition-all hover:border-fd-primary/50 hover:shadow-md"
        >
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <ServerIcon className="size-6" />
          </div>
          <h2 className="mb-2 font-semibold text-lg">Self-Hosting Guide</h2>
          <p className="mb-4 flex-1 text-fd-muted-foreground text-sm">
            Deploy your own Documenso instance with Docker, Kubernetes, or Railway.
          </p>
          <span className="font-medium text-fd-primary text-sm">Deploy now →</span>
        </Link>
      </div>

      {/* Quick Start & Core Concepts */}
      <div className="mb-16 grid gap-8 md:grid-cols-2">
        <div className="rounded-xl border bg-fd-card/50 p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <BookOpenIcon className="size-5 text-fd-muted-foreground" />
            Quick Start
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 font-medium text-sm">Send your first document</h4>
              <ol className="list-inside list-decimal space-y-1 text-fd-muted-foreground text-sm">
                <li>
                  <Link href="/docs/users/getting-started/create-account" className="text-fd-primary hover:underline">
                    Create an account
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs/users/getting-started/send-first-document"
                    className="text-fd-primary hover:underline"
                  >
                    Upload and send a document
                  </Link>
                </li>
              </ol>
            </div>
            <div>
              <h4 className="mb-2 font-medium text-sm">Integrate with the API</h4>
              <ol className="list-inside list-decimal space-y-1 text-fd-muted-foreground text-sm">
                <li>
                  <Link
                    href="/docs/developers/getting-started/authentication"
                    className="text-fd-primary hover:underline"
                  >
                    Get your API key
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs/developers/getting-started/first-api-call"
                    className="text-fd-primary hover:underline"
                  >
                    Make your first API call
                  </Link>
                </li>
              </ol>
            </div>
            <div>
              <h4 className="mb-2 font-medium text-sm">Deploy self-hosted</h4>
              <ol className="list-inside list-decimal space-y-1 text-fd-muted-foreground text-sm">
                <li>
                  <Link
                    href="/docs/self-hosting/getting-started/requirements"
                    className="text-fd-primary hover:underline"
                  >
                    Check requirements
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs/self-hosting/getting-started/quick-start"
                    className="text-fd-primary hover:underline"
                  >
                    Run with Docker
                  </Link>
                </li>
              </ol>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-fd-card/50 p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <BookOpenIcon className="size-5 text-fd-muted-foreground" />
            Core Concepts
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/docs/concepts/document-lifecycle"
              className="rounded-lg border bg-fd-background p-3 text-sm transition-colors hover:border-fd-primary/50"
            >
              <div className="mb-1 font-medium">Document Lifecycle</div>
              <div className="text-fd-muted-foreground text-xs">Draft to completed</div>
            </Link>
            <Link
              href="/docs/concepts/recipient-roles"
              className="rounded-lg border bg-fd-background p-3 text-sm transition-colors hover:border-fd-primary/50"
            >
              <div className="mb-1 font-medium">Recipient Roles</div>
              <div className="text-fd-muted-foreground text-xs">Signers and approvers</div>
            </Link>
            <Link
              href="/docs/concepts/field-types"
              className="rounded-lg border bg-fd-background p-3 text-sm transition-colors hover:border-fd-primary/50"
            >
              <div className="mb-1 font-medium">Field Types</div>
              <div className="text-fd-muted-foreground text-xs">Signatures and inputs</div>
            </Link>
            <Link
              href="/docs/concepts/signing-certificates"
              className="rounded-lg border bg-fd-background p-3 text-sm transition-colors hover:border-fd-primary/50"
            >
              <div className="mb-1 font-medium">Signing Certificates</div>
              <div className="text-fd-muted-foreground text-xs">Digital verification</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Compliance & Policies */}
      <div className="mb-16 grid gap-4 md:grid-cols-2">
        <Link
          href="/docs/compliance"
          className="flex items-start gap-4 rounded-xl border bg-fd-card/50 p-5 transition-all hover:border-fd-primary/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldCheckIcon className="size-5" />
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Compliance & Legal</h3>
            <p className="text-fd-muted-foreground text-sm">
              ESIGN, UETA, eIDAS compliance, GDPR, and signature levels explained.
            </p>
          </div>
        </Link>

        <Link
          href="/docs/policies"
          className="flex items-start gap-4 rounded-xl border bg-fd-card/50 p-5 transition-all hover:border-fd-primary/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400">
            <FileTextIcon className="size-5" />
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Policies & Licensing</h3>
            <p className="text-fd-muted-foreground text-sm">
              AGPL and Enterprise licenses, fair use, privacy policy, and support.
            </p>
          </div>
        </Link>
      </div>

      {/* Community CTA */}
      <div className="rounded-xl border bg-gradient-to-r from-fd-primary/5 to-fd-primary/10 p-8 text-center">
        <h3 className="mb-2 font-semibold text-lg">Join the Community</h3>
        <p className="mb-6 text-fd-muted-foreground text-sm">
          Documenso is open source. Contribute, ask questions, or share feedback.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/documenso/documenso"
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-background px-4 py-2 font-medium text-sm transition-colors hover:bg-fd-accent"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
          <a
            href="mailto:helpdesk@truenorthmortgage.ca"
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-background px-4 py-2 font-medium text-sm transition-colors hover:bg-fd-accent"
          >
            Need additional help? Email helpdesk@truenorthmortgage.ca
          </a>
          <a
            href="https://app.documenso.com/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-documenso px-4 py-2 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-documenso/90"
          >
            Try Documenso
          </a>
        </div>
      </div>
    </main>
  );
}
