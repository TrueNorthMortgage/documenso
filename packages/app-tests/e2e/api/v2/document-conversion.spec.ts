import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { prisma } from '@documenso/prisma';
import { expect, test } from '@playwright/test';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { NEXT_PUBLIC_WEBAPP_URL } from '../../../../lib/constants/app';
import { DOCUMENT_CONVERSION_MIME_TYPE_DOCX } from '../../../../lib/constants/document-conversion';
import { apiCreateTestContext } from '../../fixtures/api-seeds';

const WEBAPP_BASE_URL = NEXT_PUBLIC_WEBAPP_URL();
const API_BASE_URL = `${WEBAPP_BASE_URL}/api/v2-beta`;

const DOCX_FIXTURE_BASE64 =
  'UEsDBBQAAAAIAPphIl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZ' +
  'k8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOF' +
  'iowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk' +
  '74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgA+mEiXZv9N+qt' +
  'AAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdn' +
  'BVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpk' +
  'nRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAPphIl2BA2Pz5AAAAF0BAAARAAAA' +
  'd29yZC9kb2N1bWVudC54bWxFUE1PwzAM/StR7ixdtaGparsDiNsEEiBxzVKvrWjiKDaE8etJOqpenv388fyS+vhjJ/ENgUZ0jdxu' +
  'CinAGexG1zfy/e3p7iAFsXadntBBI69A8tjWserQfFlwLJKAoyo2cmD2lVJkBrCaNujBpd4Fg9WcaOhVxND5gAaIkr6dVFkU98rq' +
  '0cksecbumqPPEDJw+/j88CEMun+Lgix+gmAgrlXuZwwzzlsEhl/mVd+//oqYfW3LcpeeFash5ftDytVt4KRDqjL6VN/dRsLYD7zS' +
  'MzKjXfkEl6Wr5qPLPbW4V+vPtH9QSwECFAMUAAAACAD6YSJdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRf' +
  'VHlwZXNdLnhtbFBLAQIUAxQAAAAIAPphIl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQA' +
  'AAAIAPphIl2BA2Pz5AAAAF0BAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAACAwAA' +
  'AAA=';

test('[DOCUMENT_CONVERSION]: converts DOCX uploads into readable PDFs', async ({ request }) => {
  const { token, team } = await apiCreateTestContext('document-conversion-e2e');
  const docxBuffer = Buffer.from(DOCX_FIXTURE_BASE64, 'base64');

  const payload = {
    title: '[TEST] DOCX conversion',
    type: 'DOCUMENT',
  };

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  formData.append(
    'files',
    new File([docxBuffer], 'document-conversion.docx', {
      type: DOCUMENT_CONVERSION_MIME_TYPE_DOCX,
    }),
  );

  const response = await request.post(`${API_BASE_URL}/envelope/create`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: formData,
  });

  expect(response.ok(), `envelope/create failed: ${await response.text()}`).toBeTruthy();

  const { id: envelopeId } = await response.json();
  const envelope = await prisma.envelope.findFirstOrThrow({
    where: { id: envelopeId, teamId: team.id },
    include: {
      envelopeItems: {
        include: { documentData: true },
      },
    },
  });

  expect(envelope.envelopeItems).toHaveLength(1);

  const documentData = envelope.envelopeItems[0]?.documentData;

  if (!documentData) {
    throw new Error('Created envelope has no document data');
  }

  const pdfData = await getFileServerSide(documentData);
  expect(Buffer.from(pdfData.subarray(0, 5)).toString()).toBe('%PDF-');

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  expect(pdf.numPages).toBeGreaterThanOrEqual(1);
});
