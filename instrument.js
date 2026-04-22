import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: 'https://56d20fd55f45117bb50b025d7a8f32ab@o4511264027049984.ingest.us.sentry.io/4511264098091008',
  environment: process.env.NODE_ENV || 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.2,
  ignoreErrors: ["has no method 'updateFrom'"],
})
