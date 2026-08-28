import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';

export default function SignatureDisclosure() {
  return (
    <div>
      <article className="prose dark:prose-invert">
        <p className="font-semibold">
          <Trans>TRUE NORTH MORTGAGE</Trans>
        </p>
        <h1>
          <Trans>Electronic Record and Signature Disclosure</Trans>
        </h1>

        <h2>
          <Trans>1. Overview and Purpose</Trans>
        </h2>
        <p>
          <Trans>
            True North Mortgage, Inc. (along with our affiliates and related entities, including THINK Financial, and
            Morcado Trust, collectively "True North Mortgage", "we", "us", or "our") provides this secure electronic
            document signing platform to streamline your mortgage application, approval, and closing process. This
            Disclosure explains your rights, the legal validity of electronic signatures, and how documents and notices
            are delivered electronically. By proceeding and signing your documents electronically through this platform,
            you agree to the terms outlined below.
          </Trans>
        </p>

        <h2>
          <Trans>2. Consent to Electronic Transactions and Signatures</Trans>
        </h2>
        <p>
          <Trans>
            By clicking to view, complete, or electronically sign documents on our platform, you consent to conduct
            transactions electronically. You agree that your electronic signature—whether entered, drawn, or applied via
            click-to-sign—carries the same legal weight, effect, and enforceability as a physical handwritten signature
            in ink, in accordance with applicable Canadian federal and provincial legislation, including the Personal
            Information Protection and Electronic Documents Act (PIPEDA) and provincial Electronic Commerce / Electronic
            Transactions Acts.
          </Trans>
        </p>

        <h2>
          <Trans>3. Scope of Electronic Delivery</Trans>
        </h2>
        <p>
          <Trans>
            This consent applies to all documents, disclosures, mortgage applications, rate commitments, lender
            agreements, borrower declarations, notices, and related communications delivered through this platform or
            sent to your designated email address during the course of your transaction with True North Mortgage.
          </Trans>
        </p>

        <h2>
          <Trans>4. Hardware and System Requirements</Trans>
        </h2>
        <p>
          <Trans>To access, review, sign, and retain electronic records, you must have:</Trans>
        </p>
        <ul>
          <li>
            <Trans>A device with active internet access (computer, tablet, or smartphone).</Trans>
          </li>
          <li>
            <Trans>
              An up-to-date web browser (such as Google Chrome, Apple Safari, Microsoft Edge, or Mozilla Firefox).
            </Trans>
          </li>
          <li>
            <Trans>An active, secure personal email address capable of receiving document notifications.</Trans>
          </li>
          <li>
            <Trans>
              Software capable of opening and viewing PDF files (e.g., Adobe Acrobat Reader or a standard PDF-compatible
              browser).
            </Trans>
          </li>
          <li>
            <Trans>
              Storage capacity or access to a printer if you wish to retain digital copies or print physical records.
            </Trans>
          </li>
        </ul>

        <h2>
          <Trans>5. Right to Withdraw Consent</Trans>
        </h2>
        <p>
          <Trans>
            You have the right to withdraw your consent to use electronic signatures at any time prior to completing the
            signing process.
          </Trans>
        </p>
        <p>
          <strong>
            <Trans>How to withdraw:</Trans>
          </strong>{' '}
          <Trans>Notify your assigned True North Mortgage broker or specialist directly.</Trans>
        </p>
        <p>
          <strong>
            <Trans>Consequences of withdrawal:</Trans>
          </strong>{' '}
          <Trans>
            Because our underwriting and lender submission workflows rely on digital processing, withdrawing consent may
            require transitioning to paper-based signing, which may result in delays to your mortgage approval or
            closing schedule.
          </Trans>
        </p>

        <h2>
          <Trans>6. Accessing and Retaining Your Documents</Trans>
        </h2>
        <p>
          <Trans>
            Once all required parties have completed signing, you will receive an electronic confirmation with access to
            view, download, and save a completed copy of your signed document package (in PDF format) for your personal
            records. We strongly recommend downloading and saving a copy immediately upon receipt.
          </Trans>
        </p>
        <p>
          <Trans>
            True North Mortgage retains records of signed documents in accordance with our{' '}
            <a href="https://truenorthmortgage.ca/privacy-policy">Privacy Policy</a> and Canadian regulatory and
            mortgage retention obligations.
          </Trans>
        </p>

        <h2>
          <Trans>7. Keeping Your Contact Information Current</Trans>
        </h2>
        <p>
          <Trans>
            You are responsible for ensuring that the contact information and email address provided to True North
            Mortgage remain accurate and current. If your email address, legal name, or phone number changes, please
            notify your True North Mortgage broker or representative immediately to avoid delays in receiving critical
            documents.
          </Trans>
        </p>

        <h2>
          <Trans>8. Privacy and Data Security</Trans>
        </h2>
        <p>
          <Trans>
            All documents, identity verification checks, and signatures collected on this platform are encrypted and
            handled in compliance with Canadian privacy legislation (including PIPEDA) and the True North Mortgage
            Privacy Policy (available at{' '}
            <a href="https://truenorthmortgage.ca/privacy-policy">truenorthmortgage.ca/privacy-policy</a>).
          </Trans>
        </p>

        <h2>
          <Trans>9. Contact Information and Support</Trans>
        </h2>
        <p>
          <Trans>
            If you have any questions regarding this disclosure, encounter technical issues during signing, or wish to
            request a paper copy of a document, please reach out to us:
          </Trans>
        </p>
        <p>
          <strong>
            <Trans>Dedicated Broker / Agent</Trans>
          </strong>
          <br />
          <Trans>Contact directly via your mortgage application file</Trans>
        </p>
        <p>
          <strong>
            <Trans>Toll-Free Client Support</Trans>
          </strong>
          <br />
          <a href="tel:18777784772">1-877-778-4772</a>
        </p>
        <p>
          <strong>
            <Trans>Privacy Office</Trans>
          </strong>
          <br />
          <a href="mailto:privacy@truenorthmortgage.ca">privacy@truenorthmortgage.ca</a>
        </p>
        <p>
          <strong>
            <Trans>Website</Trans>
          </strong>
          <br />
          <a href="https://www.truenorthmortgage.ca">www.truenorthmortgage.ca</a>
        </p>
      </article>

      <div className="mt-8">
        <Button asChild>
          <Link to="/">
            <Trans>Back home</Trans>
          </Link>
        </Button>
      </div>
    </div>
  );
}
