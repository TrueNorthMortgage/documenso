import { Button } from '@documenso/ui/primitives/button';
import { useEffect, useState } from 'react';

import {
  getSelfHostedReturnTargetFromLocation,
  getStoredSelfHostedReturnTarget,
  type SelfHostedReturnTarget,
  storeSelfHostedReturnTarget,
} from '~/utils/self-hosted-return';

type SelfHostedReturnButtonProps = {
  className?: string;
  size?: React.ComponentProps<typeof Button>['size'];
};

export const SelfHostedReturnButton = ({ className, size }: SelfHostedReturnButtonProps) => {
  const [target, setTarget] = useState<SelfHostedReturnTarget | null>(null);

  useEffect(() => {
    const locationTarget = getSelfHostedReturnTargetFromLocation();

    if (locationTarget) {
      storeSelfHostedReturnTarget(locationTarget);
      setTarget(locationTarget);
      return;
    }

    setTarget(getStoredSelfHostedReturnTarget());
  }, []);

  if (!target) {
    return null;
  }

  return (
    <Button asChild variant="outline" size={size} className={className}>
      <a href={target.url}>{target.label}</a>
    </Button>
  );
};
