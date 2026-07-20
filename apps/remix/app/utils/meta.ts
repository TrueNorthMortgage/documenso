import { i18n, type MessageDescriptor } from '@lingui/core';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description =
    'True North Mortgage | Secure Document Signing | Official document signing portal for True North Mortgage. Easily review, sign, and return your documents online.';

  return [
    {
      title: title ? `${i18n._(title)} - True North Mortgage` : 'True North Mortgage',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content:
        'True North Mortgage, Documenso, document signing, secure document signing, online document signing, mortgage documents, e-signature, digital signature, electronic signature, sign documents online, mortgage application, loan documents, mortgage closing, mortgage process, mortgage approval, mortgage paperwork, mortgage forms, mortgage contracts, mortgage agreements',
    },
    {
      name: 'author',
      content: 'Documenso, Inc.',
    },
    {
      name: 'robots',
      content: 'index, follow',
    },
    {
      property: 'og:title',
      content: 'True North Mortgage - Secure Document Signing',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary',
    },
    {
      name: 'twitter:site',
      content: '@TrueNorthMtg',
    },
    {
      name: 'twitter:description',
      content: description,
    },
  ];
};
