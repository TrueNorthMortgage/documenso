import { cn } from '@documenso/ui/lib/utils';
import { Loader } from 'lucide-react';

export const DocumentSigningFieldsLoader = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background">
      <Loader className="h-5 w-5 animate-spin text-primary md:h-8 md:w-8" />
    </div>
  );
};

export const DocumentSigningFieldsUninserted = ({ children }: { children: React.ReactNode }) => {
  return (
    <p className="whitespace-pre-wrap text-[clamp(0.425rem,25cqw,0.825rem)] text-foreground duration-200 group-hover:text-recipient-green">
      {children}
    </p>
  );
};

type DocumentSigningFieldsInsertedProps = {
  children: React.ReactNode;

  /**
   * The text alignment of the field.
   *
   * Defaults to left.
   */
  textAlign?: 'left' | 'center' | 'right';
  allowHorizontalOverflow?: boolean;
};

export const DocumentSigningFieldsInserted = ({
  children,
  textAlign = 'left',
  allowHorizontalOverflow = false,
}: DocumentSigningFieldsInsertedProps) => {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center',
        allowHorizontalOverflow ? 'overflow-visible' : 'overflow-hidden',
      )}
    >
      <p
        className={cn(
          'w-full text-left text-[clamp(0.425rem,25cqw,0.825rem)] text-foreground duration-200',
          allowHorizontalOverflow ? 'whitespace-nowrap' : 'whitespace-pre-wrap',
          {
            '!text-center': textAlign === 'center',
            '!text-right': textAlign === 'right',
          },
        )}
      >
        {children}
      </p>
    </div>
  );
};
