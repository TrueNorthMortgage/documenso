# Rollbar error monitoring

Documenso uses the official [Rollbar JavaScript SDK](https://docs.rollbar.com/docs/javascript) for browser and Node.js error reporting. Reporting is optional: without access tokens, no Rollbar instance is created.

## Configuration

Create a Rollbar project and configure these runtime environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN` | A project token with `post_server_item` scope. Keep it in server secrets. |
| `NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN` | A separate project token with only `post_client_item` scope. This token is intentionally available in the browser. |
| `NEXT_PUBLIC_ROLLBAR_ENVIRONMENT` | Deployment label such as `staging` or `production`. Defaults to `NODE_ENV`. |
| `NEXT_PUBLIC_ROLLBAR_CODE_VERSION` | Deployed Git SHA or release version. Defaults to the package version. Set the same value for browser and server reports. |

Restart the application after changing runtime configuration. Configure either token independently to enable reporting for that runtime.

The production Dockerfile accepts `DOCUMENSO_CODE_VERSION` as a build argument
and stores it in the image as `NEXT_PUBLIC_ROLLBAR_CODE_VERSION`. Build pipelines
should pass the commit SHA of the Documenso source they build. The image can then
be promoted between environments without changing its code version. Tokens and
environment labels remain runtime configuration.

## Coverage

- React Router server loader/action/render errors through `handleError`, excluding aborted requests, plus streaming render failures.
- React Router browser errors through `HydratedRouter.onError`, plus uncaught exceptions and unhandled promise rejections captured by the SDK.
- Unexpected tRPC errors using the existing server-error classification; expected validation errors remain excluded.
- Unhandled Hono errors and server HTTP exceptions with status 500 or higher.
- API v1 unexpected errors and server HTTP errors with status 500 or higher.
- Uncaught Node.js exceptions and unhandled promise rejections. Uncaught exceptions terminate the process after reporting.

Caught errors outside these hooks need an explicit call to `reportServerError`. Existing logs remain available. When browser Rollbar is configured, PostHog exception capture is disabled; other PostHog functionality remains enabled.

## Report contents

Automatic telemetry and session replay are disabled. Request data, person data, custom payloads, and request context are removed before transmission. The application does not attach document contents, form values, credentials, or signing URLs. Stack traces and exception messages remain available for diagnosis; avoid embedding sensitive values in exception messages.

Source-map generation and upload are not configured by this integration. Browser reports initially reference the deployed JavaScript assets. Follow [Rollbar's source-map guide](https://docs.rollbar.com/docs/source-maps) when configuring source maps for a deployment.

## Verification

Run the focused Rollbar configuration/SDK tests and the existing tRPC error-handler tests in the development container. The SDK test inspects an actual report with transmission disabled.

With tokens configured in a test environment, trigger a deliberate browser error and server error, then confirm both arrive in the Rollbar project with the expected environment and version. Inspect the reports for sensitive data. Confirm that validation failures do not create occurrences. Receipt in Rollbar requires credentials and is a separate check from local tests.
