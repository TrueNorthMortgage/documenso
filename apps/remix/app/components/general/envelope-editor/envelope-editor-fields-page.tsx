import { useCurrentEnvelopeEditor } from '@documenso/lib/client-only/providers/envelope-editor-provider';
import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { IS_AI_FEATURES_CONFIGURED } from '@documenso/lib/constants/app';
import { PDF_VIEWER_ERROR_MESSAGES } from '@documenso/lib/constants/pdf-viewer-i18n';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import type { NormalizedFieldWithContext } from '@documenso/lib/server-only/ai/envelope/detect-fields/types';
import type { TConditionalFieldRule } from '@documenso/lib/types/conditional-field';
import {
  FIELD_META_DEFAULT_VALUES,
  type TCheckboxFieldMeta,
  type TDateFieldMeta,
  type TDropdownFieldMeta,
  type TEmailFieldMeta,
  type TFieldMetaSchema,
  type TInitialsFieldMeta,
  type TNameFieldMeta,
  type TNumberFieldMeta,
  type TRadioFieldMeta,
  type TSignatureFieldMeta,
  type TTextFieldMeta,
} from '@documenso/lib/types/field-meta';
import { getEnvelopeItemPermissions } from '@documenso/lib/utils/envelope';
import { getDragScrollDelta } from '@documenso/lib/utils/field-drag';
import { canRecipientFieldsBeModified } from '@documenso/lib/utils/recipients';
import { trpc } from '@documenso/trpc/react';
import { AnimateGenericFadeInOut } from '@documenso/ui/components/animate/animate-generic-fade-in-out';
import { cn } from '@documenso/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import {
  ConditionalFieldSettings,
  getFieldDisplayName,
} from '@documenso/ui/primitives/document-flow/conditional-field-settings';
import { FRIENDLY_FIELD_TYPE } from '@documenso/ui/primitives/document-flow/types';
import { Separator } from '@documenso/ui/primitives/separator';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, FieldType, RecipientRole } from '@prisma/client';
import { AlertCircleIcon, EyeOffIcon, FileTextIcon, PencilIcon, SparklesIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRevalidator, useSearchParams } from 'react-router';
import { isDeepEqual } from 'remeda';
import { match } from 'ts-pattern';
import { AiFeaturesEnableDialog } from '~/components/dialogs/ai-features-enable-dialog';
import { AiFieldDetectionDialog } from '~/components/dialogs/ai-field-detection-dialog';
import { ApplyTemplateToEnvelopeItemDialog } from '~/components/dialogs/apply-template-to-envelope-item-dialog';
import { EnvelopeItemEditDialog } from '~/components/dialogs/envelope-item-edit-dialog';
import { EditorFieldCheckboxForm } from '~/components/forms/editor/editor-field-checkbox-form';
import { EditorFieldDateForm } from '~/components/forms/editor/editor-field-date-form';
import { EditorFieldDropdownForm } from '~/components/forms/editor/editor-field-dropdown-form';
import { EditorFieldEmailForm } from '~/components/forms/editor/editor-field-email-form';
import { EditorFieldGroupSettings } from '~/components/forms/editor/editor-field-group-settings';
import { EditorFieldInitialsForm } from '~/components/forms/editor/editor-field-initials-form';
import { EditorFieldNameForm } from '~/components/forms/editor/editor-field-name-form';
import { EditorFieldNumberForm } from '~/components/forms/editor/editor-field-number-form';
import { EditorFieldRadioForm } from '~/components/forms/editor/editor-field-radio-form';
import { EditorFieldSignatureForm } from '~/components/forms/editor/editor-field-signature-form';
import { EditorFieldTextForm } from '~/components/forms/editor/editor-field-text-form';
import { EnvelopePdfViewer } from '~/components/general/pdf-viewer/envelope-pdf-viewer';
import { useCurrentTeam } from '~/providers/team';

import { ConditionalFieldHighlightContext } from './conditional-field-highlight-context';
import { type InvalidFieldPlacement, useEnvelopeEditorFieldDrag } from './envelope-editor-field-drag-context';
import { EnvelopeEditorFieldDragDrop } from './envelope-editor-fields-drag-drop';
import { EnvelopeEditorFieldsPageRenderer, getPageAtPoint } from './envelope-editor-fields-page-renderer';
import { EnvelopeRendererFileSelector } from './envelope-file-selector';
import { EnvelopeRecipientSelector } from './envelope-recipient-selector';

const FieldSettingsTypeTranslations: Record<FieldType, MessageDescriptor> = {
  [FieldType.SIGNATURE]: msg`Signature Settings`,
  [FieldType.FREE_SIGNATURE]: msg`Free Signature Settings`,
  [FieldType.TEXT]: msg`Text Settings`,
  [FieldType.DATE]: msg`Date Settings`,
  [FieldType.EMAIL]: msg`Email Settings`,
  [FieldType.NAME]: msg`Name Settings`,
  [FieldType.INITIALS]: msg`Initials Settings`,
  [FieldType.NUMBER]: msg`Number Settings`,
  [FieldType.RADIO]: msg`Radio Settings`,
  [FieldType.CHECKBOX]: msg`Checkbox Settings`,
  [FieldType.DROPDOWN]: msg`Dropdown Settings`,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const INVALID_FIELD_PLACEMENT_CLASS_NAME = 'rounded-[2px] border-2 border-red-500 bg-white text-red-600';

const InvalidFieldPlacementOverlay = ({
  isInteractive = true,
  isInvalidPlacement,
  isPlacementDragging = false,
  isPrimary = true,
  placement,
  scrollableContainerRef,
}: {
  isInteractive?: boolean;
  isInvalidPlacement: boolean;
  isPlacementDragging?: boolean;
  isPrimary?: boolean;
  placement: InvalidFieldPlacement;
  scrollableContainerRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const { editorFields } = useCurrentEnvelopeEditor();
  const {
    activeGroupPlacements,
    activePlacement,
    clearInvalidPlacement,
    invalidPlacements,
    selectedInvalidFieldFormIds,
    setActiveGroupPlacements,
    setActivePlacement,
    setPendingSelectionFieldFormIds,
    setSelectedInvalidFieldFormIds,
    setInvalidPlacement,
  } = useEnvelopeEditorFieldDrag();
  const { _ } = useLingui();
  const placementRef = useRef(placement);
  const dragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number | null;
    lastMoveAt: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const activeGroupPlacementsRef = useRef(activeGroupPlacements);

  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);

  useEffect(() => {
    activeGroupPlacementsRef.current = activeGroupPlacements;
  }, [activeGroupPlacements]);

  useEffect(() => {
    if (!isPrimary) {
      return;
    }

    if (!editorFields.getFieldByFormId(placement.fieldFormId)) {
      if (isInvalidPlacement) {
        clearInvalidPlacement(placement.fieldFormId);
      } else {
        setActivePlacement(null);
      }
    }
  }, [clearInvalidPlacement, editorFields, isInvalidPlacement, isPrimary, placement.fieldFormId, setActivePlacement]);

  const isActivePlacement = !isInvalidPlacement && activePlacement?.fieldFormId === placement.fieldFormId;

  const updatePlacement = useCallback(
    (clientX: number, clientY: number) => {
      const scrollContainer = scrollableContainerRef.current;
      const currentPlacement = placementRef.current;
      const drag = dragRef.current;

      if (!scrollContainer || !currentPlacement || !drag) {
        return;
      }

      const scrollRect = scrollContainer.getBoundingClientRect();
      const now = performance.now();
      const elapsedMs = Math.max(0, now - drag.lastMoveAt);

      drag.lastMoveAt = now;
      scrollContainer.scrollTop += getDragScrollDelta({
        clientHeight: scrollContainer.clientHeight,
        containerBottom: scrollRect.bottom,
        containerTop: scrollRect.top,
        elapsedMs,
        pointerY: clientY,
        scrollHeight: scrollContainer.scrollHeight,
        scrollTop: scrollContainer.scrollTop,
      });

      const maxX = Math.max(0, scrollContainer.clientWidth - currentPlacement.width);
      const maxY = Math.max(
        scrollContainer.scrollTop + scrollContainer.clientHeight - currentPlacement.height,
        scrollContainer.scrollHeight - currentPlacement.height,
      );
      const nextPlacement = {
        ...currentPlacement,
        x: clamp(clientX - scrollRect.left + scrollContainer.scrollLeft - drag.offsetX, 0, maxX),
        y: clamp(clientY - scrollRect.top + scrollContainer.scrollTop - drag.offsetY, 0, maxY),
      };

      placementRef.current = nextPlacement;

      const deltaX = nextPlacement.x - currentPlacement.x;
      const deltaY = nextPlacement.y - currentPlacement.y;
      const nextGroupPlacements = activeGroupPlacementsRef.current.map((groupPlacement) => ({
        ...groupPlacement,
        x: groupPlacement.x + deltaX,
        y: groupPlacement.y + deltaY,
      }));

      if (isInvalidPlacement) {
        const placements = nextGroupPlacements.length > 0 ? nextGroupPlacements : [nextPlacement];

        placements.forEach(setInvalidPlacement);
        activeGroupPlacementsRef.current = nextGroupPlacements;
        setActiveGroupPlacements(nextGroupPlacements);
      } else {
        if (nextGroupPlacements.length > 0) {
          activeGroupPlacementsRef.current = nextGroupPlacements;
          setActiveGroupPlacements(nextGroupPlacements);
        }
      }

      setActivePlacement(nextPlacement);
    },
    [isInvalidPlacement, scrollableContainerRef, setActiveGroupPlacements, setActivePlacement, setInvalidPlacement],
  );

  const completePlacement = useCallback(
    (clientX: number, clientY: number) => {
      updatePlacement(clientX, clientY);

      const currentPlacement = placementRef.current;
      const placements =
        activeGroupPlacementsRef.current.length > 0
          ? activeGroupPlacementsRef.current
          : currentPlacement
            ? [currentPlacement]
            : [];
      const targetPage = getPageAtPoint(clientX, clientY);
      let placedOnPage = false;

      if (currentPlacement && targetPage) {
        const pageRect = targetPage.getBoundingClientRect();
        const scrollContainer = scrollableContainerRef.current;
        const scrollRect = scrollContainer?.getBoundingClientRect();
        const pageNumber = Number(targetPage.dataset.pageNumber);

        if (
          scrollContainer &&
          scrollRect &&
          Number.isInteger(pageNumber) &&
          pageRect.width > 0 &&
          pageRect.height > 0
        ) {
          const pageX = pageRect.left - scrollRect.left + scrollContainer.scrollLeft;
          const pageY = pageRect.top - scrollRect.top + scrollContainer.scrollTop;
          for (const groupPlacement of placements) {
            const field = editorFields.getFieldByFormId(groupPlacement.fieldFormId);

            if (!field) {
              continue;
            }

            const maxPositionX = Math.max(0, 100 - field.width);
            const maxPositionY = Math.max(0, 100 - field.height);

            editorFields.updateFieldByFormId(field.formId, {
              page: pageNumber,
              positionX: clamp(((groupPlacement.x - pageX) / pageRect.width) * 100, 0, maxPositionX),
              positionY: clamp(((groupPlacement.y - pageY) / pageRect.height) * 100, 0, maxPositionY),
            });
          }

          if (currentPlacement) {
            editorFields.setSelectedField(currentPlacement.fieldFormId);
          }
          setActivePlacement(null);
          activeGroupPlacementsRef.current = [];
          setActiveGroupPlacements([]);
          if (placements.length > 1) {
            setPendingSelectionFieldFormIds(placements.map((groupPlacement) => groupPlacement.fieldFormId));
          }
          if (isInvalidPlacement) {
            placements.forEach((groupPlacement) => {
              clearInvalidPlacement(groupPlacement.fieldFormId);
            });
            setSelectedInvalidFieldFormIds([]);
          }
          placedOnPage = true;
        }
      }

      if (currentPlacement && !placedOnPage) {
        setActivePlacement(null);
        activeGroupPlacementsRef.current = [];
        setActiveGroupPlacements([]);
        setSelectedInvalidFieldFormIds(placements.map((groupPlacement) => groupPlacement.fieldFormId));

        if (!isInvalidPlacement) {
          placements.forEach(setInvalidPlacement);
        }
      }

      dragRef.current = null;
      setIsDragging(false);
    },
    [
      editorFields,
      clearInvalidPlacement,
      isInvalidPlacement,
      scrollableContainerRef,
      setActiveGroupPlacements,
      setActivePlacement,
      setPendingSelectionFieldFormIds,
      setSelectedInvalidFieldFormIds,
      updatePlacement,
    ],
  );

  useEffect(() => {
    const currentActivePlacement = placementRef.current;

    if (!isActivePlacement || !currentActivePlacement || currentActivePlacement.fieldFormId !== placement.fieldFormId) {
      return;
    }

    dragRef.current = {
      lastMoveAt: performance.now(),
      offsetX: currentActivePlacement.offsetX,
      offsetY: currentActivePlacement.offsetY,
      pointerId: null,
    };
    setIsDragging(true);

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      updatePlacement(event.clientX, event.clientY);
    };

    const handleMouseUp = (event: MouseEvent) => {
      event.preventDefault();
      completePlacement(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      updatePlacement(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0] ?? event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      completePlacement(touch.clientX, touch.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [completePlacement, isActivePlacement, placement.fieldFormId, updatePlacement]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const scrollContainer = scrollableContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const isModifierPressed = event.shiftKey || event.ctrlKey || event.metaKey;

    if (isInvalidPlacement && isModifierPressed) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedInvalidFieldFormIds(
        selectedInvalidFieldFormIds.includes(placement.fieldFormId)
          ? selectedInvalidFieldFormIds.filter((fieldFormId) => fieldFormId !== placement.fieldFormId)
          : [...selectedInvalidFieldFormIds, placement.fieldFormId],
      );
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isInvalidPlacement) {
      const selectedFieldFormIds = selectedInvalidFieldFormIds.includes(placement.fieldFormId)
        ? selectedInvalidFieldFormIds
        : [placement.fieldFormId];
      const selectedPlacements = invalidPlacements.filter(
        (invalidPlacement) =>
          invalidPlacement.envelopeItemId === placement.envelopeItemId &&
          selectedFieldFormIds.includes(invalidPlacement.fieldFormId),
      );
      const nextGroupPlacements = selectedPlacements.length > 1 ? selectedPlacements : [];

      activeGroupPlacementsRef.current = nextGroupPlacements;
      setActiveGroupPlacements(nextGroupPlacements);
      setActivePlacement(placement);
      setSelectedInvalidFieldFormIds(selectedFieldFormIds);
    }

    const scrollRect = scrollContainer.getBoundingClientRect();

    dragRef.current = {
      lastMoveAt: performance.now(),
      offsetX: event.clientX - scrollRect.left + scrollContainer.scrollLeft - placement.x,
      offsetY: event.clientY - scrollRect.top + scrollContainer.scrollTop - placement.y,
      pointerId: event.pointerId,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    updatePlacement(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    completePlacement(event.clientX, event.clientY);
  };

  const field = editorFields.getFieldByFormId(placement.fieldFormId);
  const fieldText = field ? field.fieldMeta?.label || _(FRIENDLY_FIELD_TYPE[field.type]) : null;
  const showInvalidStyle = isInvalidPlacement && !isDragging && !isPlacementDragging;
  const previewDataUrl = showInvalidStyle ? placement.invalidPreviewDataUrl : placement.previewDataUrl;
  const showFieldPreview = Boolean(previewDataUrl);

  return (
    <div
      data-invalid-field-placement
      className={cn(
        'absolute z-50 cursor-move',
        !showFieldPreview &&
          (showInvalidStyle
            ? INVALID_FIELD_PLACEMENT_CLASS_NAME
            : 'rounded-[2px] border-2 border-gray-400 bg-white/50 text-black'),
      )}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        height: placement.height,
        left: placement.x,
        pointerEvents: isInteractive ? 'auto' : 'none',
        top: placement.y,
        width: placement.width,
      }}
      title={field ? `${field.type}: place this field on a document page` : 'Place this field on a document page'}
    >
      {showFieldPreview ? (
        <img alt="" className="block h-full w-full" draggable={false} src={previewDataUrl} />
      ) : fieldText ? (
        <span className="flex h-full items-center justify-center overflow-hidden px-1 text-center text-xs">
          {fieldText}
        </span>
      ) : null}
      {showInvalidStyle && (
        <AlertCircleIcon className="absolute -top-3 -right-3 h-5 w-5 rounded-full bg-white text-red-600" />
      )}
    </div>
  );
};

const ActiveFieldSelectionOverlay = () => {
  const { currentEnvelopeItem } = useCurrentEnvelopeRender();
  const { activeGroupPlacements, activePlacement, invalidPlacements, selectedInvalidFieldFormIds } =
    useEnvelopeEditorFieldDrag();

  if (!currentEnvelopeItem) {
    return null;
  }

  const placements =
    activeGroupPlacements.length > 0
      ? activeGroupPlacements
      : activePlacement
        ? [activePlacement]
        : invalidPlacements.filter(
            (placement) =>
              placement.envelopeItemId === currentEnvelopeItem.id &&
              selectedInvalidFieldFormIds.includes(placement.fieldFormId),
          );
  const currentPlacements = placements.filter((placement) => placement.envelopeItemId === currentEnvelopeItem.id);

  if (currentPlacements.length === 0) {
    return null;
  }

  const left = Math.min(...currentPlacements.map((placement) => placement.x));
  const top = Math.min(...currentPlacements.map((placement) => placement.y));
  const right = Math.max(...currentPlacements.map((placement) => placement.x + placement.width));
  const bottom = Math.max(...currentPlacements.map((placement) => placement.y + placement.height));
  const handleClassName = 'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border bg-white';
  const handleStyle = { borderColor: 'rgb(0, 161, 255)' };

  return (
    <div
      className="pointer-events-none absolute z-[51] border"
      data-active-field-selection
      style={{
        borderColor: 'rgb(0, 161, 255)',
        height: bottom - top,
        left,
        top,
        width: right - left,
      }}
    >
      <span className={handleClassName} style={{ ...handleStyle, left: 0, top: 0 }} />
      <span className={handleClassName} style={{ ...handleStyle, left: '50%', top: 0 }} />
      <span className={handleClassName} style={{ ...handleStyle, left: '100%', top: 0 }} />
      <span className={handleClassName} style={{ ...handleStyle, left: 0, top: '50%' }} />
      <span className={handleClassName} style={{ ...handleStyle, left: '100%', top: '50%' }} />
      <span className={handleClassName} style={{ ...handleStyle, left: 0, top: '100%' }} />
      <span className={handleClassName} style={{ ...handleStyle, left: '50%', top: '100%' }} />
      <span className={handleClassName} style={{ ...handleStyle, left: '100%', top: '100%' }} />
    </div>
  );
};

const InvalidFieldPlacementSelection = ({
  scrollableContainerRef,
}: {
  scrollableContainerRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const { currentEnvelopeItem } = useCurrentEnvelopeRender();
  const { invalidPlacements, selectedInvalidFieldFormIds, setSelectedInvalidFieldFormIds } =
    useEnvelopeEditorFieldDrag();
  const [selection, setSelection] = useState<{
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>(null);
  const dragRef = useRef<{
    additive: boolean;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const getRelativePoint = (clientX: number, clientY: number) => {
    const scrollContainer = scrollableContainerRef.current;

    if (!scrollContainer) {
      return null;
    }

    const scrollRect = scrollContainer.getBoundingClientRect();

    return {
      x: clientX - scrollRect.left + scrollContainer.scrollLeft,
      y: clientY - scrollRect.top + scrollContainer.scrollTop,
    };
  };

  const updateSelection = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const point = getRelativePoint(clientX, clientY);

    if (!drag || !point) {
      return;
    }

    setSelection({
      height: Math.abs(point.y - drag.startY),
      width: Math.abs(point.x - drag.startX),
      x: Math.min(drag.startX, point.x),
      y: Math.min(drag.startY, point.y),
    });
  };

  const completeSelection = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const point = getRelativePoint(clientX, clientY);

    if (!drag || !point) {
      return;
    }

    const selectionRect = {
      height: Math.abs(point.y - drag.startY),
      width: Math.abs(point.x - drag.startX),
      x: Math.min(drag.startX, point.x),
      y: Math.min(drag.startY, point.y),
    };
    const selectedFieldFormIds = invalidPlacements
      .filter((placement) => {
        if (placement.envelopeItemId !== currentEnvelopeItem?.id) {
          return false;
        }

        return (
          selectionRect.x < placement.x + placement.width &&
          selectionRect.x + selectionRect.width > placement.x &&
          selectionRect.y < placement.y + placement.height &&
          selectionRect.y + selectionRect.height > placement.y
        );
      })
      .map((placement) => placement.fieldFormId);

    setSelectedInvalidFieldFormIds(
      drag.additive ? [...new Set([...selectedInvalidFieldFormIds, ...selectedFieldFormIds])] : selectedFieldFormIds,
    );
    dragRef.current = null;
    setSelection(null);
  };

  useEffect(() => {
    const scrollContainer = scrollableContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || getPageAtPoint(event.clientX, event.clientY)) {
        return;
      }

      const target = event.target;

      if (
        !(target instanceof HTMLElement) ||
        target.closest('[data-invalid-field-placement], button, a, input, select, textarea, [role="button"]')
      ) {
        return;
      }

      const point = getRelativePoint(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      event.preventDefault();
      dragRef.current = {
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
      };
      setSelection({ height: 0, width: 0, x: point.x, y: point.y });
      scrollContainer.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      updateSelection(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      completeSelection(event.clientX, event.clientY);
    };

    scrollContainer.addEventListener('pointerdown', handlePointerDown);
    scrollContainer.addEventListener('pointermove', handlePointerMove);
    scrollContainer.addEventListener('pointerup', handlePointerUp);
    scrollContainer.addEventListener('pointercancel', handlePointerUp);

    return () => {
      scrollContainer.removeEventListener('pointerdown', handlePointerDown);
      scrollContainer.removeEventListener('pointermove', handlePointerMove);
      scrollContainer.removeEventListener('pointerup', handlePointerUp);
      scrollContainer.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [completeSelection, getRelativePoint, scrollableContainerRef, updateSelection]);

  return selection ? (
    <div
      className="pointer-events-none absolute z-40 border-2 border-sky-500 bg-sky-500/10"
      style={{
        height: selection.height,
        left: selection.x,
        top: selection.y,
        width: selection.width,
      }}
    />
  ) : null;
};

const InvalidFieldPlacementOverlays = ({
  scrollableContainerRef,
}: {
  scrollableContainerRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const { currentEnvelopeItem } = useCurrentEnvelopeRender();
  const { activeGroupPlacements, activePlacement, invalidPlacements } = useEnvelopeEditorFieldDrag();

  if (!currentEnvelopeItem) {
    return null;
  }

  type PlacementOverlay = {
    isInteractive: boolean;
    isInvalidPlacement: boolean;
    isPlacementDragging?: boolean;
    isPrimary: boolean;
    placement: InvalidFieldPlacement;
  };

  const overlays = new Map<string, PlacementOverlay>();
  const activePlacementIsInvalid = activePlacement
    ? invalidPlacements.some((placement) => placement.fieldFormId === activePlacement.fieldFormId)
    : false;

  if (activePlacement?.envelopeItemId === currentEnvelopeItem.id) {
    overlays.set(activePlacement.fieldFormId, {
      isInteractive: true,
      isInvalidPlacement: activePlacementIsInvalid,
      isPlacementDragging: activePlacementIsInvalid,
      isPrimary: true,
      placement: activePlacement,
    });
  }

  activeGroupPlacements
    .filter(
      (placement) =>
        placement.envelopeItemId === currentEnvelopeItem.id && placement.fieldFormId !== activePlacement?.fieldFormId,
    )
    .forEach((placement) => {
      overlays.set(placement.fieldFormId, {
        isInteractive: false,
        isInvalidPlacement: activePlacementIsInvalid,
        isPlacementDragging: activePlacementIsInvalid,
        isPrimary: false,
        placement,
      });
    });

  const activeFieldFormIds = new Set([
    ...activeGroupPlacements.map((placement) => placement.fieldFormId),
    ...(activePlacement ? [activePlacement.fieldFormId] : []),
  ]);

  invalidPlacements
    .filter(
      (placement) =>
        placement.envelopeItemId === currentEnvelopeItem.id && !activeFieldFormIds.has(placement.fieldFormId),
    )
    .forEach((placement) => {
      overlays.set(placement.fieldFormId, {
        isInteractive: true,
        isInvalidPlacement: true,
        isPrimary: true,
        placement,
      });
    });

  return (
    <>
      <ActiveFieldSelectionOverlay />
      {Array.from(overlays.values()).map((overlay) => (
        <InvalidFieldPlacementOverlay
          key={overlay.placement.fieldFormId}
          isInteractive={overlay.isInteractive}
          isInvalidPlacement={overlay.isInvalidPlacement}
          isPlacementDragging={overlay.isPlacementDragging}
          isPrimary={overlay.isPrimary}
          placement={overlay.placement}
          scrollableContainerRef={scrollableContainerRef}
        />
      ))}
    </>
  );
};

export const EnvelopeEditorFieldsPage = () => {
  const [searchParams] = useSearchParams();

  const team = useCurrentTeam();

  const scrollableContainerRef = useRef<HTMLDivElement>(null);

  const { envelope, editorFields, navigateToStep, editorConfig, syncEnvelope } = useCurrentEnvelopeEditor();

  const { currentEnvelopeItem } = useCurrentEnvelopeRender();

  const { _ } = useLingui();

  const { mutateAsync: createConditionalRule } = trpc.field.createConditionalFieldRule.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );
  const { mutateAsync: deleteConditionalRule } = trpc.field.deleteConditionalFieldRule.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const [isAiFieldDialogOpen, setIsAiFieldDialogOpen] = useState(false);
  const [isAiEnableDialogOpen, setIsAiEnableDialogOpen] = useState(false);
  const [highlightedConditionalFieldIds, setHighlightedConditionalFieldIds] = useState<number[]>([]);
  const [conditionalSelectionFieldIds, setConditionalSelectionFieldIds] = useState<number[]>([]);
  const { revalidate } = useRevalidator();

  const highlightedConditionalFieldIdSet = useMemo(
    () => new Set(highlightedConditionalFieldIds),
    [highlightedConditionalFieldIds],
  );

  const envelopeItemPermissions = useMemo(
    () => getEnvelopeItemPermissions(envelope, envelope.recipients),
    [envelope, envelope.recipients],
  );

  const selectedField = useMemo(() => structuredClone(editorFields.selectedField), [editorFields.selectedField]);

  const conditionalFields = useMemo(
    () =>
      editorFields.localFields.map((field) => ({
        nativeId: field.id,
        formId: field.formId,
        pageNumber: field.page,
        pageX: field.positionX,
        pageY: field.positionY,
        pageWidth: field.width,
        pageHeight: field.height,
        signerEmail: envelope.recipients.find((recipient) => recipient.id === field.recipientId)?.email ?? '',
        recipientId: field.recipientId,
        type: field.type,
        fieldMeta: field.fieldMeta,
        conditionalChildRule: field.conditionalChildRule,
        conditionalParentRules: field.conditionalParentRules,
        envelopeItemId: field.envelopeItemId,
      })),
    [editorFields.localFields, envelope.recipients],
  );

  const conditionalFieldNames = useMemo(
    () =>
      new Map(
        conditionalFields.flatMap((field) =>
          field.nativeId ? [[field.nativeId, getFieldDisplayName(field, conditionalFields)] as const] : [],
        ),
      ),
    [conditionalFields],
  );

  const conditionalFieldHighlightContextValue = useMemo(
    () => ({
      highlightedFieldIds: highlightedConditionalFieldIdSet,
      selectionFieldIds: new Set(conditionalSelectionFieldIds),
      fieldNames: conditionalFieldNames,
    }),
    [conditionalFieldNames, conditionalSelectionFieldIds, highlightedConditionalFieldIdSet],
  );

  const selectedConditionalField = conditionalFields.find((field) => field.formId === selectedField?.formId);
  const selectedFieldMeta = selectedField?.fieldGroup
    ? {
        ...selectedField.fieldMeta,
        readOnly: selectedField.fieldGroup.readOnly,
        fontSize: selectedField.fieldGroup.fontSize ?? undefined,
        direction: selectedField.fieldGroup.direction === 'horizontal' ? 'horizontal' : 'vertical',
      }
    : selectedField?.fieldMeta;

  const updateConditionalRuleState = (rule: TConditionalFieldRule) => {
    for (const field of editorFields.localFields) {
      if (field.id === rule.childFieldId) {
        editorFields.updateFieldByFormId(field.formId, { conditionalChildRule: rule });
      }

      if (field.id === rule.parentFieldId) {
        editorFields.updateFieldByFormId(field.formId, {
          conditionalParentRules: [...(field.conditionalParentRules ?? []), rule],
        });
      }
    }
  };

  const removeConditionalRuleState = (childFieldId: number) => {
    const deletedRule = editorFields.localFields.find((field) => field.id === childFieldId)?.conditionalChildRule;

    for (const field of editorFields.localFields) {
      editorFields.updateFieldByFormId(field.formId, {
        conditionalChildRule: field.id === childFieldId ? null : field.conditionalChildRule,
        conditionalParentRules: deletedRule
          ? field.conditionalParentRules?.filter((rule) => rule.id !== deletedRule.id)
          : field.conditionalParentRules,
      });
    }
  };

  const updateSelectedFieldMeta = (fieldMeta: TFieldMetaSchema) => {
    if (!selectedField) {
      return;
    }

    const isMetaSame = isDeepEqual(selectedField.fieldMeta, fieldMeta);

    if (!isMetaSame) {
      if (selectedField.fieldGroupId) {
        editorFields.updateFieldGroupMeta(selectedField, fieldMeta);
      } else {
        editorFields.updateFieldByFormId(selectedField.formId, { fieldMeta });
      }
    }
  };

  const onFieldDetectionComplete = (fields: NormalizedFieldWithContext[]) => {
    for (const field of fields) {
      editorFields.addField({
        height: field.height,
        width: field.width,
        positionX: field.positionX,
        positionY: field.positionY,
        type: field.type,
        envelopeItemId: field.envelopeItemId,
        recipientId: field.recipientId,
        fieldGroupId: null,
        fieldGroup: null,
        page: field.pageNumber,
        fieldMeta: structuredClone(FIELD_META_DEFAULT_VALUES[field.type]),
      });
    }

    setIsAiFieldDialogOpen(false);
  };

  /**
   * Set the selected recipient to the first recipient in the envelope.
   */
  useEffect(() => {
    const firstSelectableRecipient = envelope.recipients.find(
      (recipient) => recipient.role === RecipientRole.SIGNER || recipient.role === RecipientRole.APPROVER,
    );

    editorFields.setSelectedRecipient(firstSelectableRecipient?.id ?? null);
  }, []);

  const onDetectClick = () => {
    if (!team.preferences.aiFeaturesEnabled) {
      setIsAiEnableDialogOpen(true);
      return;
    }

    setIsAiFieldDialogOpen(true);
  };

  const onAiFeaturesEnabled = () => {
    void revalidate().then(() => {
      setIsAiEnableDialogOpen(false);
      setIsAiFieldDialogOpen(true);
    });
  };

  const renderEnvelopeItemAction =
    editorConfig.envelopeItems?.allowReplace && envelopeItemPermissions.canFileBeChanged
      ? (item: { id: string; title: string }) => (
          <div className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
            <div
              className={cn('h-2 w-2 rounded-full transition-opacity duration-150 group-hover:opacity-0', {
                'bg-green-500': currentEnvelopeItem?.id === item.id,
              })}
            />
            <EnvelopeItemEditDialog
              envelopeItem={item}
              allowConfigureTitle={editorConfig.envelopeItems?.allowConfigureTitle ?? false}
              trigger={
                // biome-ignore lint/a11y/useSemanticElements: This trigger is rendered inside the selector button.
                <span
                  role="button"
                  tabIndex={0}
                  className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.click();
                    }
                  }}
                  data-testid={`envelope-item-edit-button-${item.id}`}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </span>
              }
            />
          </div>
        )
      : undefined;

  const pageContent = (
    <div className="relative flex h-full flex-col">
      {envelope.envelopeItems.length > 1 && (
        <div className="hidden min-w-0 flex-shrink-0 items-center gap-4 border-border border-b bg-background px-4 py-2 lg:flex">
          <h3 className="flex-shrink-0 font-semibold text-foreground text-sm">
            <Trans>Documents</Trans>
          </h3>

          <EnvelopeRendererFileSelector
            className="document-selector-scrollbar min-w-0 flex-1 p-0"
            fields={editorFields.localFields}
            hideScrollbar={false}
            renderItemAction={renderEnvelopeItemAction}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex h-full w-full flex-col overflow-y-auto px-2" ref={scrollableContainerRef}>
          {/* Keep document navigation horizontal on smaller screens. */}
          <EnvelopeRendererFileSelector
            className="px-0 lg:hidden"
            fields={editorFields.localFields}
            renderItemAction={renderEnvelopeItemAction}
          />

          {/* Document View */}
          <div className="mt-4 flex h-full flex-col items-center justify-center">
            {envelope.recipients.length === 0 && (
              <Alert
                variant="neutral"
                className="mb-4 flex max-w-[800px] flex-row items-center justify-between space-y-0 rounded-sm border border-border bg-background"
              >
                <div className="flex flex-col gap-1">
                  <AlertTitle>
                    <Trans>Missing Recipients</Trans>
                  </AlertTitle>
                  <AlertDescription>
                    <Trans>You need at least one recipient to add fields</Trans>
                  </AlertDescription>
                </div>

                <Button variant="outline" onClick={() => void navigateToStep('upload')}>
                  <Trans>Add Recipients</Trans>
                </Button>
              </Alert>
            )}

            {currentEnvelopeItem !== null ? (
              <EnvelopePdfViewer
                customPageRenderer={EnvelopeEditorFieldsPageRenderer}
                scrollParentRef={scrollableContainerRef}
                errorMessage={PDF_VIEWER_ERROR_MESSAGES.editor}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-32">
                <FileTextIcon className="h-10 w-10 text-muted-foreground" />
                <p className="mt-1 text-foreground text-sm">
                  <Trans>No documents found</Trans>
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  <Trans>Please upload a document to continue</Trans>
                </p>
              </div>
            )}
          </div>

          <InvalidFieldPlacementSelection scrollableContainerRef={scrollableContainerRef} />
          <InvalidFieldPlacementOverlays scrollableContainerRef={scrollableContainerRef} />
        </div>

        {/* Right Section - Form Fields Panel */}
        {currentEnvelopeItem && envelope.recipients.length > 0 && (
          <div className="sticky top-0 h-full w-80 flex-shrink-0 overflow-y-auto border-border border-l bg-background py-4">
            {/* Recipient selector section. */}
            <section className="px-4">
              <h3 className="mb-2 font-semibold text-foreground text-sm">
                <Trans>Selected Recipient</Trans>
              </h3>

              <EnvelopeRecipientSelector
                selectedRecipient={editorFields.selectedRecipient}
                onSelectedRecipientChange={(recipient) => editorFields.setSelectedRecipient(recipient.id)}
                recipients={envelope.recipients}
                fields={envelope.fields}
                className="w-full"
                align="end"
              />

              {editorFields.selectedRecipient &&
                !canRecipientFieldsBeModified(editorFields.selectedRecipient, envelope.fields) && (
                  <Alert className="mt-4" variant="warning">
                    <AlertDescription>
                      <Trans>
                        This recipient can no longer be modified as they have signed a field, or completed the document.
                      </Trans>
                    </AlertDescription>
                  </Alert>
                )}
            </section>

            <Separator className="my-4" />

            {/* Add fields section. */}
            <section className="px-4">
              <h3 className="mb-2 font-semibold text-foreground text-sm">
                <Trans>Add Fields</Trans>
              </h3>

              <EnvelopeEditorFieldDragDrop
                selectedRecipientId={editorFields.selectedRecipient?.id ?? null}
                selectedEnvelopeItemId={currentEnvelopeItem?.id ?? null}
              />

              <ApplyTemplateToEnvelopeItemDialog
                envelope={envelope}
                envelopeItemId={currentEnvelopeItem.id}
                onChanged={syncEnvelope}
                disabled={envelope.status !== DocumentStatus.DRAFT}
              />

              {editorConfig.fields?.allowAIDetection && IS_AI_FEATURES_CONFIGURED() && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={onDetectClick}
                    disabled={envelope.status !== DocumentStatus.DRAFT}
                    title={
                      envelope.status !== DocumentStatus.DRAFT
                        ? _(msg`You can only detect fields in draft envelopes`)
                        : undefined
                    }
                  >
                    <SparklesIcon className="mr-2 -ml-1 h-4 w-4" />
                    <Trans>Detect with AI</Trans>
                  </Button>

                  <AiFieldDetectionDialog
                    open={isAiFieldDialogOpen}
                    onOpenChange={setIsAiFieldDialogOpen}
                    onComplete={onFieldDetectionComplete}
                    envelopeId={envelope.id}
                    teamId={envelope.teamId}
                  />

                  <AiFeaturesEnableDialog
                    open={isAiEnableDialogOpen}
                    onOpenChange={setIsAiEnableDialogOpen}
                    onEnabled={onAiFeaturesEnabled}
                  />
                </>
              )}
            </section>

            {/* Field details section. */}
            <AnimateGenericFadeInOut key={editorFields.selectedField?.formId}>
              {selectedField && (
                <section>
                  <Separator className="my-4" />

                  {searchParams.get('devmode') && (
                    <>
                      <div className="px-4">
                        <h3 className="mb-3 font-semibold text-foreground text-sm">
                          <Trans>Developer Mode</Trans>
                        </h3>

                        <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-foreground text-sm">
                          {selectedField.id && (
                            <p>
                              <span className="min-w-12 text-muted-foreground">
                                <Trans>Field ID:</Trans>
                              </span>{' '}
                              {selectedField.id}
                            </p>
                          )}
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Recipient ID:</Trans>
                            </span>{' '}
                            {selectedField.recipientId}
                          </p>
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Pos X:</Trans>
                            </span>{' '}
                            {selectedField.positionX.toFixed(2)}
                          </p>
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Pos Y:</Trans>
                            </span>{' '}
                            {selectedField.positionY.toFixed(2)}
                          </p>
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Width:</Trans>
                            </span>{' '}
                            {selectedField.width.toFixed(2)}
                          </p>
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Height:</Trans>
                            </span>{' '}
                            {selectedField.height.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <Separator className="my-4" />
                    </>
                  )}

                  <div className="px-4 [&_label]:text-foreground/70 [&_label]:text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm">{_(FieldSettingsTypeTranslations[selectedField.type])}</h3>
                      {selectedConditionalField?.conditionalChildRule && (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-500"
                          title={_(msg`This field is conditionally visible`)}
                        >
                          <EyeOffIcon className="h-3 w-3" aria-hidden="true" />
                          <span>Conditional</span>
                        </span>
                      )}
                    </div>
                    {selectedConditionalField && (
                      <p className="mt-1 text-muted-foreground text-xs">
                        Name:{' '}
                        <span className="font-medium text-foreground">
                          {getFieldDisplayName(selectedConditionalField, conditionalFields)}
                        </span>
                      </p>
                    )}

                    {match(selectedField.type)
                      .with(FieldType.SIGNATURE, () => (
                        <EditorFieldSignatureForm
                          value={selectedField?.fieldMeta as TSignatureFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.CHECKBOX, () => (
                        <EditorFieldCheckboxForm
                          value={selectedFieldMeta as TCheckboxFieldMeta | undefined}
                          isGrouped={Boolean(selectedField.fieldGroupId)}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.DATE, () => (
                        <EditorFieldDateForm
                          value={selectedField?.fieldMeta as TDateFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.DROPDOWN, () => (
                        <EditorFieldDropdownForm
                          value={selectedField?.fieldMeta as TDropdownFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.EMAIL, () => (
                        <EditorFieldEmailForm
                          value={selectedField?.fieldMeta as TEmailFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.INITIALS, () => (
                        <EditorFieldInitialsForm
                          value={selectedField?.fieldMeta as TInitialsFieldMeta | undefined}
                          isGrouped={Boolean(selectedField?.fieldGroupId)}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.NAME, () => (
                        <EditorFieldNameForm
                          value={selectedField?.fieldMeta as TNameFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.NUMBER, () => (
                        <EditorFieldNumberForm
                          value={selectedField?.fieldMeta as TNumberFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.RADIO, () => (
                        <EditorFieldRadioForm
                          value={selectedFieldMeta as TRadioFieldMeta | undefined}
                          isGrouped={Boolean(selectedField.fieldGroupId)}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .with(FieldType.TEXT, () => (
                        <EditorFieldTextForm
                          value={selectedField?.fieldMeta as TTextFieldMeta | undefined}
                          onValueChange={(value) => updateSelectedFieldMeta(value)}
                        />
                      ))
                      .otherwise(() => null)}

                    <EditorFieldGroupSettings
                      field={selectedField}
                      fields={editorFields.localFields}
                      onCreateGroup={(name) => {
                        editorFields.createFieldGroup(selectedField, name);
                      }}
                      onAssignGroup={(group) => {
                        editorFields.assignFieldToGroup(selectedField, group);
                      }}
                      onUpdateValidation={(validationRule, validationLength) => {
                        editorFields.updateFieldGroupValidation(selectedField, validationRule, validationLength);
                      }}
                      onUngroup={() => {
                        editorFields.ungroupField(selectedField);
                      }}
                    />

                    {selectedConditionalField && (
                      <ConditionalFieldSettings
                        field={selectedConditionalField}
                        fields={conditionalFields}
                        className="-mx-4"
                        onCreateRule={async (input) => {
                          const rule = await createConditionalRule(input);
                          updateConditionalRuleState(rule);
                          return rule;
                        }}
                        onDeleteRule={async (childFieldId) => {
                          await deleteConditionalRule({ childFieldId });
                          removeConditionalRuleState(childFieldId);
                        }}
                        onSelectedChildIdsChange={setHighlightedConditionalFieldIds}
                        onSelectionModeChange={setConditionalSelectionFieldIds}
                      />
                    )}
                  </div>
                </section>
              )}
            </AnimateGenericFadeInOut>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ConditionalFieldHighlightContext.Provider value={conditionalFieldHighlightContextValue}>
      {pageContent}
    </ConditionalFieldHighlightContext.Provider>
  );
};
