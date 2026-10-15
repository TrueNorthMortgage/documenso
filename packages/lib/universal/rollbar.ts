import type Rollbar from 'rollbar';

import { version } from '../../../package.json';
import { env } from '../utils/env';
import { sanitizeHydrationDiagnostics } from './hydration-diagnostics';

/** Keep reports limited to diagnostic data, without request or interaction contents. */
export const sanitizeRollbarPayload = (payload: Rollbar.Dictionary) => {
  delete payload.request;
  delete payload.person;
  // The Node SDK also copies custom fields to the top level.
  const custom = payload.custom;
  const hydration = sanitizeHydrationDiagnostics(
    custom && typeof custom === 'object' && 'hydration' in custom ? custom.hydration : undefined,
  );
  delete payload.hydration;
  if (hydration) {
    payload.custom = { hydration };
  } else {
    delete payload.custom;
  }
  delete payload.context;

  const body = payload.body;

  if (body && typeof body === 'object') {
    // Telemetry can contain console output, form values, and signing URLs.
    Reflect.deleteProperty(body, 'telemetry');
  }

  // The SDK also adds raw errors, source context, and configured options.
  // Those can carry sensitive data even when request capture is disabled.
  const visited = new WeakSet<object>();
  const removeAdditionalData = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value)) {
      return;
    }

    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (['extra', 'code', 'context', 'args', 'locals', 'diagnostic', 'configured_options', 'argv'].includes(key)) {
        Reflect.deleteProperty(value, key);
      } else {
        removeAdditionalData(child);
      }
    }
  };

  removeAdditionalData(payload);
};

export const getRollbarConfiguration = (): Rollbar.Configuration => ({
  environment: env('NEXT_PUBLIC_ROLLBAR_ENVIRONMENT') || env('NODE_ENV') || 'development',
  codeVersion: env('NEXT_PUBLIC_ROLLBAR_CODE_VERSION') || version,
  payload: {
    client: {
      javascript: {
        source_map_enabled: true,
        code_version: env('NEXT_PUBLIC_ROLLBAR_CODE_VERSION') || version,
      },
    },
  },
  captureUncaught: true,
  captureUnhandledRejections: true,
  autoInstrument: false,
  captureIp: false,
  captureEmail: false,
  captureUsername: false,
  addErrorContext: false,
  includeItemsInTelemetry: false,
  scrubTelemetryInputs: true,
  scrubFields: ['authorization', 'cookie', 'token', 'signature', 'documentData', 'document', 'email'],
  reportLevel: 'error',
  transform: sanitizeRollbarPayload,
  // Rollbar 3 adds notifier diagnostics after transform, so scrub the final payload too.
  onSendCallback: (_isUncaught, _args, payload) => sanitizeRollbarPayload(payload),
});
