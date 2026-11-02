import { Trans } from '@lingui/react/macro';
import {
  ClipboardIcon,
  ClipboardPasteIcon,
  CopyPlusIcon,
  ScissorsIcon,
  SquareStackIcon,
  TrashIcon,
  TypeIcon,
  UserCircleIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type EditorContextMenuProps = {
  x: number;
  y: number;
  canCopy: boolean;
  canDelete: boolean;
  canChangeRecipient?: boolean;
  canDuplicate: boolean;
  canEditValue: boolean;
  editLabel?: ReactNode;
  canPaste: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onChangeRecipient?: () => void;
  onDuplicate: () => void;
  onDuplicateOnAllPages: () => void;
  onEditValue: () => void;
  onDelete: () => void;
};

export const EditorContextMenu = ({
  x,
  y,
  canCopy,
  canDelete,
  canChangeRecipient,
  canDuplicate,
  canEditValue,
  editLabel,
  canPaste,
  onCut,
  onCopy,
  onPaste,
  onChangeRecipient,
  onDuplicate,
  onDuplicateOnAllPages,
  onEditValue,
  onDelete,
}: EditorContextMenuProps) => {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <fieldset
      className="fixed z-[70] min-w-40 rounded-md border border-border bg-background p-1 shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={!canCopy || !canDelete}
        onClick={onCut}
      >
        <ScissorsIcon className="h-3.5 w-3.5" />
        <Trans>Cut</Trans>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={!canCopy}
        onClick={onCopy}
      >
        <ClipboardIcon className="h-3.5 w-3.5" />
        <Trans>Copy</Trans>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={!canPaste}
        onClick={onPaste}
      >
        <ClipboardPasteIcon className="h-3.5 w-3.5" />
        <Trans>Paste</Trans>
      </button>
      {canChangeRecipient !== undefined && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          disabled={!canChangeRecipient}
          onClick={onChangeRecipient}
        >
          <UserCircleIcon className="h-3.5 w-3.5" />
          <Trans>Assign recipient</Trans>
        </button>
      )}
      {canEditValue && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={onEditValue}
        >
          <TypeIcon className="h-3.5 w-3.5" />
          {editLabel}
        </button>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={!canDuplicate}
        onClick={onDuplicate}
      >
        <CopyPlusIcon className="h-3.5 w-3.5" />
        <Trans>Duplicate</Trans>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={!canDuplicate}
        onClick={onDuplicateOnAllPages}
      >
        <SquareStackIcon className="h-3.5 w-3.5" />
        <Trans>Duplicate on all pages</Trans>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive text-sm hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
        disabled={!canDelete}
        onClick={onDelete}
      >
        <TrashIcon className="h-3.5 w-3.5" />
        <Trans>Delete</Trans>
      </button>
    </fieldset>,
    document.body,
  );
};
