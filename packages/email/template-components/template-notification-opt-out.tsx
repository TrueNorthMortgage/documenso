import { Trans } from '@lingui/react/macro';

import { Link, Text } from '../components';

export const TemplateNotificationOptOut = ({ href }: { href?: string }) => {
  if (!href) {
    return null;
  }

  return (
    <Text className="mt-4 text-center text-slate-400 text-xs">
      <Link href={href} className="text-slate-400 underline">
        <Trans>Do not notify me about this signing envelope again</Trans>
      </Link>
    </Text>
  );
};
