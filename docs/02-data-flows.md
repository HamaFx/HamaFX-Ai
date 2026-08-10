# Data Flows and Providers

## Market data

The data package uses provider adapters with health-aware failover. BiQuote is the primary market-data source for supported instruments; Finnhub and other configured providers may provide fallback or supplementary data. Provider availability and terms can change independently of this repository.

## AI and BYOK

The browser sends authenticated chat requests to `apps/web`. The server resolves the selected model and decrypts the user's provider key only in memory for the AI call. Provider keys are never intended to be returned to the browser or written to logs.

Operators may configure server-level AI credentials, but self-hosted open-source deployments should prefer BYOK so each user controls their own provider account and billing.

## Optional telemetry

Sentry and Langfuse are disabled unless configured. When enabled, operators must review whether prompts, tool inputs, outputs, metadata, and error context are sent to the selected service.

## Licensing responsibility

Market-data providers may impose limits on storage, redistribution, commercial use, and display. Operators are responsible for accepting and complying with each provider's current terms before exposing data to other users or subscribers.
